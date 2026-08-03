// src/wallet-core/__tests__/shamir.forgery.test.js
//
// Audit 2026-08-03 H-6 — the share envelope was authenticated by CRC-32 ONLY.
// CRC-32 is an unkeyed, linear error-detection code whose algorithm sits in the
// same file, so anyone holding ONE legitimate share could edit any byte of a
// second share, recompute a valid CRC, and make combine() "reconstruct" a value
// of their choosing — returning normally, with no exception and no signal that
// anything was wrong.
//
// The module conceded this in a comment and pushed the safety net onto a caller
// that does not exist yet ("The caller MUST authenticate the reconstructed DEK
// against the vault's AES-256-GCM AAD"). An advisory contract that no caller is
// obliged to honour is not a control. combine() now verifies a hash commitment
// itself.
//
// This file reproduces the forgery. The GF(2^8) arithmetic below is an
// INDEPENDENT reimplementation (Russian-peasant multiply, brute-forced inverse)
// rather than an import of the module's tables, so the test proves the fix
// blocks a genuinely well-formed forgery and not merely a malformed buffer.

import { describe, it, expect } from 'vitest';
import { split, combine, SHARE_SIZE, SECRET_SIZE, HEADER_SIZE } from '../shamir.js';

// ---- independent GF(2^8) over the AES polynomial 0x11B ----
function gfMul(a, b) {
  let p = 0;
  for (let i = 0; i < 8; i++) {
    if (b & 1) p ^= a;
    const hi = a & 0x80;
    a = (a << 1) & 0xFF;
    if (hi) a ^= 0x1B;
    b >>= 1;
  }
  return p & 0xFF;
}
function gfInv(a) {
  for (let i = 1; i < 256; i++) if (gfMul(a, i) === 1) return i;
  throw new Error('no inverse for ' + a);
}

// ---- independent CRC-32 (IEEE), so a forged share passes the corruption check ----
const CRC_T = (() => {
  const T = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    T[i] = c >>> 0;
  }
  return T;
})();
function crc32(data, end) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < end; i++) crc = CRC_T[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  return (crc ^ 0xFFFFFFFF) >>> 0;
}
function reseal(share) {
  const crcAt = SHARE_SIZE - 4;
  const c = crc32(share, crcAt);
  share[crcAt] = (c >>> 0) & 0xFF;
  share[crcAt + 1] = (c >>> 8) & 0xFF;
  share[crcAt + 2] = (c >>> 16) & 0xFF;
  share[crcAt + 3] = (c >>> 24) & 0xFF;
  return share;
}

const X_OFFSET = 19;

// Forge a companion share so that {genuine, forged} interpolates to `target`.
// k = 2, so secret = L1*y1 + L2*y2 with L1 = x2/(x1+x2), L2 = x1/(x1+x2).
// Solving for y2:  y2 = (target + L1*y1) / L2.
function forgeCompanion(genuine, target, forgedX) {
  const forged = new Uint8Array(genuine); // inherit version/k/n/setId/commitment
  forged[X_OFFSET] = forgedX;
  const x1 = genuine[X_OFFSET];
  const x2 = forgedX;
  const denomInv = gfInv(x1 ^ x2);
  const L1 = gfMul(x2, denomInv);
  const L2 = gfMul(x1, denomInv);
  const L2inv = gfInv(L2);
  for (let i = 0; i < SECRET_SIZE; i++) {
    const y1 = genuine[HEADER_SIZE + i];
    forged[HEADER_SIZE + i] = gfMul(L2inv, target[i] ^ gfMul(L1, y1));
  }
  return reseal(forged);
}

function randomSecret() {
  const s = new Uint8Array(SECRET_SIZE);
  crypto.getRandomValues(s);
  s[0] |= 1; // never all-zero
  return s;
}

describe('shamir — CRC-only envelopes must not authenticate a forged share (H-6)', () => {
  it('the forgery is well-formed: it passes CRC and really does interpolate to the attacker target', () => {
    // A positive control. If this ever fails, the rejection test below would be
    // passing for the wrong reason (rejecting junk rather than a real forgery).
    const shares = split(randomSecret(), 3, 2);
    const target = new Uint8Array(SECRET_SIZE).fill(0xAA);
    const forged = forgeCompanion(shares[0], target, 2);

    // CRC is valid over the whole envelope-minus-CRC region.
    const crcAt = SHARE_SIZE - 4;
    const expected = crc32(forged, crcAt);
    const actual = forged[crcAt] | (forged[crcAt + 1] << 8) | (forged[crcAt + 2] << 16) | (forged[crcAt + 3] << 24);
    expect(actual >>> 0).toBe(expected >>> 0);

    // And the Lagrange math genuinely lands on the attacker's chosen value.
    const x1 = shares[0][X_OFFSET];
    const x2 = forged[X_OFFSET];
    const dInv = gfInv(x1 ^ x2);
    const L1 = gfMul(x2, dInv);
    const L2 = gfMul(x1, dInv);
    for (let i = 0; i < SECRET_SIZE; i++) {
      const v = gfMul(L1, shares[0][HEADER_SIZE + i]) ^ gfMul(L2, forged[HEADER_SIZE + i]);
      expect(v).toBe(target[i]);
    }
  });

  it('combine() REJECTS a CRC-valid forged share instead of silently returning the attacker value', () => {
    const secret = randomSecret();
    const shares = split(secret, 3, 2);
    const target = new Uint8Array(SECRET_SIZE).fill(0xAA);
    const forged = forgeCompanion(shares[0], target, 2);

    // Before the fix this returned `target` with no throw at all.
    expect(() => combine([shares[0], forged])).toThrow();
  });

  it('never returns the attacker-chosen value, however combine() fails', () => {
    const shares = split(randomSecret(), 3, 2);
    const target = new Uint8Array(SECRET_SIZE).fill(0x5C);
    const forged = forgeCompanion(shares[0], target, 3);

    let out = null;
    try { out = combine([shares[0], forged]); } catch { out = null; }
    expect(out).toBeNull();
  });

  it('rejects a share whose declared threshold k was lowered and CRC recomputed', () => {
    // k and n sit inside the CRC-protected region and were only cross-checked
    // BETWEEN shares, never authenticated. Binding them into the commitment
    // closes that too.
    const shares = split(randomSecret(), 3, 2);
    const tampered = shares.map((s) => {
      const c = new Uint8Array(s);
      c[1] = 3; // claim k = 3
      return reseal(c);
    });
    expect(() => combine(tampered)).toThrow();
  });

  it('rejects a share whose commitment was stripped to zeroes', () => {
    const shares = split(randomSecret(), 3, 2);
    const stripped = shares.map((s) => {
      const c = new Uint8Array(s);
      for (let i = HEADER_SIZE + SECRET_SIZE; i < SHARE_SIZE - 4; i++) c[i] = 0;
      return reseal(c);
    });
    expect(() => combine(stripped)).toThrow();
  });

  it('still round-trips genuine shares (the control that the check is not simply always-throw)', () => {
    const secret = randomSecret();
    const shares = split(secret, 3, 2);
    expect(combine([shares[0], shares[2]])).toEqual(secret);
    expect(combine([shares[1], shares[2]])).toEqual(secret);
    expect(combine(shares)).toEqual(secret);
  });
});
