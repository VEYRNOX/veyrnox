import { describe, it, expect, vi, afterEach } from 'vitest';

import { split, combine, SHARE_SIZE, SECRET_SIZE } from '../shamir.js';

function randomSecret() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf;
}

describe('shamir – constants', () => {
  it('exports correct sizes', () => {
    expect(SECRET_SIZE).toBe(32);
    expect(SHARE_SIZE).toBe(56);
  });
});

describe('shamir – split', () => {
  it('returns 3 shares of SHARE_SIZE bytes each for a 32-byte secret', () => {
    const secret = randomSecret();
    const shares = split(secret);
    expect(shares).toHaveLength(3);
    for (const s of shares) {
      expect(s).toBeInstanceOf(Uint8Array);
      expect(s.length).toBe(SHARE_SIZE);
    }
  });

  it('shares have distinct x-coordinates 1, 2, 3 at byte 19', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const xs = shares.map(s => s[19]);
    expect(xs).toEqual([1, 2, 3]);
  });

  it('all shares carry the same envelope header (version, k, n, setId)', () => {
    const secret = randomSecret();
    const shares = split(secret);
    for (const s of shares) {
      expect(s[0]).toBe(0x01); // version
      expect(s[1]).toBe(2);    // k
      expect(s[2]).toBe(3);    // n
    }
    // setId (bytes 3..18) must be identical across all shares
    const setId0 = shares[0].slice(3, 19);
    for (let i = 1; i < shares.length; i++) {
      expect(shares[i].slice(3, 19)).toEqual(setId0);
    }
  });

  it('different splits produce different setIds', () => {
    const secret = randomSecret();
    const a = split(secret);
    const b = split(secret);
    const idA = Array.from(a[0].slice(3, 19));
    const idB = Array.from(b[0].slice(3, 19));
    expect(idA).not.toEqual(idB);
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

  it('rejects n > 255', () => {
    const secret = randomSecret();
    expect(() => split(secret, 256, 2)).toThrow('INVALID_PARAMS');
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
    expect(() => combine([shares[0]])).toThrow('INSUFFICIENT_SHARES');
  });

  it('rejects duplicate x-coordinates', () => {
    const secret = randomSecret();
    const shares = split(secret);
    expect(() => combine([shares[0], shares[0]])).toThrow('DUPLICATE_X_COORD');
  });

  it('rejects wrong-size shares', () => {
    const bad1 = new Uint8Array(32);
    const bad2 = new Uint8Array(34);
    expect(() => combine([bad1, bad2])).toThrow('INVALID_SHARE_SIZE');
  });

  it('rejects shares of inconsistent lengths', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const truncated = shares[1].slice(0, 20);
    expect(() => combine([shares[0], truncated])).toThrow('INVALID_SHARE_SIZE');
  });
});

describe('shamir – envelope validation', () => {
  it('rejects shares with tampered version byte', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const tampered = new Uint8Array(shares[0]);
    tampered[0] = 0x02;
    expect(() => combine([tampered, shares[1]])).toThrow(/VERSION|CORRUPT/);
  });

  it('rejects shares with mismatched k (threshold)', () => {
    const secret = randomSecret();
    const shares = split(secret);
    // Tamper share[1]'s k so it disagrees with share[0]
    const tampered = new Uint8Array(shares[1]);
    tampered[1] = 3; // change k from 2 to 3
    expect(() => combine([shares[0], tampered])).toThrow(/THRESHOLD_MISMATCH|CORRUPT/);
  });

  it('rejects shares with mismatched n', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const tampered = new Uint8Array(shares[0]);
    tampered[2] = 5; // change n from 3 to 5
    expect(() => combine([tampered, shares[1]])).toThrow(/N_MISMATCH|CORRUPT/);
  });

  it('rejects shares from different splits (different setId)', () => {
    const secret = randomSecret();
    const sharesA = split(secret);
    const sharesB = split(secret);
    expect(() => combine([sharesA[0], sharesB[1]])).toThrow('SET_ID_MISMATCH');
  });

  it('rejects corrupted share data (CRC check)', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const tampered = new Uint8Array(shares[0]);
    tampered[25] ^= 0xFF; // flip a y-value byte
    expect(() => combine([tampered, shares[1]])).toThrow('SHARE_CORRUPT');
  });

  it('rejects shares with tampered x-coordinate set to 0', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const tampered = new Uint8Array(shares[0]);
    tampered[19] = 0;
    // CRC will catch this before x=0 check
    expect(() => combine([tampered, shares[1]])).toThrow(/CORRUPT|INVALID_SHARE_X/);
  });

  it('rejects fewer shares than the encoded threshold k', () => {
    const secret = randomSecret();
    const shares = split(secret, 3, 3); // k=3
    // only provide 2 shares — envelope says k=3
    expect(() => combine([shares[0], shares[1]])).toThrow('INSUFFICIENT_SHARES');
  });

  it('3-of-3 split requires all 3 shares to reconstruct', () => {
    const secret = randomSecret();
    const shares = split(secret, 3, 3);
    const recovered = combine([shares[0], shares[1], shares[2]]);
    expect(recovered).toEqual(secret);
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
    mathSpy.mockClear();

    split(secret);

    expect(mathSpy).not.toHaveBeenCalled();
  });
});

describe('shamir – GF(2^8) field correctness', () => {
  it('reconstructs a known fixed secret deterministically', () => {
    const secret = new Uint8Array(32);
    for (let i = 0; i < 32; i++) secret[i] = i + 1;
    const shares = split(secret);
    expect(combine([shares[0], shares[1]])).toEqual(secret);
    expect(combine([shares[0], shares[2]])).toEqual(secret);
    expect(combine([shares[1], shares[2]])).toEqual(secret);
  });
});
