// wallet-core/__tests__/csp-policy.test.js
//
// Static CSP strictness check (XSS-risk verification, part 1 of 2).
//
// The app is a key-handling wallet; its only network-layer defence against an
// injected-script seed/address exfiltration is the Content-Security-Policy meta
// in index.html (PR #223 "VULN-4", later PR #227). This test pins the policy so
// a regression (a stray 'unsafe-inline', a wildcard connect-src, or — as found
// on main — a SECOND conflicting CSP meta) fails CI instead of shipping.
//
// Why "exactly one" matters: when a document carries multiple CSP policies the
// browser enforces ALL of them, and a resource must pass EVERY policy (the
// effective policy is the intersection / most-restrictive). Two hand-maintained
// metas therefore (a) silently override each other's allowlists in non-obvious
// ways and (b) are a maintenance trap — a host added to one is still blocked by
// the other. A single source of truth is the only auditable state.
//
// Companion live test (injection actually blocked in the iOS WKWebView) lives in
// scripts/csp-injection-probe.* and is driven on the simulator.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// This file: src/wallet-core/__tests__/ → repo root is three levels up.
const __dir = path.dirname(fileURLToPath(import.meta.url));
const indexHtmlPath = path.resolve(__dir, '../../../index.html');
const html = readFileSync(indexHtmlPath, 'utf8');

// Pull every <meta http-equiv="Content-Security-Policy" content="..."> payload.
// Tolerant of attribute order and of multi-line content (the VULN-4 meta wraps).
function extractCspMetas(source) {
  const metas = [];
  const metaTag = /<meta\b[^>]*>/gis;
  let m;
  while ((m = metaTag.exec(source)) !== null) {
    const tag = m[0];
    if (!/http-equiv\s*=\s*["']content-security-policy["']/i.test(tag)) continue;
    // Close on the SAME quote char that opened the attribute (backreference) —
    // the policy value itself contains single quotes ('self', 'none'), so a
    // ["'] close would truncate at the first 'self'.
    const content = tag.match(/content\s*=\s*(["'])([\s\S]*?)\1/i);
    if (content) metas.push(content[2]);
  }
  return metas;
}

// "script-src 'self' 'wasm-unsafe-eval'; object-src 'none'" → Map directive→[tokens]
function parsePolicy(policy) {
  const directives = new Map();
  for (const part of policy.split(';')) {
    const tokens = part.trim().split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const name = tokens.shift().toLowerCase();
    directives.set(name, tokens);
  }
  return directives;
}

const metas = extractCspMetas(html);

describe('Content-Security-Policy — static strictness (XSS defence)', () => {
  it('declares a CSP at all', () => {
    expect(metas.length, 'no Content-Security-Policy meta found in index.html').toBeGreaterThan(0);
  });

  // The core merge-artifact guard. On main this currently FAILS (PR #223 meta +
  // PR #227 meta both present) — that failure IS the risk this suite verifies.
  it('declares EXACTLY ONE CSP meta (no conflicting duplicates)', () => {
    expect(
      metas.length,
      `found ${metas.length} CSP metas — the browser intersects all of them, so the ` +
        `effective policy is unpredictable and allowlists silently cancel out. ` +
        `Collapse to a single source of truth.`,
    ).toBe(1);
  });

  // Run the strictness assertions against EVERY policy present, so they hold no
  // matter which one (or the intersection) ends up enforced.
  describe.each(metas.map((p, i) => [i, p]))('policy #%i', (_i, policy) => {
    const d = parsePolicy(policy);

    it("script-src has no 'unsafe-inline' (inline-script XSS would execute)", () => {
      const scriptSrc = d.get('script-src') ?? d.get('default-src') ?? [];
      expect(scriptSrc).not.toContain("'unsafe-inline'");
    });

    it("script-src has no 'unsafe-eval' (eval/new Function XSS gadget)", () => {
      // 'wasm-unsafe-eval' is REQUIRED (Argon2id KDF) and is NOT 'unsafe-eval'.
      const scriptSrc = d.get('script-src') ?? d.get('default-src') ?? [];
      expect(scriptSrc).not.toContain("'unsafe-eval'");
    });

    // Regression guard for the vault crypto (PR #227 commit note + PR #234).
    // The at-rest Argon2id KDF (hash-wasm) and PR #230's decoy/hidden/panic
    // paths (credentialVerifier / vaultBackup) compile a
    // WebAssembly module; under CSP that requires 'wasm-unsafe-eval' in
    // script-src. Drop it and every wallet create/import/unlock fails. The live
    // probe (scripts/csp-injection-probe.*) proves it's actually effective in
    // the capacitor:// WKWebView; this pins it can't be removed from the policy.
    it("script-src keeps 'wasm-unsafe-eval' (Argon2id KDF — #227/#230/#234)", () => {
      const scriptSrc = d.get('script-src') ?? d.get('default-src') ?? [];
      expect(scriptSrc).toContain("'wasm-unsafe-eval'");
    });

    it("object-src is 'none' (no plugin/embed injection)", () => {
      const objectSrc = d.get('object-src') ?? d.get('default-src') ?? [];
      expect(objectSrc).toEqual(["'none'"]);
    });

    it("base-uri is 'self' (no <base> href hijack)", () => {
      expect(d.get('base-uri')).toEqual(["'self'"]);
    });

    it("default-src is 'self' (deny-by-default baseline)", () => {
      expect(d.get('default-src')).toEqual(["'self'"]);
    });

    it('connect-src is an allowlist with no open wildcard (anti-exfiltration)', () => {
      const connectSrc = d.get('connect-src') ?? d.get('default-src') ?? [];
      expect(connectSrc.length, 'connect-src missing — falls back to default-src').toBeGreaterThan(0);
      // A bare "*", "https:", "http:", or "data:"/"blob:" in connect-src would let
      // injected code POST a seed/address anywhere.
      for (const bad of ['*', 'https:', 'http:', 'data:', 'blob:', "'unsafe-inline'"]) {
        expect(connectSrc, `connect-src must not contain ${bad}`).not.toContain(bad);
      }
      // Every host token must be an explicit https origin (wildcard subdomain ok).
      for (const tok of connectSrc) {
        if (tok === "'self'") continue;
        expect(tok, `connect-src token "${tok}" is not an explicit https origin`).toMatch(
          /^https:\/\/[^*]*(\*\.)?[a-z0-9.-]+$/i,
        );
      }
    });
  });

  // If (as on main) more than one policy exists, prove they genuinely conflict —
  // i.e. the duplicate is not a harmless copy. Uses real CSP host-source matching
  // (a wildcard like *.solana.com DOES cover api.devnet.solana.com) so it reports
  // only hosts an enforcing browser would actually block under the intersection,
  // not cosmetic token differences.
  //
  // Per CSP host-source matching (simplified to what this policy uses):
  //   '*'                      → any URL
  //   bare scheme  'https:'    → any https URL
  //   https://*.solana.com     → scheme https + host is a sub-domain of solana.com
  //   https://api.foo.com      → scheme https + exact host (path ignored)
  function tokenMatchesHost(token, host) {
    if (token === '*' || token === 'https:') return true;
    const m = token.match(/^https:\/\/(\*\.)?(.+)$/i);
    if (!m) return false; // 'self'/'none'/data:/blob: don't match a remote host
    const [, wild, base] = m;
    return wild ? host === base || host.endsWith('.' + base) : host === base;
  }
  function hostAllowed(tokens, host) {
    return tokens.some((t) => tokenMatchesHost(t, host));
  }

  it('does not carry conflicting connect-src/img-src allowlists across policies', () => {
    if (metas.length < 2) return; // single policy → nothing to compare
    const sets = metas.map(parsePolicy);
    const conflicts = [];
    for (const dir of ['connect-src', 'img-src']) {
      const lists = sets.map((s) => s.get(dir) ?? s.get('default-src') ?? []);
      // Representative request hosts: every concrete (non-wildcard) https origin
      // named in any policy, plus a synthetic probe per wildcard so a wildcard
      // present in one policy but absent from another is still detected.
      const hosts = new Set();
      for (const list of lists) {
        for (const tok of list) {
          const m = tok.match(/^https:\/\/(\*\.)?(.+)$/i);
          if (!m) continue;
          hosts.add(m[1] ? `probe.${m[2]}` : m[2]);
        }
      }
      for (const host of hosts) {
        const verdicts = lists.map((list) => hostAllowed(list, host));
        if (verdicts.some(Boolean) && !verdicts.every(Boolean)) {
          conflicts.push(`${dir}: https://${host} reachable under some policies but BLOCKED under others (intersection blocks it)`);
        }
      }
    }
    expect(
      conflicts,
      `the duplicate CSP metas genuinely conflict — the browser-enforced intersection breaks these:\n  ${conflicts.join('\n  ')}`,
    ).toEqual([]);
  });
});
