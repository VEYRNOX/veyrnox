// @ts-nocheck
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
//   seals.pin      — encrypted with the user's 8-digit PIN
//
// Either seal decrypts the same plaintext (the serialized container JSON).
// The file carries no unencrypted seed material, no wallet addresses, and no
// credential hints. It is safe to store anywhere the user chooses — iCloud,
// Google Drive, a USB drive, a local folder.
//
// HONESTY NOTE on PIN seal: the seal is only as strong as the PIN. The export
// function enforces /^\d{8,12}$/ (see line ~213), matching PersonalBackup.jsx
// canExport, so a real seal carries ~27 bits (8-digit, 10^8) up to ~40 bits
// (12-digit). At 192 MiB Argon2id per attempt (KDF_PARAMS.memorySize, raised
// 64→192 MiB by PR #604, 2026-07-05), offline brute-force of an 8-digit seal is
// materially harder than the earlier 64 MiB assumption but is still bounded by the
// ~27-bit floor — a well-resourced attacker who obtains the file can still exhaust
// it eventually. The password seal is the stronger recovery path. If both are
// forgotten, there is no recovery — this is non-custodial. (2026-07-14 audit LOW:
// docstring corrected from stale "6–12 digits / 64 MiB Argon2id" claims that
// predated PR #604 and the 8-digit floor.)
//
// RESTORE
//   Password restore: the password seal IS a valid vault blob → saved directly
//     via saveVault; user unlocks with their original password.
//   PIN restore: PIN seal is decrypted → containerJson extracted → re-encrypted
//     under a new password the user sets → saved via createVault.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { encryptVault, decryptVault } from './vault.js';
import { saveVault } from './evm/vaultStore.js';
import { getKeyStore, withLockSuppressed } from './keystore/index.js';

export const BACKUP_APP = 'veyrnox';
export const BACKUP_VERSION = 1;

// ── On-disk format: a BINARY encrypted-vault container ──────────────────────────
//
// The .enc file is written as raw bytes, NOT text. Opened in a text editor it is
// undifferentiated binary garbage — the bulk of the file is the per-seal AES-GCM
// CIPHERTEXT (high-entropy, already encrypted), framed by a tiny binary header.
// There is no readable JSON, no labels, no base64. This is what makes it behave
// like an encrypted vault file rather than a document.
//
// HONEST scope note (unchanged): the protection of your SEED is the per-seal
// AES-256-GCM encryption under your chosen backup credential — that is the real
// security boundary. The binary framing (salts/IVs/lengths) is non-secret by
// design; it is not a second cipher. What changed here is purely the on-disk
// ENCODING: binary instead of text, so the file is opaque to a text editor.
//
// Layout (big-endian):
//   magic   "VYRNXENC" (8 bytes)
//   version 1 byte
//   created 8 bytes  Float64 epoch-ms
//   nSeals  1 byte
//   per seal (version 1): id(1: 0=password,1=pin) hasKdf(1) [kdf(16)] saltLen(1) salt ivLen(1) iv ctLen(4) ct
//   per seal (version 2): id(1) hasKdf(1) blobV(1) [kdf(16)] saltLen(1) salt ivLen(1) iv ctLen(4) ct
//     blobV carries the vault blob schema version (e.g. 2 for M-8 AAD binding).
//     Version 2 new in M-8 so decrypt can supply the correct additionalData.
const BIN_MAGIC = new Uint8Array([0x56, 0x59, 0x52, 0x4e, 0x58, 0x45, 0x4e, 0x43]); // "VYRNXENC"
const BIN_VERSION = 2; // bumped from 1 → 2 for M-8 AAD binding (adds blobV per seal)
const BIN_VERSION_LEGACY = 1; // old files still accepted on read (no blobV byte)
const SEAL_IDS = { password: 0, pin: 1 };
const SEAL_NAMES = { 0: 'password', 1: 'pin' };

// Legacy text container (pre-binary). Kept so an older .enc still restores.
const LEGACY_TEXT_MAGIC = 'VYRNXVLT1:';
function decodeLegacyText(text) {
  const bin = atob(text.slice(LEGACY_TEXT_MAGIC.length));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

const b64ToBytes = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

// Serialize a backup envelope to the binary container (Uint8Array).
function encodeBinary(envelope) {
  const parts = [];
  parts.push(BIN_MAGIC);
  parts.push(Uint8Array.of(BIN_VERSION));
  const created = new Uint8Array(8);
  new DataView(created.buffer).setFloat64(0, Number(envelope.created_at) || 0, false);
  parts.push(created);
  const seals = ['password', 'pin'];
  parts.push(Uint8Array.of(seals.length));
  for (const name of seals) {
    const blob = envelope.seals[name];
    const salt = b64ToBytes(blob.salt), iv = b64ToBytes(blob.iv), ct = b64ToBytes(blob.ct);
    // KDF params (numeric only — the algorithm name is NOT written to the file;
    // it is reconstructed on read). These are REQUIRED to derive the right key:
    // dropping them makes decrypt fall back to legacy params and fail.
    const k = blob.kdf;
    // blobV: vault blob schema version — written so decodeBinary can reconstruct
    // the blob with the correct v field and supply AAD for v:2+ blobs (M-8).
    const blobV = blob.v ?? 1;
    parts.push(Uint8Array.of(SEAL_IDS[name], k ? 1 : 0, blobV));
    if (k) {
      const kp = new Uint8Array(16);
      const kdv = new DataView(kp.buffer);
      kdv.setUint32(0, k.parallelism >>> 0, false);
      kdv.setUint32(4, k.iterations >>> 0, false);
      kdv.setUint32(8, k.memorySize >>> 0, false);
      kdv.setUint32(12, k.hashLength >>> 0, false);
      parts.push(kp);
    }
    parts.push(Uint8Array.of(salt.length));
    parts.push(salt);
    parts.push(Uint8Array.of(iv.length));
    parts.push(iv);
    const ctLen = new Uint8Array(4);
    new DataView(ctLen.buffer).setUint32(0, ct.length, false);
    parts.push(ctLen);
    parts.push(ct);
  }
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function startsWithBinMagic(bytes) {
  if (bytes.length < BIN_MAGIC.length) return false;
  for (let i = 0; i < BIN_MAGIC.length; i++) if (bytes[i] !== BIN_MAGIC[i]) return false;
  return true;
}

// Parse the binary container back to an envelope (re-base64s salt/iv/ct so the
// existing decryptVault/restore path is unchanged). Throws on malformed input.
function decodeBinary(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let o = BIN_MAGIC.length;
  const need = (n) => { if (o + n > bytes.length) throw new Error('Not a valid Veyrnox backup file'); };
  need(1); const version = bytes[o]; o += 1;
  if (version !== BIN_VERSION && version !== BIN_VERSION_LEGACY) throw new Error('Unsupported backup version');
  need(8); const created_at = dv.getFloat64(o, false); o += 8;
  need(1); const nSeals = bytes[o]; o += 1;
  const seals = {};
  for (let s = 0; s < nSeals; s++) {
    need(2); const id = bytes[o]; o += 1; const hasKdf = bytes[o]; o += 1;
    // blobV: present only in BIN_VERSION 2+ — vault blob schema version for AAD (M-8).
    let blobV = 1;
    if (version >= BIN_VERSION) { need(1); blobV = bytes[o]; o += 1; }
    let kdf = null;
    if (hasKdf) {
      need(16);
      kdf = {
        name: 'argon2id', // reconstructed; never written to the file
        parallelism: dv.getUint32(o, false),
        iterations: dv.getUint32(o + 4, false),
        memorySize: dv.getUint32(o + 8, false),
        hashLength: dv.getUint32(o + 12, false),
      };
      o += 16;
    }
    need(1); const saltLen = bytes[o]; o += 1;
    need(saltLen); const salt = bytes.slice(o, o + saltLen); o += saltLen;
    need(1); const ivLen = bytes[o]; o += 1;
    need(ivLen); const iv = bytes.slice(o, o + ivLen); o += ivLen;
    need(4); const ctLen = dv.getUint32(o, false); o += 4;
    need(ctLen); const ct = bytes.slice(o, o + ctLen); o += ctLen;
    const name = SEAL_NAMES[id];
    if (name) {
      const blob = { v: blobV, salt: bytesToB64(salt), iv: bytesToB64(iv), ct: bytesToB64(ct) };
      if (kdf) blob.kdf = kdf;
      seals[name] = blob;
    }
  }
  return { app: BACKUP_APP, backup_v: BACKUP_VERSION, created_at, seals };
}

// ── Validation ────────────────────────────────────────────────────────────────

function isValidBlob(b) {
  // Accept v:1 (legacy, no AAD) and v:2+ (M-8, AAD-bound).
  return b != null && (b.v === 1 || b.v === 2) && typeof b.ct === 'string'
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
  const p = /** @type {any} */ (parsed);
  if (p.app !== BACKUP_APP) return false;
  if (p.backup_v !== BACKUP_VERSION) return false;
  if (!p.seals || typeof p.seals !== 'object') return false;
  return isValidBlob(p.seals.password) && isValidBlob(p.seals.pin);
}

// ── Export ─────────────────────────────────────────────────────────────────────

/**
 * Create the backup envelope from an already-serialized container string plus
 * the two credentials. Both seals are computed at full Argon2id strength.
 * This is the pure creation step — the caller is responsible for downloading.
 *
 * @param {string} containerJson  mv.serializeContainer output (LIVE SECRET)
 * @param {string} password       the vault password
 * @param {string} pin            8-digit PIN string
 * @returns {Promise<object>}     the backup envelope (safe to JSON.stringify)
 */
export async function createBackupEnvelope(containerJson, password, pin) {
  if (typeof containerJson !== 'string' || containerJson.length === 0)
    throw new Error('No container to back up');
  if (typeof password !== 'string' || password.length < 12)
    throw new Error('Backup password must be at least 12 characters');
  if (typeof pin !== 'string' || !/^\d{8,12}$/.test(pin))
    throw new Error('PIN must be 8–12 digits');

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
 * Prove a freshly-created backup is actually restorable BEFORE the user is told
 * it succeeded. Round-trips the envelope through the real on-disk binary
 * encoding (catching any format/serialization defect) and then decrypts BOTH
 * seals with the credentials the user chose (catching a credential or KDF-param
 * mismatch). A backup you cannot open is worse than none — so export calls this
 * and only claims success if it passes.
 *
 * @param {object} envelope   result of createBackupEnvelope()
 * @param {string} password   the chosen backup password
 * @param {string} pin        the chosen backup PIN
 * @throws if the encoded file does not parse, or either seal fails to decrypt to
 *         the same plaintext under the given credentials
 */
export async function verifyBackupEnvelope(envelope, password, pin) {
  let parsed;
  try {
    parsed = parseBackupFile(encodeBinary(envelope));
  } catch {
    throw new Error('Backup verification failed — the file did not encode correctly. Not saved.');
  }
  let fromPassword, fromPin;
  try {
    fromPassword = await decryptVault(parsed.seals.password, password);
    fromPin = await decryptVault(parsed.seals.pin, pin);
  } catch {
    throw new Error('Backup verification failed — it could not be reopened with these credentials. Not saved.');
  }
  if (fromPassword !== fromPin || typeof fromPassword !== 'string' || fromPassword.length === 0) {
    throw new Error('Backup verification failed — seal mismatch. Not saved.');
  }
  return true;
}

/**
 * Deliver the backup envelope to the user.
 *
 * On native Android the <a download> path is silently dropped by the WebView.
 * We use @capacitor/filesystem to write the file to the app's cache directory,
 * then @capacitor/share to open the OS share sheet (Google Drive, Dropbox,
 * Files, email, etc.) so the user chooses the destination.
 *
 * On web/desktop the standard <a download> anchor click is used.
 *
 * Returns true if delivery was initiated, false if the share sheet was
 * dismissed (so the caller can show an honest toast).
 *
 * @param {object} envelope  result of createBackupEnvelope()
 * @returns {Promise<boolean|{saved:boolean,path:string}>}
 */
export async function downloadBackupFile(envelope) {
  const bytes = encodeBinary(envelope);
  const filename = 'veyrnox.enc';
  const platform = Capacitor.getPlatform();

  if (platform === 'android') {
    const FileSaver = registerPlugin('FileSaver');
    const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    const result = await FileSaver.saveToDownloads({ data: base64, filename });
    return { saved: true, path: result.path };
  }

  if (platform === 'ios') {
    const base64Data = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    const tempFile = await Filesystem.writeFile({
      path: filename,
      data: base64Data,
      directory: Directory.Cache,
    });
    const fileUri = tempFile.uri;
    try {
      const result = await withLockSuppressed(() =>
        Share.share({ title: filename, url: fileUri, dialogTitle: 'Save backup file' })
      );
      if (result.activityType) {
        return { saved: true, path: 'Shared via ' + result.activityType };
      }
      return { saved: true, path: 'Saved via share sheet' };
    } catch (err) {
      if (err?.message?.includes('cancelled') || err?.message?.includes('dismiss')) {
        return { saved: false, path: '' };
      }
      throw err;
    } finally {
      Filesystem.deleteFile({ path: filename, directory: Directory.Cache }).catch(() => {});
    }
  }

  // Web / desktop: standard anchor-click download.
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

/**
 * Open the system file picker (ACTION_CREATE_DOCUMENT) so the user can choose
 * a specific save location — Google Drive, Dropbox, a subfolder, etc.
 * Returns true if saved, false if cancelled.
 * @param {object} envelope  result of createBackupEnvelope()
 * @returns {Promise<boolean>}
 */
export async function downloadBackupFilePicker(envelope) {
  const bytes = encodeBinary(envelope);
  const filename = 'veyrnox.enc';
  const platform = Capacitor.getPlatform();

  if (platform === 'android') {
    const FileSaver = registerPlugin('FileSaver');
    const base64 = btoa(String.fromCharCode(...new Uint8Array(bytes)));
    const result = await withLockSuppressed(() => FileSaver.saveFile({ data: base64, filename }));
    return !result.cancelled;
  }

  if (platform === 'ios') {
    // On iOS the share sheet IS the picker — same mechanism as downloadBackupFile.
    const result = await downloadBackupFile(envelope);
    return result && typeof result === 'object' ? result.saved : !!result;
  }

  // Web fallback (desktop browser)
  const blob = new Blob([bytes], { type: 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return true;
}

// ── Restore ────────────────────────────────────────────────────────────────────

/**
 * Parse and validate a backup file. Accepts the binary container (preferred —
 * pass the file's bytes as ArrayBuffer/Uint8Array) and, for backward
 * compatibility, the legacy text formats (opaque-base64 container or plain JSON)
 * whether handed in as a string or as bytes.
 * @param {ArrayBuffer|Uint8Array|string} data  raw file contents from FileReader
 * @returns {object}  the parsed envelope
 * @throws if the content is not a valid Veyrnox backup
 */
export function parseBackupFile(data) {
  let parsed;
  if (typeof data !== 'string') {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    if (startsWithBinMagic(bytes)) {
      parsed = decodeBinary(bytes);
      if (!isValidBackup(parsed)) throw new Error('Not a valid Veyrnox backup file');
      return parsed;
    }
    // Not binary → it may be a legacy TEXT backup saved as bytes. Decode and
    // fall through to the text path.
    data = new TextDecoder().decode(bytes);
  }
  // Legacy text: opaque-base64 container or plain JSON.
  let jsonText = data;
  const trimmed = data.trim();
  if (trimmed.startsWith(LEGACY_TEXT_MAGIC)) {
    try { jsonText = decodeLegacyText(trimmed); } catch {
      throw new Error('Not a valid Veyrnox backup file');
    }
  }
  try { parsed = JSON.parse(jsonText); } catch {
    throw new Error('Not a valid Veyrnox backup file');
  }
  if (!isValidBackup(parsed))
    throw new Error('Not a valid Veyrnox backup file');
  return parsed;
}

// #1101: restoreWithPassword() REMOVED — dead export since PR #1032 unified
// restore on finalisePinRestore(). It bypassed native keystore selection by
// writing directly to web storage on native. Use decryptPasswordSeal() +
// finalisePinRestore() instead.

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
  const env = /** @type {any} */ (envelope);
  return await decryptVault(env.seals.pin, pin);
}

/**
 * Decrypt the PASSWORD seal to the container JSON (mirror of decryptPinSeal).
 * Unlike the removed restoreWithPassword (which saved the password-sealed blob
 * verbatim and left the on-device vault in the PASSWORD cohort), this only
 * RETURNS the plaintext
 * container so the caller can re-wrap it under an on-device PIN — keeping the whole
 * app PIN-cohort (owner decision 2026-07-16). Does NOT persist anything.
 * @param {object} envelope   result of parseBackupFile()
 * @param {string} password   the backup password
 * @returns {Promise<string>} the decrypted container JSON (LIVE SECRET — short-lived)
 * @throws if the password is wrong or the blob is corrupted
 */
export async function decryptPasswordSeal(envelope, password) {
  if (!isValidBackup(envelope)) throw new Error('Invalid backup');
  const env = /** @type {any} */ (envelope);
  return await decryptVault(env.seals.password, password);
}

/**
 * Final step of a file restore: encrypt the container JSON under the on-device
 * 8-digit PIN the user just set, and save it as the local primary vault. Both
 * restore paths (backup-password seal via decryptPasswordSeal, backup-PIN seal via
 * decryptPinSeal) converge here, so the restored on-device vault is ALWAYS
 * PIN-cohort — unlock and the hardware-KEK gate both use the PIN (owner decision
 * 2026-07-16). Credential-agnostic: accepts any non-empty string (the UI enforces
 * the 8-digit PIN); it does not require a 12-char password.
 * @param {string} containerJson  result of decryptPinSeal() / decryptPasswordSeal()
 * @param {string} devicePin      the on-device 8-digit PIN chosen during restore
 */
export async function finalisePinRestore(containerJson, devicePin) {
  if (typeof containerJson !== 'string' || containerJson.length === 0)
    throw new Error('No container to save');
  if (typeof devicePin !== 'string' || devicePin.length === 0)
    throw new Error('Device PIN required');
  try {
    await getKeyStore().createVault(containerJson, devicePin);
  } catch (e) {
    // The PIN seal already decrypted — a save failure here is persistence, not a
    // credential error. Tag it so the UI shows an honest, non-misleading message.
    throw Object.assign(new Error('RESTORE_SAVE_FAILED'), { code: 'RESTORE_SAVE_FAILED', cause: e });
  }
}
