// wallet-core/provisionChaff.js
//
// ALWAYS-PROVISION the deniability slots. PROVISIONAL — ⚠️ FLAGGED FOR AUDIT. ⚠️
//
// Single-mode deniability requires every PIN device to be structurally identical
// regardless of what the user personalized: the storage footprint must NOT reveal
// whether a duress/panic credential was set. (Timing is already constant — see
// deniabilityUnlock.js.) So at PIN creation we silently provision a CHAFF blob in
// both the duress ('secondary') and panic ('tertiary') slots.
//
// The chaff is encrypted under a high-entropy THROWAWAY password generated and
// discarded here. Nobody holds it, so the chaff is genuinely unopenable; a
// non-enrolled PIN never matches it and falls through to the Option-A deterministic
// decoy exactly as it would past a real duress blob. The chaff goes through the
// SAME encryptVault path (same Argon2id at KDF_PARAMS, same salt handling) as a
// real credential — there is NO chaff-specific branch — so it is byte-shaped like
// a personalized blob.
//
// Idempotent and never-overwrite (mirrors stealth.js ensureStealthPool): it writes
// ONLY into an empty slot, so a personalized credential is never clobbered and a
// slot that failed to provision earlier is backfilled on the next call.
//
// TESTNET ONLY. No network/provider/signing — only local encrypt + store.

import { generateMnemonic } from './mnemonic.js';
import { hasDuressVault, setDuressVault } from './duress.js';
import { hasPanicVault, setPanicVault } from './panic.js';

// 32 random bytes → base64. Generated and discarded; never persisted.
function throwawayPassword() {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return btoa(s);
}

/**
 * Ensure both deniability slots hold a blob, provisioning chaff into any empty
 * slot. Idempotent; never overwrites an existing (chaff or personalized) blob.
 * strength=128 matches setDuressPin's default so chaff and personalized duress
 * blobs carry the same kind of 12-word-mnemonic plaintext.
 *
 * H2: the duress chaff goes through setDuressVault, which now wraps the mnemonic in
 * a FIXED-LENGTH multi-seed container (padded to FIXED_LEN). A personalized duress
 * blob is wrapped the SAME way, so chaff and real duress blobs remain ciphertext-
 * length-identical — the load-bearing deniability property. The panic chaff stays a
 * bare-mnemonic marker because a real panic marker (setPanicVault) is also a bare
 * mnemonic; chaff matches its own slot's real shape in each case.
 * @returns {Promise<void>}
 */
export async function provisionDeniabilityChaff() {
  if (!(await hasDuressVault())) {
    await setDuressVault(generateMnemonic(128), throwawayPassword());
  }
  if (!(await hasPanicVault())) {
    await setPanicVault(throwawayPassword());
  }
}
