// wallet-core/btc/__tests__/derivation.zeroize.test.js
//
// M-1 (audit 2026-07-28): deriveBtcAccount used to leak the BIP-39 seed and the
// HD master private key to GC — either can re-derive every child key on every
// chain (same seed backs EVM, BTC, SOL). Mirrors the EVM equivalent in
// wallet-core/derivation.js (PR #1113, L-1).
//
// Two things are pinned here:
//   1. deriveBtcAccount zeros the seed buffer and the master private key by the
//      time it returns (and even if a downstream throw occurs — try/finally).
//      Verified by spying on Uint8Array.prototype.fill so tests do not need
//      access to the intermediate buffers themselves.
//   2. deriveBtcAddress additionally wipes the leaf privateKey before
//      returning, because the receive/display path never signs — the leaf key
//      is pure attack surface here.

import { describe, it, expect, vi, afterEach } from 'vitest';
import { deriveBtcAccount, deriveBtcAddress } from '../derivation.js';

const TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('btc/derivation — seed + master zeroize (M-1)', () => {
  it('deriveBtcAccount zeros the seed and master private key before returning', () => {
    // Record every Uint8Array that .fill(0) is called on, and only those.
    const zeroedBuffers = [];
    const origFill = Uint8Array.prototype.fill;
    const fillSpy = vi
      .spyOn(Uint8Array.prototype, 'fill')
      .mockImplementation(function (value, ...rest) {
        if (value === 0) zeroedBuffers.push({ len: this.length, ref: this });
        return origFill.call(this, value, ...rest);
      });

    const acct = deriveBtcAccount(TEST_MNEMONIC, {
      networkKey: 'testnet',
      change: 0,
      index: 0,
    });

    // The correctness side is covered by btc-derivation.test.js; here we only
    // need the derivation to have SUCCEEDED before checking the wipe.
    expect(acct.address.startsWith('tb1q')).toBe(true);

    // seed = 64 bytes, master.privateKey = 32 bytes. Both must have been
    // zeroed by the finally block. There is exactly ONE seed and ONE master
    // priv per call — the two lengths together are the fingerprint.
    const lengths = zeroedBuffers.map((b) => b.len).sort();
    expect(lengths).toContain(64);
    expect(lengths).toContain(32);
    expect(fillSpy).toHaveBeenCalled();

    // Sanity — the returned child privateKey is a live signing secret; caller
    // is responsible for wiping it (see M-2 / send.zeroing.test.js). It must
    // NOT have been the buffer we zeroed here.
    expect(acct.privateKey.some((b) => b !== 0)).toBe(true);
  });

  it('deriveBtcAddress wipes the leaf privateKey before returning', () => {
    // Capture the leaf privateKey buffer that deriveBtcAccount hands back.
    // Trick: monkey-patch Uint8Array.prototype.fill to remember every
    // 32-byte buffer that gets zeroed. deriveBtcAddress must have zeroed the
    // 32-byte leaf key IN ADDITION to the seed (64) and master (32).
    const zeroed32ByteRefs = [];
    const origFill = Uint8Array.prototype.fill;
    vi.spyOn(Uint8Array.prototype, 'fill').mockImplementation(function (value, ...rest) {
      if (value === 0 && this.length === 32) zeroed32ByteRefs.push(this);
      return origFill.call(this, value, ...rest);
    });

    const out = deriveBtcAddress(TEST_MNEMONIC, {
      networkKey: 'testnet',
      change: 0,
      index: 0,
    });

    // Public surface: address + path only, no key material.
    expect(Object.keys(out).sort()).toEqual(['address', 'path']);
    expect(out.address.startsWith('tb1q')).toBe(true);

    // At least TWO distinct 32-byte buffers were zeroed: master.privateKey
    // AND the leaf child.privateKey. (deriveBtcAccount alone zeros only one
    // 32-byte buffer — the master.)
    const distinct = new Set(zeroed32ByteRefs);
    expect(distinct.size).toBeGreaterThanOrEqual(2);
  });
});
