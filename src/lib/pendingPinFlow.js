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

// A failed pending-PIN import/create is one of two kinds, and they want OPPOSITE
// pending-PIN handling in the UI catch:
//   (a) a RECOVERABLE user-input reject — a malformed / bad-checksum seed phrase.
//       consumePendingPin never reached `provision`'s side effects (the BIP-39
//       check throws first) so the in-memory pending PIN is intact. We MUST keep
//       it, so the user can correct the phrase and retry without re-entering the
//       PIN. Clearing it here is the bug that stranded the user on the misleading
//       "No PIN set" loop.
//   (b) a GENUINE provisioning/teardown failure (keystore write, chaff rollback).
//       Here we fail closed: clear the pending PIN and tell the user nothing was
//       saved.
// Recoverable rejects are tagged `code: 'INVALID_MNEMONIC'` at the throw site; we
// also fall back to the known messages so a re-worded/older throw still classifies
// correctly (string match is the fallback, not the primary signal).
//
// @param {unknown} error  the rejection caught by the UI import/create handler
// @returns {boolean}      true → preserve the pending PIN (recoverable input)
export function isRecoverableSeedInputError(error) {
  if (!error) return false;
  if (error.code === 'INVALID_MNEMONIC') return true;
  return /invalid recovery phrase|invalid mnemonic/i.test(String(error.message || ''));
}
