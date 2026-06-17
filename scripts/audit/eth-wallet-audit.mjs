#!/usr/bin/env node
// scripts/audit/eth-wallet-audit.mjs
//
// Veyrnox — ETH wallet security AUDIT HARNESS (automated portion).
//
//   node scripts/audit/eth-wallet-audit.mjs
//   npm run audit:eth
//
// ─────────────────────────────────────────────────────────────────────────────
// WHAT THIS IS — and IS NOT.
//
// This runs the AUTOMATED checks an auditor would want green before they start:
// gate integrity, secret/egress scans, CSPRNG tripwire, crypto-path tests,
// dependency posture. A clean run means "no automated red flags" — the cheap
// precondition that SHRINKS a paid review (per docs/MVP.roadmap.md, Track C).
//
// It is NOT an independent audit. "Independent" means a third party reviews the
// architecture and key handling by hand (docs/Audit.scope.md §24). A script you
// run yourself cannot satisfy that gate, and a green run here does NOT authorize
// flipping ALLOW_MAINNET. The script asserts the gate stays CLOSED and fails if
// anyone has opened it (fail-closed, I4).
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, extname, relative, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');
const EXTS = new Set(['.js', '.jsx', '.ts', '.tsx', '.mjs']);

// ── result accumulation ──────────────────────────────────────────────────────
const results = [];
// severity: 'fail' (hard, exit 1) | 'warn' (review) | 'pass' | 'info'
function record(id, severity, title, detail = '') {
  results.push({ id, severity, title, detail });
  const tag = { fail: 'FAIL', warn: 'WARN', pass: 'PASS', info: 'INFO' }[severity];
  const line = `[${tag}] ${id} — ${title}`;
  console.log(line + (detail ? `\n        ${String(detail).replace(/\n/g, '\n        ')}` : ''));
}

// ── file walking ─────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', '.git', 'android', 'ios', 'coverage']);
function walk(dir, acc = []) {
  let entries;
  try { entries = readdirSync(dir); } catch { return acc; }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const p = join(dir, name);
    let s; try { s = statSync(p); } catch { continue; }
    if (s.isDirectory()) walk(p, acc);
    else if (EXTS.has(extname(p))) acc.push(p);
  }
  return acc;
}
const rel = (p) => relative(ROOT, p).replace(/\\/g, '/');
const isTestOrDoc = (p) => /(__tests__|\.test\.|\.spec\.|\/scripts\/|\/docs\/|rehearsal|validation-sweep)/.test(rel(p));

const SRC = join(ROOT, 'src');
const allFiles = walk(SRC);
const prodFiles = allFiles.filter((p) => !isTestOrDoc(p));

// Raw line scan — use when the literal TEXT matters (string/hex/mnemonic content).
function grepFiles(files, re) {
  const hits = [];
  for (const f of files) {
    let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
    const lines = text.split(/\r?\n/);
    lines.forEach((ln, i) => { if (re.test(ln)) hits.push(`${rel(f)}:${i + 1}: ${ln.trim().slice(0, 160)}`); });
  }
  return hits;
}

// Blank out comments + string/template contents (preserving line numbers) so we
// match real CODE CONSTRUCTS, not prose that merely mentions them. Without this,
// a comment like "// Math.random() is NOT a CSPRNG" or a note string would trip
// the very check that warns against it — false positives that erode trust.
function stripCommentsAndStrings(text) {
  let out = '', i = 0, state = 'code';
  const n = text.length;
  while (i < n) {
    const c = text[i], c2 = text[i + 1];
    const blank = c === '\n' ? '\n' : c === '\t' ? '\t' : ' ';
    if (state === 'code') {
      if (c === '/' && c2 === '/') { state = 'line'; out += '  '; i += 2; continue; }
      if (c === '/' && c2 === '*') { state = 'block'; out += '  '; i += 2; continue; }
      if (c === "'") { state = 'sq'; out += ' '; i++; continue; }
      if (c === '"') { state = 'dq'; out += ' '; i++; continue; }
      if (c === '`') { state = 'tpl'; out += ' '; i++; continue; }
      out += c; i++; continue;
    }
    if (state === 'line') { if (c === '\n') { state = 'code'; out += '\n'; i++; continue; } out += blank; i++; continue; }
    if (state === 'block') { if (c === '*' && c2 === '/') { state = 'code'; out += '  '; i += 2; continue; } out += blank; i++; continue; }
    // inside a string/template
    if (c === '\\') { out += '  '; i += 2; continue; }
    if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) { state = 'code'; out += ' '; i++; continue; }
    out += blank; i++;
  }
  return out;
}

// Code-construct scan — strips comments/strings first; shows the ORIGINAL line.
function grepCode(files, re) {
  const hits = [];
  for (const f of files) {
    let text; try { text = readFileSync(f, 'utf8'); } catch { continue; }
    const raw = text.split(/\r?\n/);
    const stripped = stripCommentsAndStrings(text).split(/\r?\n/);
    stripped.forEach((ln, i) => { if (re.test(ln)) hits.push(`${rel(f)}:${i + 1}: ${(raw[i] || '').trim().slice(0, 160)}`); });
  }
  return hits;
}

console.log('\n=== Veyrnox ETH wallet audit harness ===\n');
console.log(`root: ${ROOT}`);
console.log(`scanned: ${allFiles.length} source files (${prodFiles.length} non-test)\n`);

// ─────────────────────────────────────────────────────────────────────────────
// A. GATE INTEGRITY — the financial safety gate must be CLOSED.
// ─────────────────────────────────────────────────────────────────────────────
async function checkGates() {
  // A1: EVM mainnet gate, by dynamic import (robust to key renames).
  try {
    const net = await import(pathToFileURL(join(SRC, 'wallet-core/evm/networks.js')).href);
    if (net.ALLOW_MAINNET === false) {
      record('A1', 'pass', 'EVM ALLOW_MAINNET is false (gate closed)');
    } else {
      record('A1', 'fail', 'EVM ALLOW_MAINNET is NOT false', `value=${String(net.ALLOW_MAINNET)} — mainnet gate is OPEN. Audit cannot pass with the gate open.`);
    }
    // A2: every non-testnet network must be enabled:false AND throw via getNetwork.
    const NETWORKS = net.NETWORKS || {};
    const mainnets = Object.entries(NETWORKS).filter(([, n]) => n && n.isTestnet === false);
    let bad = [];
    for (const [key, n] of mainnets) {
      if (n.enabled !== false) bad.push(`${key}: enabled=${n.enabled}`);
      try { net.getNetwork(key); bad.push(`${key}: getNetwork did NOT throw`); } catch { /* expected */ }
    }
    if (mainnets.length === 0) record('A2', 'warn', 'No mainnet networks found in config to assert against');
    else if (bad.length === 0) record('A2', 'pass', `All ${mainnets.length} mainnet networks gated (enabled:false + getNetwork throws)`);
    else record('A2', 'fail', 'A mainnet network is reachable', bad.join('; '));
    // A3: enabled list is testnet-only.
    const enabled = net.listEnabledNetworks ? net.listEnabledNetworks() : [];
    const leaked = enabled.filter((n) => n.isTestnet === false);
    if (leaked.length === 0) record('A3', 'pass', `listEnabledNetworks() is testnet-only (${enabled.length} nets)`);
    else record('A3', 'fail', 'A mainnet network leaked into listEnabledNetworks()', leaked.map((n) => n.chainId).join(', '));
  } catch (e) {
    record('A1', 'warn', 'Could not import evm/networks.js for gate check', e.message);
  }

  // A4: BTC + SOL master mainnet switches (defense in depth).
  for (const [id, file, sym] of [['A4', 'wallet-core/btc/networks.js', 'ALLOW_BTC_MAINNET'], ['A5', 'wallet-core/sol/networks.js', 'ALLOW_SOL_MAINNET']]) {
    try {
      const m = await import(pathToFileURL(join(SRC, file)).href);
      if (m[sym] === false) record(id, 'pass', `${sym} is false (gate closed)`);
      else record(id, 'fail', `${sym} is NOT false`, `value=${String(m[sym])}`);
    } catch (e) {
      record(id, 'warn', `Could not import ${file}`, e.message);
    }
  }

  // A6: ASSET status — ETH must be a testnet chain, not mainnet.
  try {
    const a = await import(pathToFileURL(join(SRC, 'wallet-core/assets.js')).href);
    const list = a.TOP_CRYPTOS || a.ASSETS || a.default || [];
    const eth = (Array.isArray(list) ? list : []).find((x) => x.symbol === 'ETH');
    if (eth && /sepolia|testnet|goerli|holesky/i.test(eth.chain || '')) record('A6', 'pass', `ETH asset points at testnet chain "${eth.chain}"`);
    else if (eth) record('A6', 'fail', `ETH asset chain is not a known testnet`, `chain="${eth.chain}"`);
    else record('A6', 'warn', 'Could not locate ETH asset entry to assert chain');
  } catch (e) {
    record('A6', 'warn', 'Could not import assets.js', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// B. SECRET / KEY-EGRESS SCAN  (I1 keys never leave device, I2 no silent egress)
// ─────────────────────────────────────────────────────────────────────────────
function checkSecrets() {
  // B1: hardcoded private keys (raw 32-byte hex) outside tests/docs.
  const pk = grepFiles(prodFiles, /\b0x[a-fA-F0-9]{64}\b/);
  if (pk.length === 0) record('B1', 'pass', 'No raw 64-hex private-key literals in production code');
  else record('B1', 'warn', `${pk.length} raw 64-hex literal(s) — confirm none are private keys`, pk.slice(0, 10).join('\n'));

  // B2: hardcoded mnemonic-looking literals (12+ lowercase words in quotes).
  // The canonical all-"abandon"/"about" zero-entropy vector is the most PUBLIC
  // mnemonic in existence (no funds) — surfaced as WARN ("confirm demo-only"),
  // never a hard fail. Any OTHER mnemonic-shaped literal is a hard fail.
  const CANONICAL_VECTOR = /(abandon\s+){11}about/;
  const mn = grepFiles(prodFiles, /["'`](?:[a-z]{3,8}\s+){11,}[a-z]{3,8}["'`]/);
  const mnReal = mn.filter((h) => !CANONICAL_VECTOR.test(h));
  const mnVector = mn.filter((h) => CANONICAL_VECTOR.test(h));
  if (mnReal.length > 0) record('B2', 'fail', `${mnReal.length} non-public mnemonic-shaped literal(s) in production code`, mnReal.slice(0, 10).join('\n'));
  else if (mnVector.length > 0) record('B2', 'warn', `${mnVector.length} canonical PUBLIC test-vector mnemonic(s) — confirm demo-only, never a wallet default`, mnVector.join('\n'));
  else record('B2', 'pass', 'No hardcoded mnemonic literals in production code');

  // B3: secret identifier on the same line as a network call (egress tripwire).
  const egress = grepCode(prodFiles, /(fetch|axios|XMLHttpRequest|navigator\.sendBeacon|WebSocket)\s*\(.*(mnemonic|seed|privateKey|priv_key|entropy|secretKey)/i);
  if (egress.length === 0) record('B3', 'pass', 'No network call with seed/key material on the same line');
  else record('B3', 'fail', `${egress.length} potential key-egress site(s)`, egress.join('\n'));

  // B4: console logging of secrets.
  const log = grepCode(prodFiles, /console\.\w+\([^)]*(mnemonic|seed|privateKey|entropy|secretKey)/i);
  if (log.length === 0) record('B4', 'pass', 'No console logging of seed/key material');
  else record('B4', 'fail', `${log.length} console log(s) of secret material`, log.join('\n'));

  // B5: outbound calls inside wallet-core (should be RPC-only — list for review).
  const wc = prodFiles.filter((p) => rel(p).startsWith('src/wallet-core/'));
  const calls = grepFiles(wc, /\b(fetch|axios|sendBeacon|new WebSocket)\s*\(/);
  if (calls.length === 0) record('B5', 'info', 'No direct network calls in wallet-core');
  else record('B5', 'warn', `${calls.length} network-call site(s) in wallet-core — confirm each is RPC/explorer only`, calls.slice(0, 20).join('\n'));
}

// ─────────────────────────────────────────────────────────────────────────────
// C. CRYPTO HYGIENE / KNOWN REGRESSIONS
// ─────────────────────────────────────────────────────────────────────────────
function checkCryptoHygiene() {
  const guarded = prodFiles.filter((p) => /src\/(wallet-core|risk|sign-gate|rasp|lib)\//.test(rel(p)));

  // C1: CSPRNG — Math.random / weak entropy in key paths (backstop to check:rng).
  const rng = grepCode(guarded, /\bMath\.random\s*\(|\bDate\.now\s*\(\)\s*%/);
  if (rng.length === 0) record('C1', 'pass', 'No Math.random()/weak-entropy in key/security paths');
  else record('C1', 'fail', `${rng.length} weak-randomness use(s) in key/security paths`, rng.join('\n'));

  // C2: buffer.Buffer client-bundle regression (cf14175 / CONSOLE-1).
  const buf = grepCode(prodFiles, /\bbuffer\.Buffer\b/);
  if (buf.length === 0) record('C2', 'pass', 'No lowercase buffer.Buffer access (cf14175 regression guard)');
  else record('C2', 'fail', `${buf.length} buffer.Buffer access(es) — client-bundle crash regression`, buf.join('\n'));

  // C3: eval / Function constructor / innerHTML sinks.
  const sinks = grepCode(prodFiles, /\beval\s*\(|new\s+Function\s*\(|dangerouslySetInnerHTML/);
  if (sinks.length === 0) record('C3', 'pass', 'No eval/Function/dangerouslySetInnerHTML sinks');
  else record('C3', 'warn', `${sinks.length} dynamic-exec/HTML-injection sink(s) to review`, sinks.join('\n'));

  // C4: insecure transport in chain config (literal scan — URL text matters).
  const http = grepFiles(guarded, /["'`]http:\/\/(?!localhost|127\.0\.0\.1)/);
  if (http.length === 0) record('C4', 'pass', 'No plaintext http:// endpoints in key/security paths');
  else record('C4', 'warn', `${http.length} plaintext http:// endpoint(s)`, http.join('\n'));

  // C5: pinned audited crypto stack present.
  try {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
    const deps = { ...pkg.dependencies, ...pkg.devDependencies };
    const need = ['@noble/curves', '@noble/hashes', '@scure/bip32', '@scure/bip39', 'ethers'];
    const missing = need.filter((d) => !deps[d]);
    if (missing.length === 0) record('C5', 'pass', 'Audited crypto stack present', need.map((d) => `${d}@${deps[d]}`).join(', '));
    else record('C5', 'warn', 'Expected crypto lib(s) missing from manifest', missing.join(', '));
  } catch (e) {
    record('C5', 'warn', 'Could not read package.json for dep check', e.message);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// D. SUBPROCESS CHECKS — reuse the repo's own gates.
// ─────────────────────────────────────────────────────────────────────────────
function run(cmd) {
  // Keep stdout and stderr SEPARATE: tools like `npm audit --json` write JSON to
  // stdout and notices to stderr, and exit non-zero when findings exist. Merging
  // the two corrupts the JSON for the parser. `out` stays the merged view for
  // human-readable log tails; `stdout` is the clean machine-readable channel.
  try {
    const stdout = execSync(cmd, { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], encoding: 'utf8', timeout: 15 * 60 * 1000 });
    return { ok: true, stdout, stderr: '', out: stdout };
  } catch (e) {
    const stdout = e.stdout || '', stderr = e.stderr || e.message || '';
    return { ok: false, stdout, stderr, out: stdout + stderr };
  }
}

function checkSubprocess({ skipTests, skipNpmAudit }) {
  // D1: CSPRNG guard (the repo's own tripwire).
  const rng = run('npm run -s check:rng');
  record('D1', rng.ok ? 'pass' : 'fail', 'check:rng (CSPRNG guard)', rng.ok ? '' : rng.out.slice(-1200));

  // D2: full test suite incl. gating + crypto-path tests.
  if (skipTests) record('D2', 'info', 'Test suite SKIPPED (--skip-tests)');
  else {
    const t = run('npm test -s');
    const tail = t.out.split(/\r?\n/).filter(Boolean).slice(-12).join('\n');
    record('D2', t.ok ? 'pass' : 'fail', 'Test suite (npm test)', tail);
  }

  // D3: dependency vulnerability posture.
  if (skipNpmAudit) record('D3', 'info', 'npm audit SKIPPED (--skip-npm-audit)');
  else {
    const a = run('npm audit --omit=dev --json');
    try {
      const j = JSON.parse(a.stdout);
      const v = (j.metadata && j.metadata.vulnerabilities) || {};
      const high = (v.high || 0) + (v.critical || 0);
      const sev = `critical=${v.critical || 0} high=${v.high || 0} moderate=${v.moderate || 0} low=${v.low || 0}`;
      if (high > 0) record('D3', 'fail', 'High/critical dependency vulnerabilities', sev);
      else if ((v.moderate || 0) > 0) record('D3', 'warn', 'Moderate dependency vulnerabilities', sev);
      else record('D3', 'pass', 'No high/critical production dependency vulnerabilities', sev);
    } catch {
      record('D3', 'warn', 'npm audit did not return parseable JSON', a.out.slice(0, 400));
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────────────────
const argv = new Set(process.argv.slice(2));
await checkGates();
checkSecrets();
checkCryptoHygiene();
checkSubprocess({ skipTests: argv.has('--skip-tests'), skipNpmAudit: argv.has('--skip-npm-audit') });

// ── summary + report ─────────────────────────────────────────────────────────
const counts = results.reduce((a, r) => ((a[r.severity] = (a[r.severity] || 0) + 1), a), {});
console.log('\n────────────────────────────────────────────────────────');
console.log(`SUMMARY  pass=${counts.pass || 0}  warn=${counts.warn || 0}  fail=${counts.fail || 0}  info=${counts.info || 0}`);
console.log('────────────────────────────────────────────────────────');
console.log('NOTE: a clean run is the AUTOMATED precondition only. It is NOT an');
console.log('independent audit and does NOT authorize ALLOW_MAINNET. See');
console.log('docs/Audit.scope.md §24 for the third-party gate.\n');

// machine-readable evidence artifact
try {
  const outDir = join(ROOT, 'docs', 'audit-runs');
  mkdirSync(outDir, { recursive: true });
  const stamp = (process.env.AUDIT_STAMP || 'latest').replace(/[^\w.-]/g, '_');
  const file = join(outDir, `eth-wallet-audit.${stamp}.json`);
  writeFileSync(file, JSON.stringify({ counts, results, generatedBy: 'scripts/audit/eth-wallet-audit.mjs' }, null, 2));
  console.log(`report: ${rel(file)}`);
} catch (e) {
  console.log(`(could not write report artifact: ${e.message})`);
}

const fails = results.filter((r) => r.severity === 'fail');
if (fails.length > 0) {
  console.log(`\nAUDIT HARNESS FAILED — ${fails.length} hard finding(s): ${fails.map((f) => f.id).join(', ')}`);
  process.exit(1);
}
console.log('\nAUDIT HARNESS GREEN — no automated red flags. Hand this to the independent reviewer.');
process.exit(0);
