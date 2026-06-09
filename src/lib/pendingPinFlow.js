// lib/pendingPinFlow.js
//
// Consume the in-memory Phase-1 pending PIN into an atomic Phase-2 provision.
// Pure orchestration (no React/IndexedDB) so the gating + consume-on-success-only
// semantics of the provider's createWalletFromPendingPin / importWalletForPendingPin
// wrappers are unit-tested directly. The actual atomic/fail-closed provisioning lives
// in the injected `provision` (provisionPinWallet / provisionPinRecovery), already
// unit-tested. Here we only guarantee: (1) no PIN -> throw, never provision; (2) the
// pin is cleared ONLY after a successful provision (consume-on-success); (3) on a
// provision failure the pin is NOT cleared here (the UI catch decides), and the error
// propagates so the caller can surface it / the orchestrator's rollback stands.
//
// @param {() => (string|null)} getPin   reads the in-memory pending PIN
// @param {() => void} clearPin           clears the in-memory pending PIN
// @param {(pin: string) => Promise<void>} provision  the atomic provisioning step
// @returns {Promise<void>}
export async function consumePendingPin(getPin, clearPin, provision) {
  const pin = getPin();
  if (pin == null) throw new Error('No PIN set; complete PIN setup first');
  await provision(pin);   // throws on failure → pin NOT cleared below, error propagates
  clearPin();             // consumed-and-cleared ONLY on success
}
