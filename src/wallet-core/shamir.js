// Audited Shamir wrapper. The raw split/combine core now routes through
// `@stablelib/tss`, while this module preserves Veyrnox's envelope/versioning,
// commitment, CRC, and validation behaviour around that core.
//
// Security-sensitive changes here still need explicit review: this file sits on
// the recovery-share boundary and owns the compatibility contract for the share
// envelope callers consume.
/**
 * Shamir Secret Sharing over GF(2^8) via audited StableLib raw TSS.
 *
 * The external primitive is audited; this wrapper keeps the project-specific
 * share envelope, commitment, and corruption/authentication checks around it.
 * Designed for 2-of-3 threshold splitting of 32-byte DEK material.
 *
 * Share envelope (v2, 88 bytes):
 *   [0]       version    = 0x02
 *   [1]       k          threshold required for reconstruction
 *   [2]       n          total shares in this set
 *   [3..18]   setId      16-byte random identifier (same across all shares in a split)
 *   [19]      x          evaluation point (1-indexed)
 *   [20..51]  y[32]      evaluated polynomial bytes
 *   [52..83]  commitment SHA-256(DOMAIN || setId || k || n || secret)
 *   [84..87]  crc32      IEEE CRC-32 of bytes [0..83]
 *
 * v1 (56 bytes, no commitment) is REJECTED, not migrated: it had no
 * authentication, and accepting it would reopen H-6 below. No v1 shares were
 * ever issued — nothing calls this module yet.
 *
 * Security properties:
 *   - RNG: crypto.getRandomValues only (CSPRNG)
 *   - Intermediate buffers zeroed in finally blocks
 *   - Input validation: fail-closed on malformed input
 *   - Envelope prevents mixing shares from different splits or wrong thresholds
 *   - CRC32 detects corruption. It is NOT authentication: it is unkeyed and
 *     linear, so a forger can always recompute it. Authentication comes from the
 *     commitment (audit 2026-08-03 H-6) — combine() recomputes it over the
 *     reconstructed secret and rejects a mismatch, so producing a share that
 *     reconstructs to an attacker-chosen value needs a SHA-256 preimage.
 *     Previously the module documented that "the caller MUST authenticate the
 *     reconstructed DEK against the vault's AES-GCM AAD"; an advisory contract
 *     no caller is obliged to honour is not a control, so the check now lives
 *     here. A caller that ALSO authenticates via AAD is still correct — this is
 *     defence in depth, not a replacement.
 *   - The commitment binds setId/k/n too, so a consistent set of tampered
 *     headers (e.g. a lowered threshold, CRCs recomputed) is rejected as well
 *   - combine() uses exactly k shares for interpolation, then verifies any extras
 *     against the reconstructed polynomial — a single inconsistent share is a
 *     hard reject
 *   - Input shares are defensively copied before validation to prevent TOCTOU
 *     via SharedArrayBuffer
 *   - GF arithmetic is branch-free and table-free (audit 2026-08-03 M-7): no
 *     data-dependent branches, no secret-indexed memory access. This is NOT a
 *     claim of end-to-end constant-time execution, which JavaScript cannot
 *     provide — see the note above gfMul and the spec's Timing requirement.
 *
 * @module wallet-core/shamir
 */

// @noble/hashes — the project's mandated audited primitive source ("no custom
// crypto primitives"). Synchronous, so combine() stays synchronous.
import { sha256 } from '@noble/hashes/sha256';
import { splitRaw, combineRaw } from '@stablelib/tss';

export const SECRET_SIZE = 32;
export const SHARE_VERSION_V2 = 0x02;
export const SHARE_VERSION_V3 = 0x03;
export const CURRENT_SHARE_VERSION = SHARE_VERSION_V2;
export const SHARE_SIZE = 88; // envelope v2: 1+1+1+16+1+32+32+4
export const MIXED_SHARE_VERSIONS = 'MIXED_SHARE_VERSIONS';

const ENVELOPE_VERSION = SHARE_VERSION_V2;
const SET_ID_SIZE = 16;
// Exported so tests address the envelope by offset constants rather than
// hardcoded numbers — a format change should not silently invalidate them.
export const HEADER_SIZE = 20; // version(1) + k(1) + n(1) + setId(16) + x(1)
export const COMMITMENT_SIZE = 32;
const COMMITMENT_OFFSET = HEADER_SIZE + SECRET_SIZE; // 52
const CRC_SIZE = 4;
const CRC_OFFSET = COMMITMENT_OFFSET + COMMITMENT_SIZE; // 84

// Domain-separated so this hash can never collide with any other SHA-256 use in
// the codebase (same discipline as kek.js's KEK_DOMAIN).
const COMMITMENT_DOMAIN = 'veyrnox/shamir/v2/commit(setId||k||n||secret)';

export function getShareVersion(share) {
  if (!(share instanceof Uint8Array) || share.length < 1) return null;
  return share[0];
}

export function isRecognizedShareVersion(version) {
  return version === SHARE_VERSION_V2 || version === SHARE_VERSION_V3;
}

export function getShareSize(version) {
  if (version === SHARE_VERSION_V2) return SHARE_SIZE;
  return null;
}

export function isValidShareShape(share) {
  const version = getShareVersion(share);
  const expected = getShareSize(version);
  return expected !== null && share instanceof Uint8Array && share.length === expected;
}

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

function rawShareFromEnvelope(share) {
  const raw = new Uint8Array(1 + SECRET_SIZE);
  raw[0] = share[19];
  raw.set(share.subarray(HEADER_SIZE, COMMITMENT_OFFSET), 1);
  return raw;
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

// CRC covers everything before it, which as of v2 includes the commitment — so a
// corrupted commitment is caught as corruption, and a DELIBERATELY rewritten one
// is caught by the commitment check itself.
function writeCrc(buf) {
  const c = crc32(buf, 0, CRC_OFFSET);
  buf[CRC_OFFSET] = (c >>> 0) & 0xFF;
  buf[CRC_OFFSET + 1] = (c >>> 8) & 0xFF;
  buf[CRC_OFFSET + 2] = (c >>> 16) & 0xFF;
  buf[CRC_OFFSET + 3] = (c >>> 24) & 0xFF;
}

function readCrc(buf) {
  return (
    buf[CRC_OFFSET]
    | (buf[CRC_OFFSET + 1] << 8)
    | (buf[CRC_OFFSET + 2] << 16)
    | (buf[CRC_OFFSET + 3] << 24)
  ) >>> 0;
}

function verifyCrc(buf) {
  return crc32(buf, 0, CRC_OFFSET) === readCrc(buf);
}

// ---------------------------------------------------------------------------
// Commitment (H-6) — the authentication CRC-32 cannot provide
// ---------------------------------------------------------------------------
//
// commitment = SHA-256(DOMAIN || setId || k || n || secret)
//
// CRC-32 is unkeyed and linear: a holder of one genuine share could rewrite any
// byte of a companion share, recompute the CRC, and make combine() return a
// value of their choosing with no error raised. Recomputing this commitment
// after reconstruction and comparing it to the one carried in the envelope makes
// that forgery require a SHA-256 preimage.
//
// Binding setId/k/n into the hash authenticates them too — they previously sat
// inside the CRC-protected region and were only cross-checked BETWEEN the shares
// presented in a single call, so a consistent set of tampered headers passed.
//
// This does NOT leak the secret. The secret is 32 uniformly random bytes (a DEK);
// a domain-separated SHA-256 of it is preimage-resistant, and the commitment is
// only ever stored beside shares that are already threshold-protected.
function computeCommitment(setId, k, n, secret) {
  const domain = new TextEncoder().encode(COMMITMENT_DOMAIN);
  const buf = new Uint8Array(domain.length + SET_ID_SIZE + 2 + SECRET_SIZE);
  let o = 0;
  buf.set(domain, o); o += domain.length;
  buf.set(setId, o); o += SET_ID_SIZE;
  buf[o++] = k;
  buf[o++] = n;
  buf.set(secret, o);
  try {
    return sha256(buf);
  } finally {
    buf.fill(0); // the input carried the plaintext secret
  }
}

// Constant-time equality. The commitment is not itself secret, but an early-exit
// compare here would leak how many leading bytes of a forged commitment matched,
// which is a free oracle for an attacker grinding one.
function timingSafeEqual(a, b, aOffset = 0) {
  let diff = 0;
  for (let i = 0; i < COMMITMENT_SIZE; i++) diff |= a[aOffset + i] ^ b[i];
  return diff === 0;
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
 * @returns {Uint8Array[]} Array of n shares, each SHARE_SIZE bytes (envelope v2)
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

    try {
      const rawShares = splitRaw(sec, k, n);
      const shares = new Array(rawShares.length);
      try {
        for (let i = 0; i < rawShares.length; i++) {
          const raw = rawShares[i];
          const share = new Uint8Array(SHARE_SIZE);
          writeEnvelope(share, ENVELOPE_VERSION, k, n, setId, raw[0]);
          share.set(raw.subarray(1), HEADER_SIZE);
          shares[i] = share;
        }
      } finally {
        for (const raw of rawShares) raw.fill(0);
      }

      // H-6 — every share carries the same commitment to (setId, k, n, secret).
      // Written before the CRC so the CRC covers it.
      const commitment = computeCommitment(setId, k, n, sec);
      for (const share of shares) {
        share.set(commitment, COMMITMENT_OFFSET);
        writeCrc(share);
      }

      return shares;
    } finally {
      setId.fill(0);
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
 * AUTHENTICATION: the reconstruction is authenticated HERE, not by the caller.
 * After interpolating, combine() recomputes
 * SHA-256(DOMAIN || setId || k || n || secret) over the value it just rebuilt
 * and requires it to equal the commitment carried in the envelope (audit
 * 2026-08-03 H-6). Forging a share that survives that needs a SHA-256 preimage,
 * so CRC-32 — unkeyed, linear, trivially recomputable by a forger — is relied on
 * for CORRUPTION detection only, never for authentication.
 *
 * A caller that ALSO authenticates the DEK against the vault's AES-256-GCM AAD
 * is still correct; that is defence in depth, not a requirement this function
 * delegates upward.
 *
 * @param {Uint8Array[]} shares - Array of shares (each SHARE_SIZE bytes, envelope v2)
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

    const versions = new Set(local.map((share) => share[0]));
    let allRecognized = true;
    for (const version of versions) {
      if (!isRecognizedShareVersion(version)) {
        allRecognized = false;
        break;
      }
    }
    if (versions.size > 1 && allRecognized) {
      throw new Error(MIXED_SHARE_VERSIONS);
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

      // Every share in a set commits to the same value. This is a consistency
      // check only — the authoritative test is the recomputation after
      // reconstruction below, which is what a forger cannot satisfy.
      if (!timingSafeEqual(local[i], local[0].subarray(COMMITMENT_OFFSET, CRC_OFFSET), COMMITMENT_OFFSET)) {
        throw new Error('COMMITMENT_MISMATCH');
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
    const rawKShares = [];
    try {
      for (let i = 0; i < refK; i++) rawKShares.push(rawShareFromEnvelope(kShares[i]));
      result.set(combineRaw(rawKShares, refK));
    } finally {
      for (const raw of rawKShares) raw.fill(0);
    }

    // H-6 — AUTHENTICATE the reconstruction. Everything above this line is
    // CRC-checked only, i.e. protected against corruption but not against a
    // deliberate forger. Recompute the commitment over the value we just
    // rebuilt and require it to match the one the shares carry; producing a
    // forged share that survives this needs a SHA-256 preimage.
    //
    // Runs BEFORE the extra-share interpolation below so an authentication
    // failure short-circuits, and so a forged share among the first k is
    // rejected even when no extra shares were supplied to cross-check it.
    {
      const setId = local[0].subarray(3, 3 + SET_ID_SIZE);
      const expected = computeCommitment(setId, refK, refN, result);
      try {
        if (!timingSafeEqual(local[0], expected, COMMITMENT_OFFSET)) {
          result.fill(0);
          throw new Error('COMMITMENT_MISMATCH');
        }
      } finally {
        expected.fill(0);
      }
    }

    // Verify any extra shares against the reconstructed polynomial.
    if (local.length > refK) {
      const baseShares = kShares.slice(0, refK - 1);
      for (let e = refK; e < local.length; e++) {
        /** @type {Uint8Array | null} */
        let extraRecon = null;
        const subset = [...baseShares, local[e]];
        const rawSubset = [];
        try {
          for (const share of subset) rawSubset.push(rawShareFromEnvelope(share));
          extraRecon = combineRaw(rawSubset, refK);
          let diff = 0;
          for (let i = 0; i < SECRET_SIZE; i++) diff |= result[i] ^ extraRecon[i];
          if (diff !== 0) {
            result.fill(0);
            throw new Error('SHARE_INCONSISTENT');
          }
        } catch (err) {
          const error = /** @type {{ message?: string } | null | undefined} */ (err);
          if (error?.message === 'SHARE_INCONSISTENT') throw err;
          result.fill(0);
          throw new Error('SHARE_INCONSISTENT');
        } finally {
          for (const raw of rawSubset) raw.fill(0);
          if (extraRecon) extraRecon.fill(0);
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
