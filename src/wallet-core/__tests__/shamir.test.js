import { describe, it, expect, vi, afterEach } from 'vitest';

// Will fail until shamir.js exists
import { split, combine, SHARE_SIZE, SECRET_SIZE } from '../shamir.js';

function randomSecret() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf;
}

describe('shamir – constants', () => {
  it('exports correct sizes', () => {
    expect(SECRET_SIZE).toBe(32);
    expect(SHARE_SIZE).toBe(33);
  });
});

describe('shamir – split', () => {
  it('returns 3 shares of 33 bytes each for a 32-byte secret', () => {
    const secret = randomSecret();
    const shares = split(secret);
    expect(shares).toHaveLength(3);
    for (const s of shares) {
      expect(s).toBeInstanceOf(Uint8Array);
      expect(s.length).toBe(SHARE_SIZE);
    }
  });

  it('shares have distinct x-coordinates 1, 2, 3', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const xs = shares.map(s => s[0]);
    expect(xs).toEqual([1, 2, 3]);
  });

  it('rejects all-zero secret', () => {
    const zero = new Uint8Array(32);
    expect(() => split(zero)).toThrow('ALL_ZERO_SECRET');
  });

  it('rejects wrong-size input (too short)', () => {
    const short = new Uint8Array(16);
    crypto.getRandomValues(short);
    expect(() => split(short)).toThrow('INVALID_SECRET_SIZE');
  });

  it('rejects wrong-size input (too long)', () => {
    const long = new Uint8Array(64);
    crypto.getRandomValues(long);
    expect(() => split(long)).toThrow('INVALID_SECRET_SIZE');
  });

  it('rejects zero-length secret', () => {
    expect(() => split(new Uint8Array(0))).toThrow('INVALID_SECRET_SIZE');
  });

  it('rejects n < k', () => {
    const secret = randomSecret();
    expect(() => split(secret, 1, 2)).toThrow('INVALID_PARAMS');
  });

  it('rejects k < 2', () => {
    const secret = randomSecret();
    expect(() => split(secret, 3, 1)).toThrow('INVALID_PARAMS');
  });
});

describe('shamir – combine', () => {
  it('reconstructs the original secret from shares [0,1]', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const recovered = combine([shares[0], shares[1]]);
    expect(recovered).toEqual(secret);
  });

  it('reconstructs the original secret from shares [0,2]', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const recovered = combine([shares[0], shares[2]]);
    expect(recovered).toEqual(secret);
  });

  it('reconstructs the original secret from shares [1,2]', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const recovered = combine([shares[1], shares[2]]);
    expect(recovered).toEqual(secret);
  });

  it('all 3 combinations of 2-from-3 produce the same result', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const r01 = combine([shares[0], shares[1]]);
    const r02 = combine([shares[0], shares[2]]);
    const r12 = combine([shares[1], shares[2]]);
    expect(r01).toEqual(secret);
    expect(r02).toEqual(secret);
    expect(r12).toEqual(secret);
  });

  it('single share cannot reconstruct (returns wrong value)', () => {
    const secret = randomSecret();
    const shares = split(secret);
    // Attempting combine with 1 share should reject (k < 2 shares)
    expect(() => combine([shares[0]])).toThrow('INSUFFICIENT_SHARES');
  });

  it('rejects duplicate x-coordinates', () => {
    const secret = randomSecret();
    const shares = split(secret);
    // Pass same share twice
    expect(() => combine([shares[0], shares[0]])).toThrow('DUPLICATE_X_COORD');
  });

  it('rejects shares with x-coordinate 0', () => {
    const secret = randomSecret();
    const shares = split(secret);
    // Tamper: set x-coord to 0
    const tampered = new Uint8Array(shares[0]);
    tampered[0] = 0;
    expect(() => combine([tampered, shares[1]])).toThrow('INVALID_SHARE_X');
  });

  it('rejects n > 255 (would wrap x-coordinates)', () => {
    const secret = randomSecret();
    expect(() => split(secret, 256, 2)).toThrow('INVALID_PARAMS');
  });

  it('rejects wrong-size shares', () => {
    const bad1 = new Uint8Array(32); // too short
    const bad2 = new Uint8Array(34); // too long
    expect(() => combine([bad1, bad2])).toThrow('INVALID_SHARE_SIZE');
  });

  it('rejects shares of inconsistent lengths', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const truncated = shares[1].slice(0, 20);
    expect(() => combine([shares[0], truncated])).toThrow('INVALID_SHARE_SIZE');
  });
});

describe('shamir – round-trip fuzz', () => {
  it('split then combine for 10 random secrets', () => {
    for (let i = 0; i < 10; i++) {
      const secret = randomSecret();
      const shares = split(secret);
      const recovered = combine([shares[0], shares[2]]);
      expect(recovered).toEqual(secret);
    }
  });
});

describe('shamir – RNG usage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('uses crypto.getRandomValues, not Math.random', () => {
    const mathSpy = vi.spyOn(Math, 'random');
    const secret = randomSecret();
    // Clear the call from randomSecret() itself
    mathSpy.mockClear();

    split(secret);

    expect(mathSpy).not.toHaveBeenCalled();
  });
});

describe('shamir – GF(2^8) field correctness', () => {
  it('reconstructs a known fixed secret deterministically', () => {
    // Use a fixed secret and verify split/combine round-trips
    const secret = new Uint8Array(32);
    for (let i = 0; i < 32; i++) secret[i] = i + 1; // 1..32
    const shares = split(secret);
    // All 3 pairwise combos must reconstruct
    expect(combine([shares[0], shares[1]])).toEqual(secret);
    expect(combine([shares[0], shares[2]])).toEqual(secret);
    expect(combine([shares[1], shares[2]])).toEqual(secret);
  });
});
