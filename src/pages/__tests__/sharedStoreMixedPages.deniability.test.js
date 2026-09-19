// K-2 / I3 (#2537) — the SECOND wave of shared-store surfaces, and the ones the
// sharedStorePages harness structurally cannot cover.
//
// That harness asserts `useQuery calls === store rows` and `useMutation calls
// === guarded mutations`, which works only for pages whose every hook touches
// the store. These five do not qualify:
//   HDWalletManager  4 useQuery, 1 of them on the store
//   ConnectWallet    0 useQuery, 1 store mutation
//   WhitelistManager lives under src/components/security, which that harness
//                    cannot resolve (it joins paths against src/pages)
// So this file anchors on the ENTITY CALL itself rather than on hook counts:
// every `base44.entities.X.{list,filter}` must sit inside a query carrying
// `enabled:` with `!deniable`, and every `.{create,update,delete}` must be
// preceded inside its own mutationFn by a denyInDeniable() guard.
//
// Why these five were missed by the first audit, recorded because the mistake
// is instructive: I searched for `isDeniabilityOrDemoActive|denyInDeniable|
// deniable` and called every file without a hit "ungated". Four files that DO
// gate — TokenApprovals, SessionManager, StealthWallets, usePriceAlertNotifier —
// use the older `isDecoy || isHidden || DEMO` composite and never say
// "deniable", so my own detector produced false positives in both directions.
// A gate-detection regex is a search list, and a search list is a floor.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(here, '..', '..');

const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const READS = /\bbase44\.entities\.[A-Za-z0-9_]+\.(?:list|filter)\(/g;
const WRITES = /\bbase44\.entities\.[A-Za-z0-9_]+\.(?:create|update|delete)\(/g;

// The enclosing block for a call: walk backwards to the nearest `useQuery({` or
// `mutationFn:` and forward to the matching close. Cheaper than a parser and
// scoped tightly enough that the NEXT hook's guard cannot satisfy this one.
function enclosing(code, index, opener) {
  const start = code.lastIndexOf(opener, index);
  if (start < 0) return null;
  return code.slice(start, index);
}

const PAGES = [
  { file: 'pages/WatchWallets.jsx', reads: 1, writes: 2 },
  { file: 'pages/CryptoDetailPage.jsx', reads: 1, writes: 0 },
  { file: 'pages/HDWalletManager.jsx', reads: 1, writes: 1 },
  { file: 'pages/ConnectWallet.jsx', reads: 0, writes: 1 },
  { file: 'components/security/WhitelistManager.jsx', reads: 1, writes: 2 },
];

describe.each(PAGES)('$file — shared-store deniability gate (#2537)', ({ file, reads, writes }) => {
  const code = stripComments(readFileSync(resolve(SRC, file), 'utf8'));

  it('derives `deniable` from DEMO, decoy, hidden AND the module-level predicate', () => {
    expect(code).toMatch(/\bisDecoy\b[\s\S]{0,80}\bisHidden\b[\s\S]{0,40}=\s*useWallet\(\)/);
    expect(code).toMatch(
      /const\s+deniable\s*=\s*DEMO\s*\|\|\s*isDecoy\s*\|\|\s*isHidden\s*\|\|\s*isDeniabilityOrDemoActive\(\)/,
    );
    expect(code).toMatch(/import\s*\{\s*DEMO\s*\}\s*from\s*["']@\/api\/demoClient["']/);
    expect(code).toMatch(/isDeniabilityOrDemoActive\s*\}\s*from\s*["']@\/wallet-core\/deniabilitySession["']/);
  });

  it(`every store read (${reads}) sits in a query disabled for a deniable session`, () => {
    const found = [...code.matchAll(READS)];
    expect(found.length, 'store read count changed — update this pin').toBe(reads);
    for (const m of found) {
      const block = enclosing(code, m.index, 'useQuery(');
      expect(block, `read at ${m[0]} is not inside a useQuery`).toBeTruthy();
      const whole = code.slice(code.lastIndexOf('useQuery(', m.index), m.index + 400);
      expect(whole, `ungated read: ${m[0]}`).toMatch(/enabled:[^,}]*!deniable/);
    }
  });

  it(`every store write (${writes}) refuses before touching the store`, () => {
    const found = [...code.matchAll(WRITES)];
    expect(found.length, 'store write count changed — update this pin').toBe(writes);
    for (const m of found) {
      const block = enclosing(code, m.index, 'mutationFn:');
      expect(block, `write at ${m[0]} is not inside a mutationFn`).toBeTruthy();
      expect(block, `unguarded write: ${m[0]}`).toMatch(/if\s*\(deniable\)\s*denyInDeniable\(\)/);
    }
  });

  it.runIf(writes > 0)('denyInDeniable throws DENIABILITY_BLOCKED', () => {
    expect(code).toMatch(
      /const\s+denyInDeniable\s*=\s*\(\)\s*=>\s*\{\s*throw\s+Object\.assign\([^;]*code:\s*["']DENIABILITY_BLOCKED["']/,
    );
  });
});

// SessionRevocationGuard is deliberately NOT in the list above, and this test
// exists so that decision is visible rather than looking like an omission.
//
// It reads UserSession filtered to THIS DEVICE's own session token — it never
// enumerates the real user's sessions, so there is nothing to leak. More
// importantly it is a SECURITY CONTROL: it locks the app when the session is
// revoked from elsewhere. Gating it in a decoy session would disable that
// control exactly when a coerced session is running, which is the opposite of
// what #2537 wants. If someone later "fixes" it for consistency, this pin
// fails and sends them here first.
describe('SessionRevocationGuard.jsx — intentionally ungated (#2537)', () => {
  const code = stripComments(
    readFileSync(resolve(SRC, 'components/SessionRevocationGuard.jsx'), 'utf8'),
  );

  it('reads only this device\'s own session row', () => {
    expect(code).toMatch(/UserSession\.filter\(\s*\{\s*session_token:\s*token\s*\}\s*\)/);
  });

  it('carries no deniability gate, by design', () => {
    expect(code).not.toMatch(/const\s+deniable\s*=/);
  });
});
