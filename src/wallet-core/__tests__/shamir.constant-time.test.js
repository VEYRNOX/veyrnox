// src/wallet-core/__tests__/shamir.constant-time.test.js
//
// Audit 2026-08-03 M-7 — the GF(2^8) arithmetic contradicted its own governing
// spec. docs/cloud-recovery-shard-spec.md says the implementation "MUST be
// constant-time on the share bytes to prevent timing side-channels during
// reconstruction", but gfMul branched on whether either operand was zero and
// both gfMul/gfInv indexed 256/512-entry lookup tables with secret-derived
// bytes (the DEK at split time, share y-values at combine time) — the classic
// cache-timing shape, the same class as naive T-table AES.
//
// Two halves to this file:
//
//   1. STRUCTURAL — the GF routines contain no data-dependent branch and no
//      lookup table. This is what actually changed, and it is the part that can
//      be mechanically verified.
//
//   2. EXHAUSTIVE CORRECTNESS — replacing a working field implementation is the
//      real risk here, so gfMul is checked against an independent reference for
//      ALL 65,536 input pairs and gfInv for all 255 non-zero elements. These
//      pass before and after; they exist to prove the rewrite changed only the
//      timing profile, never a single output value.
//
// Honest limit, deliberately not overclaimed: JavaScript cannot guarantee
// constant-time execution end to end (JIT deoptimisation, GC, engine-level
// specialisation on integer ranges are all outside our control). What is
// verifiable, and what these tests pin, is the absence of secret-dependent
// branches and secret-indexed memory access in the source.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { split, combine, gfMul, gfInv } from '../shamir.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../shamir.js'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

// Isolate a top-level function body by name.
function bodyOf(name) {
  const start = code.indexOf(`function ${name}(`);
  expect(start, `${name} should exist`).toBeGreaterThan(-1);
  const open = code.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return code.slice(open, i + 1);
    }
  }
  throw new Error(`unbalanced braces in ${name}`);
}

// ---- independent reference: textbook shift-and-add, deliberately written in a
// DIFFERENT shape from the implementation (explicit branches) so a shared bug
// cannot cancel out. ----
function refMul(a, b) {
  let p = 0;
  let x = a & 0xFF;
  let y = b & 0xFF;
  for (let i = 0; i < 8; i++) {
    if (y & 1) p ^= x;
    const carry = x & 0x80;
    x = (x << 1) & 0xFF;
    if (carry) x ^= 0x1B;
    y >>= 1;
  }
  return p & 0xFF;
}

describe('shamir GF(2^8) — no secret-dependent branches or table lookups (M-7)', () => {
  it('the module defines no GF lookup tables at all', () => {
    // EXP_TABLE / LOG_TABLE were the cache-visible surface. The CRC table is a
    // separate concern: it is indexed by ENVELOPE bytes during integrity
    // checking, not by secret polynomial material, and is unchanged.
    expect(code).not.toMatch(/EXP_TABLE/);
    expect(code).not.toMatch(/LOG_TABLE/);
  });

  it('gfMul contains no branch and no array indexing', () => {
    const body = bodyOf('gfMul');
    expect(body).not.toMatch(/\bif\b/);
    expect(body).not.toMatch(/\?/);        // no ternary either
    expect(body).not.toMatch(/\w+\s*\[/);  // no indexed read of any kind
  });

  it('gfInv contains no branch on the VALUE being inverted and no array indexing', () => {
    const body = bodyOf('gfInv');
    expect(body).not.toMatch(/\w+\s*\[/);
    // A guard on the zero element is permitted: it is an error condition on a
    // public x-coordinate difference, not a branch on secret material. What must
    // not appear is a value-dependent search or table read.
    expect(body).not.toMatch(/for\s*\(/);
    expect(body).not.toMatch(/while\s*\(/);
  });

  it('the loop in gfMul runs a fixed 8 iterations regardless of input', () => {
    const body = bodyOf('gfMul');
    expect(body).toMatch(/for\s*\(\s*let\s+\w+\s*=\s*0\s*;\s*\w+\s*<\s*8\s*;/);
  });
});

describe('shamir GF(2^8) — exhaustive correctness (the rewrite changed timing, not values)', () => {
  it('gfMul matches an independent reference for all 65,536 input pairs', () => {
    let mismatches = 0;
    let firstBad = null;
    for (let a = 0; a < 256; a++) {
      for (let b = 0; b < 256; b++) {
        if (gfMul(a, b) !== refMul(a, b)) {
          mismatches++;
          if (!firstBad) firstBad = { a, b, got: gfMul(a, b), want: refMul(a, b) };
        }
      }
    }
    expect({ mismatches, firstBad }).toEqual({ mismatches: 0, firstBad: null });
  });

  it('multiplication by zero is absorbing (the case the old branch special-cased)', () => {
    for (let a = 0; a < 256; a++) {
      expect(gfMul(a, 0)).toBe(0);
      expect(gfMul(0, a)).toBe(0);
    }
  });

  it('1 is the multiplicative identity', () => {
    for (let a = 0; a < 256; a++) expect(gfMul(a, 1)).toBe(a);
  });

  it('multiplication is commutative across the whole field', () => {
    for (let a = 0; a < 256; a++) {
      for (let b = a; b < 256; b++) expect(gfMul(a, b)).toBe(gfMul(b, a));
    }
  });

  it('gfInv(a) * a === 1 for every non-zero element', () => {
    for (let a = 1; a < 256; a++) expect(gfMul(gfInv(a), a)).toBe(1);
  });

  it('gfInv is an involution: inv(inv(a)) === a', () => {
    for (let a = 1; a < 256; a++) expect(gfInv(gfInv(a))).toBe(a);
  });

  it('gfInv still fails closed on the zero element', () => {
    expect(() => gfInv(0)).toThrow('GF_ZERO_INVERSE');
  });
});

describe('shamir — end-to-end unaffected by the GF rewrite', () => {
  it('split/combine round-trips exactly for 25 random secrets', () => {
    for (let i = 0; i < 25; i++) {
      const secret = new Uint8Array(32);
      crypto.getRandomValues(secret);
      secret[0] |= 1;
      const shares = split(secret, 3, 2);
      expect(combine([shares[0], shares[1]])).toEqual(secret);
      expect(combine([shares[0], shares[2]])).toEqual(secret);
      expect(combine([shares[1], shares[2]])).toEqual(secret);
    }
  });

  it('round-trips for a higher threshold too (k=3, n=5)', () => {
    const secret = new Uint8Array(32);
    crypto.getRandomValues(secret);
    secret[0] |= 1;
    const shares = split(secret, 5, 3);
    expect(combine([shares[0], shares[2], shares[4]])).toEqual(secret);
  });
});
