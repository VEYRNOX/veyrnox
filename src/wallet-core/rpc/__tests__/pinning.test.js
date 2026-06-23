// wallet-core/rpc/__tests__/pinning.test.js
//
// Network hardening (cert/host pinning) — fail-closed contract.
//
// HONESTY POSTURE: on the WEB platform a JS app cannot read the TLS leaf
// certificate's SPKI (the browser terminates TLS and exposes no cert API), so a
// real SPKI pin cannot be enforced honestly in the browser. What CAN be enforced
// is an allowlist of egress hostnames (the I2 surface — WHERE traffic goes). The
// SPKI map is the data a NATIVE Capacitor-HTTP pinned-cert config consumes
// (TARGET, real-device verification required). These tests pin the host-allowlist
// fail-closed behaviour and the SPKI lookup shape — asserting structure/throwing,
// not prose.

import { describe, it, expect } from 'vitest';
import {
  verifyPin,
  isPinnedHost,
  getExpectedSpki,
  pinnedFetch,
  PIN_ERROR,
} from '../pinning.js';

describe('verifyPin — host allowlist fail-closed', () => {
  it('passes for a known pinned host (https)', () => {
    expect(verifyPin('https://ethereum-sepolia-rpc.publicnode.com')).toBe(true);
  });

  it('throws PIN_ERROR.UNKNOWN_HOST for an unknown host (fail closed)', () => {
    expect(() => verifyPin('https://evil.example.com')).toThrowError(
      expect.objectContaining({ code: PIN_ERROR.UNKNOWN_HOST }),
    );
  });

  it('throws for loopback being treated as pinned (loopback is never pinned)', () => {
    // Loopback is an explicit operator escape hatch, not a pinned host: verifyPin
    // fails closed on it so the caller must opt in via the loopback bypass, never
    // silently "pass" an unpinned local node as if it were pinned.
    expect(() => verifyPin('http://localhost:8545')).toThrowError(
      expect.objectContaining({ code: PIN_ERROR.UNKNOWN_HOST }),
    );
  });

  it('throws for a malformed URL (fail closed, never pass)', () => {
    expect(() => verifyPin('not a url')).toThrowError(
      expect.objectContaining({ code: PIN_ERROR.BAD_URL }),
    );
  });
});

describe('isPinnedHost / getExpectedSpki — lookup shape', () => {
  it('isPinnedHost is true for a known host, false for unknown', () => {
    expect(isPinnedHost('bsc-testnet-rpc.publicnode.com')).toBe(true);
    expect(isPinnedHost('evil.example.com')).toBe(false);
  });

  it('getExpectedSpki returns a non-empty array of sha256/ SPKI pins for a known host', () => {
    const pins = getExpectedSpki('mempool.space');
    expect(Array.isArray(pins)).toBe(true);
    expect(pins.length).toBeGreaterThan(0);
    for (const p of pins) expect(p).toMatch(/^sha256\//);
  });

  it('getExpectedSpki returns null for an unknown host (fail closed at caller)', () => {
    expect(getExpectedSpki('evil.example.com')).toBeNull();
  });

  it('a pinned host with an EMPTY pin list fails closed (no pins = cannot verify)', () => {
    // An entry that exists but carries zero SPKI hashes must NOT be treated as
    // "verified" — an empty pin set can never match a real cert, so verifyPin
    // must refuse rather than wave it through.
    expect(() => verifyPin('https://veyrnox-test-empty-pins.invalid')).toThrowError(
      expect.objectContaining({ code: PIN_ERROR.NO_PINS }),
    );
  });
});

describe('pinnedFetch — fail-closed wrapper', () => {
  it('refuses (throws, does not call fetch) for an unknown host', async () => {
    let called = false;
    const fakeFetch = async () => { called = true; return { ok: true }; };
    await expect(
      pinnedFetch('https://evil.example.com/x', {}, { fetchImpl: fakeFetch }),
    ).rejects.toThrowError(expect.objectContaining({ code: PIN_ERROR.UNKNOWN_HOST }));
    expect(called).toBe(false);
  });

  it('calls through for a pinned host on web (host allowlist satisfied)', async () => {
    let seenUrl = null;
    const fakeFetch = async (u) => { seenUrl = u; return { ok: true, status: 200 }; };
    const res = await pinnedFetch(
      'https://mempool.space/testnet/api/fee-estimates',
      {},
      { fetchImpl: fakeFetch },
    );
    expect(res.ok).toBe(true);
    expect(seenUrl).toBe('https://mempool.space/testnet/api/fee-estimates');
  });

  it('allows an explicit loopback bypass (operator-run local node)', async () => {
    let called = false;
    const fakeFetch = async () => { called = true; return { ok: true }; };
    await pinnedFetch('http://127.0.0.1:8545', {}, { fetchImpl: fakeFetch, allowLoopback: true });
    expect(called).toBe(true);
  });
});
