/**
 * Shamir DEK sharding — flagged-off wrapper + Personal Backup Phase 1 export.
 *
 * Personal Backup implementation per owner override 2026-08-08 (see CLAUDE.md).
 * Pre-audit. Nothing here is "verified" until an on-device recovery trip
 * completes and an independent audit passes.
 *
 * Two gates live in this file, deliberately separate:
 *
 *   - ALLOW_SHARD_BACKUP (unchanged, still false) — the general-purpose sharding
 *     API. This gate stays off; do NOT wire it to any runtime toggle. It is here
 *     so shamir.js has an integration test surface and so #1111 has a concrete
 *     caller shape to design against.
 *
 *   - ENABLE_PERSONAL_BACKUP_SHARDS (new, still false) — the specific,
 *     Personal-Backup-only surface used by src/pages/PersonalBackup.jsx. Flipped
 *     via VITE_ENABLE_PERSONAL_BACKUP_SHARDS at build time; dead-code-eliminated
 *     from production bundles until intentionally set. Even when true it does
 *     NOT: persist anything, talk to a cloud provider, wire into the vault write
 *     path, or change how any existing wallet unlocks. Phase 1 is export-only —
 *     the caller receives 3 share byte arrays and is responsible for delivering
 *     them (native share sheet in Phase 1; cloud + posture in later phases).
 */

import { split, combine, SECRET_SIZE, SHARE_SIZE } from './shamir.js';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

// Hard-off gate for the generic split/combine wrappers. Do NOT wire this to an
// env var, a build flag, or a runtime toggle. Callers that need the primitive
// for a test must import it directly from shamir.js; this pair's presence in
// production code paths is a bug. Personal Backup uses the dedicated pair below
// (splitDekForPersonalBackup / combineDekForPersonalBackup), NOT these.
export const ALLOW_SHARD_BACKUP = false;

// Personal Backup Phase 1 gate. Read once at module load; a runtime flip has
// no effect (Vite inlines import.meta.env at build time). Defaults false so an
// accidental prod build never surfaces the new UI.
export const ENABLE_PERSONAL_BACKUP_SHARDS =
  typeof import.meta !== 'undefined' &&
  import.meta.env &&
  import.meta.env.VITE_ENABLE_PERSONAL_BACKUP_SHARDS === '1';

export const SHARD_BACKUP_DISABLED = 'SHARD_BACKUP_DISABLED';
export const SHARD_INVALID_DEK = 'SHARD_INVALID_DEK';
export const PERSONAL_BACKUP_SHARDS_DISABLED = 'PERSONAL_BACKUP_SHARDS_DISABLED';
export const PERSONAL_BACKUP_ROUND_TRIP_FAILED = 'PERSONAL_BACKUP_ROUND_TRIP_FAILED';

/**
 * Split a DEK into 3 shares with a 2-of-3 threshold, per the design in
 * docs/cloud-recovery-shard-spec.md §3.
 *
 * Behaviour is intentionally the minimum needed to prove integration:
 *   - Accepts a Uint8Array DEK of SECRET_SIZE bytes (32).
 *   - Returns 3 shamir envelope-v2 shares (88 bytes each).
 *   - Throws SHARD_BACKUP_DISABLED unless the caller has explicitly opted in
 *     with { allow: true } AND the module-level gate is on.
 *   - Zeroizes the local DEK copy on every path (success or throw). The
 *     caller's DEK is not mutated — shamir.split() does its own defensive
 *     copy — but this wrapper adds a second copy so that a future refactor
 *     which drops shamir.js's defensive copy cannot silently leak.
 *
 * Deliberately absent:
 *   - No storage / upload / persistence — a share never leaves this stack
 *     frame.
 *   - No AAD binding on the envelope. The v2 commitment already binds
 *     setId/k/n/secret; AAD binding is a separate v:3 migration (#1111) and
 *     will need its own envelope version bump.
 *   - No deniability semantics. Decoy DEKs need their own independent shard
 *     sets (spec §7); this wrapper is single-DEK by design so the decoy
 *     model can be added in one place later without a rewrite.
 *
 * @param {Uint8Array} dek 32-byte DEK
 * @param {{allow: boolean}} opts must be { allow: true } to proceed
 * @returns {Uint8Array[]} 3 shares of SHARE_SIZE bytes each
 */
export function splitDekForBackup(dek, opts) {
  if (!ALLOW_SHARD_BACKUP || !opts || opts.allow !== true) {
    throw new Error(SHARD_BACKUP_DISABLED);
  }
  if (!(dek instanceof Uint8Array) || dek.length !== SECRET_SIZE) {
    throw new Error(SHARD_INVALID_DEK);
  }
  const local = new Uint8Array(dek);
  try {
    return split(local, 3, 2);
  } finally {
    local.fill(0);
  }
}

/**
 * Reconstruct a DEK from any 2 shares of a 2-of-3 split. Thin wrapper around
 * shamir.combine so callers do not have to import both modules.
 *
 * Same hard-off gate as splitDekForBackup — the recovery UI does not exist
 * yet and there is no legitimate production call site.
 *
 * @param {Uint8Array[]} shares
 * @param {{allow: boolean}} opts must be { allow: true } to proceed
 * @returns {Uint8Array} reconstructed DEK
 */
export function combineDekFromBackup(shares, opts) {
  if (!ALLOW_SHARD_BACKUP || !opts || opts.allow !== true) {
    throw new Error(SHARD_BACKUP_DISABLED);
  }
  return combine(shares);
}

// ── Personal Backup Phase 1 ────────────────────────────────────────────────
//
// The functions below are the ONLY shard surface authorised for use from
// src/pages/PersonalBackup.jsx. They gate on ENABLE_PERSONAL_BACKUP_SHARDS,
// not ALLOW_SHARD_BACKUP — the two flags are kept independent so a future
// flip of ALLOW_SHARD_BACKUP cannot accidentally enable Personal Backup and
// vice versa.
//
// Phase 1 constraint (do NOT weaken without owner sign-off): the split runs,
// a round-trip is verified against the ORIGINAL DEK bytes in-memory, and the
// 3 share envelopes are returned. Nothing is persisted; the DEK is zeroed on
// every path before return. No cloud, no Share-A swap, no fast-path cache.
//
// The round-trip check is defence-in-depth against a shamir.js regression
// silently producing shares that don't reconstruct. A caller that receives
// 3 shares from this function has a cryptographic guarantee (subject to the
// v2 commitment) that ANY 2 of them reconstruct the DEK they were derived
// from — even if the caller never verifies again.

/**
 * Split a DEK into 3 shares for Personal Backup export. Verifies the
 * round-trip against the original DEK before returning; on mismatch, throws
 * PERSONAL_BACKUP_ROUND_TRIP_FAILED and returns nothing (fail-closed, I4).
 *
 * @param {Uint8Array} dek 32-byte DEK. Caller retains ownership; this
 *   function makes its own defensive copy and does not mutate the caller's
 *   buffer. Caller is still responsible for zeroing their copy.
 * @returns {Uint8Array[]} 3 shares of SHARE_SIZE bytes each.
 * @throws {Error} PERSONAL_BACKUP_SHARDS_DISABLED if the flag is off.
 * @throws {Error} SHARD_INVALID_DEK on wrong-shape input.
 * @throws {Error} PERSONAL_BACKUP_ROUND_TRIP_FAILED if any 2-of-3 combine
 *   does not reproduce the DEK bytes.
 */
export function splitDekForPersonalBackup(dek) {
  if (!ENABLE_PERSONAL_BACKUP_SHARDS) {
    throw new Error(PERSONAL_BACKUP_SHARDS_DISABLED);
  }
  if (!(dek instanceof Uint8Array) || dek.length !== SECRET_SIZE) {
    throw new Error(SHARD_INVALID_DEK);
  }
  const local = new Uint8Array(dek);
  /** @type {Uint8Array[] | null} */
  let shares = null;
  /** @type {Uint8Array | null} */
  let recon = null;
  try {
    shares = split(local, 3, 2);
    // Verify all three 2-of-3 pair combinations reconstruct the DEK.
    // combine() itself validates the SHA-256 commitment; the extra byte
    // compare here catches an in-memory shape drift between split and
    // combine that a commitment-only check would let through if both sides
    // agreed on a subtly wrong secret.
    for (const [i, j] of [
      [0, 1],
      [0, 2],
      [1, 2],
    ]) {
      recon = combine([shares[i], shares[j]]);
      let equal = recon.length === local.length;
      let diff = 0;
      for (let k = 0; k < local.length; k++) diff |= recon[k] ^ local[k];
      if (diff !== 0 || !equal) {
        throw new Error(PERSONAL_BACKUP_ROUND_TRIP_FAILED);
      }
      recon.fill(0);
      recon = null;
    }
    return shares;
  } catch (err) {
    // Best-effort share cleanup on failure. Caller will not receive them.
    if (shares) for (const s of shares) s.fill(0);
    throw err;
  } finally {
    local.fill(0);
    if (recon) recon.fill(0);
  }
}

/**
 * Reconstruct a DEK from any 2 Personal Backup shares. Provided for Phase 2
 * (restore flow) and so tests can round-trip through the same code path a
 * future restore will use. Same flag gate as split; shamir.combine already
 * verifies the v2 commitment and rejects tampered / mismatched-set shares.
 *
 * @param {Uint8Array[]} shares any 2 of the 3 shares produced by
 *   splitDekForPersonalBackup, in any order.
 * @returns {Uint8Array} the reconstructed 32-byte DEK. Caller MUST zero.
 * @throws {Error} PERSONAL_BACKUP_SHARDS_DISABLED if the flag is off.
 */
export function combineDekForPersonalBackup(shares) {
  if (!ENABLE_PERSONAL_BACKUP_SHARDS) {
    throw new Error(PERSONAL_BACKUP_SHARDS_DISABLED);
  }
  return combine(shares);
}

export { SECRET_SIZE, SHARE_SIZE };

// ── Cross-device restore (Phase 3) ────────────────────────────────────
// A raw Shamir share is 33 bytes of DEK slice — useless on a fresh phone
// that has no vault ciphertext. A "bundle" wraps the share with the
// encrypted vault blob and a hash of that blob so any 2 bundles can
// self-restore the wallet without the original device.
//
// vaultBlob is the SAME object saveVaultContents writes to disk
// (see wallet-core/vault.js — { v, kdf, salt, iv, ct }). The bundle
// carries it verbatim so restore == decrypt(vault, DEK) with the same
// KDF params the origin device used.

export const SHARD_BUNDLE_VERSION = 2;
// v1 is REJECTED, not merely superseded. Those bundles were hashed with a
// broken top-level-only hasher — JSON.stringify's array replacer is a key
// FILTER applied at every nesting level, so any nested object (e.g. vault.kdf)
// collapsed to '{}' and changes inside it were invisible to the integrity
// check. `v` is read from the same file being validated, so keeping a v1
// branch let an attacker-supplied bundle select the weak verifier for itself.
//
// The compatibility branch was removed (2026-08-15) after confirming it served
// zero real artifacts: VITE_ENABLE_PERSONAL_BACKUP_SHARDS gates the whole
// feature, defaults false, and is set in NO shipping build — not ci.yml,
// deploy-preview.yml, or firebase-test-lab.yml. Only local dev and the
// android-e2e-emulator job ever turned it on, so no user could have produced a
// v1 bundle. A developer holding a locally-generated v1 test bundle must
// re-export it.
export const SHARD_BUNDLE_MISMATCH = 'SHARD_BUNDLE_MISMATCH';
export const SHARD_BUNDLE_INVALID = 'SHARD_BUNDLE_INVALID';

const b64 = {
  enc(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return typeof btoa === 'function' ? btoa(s) : Buffer.from(bytes).toString('base64');
  },
  dec(str) {
    const bin = typeof atob === 'function' ? atob(str) : Buffer.from(str, 'base64').toString('binary');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  },
};

// Recursive canonical serialiser: every object's keys sorted at every
// nesting level, arrays preserved in order, primitives via JSON.stringify.
// Fixes the v1 bug where JSON.stringify(vault, Object.keys(vault).sort())
// only filters the TOP level — any nested object (vault.kdf) serialised as
// '{}' and was invisible to the integrity hash.
function canonicalStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalStringify).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalStringify(v[k])).join(',') + '}';
}

function hashVault(vault) {
  return bytesToHex(sha256(new TextEncoder().encode(canonicalStringify(vault))));
}

/**
 * Wrap one shamir share + the full encrypted vault blob into a self-
 * contained bundle safe to store off-device (paper, cloud, another phone).
 *
 * @param {Uint8Array} share one 33-byte share from splitDekForPersonalBackup
 * @param {number} index 1..3 — human-facing share number
 * @param {{v?: number, kdf: any, salt: string, iv: string, ct: string}} vault the object saveVault writes
 * @returns {object} a JSON-safe bundle
 */
export function encodeShareBundle(share, index, vault) {
  if (!ENABLE_PERSONAL_BACKUP_SHARDS) throw new Error(PERSONAL_BACKUP_SHARDS_DISABLED);
  if (!(share instanceof Uint8Array) || share.length !== SHARE_SIZE) throw new Error(SHARD_BUNDLE_INVALID);
  if (!Number.isInteger(index) || index < 1 || index > 3) throw new Error(SHARD_BUNDLE_INVALID);
  if (!vault || typeof vault !== 'object') throw new Error(SHARD_BUNDLE_INVALID);
  const v = /** @type {any} */ (vault);
  if (!v.ct || !v.salt || !v.iv || !v.kdf) {
    throw new Error(SHARD_BUNDLE_INVALID);
  }
  return {
    v: SHARD_BUNDLE_VERSION,
    shareIndex: index,
    shareBytes: b64.enc(share),
    vault,
    vaultHash: hashVault(vault),
    meta: { createdAt: new Date(0).toISOString() }, // caller may overwrite before serialising
  };
}

/**
 * Parse a bundle string OR object. Validates shape and hash-vs-vault
 * integrity. Returns { share: Uint8Array, index, vault, vaultHash }.
 *
 * @param {string|object} input bundle JSON string or already-parsed object
 */
export function decodeShareBundle(input) {
  if (!ENABLE_PERSONAL_BACKUP_SHARDS) throw new Error(PERSONAL_BACKUP_SHARDS_DISABLED);
  let obj;
  if (typeof input === 'string') {
    try { obj = JSON.parse(input); } catch { throw new Error(SHARD_BUNDLE_INVALID); }
  } else {
    obj = input;
  }
  if (!obj || typeof obj !== 'object') throw new Error(SHARD_BUNDLE_INVALID);
  if (obj.v !== SHARD_BUNDLE_VERSION) throw new Error(SHARD_BUNDLE_INVALID);
  if (!Number.isInteger(obj.shareIndex) || obj.shareIndex < 1 || obj.shareIndex > 3) throw new Error(SHARD_BUNDLE_INVALID);
  if (typeof obj.shareBytes !== 'string') throw new Error(SHARD_BUNDLE_INVALID);
  if (!obj.vault || typeof obj.vault !== 'object') throw new Error(SHARD_BUNDLE_INVALID);
  if (typeof obj.vaultHash !== 'string') throw new Error(SHARD_BUNDLE_INVALID);

  const share = b64.dec(obj.shareBytes);
  if (share.length !== SHARE_SIZE) throw new Error(SHARD_BUNDLE_INVALID);
  if (hashVault(obj.vault) !== obj.vaultHash) throw new Error(SHARD_BUNDLE_MISMATCH);

  return { share, index: obj.shareIndex, vault: obj.vault, vaultHash: obj.vaultHash };
}

/**
 * Combine 2 bundles into a reconstructed DEK + the vault they both point to.
 * Throws if the two bundles were made from DIFFERENT vaults (hash mismatch)
 * or if the shamir combine fails (tampered / mismatched-set shares).
 *
 * @param {(string|object)[]} bundles exactly 2 bundles
 * @returns {{ dek: Uint8Array, vault: object }} caller MUST zero dek after use
 */
export function combineFromBundles(bundles) {
  if (!ENABLE_PERSONAL_BACKUP_SHARDS) throw new Error(PERSONAL_BACKUP_SHARDS_DISABLED);
  if (!Array.isArray(bundles) || bundles.length !== 2) throw new Error(SHARD_BUNDLE_INVALID);
  const a = decodeShareBundle(bundles[0]);
  const b = decodeShareBundle(bundles[1]);
  if (a.vaultHash !== b.vaultHash) throw new Error(SHARD_BUNDLE_MISMATCH);
  if (a.index === b.index) throw new Error(SHARD_BUNDLE_MISMATCH);
  const dek = combine([a.share, b.share]);
  return { dek, vault: a.vault };
}
