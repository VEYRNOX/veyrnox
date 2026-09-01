import { describe, it, expect, vi, afterEach } from 'vitest';

import {
  split,
  combine,
  SHARE_SIZE,
  SECRET_SIZE,
  HEADER_SIZE,
  SHARE_VERSION_V2,
  SHARE_VERSION_V3,
  MIXED_SHARE_VERSIONS,
  getShareVersion,
  getShareSize,
  isRecognizedShareVersion,
  isValidShareShape,
} from '../shamir.js';

function randomSecret() {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  return buf;
}

describe('shamir – constants', () => {
  it('exports correct sizes', () => {
    expect(SECRET_SIZE).toBe(32);
    // envelope v2 (H-6): 1+1+1+16+1+32+32+4 — the extra 32 is the commitment.
    expect(SHARE_SIZE).toBe(88);
  });

  it('exports version helpers for migration groundwork', () => {
    expect(SHARE_VERSION_V2).toBe(0x02);
    expect(SHARE_VERSION_V3).toBe(0x03);
    expect(MIXED_SHARE_VERSIONS).toBe('MIXED_SHARE_VERSIONS');
    expect(getShareSize(SHARE_VERSION_V2)).toBe(SHARE_SIZE);
    expect(getShareSize(SHARE_VERSION_V3)).toBe(null);
    expect(isRecognizedShareVersion(SHARE_VERSION_V2)).toBe(true);
    expect(isRecognizedShareVersion(SHARE_VERSION_V3)).toBe(true);
    expect(isRecognizedShareVersion(0xFF)).toBe(false);
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
      expect(getShareVersion(s)).toBe(SHARE_VERSION_V2);
      expect(isValidShareShape(s)).toBe(true);
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
      expect(s[0]).toBe(0x02); // version (v2 — envelope carries a commitment)
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

  it('rejects a recognized mixed-version share set before attempting combine', () => {
    const secret = randomSecret();
    const shares = split(secret);
    const mixed = new Uint8Array(shares[1]);
    mixed[0] = SHARE_VERSION_V3;
    expect(() => combine([shares[0], mixed])).toThrow(MIXED_SHARE_VERSIONS);
  });
});

describe('shamir – envelope validation', () => {
  // NOTE: this test used to tamper the version to 0x02. When the envelope moved
  // to v2 (H-6) that made the "tampered" share byte-identical to a genuine one,
  // so the test silently became vacuous — it asserted a rejection that could no
  // longer occur. Rewritten to use versions that are genuinely unsupported, and
  // widened to pin that the LEGACY v1 envelope is rejected rather than
  // downgraded to (v1 has no commitment, so accepting it would reopen H-6).
  it('rejects shares with an unsupported version byte', () => {
    const secret = randomSecret();
    const shares = split(secret);
    for (const badVersion of [0x00, 0x01, 0x03, 0xFF]) {
      const tampered = new Uint8Array(shares[0]);
      tampered[0] = badVersion;
      expect(() => combine([tampered, shares[1]])).toThrow(/VERSION|CORRUPT/);
    }
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

  it('rejects more shares than encoded n', () => {
    const secret = randomSecret();
    const shares = split(secret);
    // Duplicate share[2] with a different x to get 4 shares for n=3
    const extra = new Uint8Array(shares[2]);
    expect(() => combine([shares[0], shares[1], shares[2], extra])).toThrow('TOO_MANY_SHARES');
  });

  it('accepts all n shares and verifies extras against the polynomial', () => {
    const secret = randomSecret();
    const shares = split(secret); // n=3, k=2
    const recovered = combine([shares[0], shares[1], shares[2]]);
    expect(recovered).toEqual(secret);
  });

  it('rejects an inconsistent extra share (wrong y-values but valid CRC)', () => {
    const secret = randomSecret();
    const sharesA = split(secret);
    // Build a Frankenstein: take two consistent shares plus an extra whose
    // y-value is deliberately corrupted while its envelope remains valid.
    //
    // This used to build the extra share from a SECOND split of the same
    // secret, and bf233155 changed it because that was flaky. The rationale it
    // recorded — "a second random split can occasionally produce the same
    // polynomial" — was correct, and the cause turned out to matter far more
    // than the flake: @stablelib/tss reused ONE coefficient byte across all 32
    // secret bytes, so two splits collided at 1/256 (measured 0.380% over
    // 200k trials) and, much worse, a single share determined the secret up to
    // 256 guesses. Fixed in shamir.js by calling splitRaw per octet; see issue
    // #2213 and shamir.coefficientReuse.test.js.
    //
    // Two splits now collide with probability ~2^-256, so the old construction
    // would no longer flake — but the deterministic mutation below is still
    // the better test, so it stays.
    const franken = new Uint8Array(sharesA[2]);
    // Offsets are derived from exported constants, so an envelope format change
    // cannot silently point this mutation at the wrong bytes.
    const Y_START = HEADER_SIZE;
    const CRC_AT = SHARE_SIZE - 4;
    franken[Y_START] ^= 0x01;
    // The commitment is left unchanged, so the share is authentic-looking at
    // every layer except the polynomial itself. This isolates the extra-share
    // consistency check.
    // Recompute CRC so it passes the corruption check
    const crc32Fn = (data) => {
      const T = new Uint32Array(256);
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        T[i] = c >>> 0;
      }
      let crc = 0xFFFFFFFF;
      for (let i = 0; i < CRC_AT; i++) crc = T[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
      return (crc ^ 0xFFFFFFFF) >>> 0;
    };
    const c = crc32Fn(franken);
    franken[CRC_AT] = (c >>> 0) & 0xFF;
    franken[CRC_AT + 1] = (c >>> 8) & 0xFF;
    franken[CRC_AT + 2] = (c >>> 16) & 0xFF;
    franken[CRC_AT + 3] = (c >>> 24) & 0xFF;
    expect(() => combine([sharesA[0], sharesA[1], franken])).toThrow('SHARE_INCONSISTENT');
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
