import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { split, combine } from '../shamir.js';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../shamir.js'), 'utf8');

function randomSecret() {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  secret[0] |= 1;
  return secret;
}

describe('shamir — StableLib adoption boundary', () => {
  it('routes split/combine through the audited StableLib raw TSS core', () => {
    expect(src).toMatch(/from '@stablelib\/tss'/);
    expect(src).toMatch(/\bsplitRaw\b/);
    expect(src).toMatch(/\bcombineRaw\b/);
  });

  it('keeps StableLib on split/combine while limiting local GF code to audited compatibility helpers', () => {
    expect(src).toMatch(/function gfMul\(/);
    expect(src).toMatch(/function gfInv\(/);
    expect(src).not.toMatch(/function polyEval\(/);
  });
});

describe('shamir — end-to-end unaffected by the library swap', () => {
  it('split/combine round-trips exactly for 25 random secrets', () => {
    for (let i = 0; i < 25; i++) {
      const secret = randomSecret();
      const shares = split(secret, 3, 2);
      expect(combine([shares[0], shares[1]])).toEqual(secret);
      expect(combine([shares[0], shares[2]])).toEqual(secret);
      expect(combine([shares[1], shares[2]])).toEqual(secret);
    }
  });

  it('round-trips for a higher threshold too (k=3, n=5)', () => {
    const secret = randomSecret();
    const shares = split(secret, 5, 3);
    expect(combine([shares[0], shares[2], shares[4]])).toEqual(secret);
  });
});
