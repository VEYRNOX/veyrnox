// lib/pinRecovery.js
//
// §4 SEED RECOVERY → PIN-COHORT RE-PROVISION.  PROVISIONAL (testnet, PIN cohort).
//
// THE LEAK THIS CLOSES (v1-auth-surface-brief §0/§4). The shipped #138 recovery
// reused the password-import flow and flipped the device to the PASSWORD cohort on
// success. A PIN user who recovered then saw a free-text password screen instead of
// everyone else's PIN pad — an observable "this user forgot their PIN and recovered"
// state that single-mode forbids (the entry surface must be identical regardless of
// what the user did). This helper re-provisions a PIN-cohort recovery as the SAME
// kind of device a fresh PIN onboarding produces, so the post-recovery surface is
// the identical PIN pad.
//
// It mirrors the Phase-2 atomic create path (provisionPinWallet), but seeds the
// wallet from the IMPORTED seed instead of a generated one:
//   1. importWallet(seed, realPin)        — encrypt the recovered seed under the new PIN
//   2. provisionDeniabilityChaff()         — silently provision BOTH deniability slots
//                                            with chaff, exactly as fresh PIN onboarding,
//                                            so the storage footprint is identical. If
//                                            this throws, TEAR THE VAULT DOWN
//                                            (discardIncompleteWallet) and rethrow — never
//                                            leave a primary vault with missing chaff slots.
//   3. setAuthModel('pin')                 — select the PIN entry surface
//   4. getOrCreateDeviceSalt()             — seeds the device salt for structural
//                                            parity with fresh onboarding. NOTE (v2
//                                            model change 2026-06-22): the Option-A
//                                            deterministic-decoy fallback was REMOVED
//                                            (deniabilityUnlock.js) — a non-enrolled
//                                            PIN now ERRORS ("Incorrect PIN"), it does
//                                            NOT open an empty decoy. This salt is now
//                                            VESTIGIAL for the decoy purpose; retained
//                                            for footprint parity, pending a TDD cleanup.
//
// FAIL CLOSED (success-only ordering). Everything after the import runs ONLY once
// importWallet resolves. If the import throws (e.g. an invalid BIP-39 phrase), the
// error propagates and the device is left exactly as it was — the existing PIN vault
// and cohort are untouched. We must NEVER half-provision: flipping the cohort before
// a confirmed import could strand the user, and is the precise failure §4 guards.
// And if chaff provisioning throws AFTER the import wrote the primary vault, we tear
// that vault down before rethrowing — a recovered device with a primary vault but no
// chaff slots is the same defenseless, fail-OPEN half-provisioned state I4 forbids.
//
// SECURITY INVARIANT: this path calls setAuthModel('pin') and never 'password'.
// A recovered device is, by construction, indistinguishable from an onboarded one.
//
// HONEST NOTE (brief §4): the seed is the ROOT secret — whoever holds the real seed
// holds the real wallet, full stop. The duress/decoy model protects the day-to-day
// UNLOCK (v2: a configured duress PIN — or Face ID, if opted in — opens the decoy;
// any other wrong PIN errors; 10 wrong attempts wipe), NOT the seed backup. A coercer
// who extracts the real seed bypasses the PIN model entirely. Recovery does not change
// this; we do not imply the duress model protects the seed.
//
// Pure orchestration over injected collaborators (no React/IndexedDB) so the §4
// contract is unit-tested directly. Touches no network/provider/signing.

/**
 * Re-provision a forgotten-PIN seed recovery into the PIN cohort, producing a
 * device indistinguishable from a fresh PIN onboarding.
 *
 * @param {{
 *   importWallet: (mnemonic: string, password: string) => Promise<unknown>,
 *   provisionDeniabilityChaff: () => Promise<void>,
 *   setAuthModel: (model: 'pin'|'password') => void,
 *   getOrCreateDeviceSalt: () => Uint8Array,
 *   discardIncompleteWallet: () => Promise<void>,
 * }} deps
 * @param {{ seed: string, realPin: string }} params
 * @returns {Promise<void>}
 */
export async function provisionPinRecovery(deps, params) {
  const { importWallet, provisionDeniabilityChaff, setAuthModel, getOrCreateDeviceSalt, discardIncompleteWallet } = deps;
  const { seed, realPin } = params;

  // 1. Import the recovered seed under the new real PIN. A throw here (invalid
  //    phrase, storage failure) aborts BEFORE any cohort/slot change — fail closed.
  await importWallet(seed, realPin);

  // 2. Silently provision both deniability slots with chaff, exactly as fresh PIN
  //    onboarding does, so the recovered device's storage footprint is identical.
  //    FAIL CLOSED: if chaff fails after the import wrote the primary vault, tear the
  //    vault down so no half-provisioned, defenseless wallet survives, then rethrow
  //    the ORIGINAL error (a teardown failure must not mask it).
  try {
    await provisionDeniabilityChaff();
  } catch (e) {
    try { await discardIncompleteWallet(); } catch { /* keep the original error */ }
    throw e;
  }

  // 3. Select the PIN cohort — the whole point of §4. Never 'password'.
  setAuthModel('pin');

  // 4. Seed the device salt for structural parity with fresh onboarding. (v2: the
  //    Option-A deterministic-decoy fallback was removed; a non-enrolled PIN now
  //    errors rather than opening an empty decoy. This salt is vestigial for the
  //    decoy purpose — kept for footprint parity, pending a TDD cleanup.)
  getOrCreateDeviceSalt();
}
