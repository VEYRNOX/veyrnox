/**
 * Shamir DEK sharding — flagged-off wrapper.
 *
 * PLANNED per docs/cloud-recovery-shard-spec.md. Pre-audit. Not shippable.
 *
 * This module exists only to prove the shamir.js primitive integrates at the
 * DEK boundary and to give the AAD v:3 migration (#1111) a concrete caller to
 * design against. It does NOT:
 *   - persist any share anywhere
 *   - talk to any cloud provider
 *   - render any UI
 *   - hook into the vault write path
 *   - change how any existing wallet unlocks
 *
 * ALLOW_SHARD_BACKUP defaults FALSE and there is no production import of this
 * file — the only callers live under __tests__. Flipping the flag on its own
 * does nothing user-facing; the recovery flow, cloud share upload, and
 * deniability-aware decoy shard sets are all still TARGET/PLANNED and require
 * the independent audit before shipping.
 */

import { split, combine, SECRET_SIZE, SHARE_SIZE } from './shamir.js';

// Hard-off gate. Do NOT wire this to an env var, a build flag, or a runtime
// toggle. Callers that need the primitive for a test must import it directly
// from shamir.js; this file's presence in production code paths is a bug.
export const ALLOW_SHARD_BACKUP = false;

export const SHARD_BACKUP_DISABLED = 'SHARD_BACKUP_DISABLED';
export const SHARD_INVALID_DEK = 'SHARD_INVALID_DEK';

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

export { SECRET_SIZE, SHARE_SIZE };
