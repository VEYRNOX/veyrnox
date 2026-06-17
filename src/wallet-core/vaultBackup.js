// wallet-core/vaultBackup.js
//
// Self-custodial encrypted vault backup (S4 — Option A: two sealed copies).
//
// DESIGN
// ------
// The backup file is a JSON envelope containing TWO independently-decryptable
// copies of the serialized vault container, each sealed with a different
// credential under full Argon2id+AES-GCM:
//
//   seals.password — encrypted with the user's full wallet password
//   seals.pin      — encrypted with the user's 6-digit PIN
//
// Either seal decrypts the same plaintext (the serialized container JSON).
// The file carries no unencrypted seed material, no wallet addresses, and no
// credential hints. It is safe to store anywhere the user chooses — iCloud,
// Google Drive, a USB drive, a local folder.
//
// HONESTY NOTE on PIN seal: a 6-digit PIN has ~20 bits of entropy. At 192 MiB
// Argon2id per attempt, offline brute-force (10^6 guesses) requires days on a
// single machine but is feasible for a well-resourced attacker who obtains the
// file. The password seal is the stronger recovery path. If both are forgotten,
// there is no recovery — this is non-custodial.
//
// RESTORE
//   Password restore: the password seal IS a valid vault blob → saved directly
//     via saveVault; user unlocks with their original password.
//   PIN restore: PIN seal is decrypted → containerJson extracted → re-encrypted
//     under a new password the user sets → saved via createVault.

import { encryptVault, decryptVault } from './vault.js';
import { saveVault } from './evm/vaultStore.js';
import { getKeyStore } from './keystore/index.js';

export const BACKUP_APP = 'veyrnox';
export const BACKUP_VERSION = 1;

// ── Validation ────────────────────────────────────────────────────────────────

function isValidBlob(b) {
  return b != null && b.v === 1 && typeof b.ct === 'string'
    && typeof b.iv === 'string' && typeof b.salt === 'string';
}

/**
 * Returns true if the parsed JSON object is a well-formed Veyrnox backup file.
 * Does NOT verify that the seals are decryptable — that requires a credential.
 * @param {unknown} parsed
 * @returns {boolean}
 */
export function isValidBackup(parsed) {
  if (!parsed || typeof parsed !== 'object') return false;
  if (parsed.app !== BACKUP_APP) return false;
  if (parsed.backup_v !== BACKUP_VERSION) return false;
  if (!parsed.seals || typeof parsed.seals !== 'object') return false;
  return isValidBlob(parsed.seals.password) && isValidBlob(parsed.seals.pin);
}

// ── Export ─────────────────────────────────────────────────────────────────────

/**
 * Create the backup envelope from an already-serialized container string plus
 * the two credentials. Both seals are computed at full Argon2id strength.
 * This is the pure creation step — the caller is responsible for downloading.
 *
 * @param {string} containerJson  mv.serializeContainer output (LIVE SECRET)
 * @param {string} password       the vault password
 * @param {string} pin            6-digit PIN string
 * @returns {Promise<object>}     the backup envelope (safe to JSON.stringify)
 */
export async function createBackupEnvelope(containerJson, password, pin) {
  if (typeof containerJson !== 'string' || containerJson.length === 0)
    throw new Error('No container to back up');
  if (typeof password !== 'string' || password.length === 0)
    throw new Error('Password required');
  if (typeof pin !== 'string' || !/^\d{4,12}$/.test(pin))
    throw new Error('PIN must be 4–12 digits');

  // Encrypt the SAME plaintext under both credentials (full KDF strength for each).
  // Two sequential Argon2id calls — ~1–4 s each on a phone. Acceptable for an
  // infrequent backup operation.
  const passwordBlob = await encryptVault(containerJson, password);
  const pinBlob      = await encryptVault(containerJson, pin);

  return {
    app:       BACKUP_APP,
    backup_v:  BACKUP_VERSION,
    created_at: Date.now(),
    seals: {
      password: passwordBlob,
      pin:      pinBlob,
    },
  };
}

/**
 * Trigger a browser file download of the backup envelope.
 * Uses a neutral filename (.enc) — not a tell that the file is a seed backup.
 * @param {object} envelope  result of createBackupEnvelope()
 */
export function downloadBackupFile(envelope) {
  const json = JSON.stringify(envelope);
  const blob = new Blob([json], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  // Neutral filename — does not announce what the file is.
  a.download = 'veyrnox.enc';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

// ── Restore ────────────────────────────────────────────────────────────────────

/**
 * Parse and validate a backup file's text content.
 * @param {string} text  raw file text from FileReader
 * @returns {object}     the parsed envelope
 * @throws if the content is not a valid Veyrnox backup
 */
export function parseBackupFile(text) {
  let parsed;
  try { parsed = JSON.parse(text); } catch {
    throw new Error('File is not valid JSON');
  }
  if (!isValidBackup(parsed))
    throw new Error('Not a valid Veyrnox backup file');
  return parsed;
}

/**
 * Restore from a backup using the password seal. The password seal blob IS a
 * valid vault blob — it is saved directly to IndexedDB so the user can unlock
 * with their original password immediately. No re-encryption needed.
 *
 * @param {object} envelope   result of parseBackupFile()
 * @param {string} password   the original wallet password
 * @returns {Promise<void>}
 * @throws if the password is wrong or the blob is corrupted
 */
export async function restoreWithPassword(envelope, password) {
  if (!isValidBackup(envelope)) throw new Error('Invalid backup');
  // Verify the password is correct by decrypting (throws on wrong credential).
  await decryptVault(envelope.seals.password, password);
  // The blob is correct — save it as the local primary vault. The user can now
  // unlock with their original password through the normal flow.
  await saveVault(envelope.seals.password);
}

/**
 * Restore from a backup using the PIN seal, then re-encrypt under a new
 * password for the local vault. Returns the decrypted container JSON so the
 * caller can drive the re-encryption step (via keyStore.createVault).
 *
 * @param {object} envelope    result of parseBackupFile()
 * @param {string} pin         the PIN the backup was created with
 * @returns {Promise<string>}  the decrypted container JSON (LIVE SECRET — short-lived)
 * @throws if the PIN is wrong or the blob is corrupted
 */
export async function decryptPinSeal(envelope, pin) {
  if (!isValidBackup(envelope)) throw new Error('Invalid backup');
  return await decryptVault(envelope.seals.pin, pin);
}

/**
 * Final step of a PIN restore: encrypt the container JSON under the new
 * password and save it as the local primary vault.
 * @param {string} containerJson  result of decryptPinSeal()
 * @param {string} newPassword
 */
export async function finalisePinRestore(containerJson, newPassword) {
  if (typeof containerJson !== 'string' || containerJson.length === 0)
    throw new Error('No container to save');
  if (typeof newPassword !== 'string' || newPassword.length === 0)
    throw new Error('New password required');
  await getKeyStore().createVault(containerJson, newPassword);
}
