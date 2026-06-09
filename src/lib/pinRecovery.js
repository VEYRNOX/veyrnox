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
// It mirrors WalletEntry.finishPinCreate, but seeds the wallet from the IMPORTED
// seed instead of a generated one:
//   1. importWallet(seed, realPin)   — encrypt the recovered seed under the new PIN
//   2. setDuressPin(duressPin)       — provision a lived-in decoy (Face-ID-to-decoy
//                                      + a probe-resistant duress vault, as onboarding)
//   3. setPanicPin(panicPin)         — OPTIONAL wipe slot; best-effort like onboarding
//   4. setAuthModel('pin')           — select the PIN entry surface + Option A
//   5. getOrCreateDeviceSalt()       — seed the deterministic-decoy salt so a
//                                      non-enrolled PIN opens an empty decoy, never errors
//
// FAIL CLOSED (success-only ordering). Everything after the import runs ONLY once
// importWallet resolves. If the import throws (e.g. an invalid BIP-39 phrase), the
// error propagates and the device is left exactly as it was — the existing PIN vault
// and cohort are untouched. We must NEVER half-provision: flipping the cohort before
// a confirmed import could strand the user, and is the precise failure §4 guards.
//
// SECURITY INVARIANT: this path calls setAuthModel('pin') and never 'password'.
// A recovered device is, by construction, indistinguishable from an onboarded one.
//
// HONEST NOTE (brief §4): the seed is the ROOT secret — whoever holds the real seed
// holds the real wallet, full stop. The duress/decoy model protects the day-to-day
// UNLOCK (give the duress PIN under coercion), NOT the seed backup. A coercer who
// extracts the real seed bypasses the PIN model entirely. Recovery does not change
// this; we do not imply the duress model protects the seed.
//
// Pure orchestration over injected collaborators (no React/IndexedDB) so the §4
// contract is unit-tested directly. Touches no network/provider/signing.

/**
 * Re-provision a forgotten-PIN seed recovery into the PIN cohort.
 *
 * @param {{
 *   importWallet: (mnemonic: string, password: string) => Promise<unknown>,
 *   setDuressPin: (duressPin: string) => Promise<unknown>,
 *   setPanicPin: (panicPin: string) => Promise<unknown>,
 *   setAuthModel: (model: 'pin'|'password') => void,
 *   getOrCreateDeviceSalt: () => Uint8Array,
 * }} deps
 * @param {{ seed: string, realPin: string, duressPin: string, panicPin?: string }} params
 * @returns {Promise<void>}
 */
export async function provisionPinRecovery(deps, params) {
  const { importWallet, setDuressPin, setPanicPin, setAuthModel, getOrCreateDeviceSalt } = deps;
  const { seed, realPin, duressPin, panicPin } = params;

  // 1. Import the recovered seed under the new real PIN. A throw here (invalid
  //    phrase, storage failure) aborts BEFORE any cohort/slot change — fail closed.
  await importWallet(seed, realPin);

  // 2. Provision the lived-in decoy under the duress PIN (parity with onboarding).
  await setDuressPin(duressPin);

  // 3. Optional panic (wipe) slot — best-effort: a flaky optional slot must never
  //    strand the user on the password surface, so swallow its error like onboarding.
  if (panicPin) {
    try { await setPanicPin(panicPin); } catch { /* optional slot; ignore */ }
  }

  // 4. Select the PIN cohort — the whole point of §4. Never 'password'.
  setAuthModel('pin');

  // 5. Seed the deterministic-decoy salt so Option A is live (no error oracle).
  getOrCreateDeviceSalt();
}
