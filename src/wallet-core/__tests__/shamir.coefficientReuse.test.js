import { describe, it, expect } from 'vitest';
import { mul, add } from '@stablelib/gf256';
import { split, combine, SECRET_SIZE, HEADER_SIZE } from '../shamir.js';

// Regression guard for issue #2213.
//
// @stablelib/tss's splitRaw() draws its coefficient vector ONCE, outside both
// of its loops, then overwrites only a[0] with each successive secret byte. At
// k=2 that leaves a single random byte masking all 32 bytes of the DEK, so one
// share determines the secret up to 256 guesses and the 2-of-3 threshold
// property does not hold. shamir.js therefore calls splitRaw per OCTET.
//
// These tests assert the SECURITY PROPERTY, not the implementation: they fail
// for any change that reintroduces a shared coefficient, including a
// well-meaning "just call splitRaw once, it's the audited core" simplification.

function randomSecret() {
  const secret = new Uint8Array(SECRET_SIZE);
  crypto.getRandomValues(secret);
  secret[0] |= 1; // never all-zero (split rejects that)
  return secret;
}

const yBytes = (share) => share.subarray(HEADER_SIZE, HEADER_SIZE + SECRET_SIZE);
const hex = (u) => [...u].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)));

describe('shamir — one share must not determine the secret (#2213)', () => {
  it('resists the 256-candidate single-share attack', () => {
    // y[i] = s[i] + a1*x holds only if ONE coefficient masks every byte. If it
    // does, iterating a1 over GF(256) reproduces the secret exactly once.
    // Sound per-octet coefficients make every candidate wrong.
    for (let trial = 0; trial < 50; trial++) {
      const secret = randomSecret();
      const shares = split(secret, 3, 2);
      const share = shares[0];
      const x = share[HEADER_SIZE - 1]; // envelope: x is the last header byte
      const y = yBytes(share);

      let hit = false;
      for (let a1 = 0; a1 < 256 && !hit; a1++) {
        let all = true;
        for (let i = 0; i < SECRET_SIZE; i++) {
          if (add(y[i], mul(a1, x)) !== secret[i]) { all = false; break; }
        }
        if (all) hit = true;
      }
      expect(hit, 'a single share reproduced the secret under some a1 — coefficient is shared across bytes').toBe(false);
    }
  });

  it('masks each secret byte independently', () => {
    // With one shared coefficient, (share1 XOR share2) is the SAME value at
    // every byte position — measured 1/1 distinct before the fix, ~30/32 after.
    // Threshold of 8 is far below the sound average and far above the broken
    // value of 1, so it is neither flaky nor satisfiable by a partial fix.
    for (let trial = 0; trial < 25; trial++) {
      const shares = split(randomSecret(), 3, 2);
      const a = yBytes(shares[0]);
      const b = yBytes(shares[1]);
      const distinct = new Set();
      for (let i = 0; i < SECRET_SIZE; i++) distinct.add(a[i] ^ b[i]);
      expect(distinct.size, 'y-byte differences repeat — bytes share a coefficient').toBeGreaterThan(8);
    }
  });

  it('draws fresh coefficients per split, so two splits of one secret differ', () => {
    // The 1/256 collision this caused is what made the "inconsistent extra
    // share" case in shamir.test.js flaky (measured 0.380% over 200k trials).
    // With per-octet coefficients the collision probability is ~2^-256.
    const secret = randomSecret();
    let identical = 0;
    for (let trial = 0; trial < 500; trial++) {
      const A = split(new Uint8Array(secret), 3, 2);
      const B = split(new Uint8Array(secret), 3, 2);
      if (hex(yBytes(A[2])) === hex(yBytes(B[2]))) identical++;
    }
    expect(identical, 'two independent splits produced the same polynomial').toBe(0);
  });
});

describe('shamir — the fix is format-compatible', () => {
  // Golden vector generated with the PRE-fix code (origin/main @ 2b979a36,
  // which called splitRaw once for the whole secret). Existing exported
  // bundles must keep restoring: combineRaw is Lagrange interpolation and is
  // indifferent to how the coefficients were chosen. If this ever fails, the
  // change is no longer a drop-in and needs an envelope bump plus a migration.
  //
  // These shares are deliberately WEAK (that is the bug) — they are a
  // compatibility fixture for a throwaway test secret, not key material.
  const SECRET = '030a11181f262d343b424950575e656c737a81888f969da4abb2b9c0c7ced5dc';
  const SHARES = [
    '02020325ddbb54a9397ca0d7a7c81d998e51b5019198838a8db4bfa6a9d0dbc2c5ccf7fee1e8131a1d040f3639202b52555c474e29f87584d05266fdaedf0ccb520ef0a56f805487c0ada7832735ef493e7be3f871e90bc4',
    '02020325ddbb54a9397ca0d7a7c81d998e51b5023c352e272019120b047d766f68615a534c45beb7b0a9a29b948d86fff8f1eae329f87584d05266fdaedf0ccb520ef0a56f805487c0ada7832735ef493e7be3f8014204da',
    '02020325ddbb54a9397ca0d7a7c81d998e51b503aea7bcb5b28b809996efe4fdfaf3c8c1ded72c25223b3009061f146d6a63787129f87584d05266fdaedf0ccb520ef0a56f805487c0ada7832735ef493e7be3f8545ed7d7',
  ];

  it('still reconstructs shares written before the fix', () => {
    const expected = unhex(SECRET);
    const shares = SHARES.map(unhex);
    for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
      expect(hex(combine([shares[i], shares[j]])), `pair ${i},${j}`).toBe(SECRET);
    }
    expect(combine([shares[0], shares[1]])).toEqual(expected);
  });

  it('round-trips newly written shares on every 2-of-3 pair', () => {
    for (let trial = 0; trial < 25; trial++) {
      const secret = randomSecret();
      const shares = split(new Uint8Array(secret), 3, 2);
      for (const [i, j] of [[0, 1], [0, 2], [1, 2]]) {
        expect(combine([shares[i], shares[j]]), `pair ${i},${j}`).toEqual(secret);
      }
    }
  });
});
