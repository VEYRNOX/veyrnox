#!/usr/bin/env node
// Supply-chain gate for CI.
//
// FAILS the build on any *critical* dependency advisory that is NOT explicitly
// acknowledged in ALLOWLIST below. Highs/moderates are deliberately NOT gated
// here — they are triaged for reachability in docs/SAST_FINDINGS.md. The point
// of this gate is narrow: catch a *new* critical the moment it lands, while
// known/deferred criticals stay visible and documented rather than silently
// ignored.
//
// Adding an entry to ALLOWLIST is a deliberate security decision: each needs a
// real reason (why it can't be fixed now) and should reference a reachability
// note. Keep it auditable — a reviewer should be able to see exactly what was
// waved through and why.
//
// Run: `node scripts/audit-gate.mjs` (uses `npm audit --json`, reads the lockfile).

import { execSync } from 'node:child_process';

/** GHSA id -> reason. Only CRITICAL advisories matching these ids are exempted. */
const ALLOWLIST = {
  // protobufjs <=7.6.2 — bundle incl. arbitrary code execution
  // (GHSA-xq3m-2v4x-88gg). DEFERRED: npm's only resolvable fix is a breaking
  // downgrade of @trezor/connect-web (isSemVerMajor); a forced protobufjs@8
  // override is unvalidated against the Ledger/Trezor/Solana stacks. Pending a
  // deliberate, tested upgrade + reachability proof. See docs/SAST_FINDINGS.md.
  'GHSA-xq3m-2v4x-88gg': 'protobufjs ACE — no safe override; tested fix + reachability review pending',
};

function runAudit() {
  // execSync goes through the shell, so it resolves `npm` on Linux (CI) and
  // `npm.cmd` on Windows (local) without the .cmd-spawn EINVAL issue. The
  // command is a fixed literal — no injection surface.
  try {
    const out = execSync('npm audit --json', {
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return JSON.parse(out);
  } catch (err) {
    // `npm audit` exits non-zero when advisories exist; the JSON is still on stdout.
    if (err.stdout) return JSON.parse(err.stdout);
    console.error('audit-gate: could not run `npm audit` —', err.message);
    process.exit(1); // fail closed
  }
}

const audit = runAudit();
const vulns = audit.vulnerabilities || {};

// Collect distinct CRITICAL advisories (deduped by GHSA), with affected packages.
const crits = new Map();
for (const [pkg, info] of Object.entries(vulns)) {
  for (const adv of info.via || []) {
    if (typeof adv !== 'object' || adv.severity !== 'critical') continue;
    const ghsa = String(adv.url || '').split('/').pop() || `npm:${adv.source}`;
    if (!crits.has(ghsa)) crits.set(ghsa, { ghsa, title: adv.title, url: adv.url, pkgs: new Set() });
    crits.get(ghsa).pkgs.add(pkg);
  }
}

const acknowledged = [];
const offending = [];
for (const c of crits.values()) (ALLOWLIST[c.ghsa] ? acknowledged : offending).push(c);

console.log(`audit-gate: ${crits.size} critical advisory(ies) in the dependency tree\n`);

if (acknowledged.length) {
  console.log('Acknowledged / deferred (allowlisted):');
  for (const c of acknowledged) {
    console.log(`  • ${c.ghsa}  ${c.title}`);
    console.log(`      packages: ${[...c.pkgs].join(', ')}`);
    console.log(`      reason:   ${ALLOWLIST[c.ghsa]}`);
  }
  console.log('');
}

if (offending.length) {
  console.error('❌ Un-acknowledged CRITICAL advisory(ies) — failing the gate:');
  for (const c of offending) {
    console.error(`  • ${c.ghsa}  ${c.title}`);
    console.error(`      packages: ${[...c.pkgs].join(', ')}`);
    console.error(`      ${c.url}`);
  }
  console.error(
    '\nTo resolve: fix the dependency (preferred), or — only after a reachability' +
      '\nreview — add the GHSA id to ALLOWLIST in scripts/audit-gate.mjs with a reason.',
  );
  process.exit(1);
}

console.log('✅ No un-acknowledged critical advisories. Gate passed.');
