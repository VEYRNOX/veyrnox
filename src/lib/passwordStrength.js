// lib/passwordStrength.js
//
// LOCAL, DEPENDENCY-FREE strength gate for the VAULT PASSWORD, applied at
// creation/import (WalletEntry + HDWalletManager). The vault password is THE
// secret that encrypts the seed at rest (wallet-core/vault.js), so its strength
// is the offline brute-force resistance if the device is stolen.
//
// HONEST SCOPE (I2/I3): this check is 100% on-device. We deliberately do NOT call
// HaveIBeenPwned or any breach/range API — a self-custody, deniable wallet must
// make zero network calls tied to the secret (no egress, no timing oracle). So
// this is a MINIMUM LOCAL BAR; it does NOT and must not claim to prove a password
// is "not breached".
//
// The floor is 12 (raised from 8). Because the length check runs first, most
// classic weak passwords ("password", "qwerty123") are now rejected on length
// before the block-list is even consulted. So the block-list targets the EVASION
// a length floor invites: a weak base word padded with digits/punctuation to reach
// the floor ("password1234", "1234letmein"). baseWord() strips leading/trailing
// digit+punct runs so the weak root is still caught.
//
// SCOPE NOTE: this 12-char floor is for the VAULT password specifically. Two other
// secrets keep their own 8-char floors BY DESIGN and are out of scope here: the
// 2FA "action password" (TwoFactorSettings) and the CloudBackup EXPORT password (a
// transient export-encryption secret, not the at-rest vault key).

export const MIN_PASSWORD_LENGTH = 12;

// Exact-match block-list (lower-cased). Entries shorter than MIN_PASSWORD_LENGTH
// are unreachable (the length check rejects first), so this holds longer offenders
// + keyboard walks with INTERIOR digits that baseWord() cannot reduce.
const COMMON_PASSWORDS = new Set([
  '123456789012', '1234567890123', '111111111111', '123123123123',
  '1q2w3e4r5t6y', 'q1w2e3r4t5y6', '1qaz2wsx3edc', 'zaq12wsx3edc',
  'passwordpassword', 'qwertyqwerty', 'adminadmin123', 'iloveyouiloveyou',
]);

// Weak ROOT words / keyboard walks. A password whose leading/trailing digit+punct
// padding strips down to one of these is rejected regardless of the padding.
const COMMON_BASE_WORDS = new Set([
  'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'qwertyui', 'asdfgh',
  'asdfghjkl', 'zxcvbn', 'zxcvbnm', 'iloveyou', 'admin', 'administrator',
  'welcome', 'letmein', 'monkey', 'dragon', 'football', 'baseball',
  'basketball', 'sunshine', 'princess', 'trustno', 'whatever', 'starwars',
  'master', 'superman', 'batman', 'login', 'abc', 'abcdef', 'abcdefg',
  'test', 'testing', 'hello', 'freedom', 'shadow', 'computer', 'qazwsx',
]);

/** True when every character is the same (e.g. "aaaaaaaaaaaa", "111111111111"). */
function isSingleRepeatedChar(s) {
  return s.length > 0 && /^(.)\1*$/.test(s);
}

/**
 * Lower-case and strip leading/trailing runs of digits and common punctuation,
 * reducing "password1234" / "1234letmein!!" to the weak root word.
 */
function baseWord(s) {
  return s.toLowerCase().replace(/^[0-9!@#$%^&*._+\-]+|[0-9!@#$%^&*._+\-]+$/g, '');
}

/**
 * Assess a candidate vault password. Pure; safe to call on every keystroke.
 * @param {string} password  the candidate vault password
 * @returns {{ ok: boolean, reason?: string }}
 */
export function checkVaultPasswordStrength(password) {
  if (typeof password !== 'string') {
    return { ok: false, reason: 'Enter a vault password.' };
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { ok: false, reason: `Choose a vault password of at least ${MIN_PASSWORD_LENGTH} characters.` };
  }
  if (isSingleRepeatedChar(password)) {
    return { ok: false, reason: 'Avoid a password that repeats a single character.' };
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase()) || COMMON_BASE_WORDS.has(baseWord(password))) {
    return { ok: false, reason: 'That password is too common or predictable — choose a stronger one.' };
  }
  return { ok: true };
}
