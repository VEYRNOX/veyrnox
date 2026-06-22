// lib/pinStrength.js
//
// LOCAL, DEPENDENCY-FREE strength gate for the REAL unlock PIN, applied at
// creation (WalletEntry pin-create / pin-recover). It makes ZERO network calls
// (I2/I3) and holds no secret beyond the call. It is the honest analog of a
// "weak password" check for a numeric PIN: it blocks the handful of PINs so
// common/predictable that a thief who gets the device would try them first.
//
// IT IS A MINIMUM BAR, NOT A GUARANTEE. A 6-digit PIN is only ~20 bits; the real
// defense is guarding the device itself + the offline back-off (WalletEntry
// VULN-8). The PIN-create UI keeps the "guard the device" caveat — this helper
// does not over-claim strength, it only removes the worst offenders.
//
// SCOPE: the REAL PIN only. The duress PIN (wallet-core/duress.js, DuressPin.jsx)
// is a SEPARATE, intentionally distinct credential with its own rules (≥4 chars,
// must differ from the real PIN) and is deliberately NOT gated here — its decoy
// nature is by design (I4 deniability).

export const MIN_PIN_LENGTH = 6;

// The most-guessed numeric PINs from public breach analyses, plus obvious
// repeating patterns. A short, literal "block the worst offenders" list — not an
// exhaustive dictionary. All-same-digit and pure sequences are caught
// structurally below, so this set only needs the non-structural offenders.
const COMMON_PINS = new Set([
  // repeats / mirrors / zig-zag patterns
  '121212', '123123', '112233', '123321', '321321', '369369', '520520',
  '212121', '585858', '420420', '007007', '998877', '778899', '143143',
  // keypad shapes / diagonals
  '789456', '159753', '147258', '258456', '357951', '159357', '951357',
  '456123', '789123', '321654', '258147', '147369', '654987', '369258',
  '369852', '852369',
  // famous numbers / classic picks
  '696969', '314159', '271828', '112358', '101010', '102030', '142536',
  '135790', '011235',
]);

/** True when every character is the same digit (e.g. "000000"). */
function isAllSameDigit(pin) {
  return /^(\d)\1*$/.test(pin);
}

/** Strictly sequential, step +1 or -1 across the whole string (no 9→0 wrap). */
function isSequential(pin) {
  let ascending = true;
  let descending = true;
  for (let i = 1; i < pin.length; i++) {
    const step = pin.charCodeAt(i) - pin.charCodeAt(i - 1);
    if (step !== 1) ascending = false;
    if (step !== -1) descending = false;
  }
  return ascending || descending;
}

/**
 * Assess a candidate REAL PIN. Pure; safe to call on every keystroke.
 * @param {string} pin  the candidate PIN (expected digits-only)
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkPinStrength(pin) {
  if (typeof pin !== 'string' || !/^\d+$/.test(pin)) {
    return { ok: false, reason: 'Enter a numeric PIN.' };
  }
  if (pin.length < MIN_PIN_LENGTH) {
    return { ok: false, reason: `Use at least ${MIN_PIN_LENGTH} digits.` };
  }
  if (isAllSameDigit(pin)) {
    return { ok: false, reason: 'Avoid a PIN that repeats one digit (like 000000).' };
  }
  if (isSequential(pin)) {
    return { ok: false, reason: 'Avoid a sequential PIN (like 123456).' };
  }
  if (COMMON_PINS.has(pin)) {
    return { ok: false, reason: 'That PIN is one of the most common — pick a less guessable one.' };
  }
  return { ok: true };
}
