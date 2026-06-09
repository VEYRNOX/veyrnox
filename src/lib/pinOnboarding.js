// lib/pinOnboarding.js
//
// ATOMIC, FAIL-CLOSED PIN-WALLET CREATION.  PROVISIONAL (testnet, PIN cohort).
//
// Onboarding must never produce a half-provisioned wallet: a device with a real
// primary vault but MISSING deniability slots (no decoy/duress/panic chaff, no PIN
// cohort marker) would show a "ready" dashboard while its coercion defenses are
// silently absent — a fail-OPEN that violates I4 (fail honest / fail closed).
//
// So provisioning is PART OF creation, not a step after it: create the real wallet,
// then provision BOTH chaff slots; if chaff fails, TEAR THE VAULT DOWN and rethrow,
// so the caller surfaces an honest failure and no defenseless wallet ever reaches
// the dashboard. The cohort marker + decoy salt are written ONLY after both slots
// exist — never on the failure path.
//
// Pure orchestration over injected collaborators (no React/IndexedDB) so the
// fail-closed contract is unit-tested directly. Touches no network/provider/signing.

/**
 * @param {{
 *   createWallet: (pin: string) => Promise<unknown>,
 *   provisionDeniabilityChaff: () => Promise<void>,
 *   setAuthModel: (model: 'pin'|'password') => void,
 *   getOrCreateDeviceSalt: () => Uint8Array,
 *   discardIncompleteWallet: () => Promise<void>,
 * }} deps
 * @param {{ pin: string }} params
 * @returns {Promise<void>}
 */
export async function provisionPinWallet(deps, { pin }) {
  const { createWallet, provisionDeniabilityChaff, setAuthModel, getOrCreateDeviceSalt, discardIncompleteWallet } = deps;

  // 1. Create the real wallet under the real PIN (writes the primary vault, unlocks).
  //    A throw here means nothing was created — propagate; there is nothing to tear down.
  await createWallet(pin);

  // 2. Provision BOTH deniability chaff slots. FAIL CLOSED: on any failure, tear the
  //    just-created vault down so no half-provisioned, defenseless wallet survives,
  //    then rethrow the ORIGINAL error (a teardown failure must not mask it).
  try {
    await provisionDeniabilityChaff();
  } catch (e) {
    try { await discardIncompleteWallet(); } catch { /* keep the original error */ }
    throw e;
  }

  // 3. Only once BOTH slots exist: mark the PIN cohort + seed the deterministic-decoy salt.
  setAuthModel('pin');
  getOrCreateDeviceSalt();
}
