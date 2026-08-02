/**
 * Shamir Secret Sharing over GF(2^8) — AES field (irreducible poly 0x11B).
 *
 * Pure implementation, no external dependencies beyond Web Crypto RNG.
 * Designed for 2-of-3 threshold splitting of 32-byte DEK material.
 *
 * Share envelope (v1, 56 bytes):
 *   [0]       version   = 0x01
 *   [1]       k         threshold required for reconstruction
 *   [2]       n         total shares in this set
 *   [3..18]   setId     16-byte random identifier (same across all shares in a split)
 *   [19]      x         evaluation point (1-indexed)
 *   [20..51]  y[32]     evaluated polynomial bytes
 *   [52..55]  crc32     IEEE CRC-32 of bytes [0..51]
 *
 * Security properties:
 *   - RNG: crypto.getRandomValues only (CSPRNG)
 *   - Intermediate buffers zeroed in finally blocks
 *   - Input validation: fail-closed on malformed input
 *   - Envelope prevents mixing shares from different splits or wrong thresholds
 *   - CRC32 detects corruption (not authentication — the vault's AES-GCM AAD
 *     authenticates the reconstructed DEK)
 *   - combine() uses exactly k shares for interpolation, then verifies any extras
 *     against the reconstructed polynomial — a single inconsistent share is a
 *     hard reject
 *   - Input shares are defensively copied before validation to prevent TOCTOU
 *     via SharedArrayBuffer
 *   - NOT constant-time: gfMul branches on zero, table lookups are cache-visible
 *
 * @module wallet-core/shamir
 */

export const SECRET_SIZE = 32;
export const SHARE_SIZE = 56; // envelope v1: 1+1+1+16+1+32+4

const ENVELOPE_VERSION = 0x01;
const SET_ID_SIZE = 16;
const HEADER_SIZE = 20; // version(1) + k(1) + n(1) + setId(16) + x(1)
const CRC_SIZE = 4;

// ---------------------------------------------------------------------------
// CRC-32 (IEEE 802.3) — corruption detection for share envelopes
// ---------------------------------------------------------------------------

const CRC_TABLE = new Uint32Array(256);
(() => {
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
      c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    }
    CRC_TABLE[i] = c >>> 0;
  }
})();

function crc32(data, start = 0, end = data.length) {
  let crc = 0xFFFFFFFF;
  for (let i = start; i < end; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

// ---------------------------------------------------------------------------
// GF(2^8) arithmetic — irreducible polynomial x^8 + x^4 + x^3 + x + 1 = 0x11B
// ---------------------------------------------------------------------------

const GF_ORDER = 256;
const IRREDUCIBLE = 0x11b;

const EXP_TABLE = new Uint8Array(512);
const LOG_TABLE = new Uint8Array(256);

const GF_GENERATOR = 3;

(() => {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    EXP_TABLE[i + 255] = x;
    LOG_TABLE[x] = i;
    x = gfMulByGen(x);
  }
  LOG_TABLE[0] = 0;
})();

function gfMulByGen(a) {
  let a2 = a << 1;
  if (a2 & 0x100) a2 ^= IRREDUCIBLE;
  return a2 ^ a;
}

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0;
  return EXP_TABLE[LOG_TABLE[a] + LOG_TABLE[b]];
}

function gfInv(a) {
  if (a === 0) throw new Error('GF_ZERO_INVERSE');
  return EXP_TABLE[255 - LOG_TABLE[a]];
}

function gfAdd(a, b) {
  return a ^ b;
}

// ---------------------------------------------------------------------------
// Polynomial evaluation
// ---------------------------------------------------------------------------

function polyEval(coeffs, x) {
  let result = 0;
  for (let i = coeffs.length - 1; i >= 0; i--) {
    result = gfAdd(gfMul(result, x), coeffs[i]);
  }
  return result;
}

// ---------------------------------------------------------------------------
// Envelope helpers
// ---------------------------------------------------------------------------

function writeEnvelope(buf, version, k, n, setId, x) {
  buf[0] = version;
  buf[1] = k;
  buf[2] = n;
  buf.set(setId, 3);
  buf[19] = x;
}

function writeCrc(buf) {
  const c = crc32(buf, 0, HEADER_SIZE + SECRET_SIZE);
  buf[52] = (c >>> 0) & 0xFF;
  buf[53] = (c >>> 8) & 0xFF;
  buf[54] = (c >>> 16) & 0xFF;
  buf[55] = (c >>> 24) & 0xFF;
}

function readCrc(buf) {
  return (buf[52] | (buf[53] << 8) | (buf[54] << 16) | (buf[55] << 24)) >>> 0;
}

function verifyCrc(buf) {
  return crc32(buf, 0, HEADER_SIZE + SECRET_SIZE) === readCrc(buf);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Split a secret into n shares with threshold k.
 *
 * @param {Uint8Array} secret - The secret to split (must be SECRET_SIZE bytes)
 * @param {number} n - Number of shares to generate (default 3)
 * @param {number} k - Threshold for reconstruction (default 2)
 * @returns {Uint8Array[]} Array of n shares, each SHARE_SIZE bytes (envelope v1)
 */
export function split(secret, n = 3, k = 2) {
  if (!(secret instanceof Uint8Array) || secret.length !== SECRET_SIZE) {
    throw new Error('INVALID_SECRET_SIZE');
  }
  if (!Number.isInteger(n) || !Number.isInteger(k) || k < 2 || n < k || n > 255) {
    throw new Error('INVALID_PARAMS');
  }

  // Defensive copy — prevents TOCTOU via SharedArrayBuffer (same pattern as combine)
  const sec = new Uint8Array(secret);
  try {
    let allZero = true;
    for (let i = 0; i < sec.length; i++) {
      if (sec[i] !== 0) { allZero = false; break; }
    }
    if (allZero) {
      throw new Error('ALL_ZERO_SECRET');
    }

    const setId = new Uint8Array(SET_ID_SIZE);
    crypto.getRandomValues(setId);

    const coeffBuf = new Uint8Array((k - 1) * SECRET_SIZE);
    try {
      crypto.getRandomValues(coeffBuf);

      const shares = [];
      for (let i = 0; i < n; i++) {
        const share = new Uint8Array(SHARE_SIZE);
        const x = i + 1;
        writeEnvelope(share, ENVELOPE_VERSION, k, n, setId, x);
        shares.push(share);
      }

      const coeffs = new Uint8Array(k);
      try {
        for (let byteIdx = 0; byteIdx < SECRET_SIZE; byteIdx++) {
          coeffs[0] = sec[byteIdx];
          for (let c = 1; c < k; c++) {
            coeffs[c] = coeffBuf[(c - 1) * SECRET_SIZE + byteIdx];
          }
          for (let i = 0; i < n; i++) {
            shares[i][HEADER_SIZE + byteIdx] = polyEval(coeffs, i + 1);
          }
        }
      } finally {
        coeffs.fill(0);
      }

      for (const share of shares) {
        writeCrc(share);
      }

      return shares;
    } finally {
      coeffBuf.fill(0);
    }
  } finally {
    sec.fill(0);
  }
}

/**
 * Reconstruct a secret from k or more shares using Lagrange interpolation at x=0.
 *
 * Validates envelope: version, threshold, set-ID consistency, CRC integrity,
 * x-coordinate bounds, and share count bounds. Uses exactly k shares for
 * interpolation; any extra shares are verified against the reconstructed
 * polynomial — a single inconsistent extra share is a hard reject.
 *
 * AUTHENTICATION BOUNDARY: with exactly k shares, integrity rests on CRC32
 * (corruption detection only — not cryptographic authentication). A
 * deliberate attacker who can recompute the CRC can produce a share that
 * reconstructs to a different DEK. The caller MUST authenticate the
 * reconstructed DEK against the vault's AES-256-GCM AAD before using it.
 * This is by design: adding a keyed MAC or commitment to the shares would
 * require key material that doesn't exist at combine time, and a hash
 * commitment would leak information about the secret.
 *
 * NOT constant-time: gfMul branches on zero, table lookups are cache-visible.
 *
 * @param {Uint8Array[]} shares - Array of shares (each SHARE_SIZE bytes, envelope v1)
 * @returns {Uint8Array} Reconstructed secret (SECRET_SIZE bytes)
 */
export function combine(shares) {
  if (!Array.isArray(shares) || shares.length < 2) {
    throw new Error('INSUFFICIENT_SHARES');
  }
  // Reject obviously oversized arrays before allocating copies (n is one byte)
  if (shares.length > 255) {
    throw new Error('TOO_MANY_SHARES');
  }

  // Validate types before copying
  for (let i = 0; i < shares.length; i++) {
    if (!(shares[i] instanceof Uint8Array) || shares[i].length !== SHARE_SIZE) {
      throw new Error('INVALID_SHARE_SIZE');
    }
  }

  // Defensive copy — prevents TOCTOU via SharedArrayBuffer.
  // Inside try so partially-copied shares are zeroed if a later copy throws.
  const local = [];
  const result = new Uint8Array(SECRET_SIZE);
  try {
    for (let i = 0; i < shares.length; i++) {
      local.push(new Uint8Array(shares[i]));
    }
    // Validate envelope on every share
    const refVersion = local[0][0];
    const refK = local[0][1];
    const refN = local[0][2];

    if (refVersion !== ENVELOPE_VERSION) {
      throw new Error('UNSUPPORTED_VERSION');
    }
    if (refK < 2 || refN < refK || refN > 255) {
      throw new Error('INVALID_ENVELOPE_PARAMS');
    }
    if (local.length < refK) {
      throw new Error('INSUFFICIENT_SHARES');
    }
    if (local.length > refN) {
      throw new Error('TOO_MANY_SHARES');
    }

    for (let i = 0; i < local.length; i++) {
      if (local[i][0] !== refVersion) throw new Error('VERSION_MISMATCH');
      if (local[i][1] !== refK) throw new Error('THRESHOLD_MISMATCH');
      if (local[i][2] !== refN) throw new Error('N_MISMATCH');

      for (let j = 0; j < SET_ID_SIZE; j++) {
        if (local[i][3 + j] !== local[0][3 + j]) {
          throw new Error('SET_ID_MISMATCH');
        }
      }

      if (!verifyCrc(local[i])) {
        throw new Error('SHARE_CORRUPT');
      }
    }

    // Check x-coordinates: must be in [1, refN], no duplicates
    const xs = new Set();
    for (let i = 0; i < local.length; i++) {
      const x = local[i][19];
      if (x === 0 || x > refN) throw new Error('INVALID_SHARE_X');
      if (xs.has(x)) throw new Error('DUPLICATE_X_COORD');
      xs.add(x);
    }

    // Use exactly refK shares for interpolation (the first refK provided)
    const kShares = local.slice(0, refK);

    const basis = new Uint8Array(refK);
    try {
      for (let i = 0; i < refK; i++) {
        const xi = kShares[i][19];
        let num = 1;
        let den = 1;
        for (let j = 0; j < refK; j++) {
          if (i === j) continue;
          const xj = kShares[j][19];
          num = gfMul(num, xj);
          den = gfMul(den, gfAdd(xi, xj));
        }
        basis[i] = gfMul(num, gfInv(den));
      }

      for (let byteIdx = 0; byteIdx < SECRET_SIZE; byteIdx++) {
        let val = 0;
        for (let i = 0; i < refK; i++) {
          val = gfAdd(val, gfMul(basis[i], kShares[i][HEADER_SIZE + byteIdx]));
        }
        result[byteIdx] = val;
      }
    } finally {
      basis.fill(0);
    }

    // Verify any extra shares against the reconstructed polynomial.
    if (local.length > refK) {
      for (let e = refK; e < local.length; e++) {
        const ex = local[e][19];
        for (let byteIdx = 0; byteIdx < SECRET_SIZE; byteIdx++) {
          let val = 0;
          for (let i = 0; i < refK; i++) {
            const xi = kShares[i][19];
            let li = 1;
            for (let j = 0; j < refK; j++) {
              if (i === j) continue;
              const xj = kShares[j][19];
              li = gfMul(li, gfMul(gfAdd(ex, xj), gfInv(gfAdd(xi, xj))));
            }
            val = gfAdd(val, gfMul(li, kShares[i][HEADER_SIZE + byteIdx]));
          }
          if (val !== local[e][HEADER_SIZE + byteIdx]) {
            result.fill(0);
            throw new Error('SHARE_INCONSISTENT');
          }
        }
      }
    }

    // Reject all-zero reconstruction (matches split's invariant)
    let allZero = true;
    for (let i = 0; i < SECRET_SIZE; i++) {
      if (result[i] !== 0) { allZero = false; break; }
    }
    if (allZero) {
      result.fill(0);
      throw new Error('ALL_ZERO_RECONSTRUCTED');
    }

    return result;
  } finally {
    // Zero all defensive copies (they collectively hold threshold-sufficient material)
    for (const buf of local) buf.fill(0);
  }
}
