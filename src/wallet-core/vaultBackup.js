// @ts-nocheck
// wallet-core/vaultBackup.js
//
// Self-custodial encrypted vault backup (S4 — single combined-credential seal).
//
// DESIGN
// ------
// The backup file is an envelope containing ONE encrypted copy of the
// serialized vault container, sealed under a credential COMBINED from both:
//
//   secret = password + 0x1F + pin
//
// Both credentials are required to restore. The unit-separator byte (0x1F,
// forbidden in a keyboard-typed PIN or password) is a domain-separator so no
// two distinct (password, pin) pairs collide.
//
// 2026-09-01 (this rewrite): replaced the earlier two-seal model
// (seals.password OR seals.pin — either alone unlocked the vault) with a
// single combined seal. The PIN-only seal exposed the file to a ~10^8 offline
// crack surface even when the password was strong; the audit floor bumped to
// 12 digits (2026-08-16, PR #1834) was a stopgap that broke UI parity with
// the rest of the app (8-digit PinPad). Combined model matches the shard
// export flow (8-digit PIN + 16-char passphrase, both required — PR #1834).
// No production users existed at the time of the cut, so no legacy-envelope
// read path is retained. A stale legacy .enc file will fail parseBackupFile.
//
// HONESTY NOTE. Combined credential entropy: 16-char alphanumeric passphrase
// ≈ 95 bits, 8-digit PIN ≈ 27 bits — jointly ~121 bits, KDF-slowed by
// Argon2id at 192 MiB / t=3 per attempt (KDF_PARAMS.memorySize). If either
// is forgotten, there is no recovery — this is non-custodial.
//
// RESTORE
//   User supplies password + pin → combined credential decrypts the single
//   seal → containerJson extracted → re-encrypted under a fresh on-device
//   8-digit PIN via finalisePinRestore. The restored vault is ALWAYS
//   PIN-cohort — unlock and hardware-KEK both use the PIN.

import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { encryptVault, decryptVault } from './vault.js';
import { saveVault } from './evm/vaultStore.js';
import { getKeyStore, withLockSuppressed } from './keystore/index.js';

export const BACKUP_APP = 'veyrnox';
export const BACKUP_VERSION = 2; // bumped 1→2 (2026-09-01) for single-combined-seal model

// Domain-separator between password and pin when combining. 0x1F (US, unit
// separator) is a control byte — not typable in a PIN or password entry — so
// no two distinct (password, pin) pairs can collide onto the same secret.
const CREDENTIAL_SEPARATOR = '\x1f';

/**
 * Combine backup password + PIN into a single credential for the seal.
 * Both are required to restore; forgetting either loses the backup.
 * @param {string} password
 * @param {string} pin
 * @returns {string} combined credential
 */
export function combineBackupCredential(password, pin) {
  return password + CREDENTIAL_SEPARATOR + pin;
}

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
//   per seal (version 3): id(1: 2=combined) hasKdf(1) blobV(1) [kdf(16)] saltLen(1) salt ivLen(1) iv ctLen(4) ct
//     blobV carries the vault blob schema version (e.g. 2 for M-8 AAD binding).
//   BIN_VERSION 1/2 (dual seals: id 0=password, id 1=pin) — REMOVED 2026-09-01,
//     no legacy read path. See file-top DESIGN comment for the rationale.
const BIN_MAGIC = new Uint8Array([0x56, 0x59, 0x52, 0x4e, 0x58, 0x45, 0x4e, 0x43]); // "VYRNXENC"
const BIN_VERSION = 3; // bumped 2→3 (2026-09-01) for single-combined-seal model
const SEAL_IDS = { combined: 2 };
const SEAL_NAMES = { 2: 'combined' };

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
  const seals = ['combined'];
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
  if (version !== BIN_VERSION) throw new Error('Unsupported backup version');
  need(8); const created_at = dv.getFloat64(o, false); o += 8;
  need(1); const nSeals = bytes[o]; o += 1;
  const seals = {};
  for (let s = 0; s < nSeals; s++) {
    need(2); const id = bytes[o]; o += 1; const hasKdf = bytes[o]; o += 1;
    need(1); const blobV = bytes[o]; o += 1;
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
  return isValidBlob(p.seals.combined);
}

// ── Export ─────────────────────────────────────────────────────────────────────

/**
 * Create the backup envelope from an already-serialized container string plus
 * both credentials. Password and PIN are combined into a single secret and
 * sealed once at full Argon2id strength. Both are required to restore.
 * This is the pure creation step — the caller is responsible for downloading.
 *
 * @param {string} containerJson  mv.serializeContainer output (LIVE SECRET)
 * @param {string} password       the backup password (min 16 chars)
 * @param {string} pin            8-digit PIN string
 * @returns {Promise<object>}     the backup envelope (safe to JSON.stringify)
 */
export async function createBackupEnvelope(containerJson, password, pin) {
  if (typeof containerJson !== 'string' || containerJson.length === 0)
    throw new Error('No container to back up');
  if (typeof password !== 'string' || password.length < 16)
    throw new Error('Backup password must be at least 16 characters');
  if (typeof pin !== 'string' || !/^\d{8}$/.test(pin))
    throw new Error('Backup PIN must be exactly 8 digits');

  const combinedBlob = await encryptVault(containerJson, combineBackupCredential(password, pin));

  return {
    app:       BACKUP_APP,
    backup_v:  BACKUP_VERSION,
    created_at: Date.now(),
    seals: {
      combined: combinedBlob,
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
  let plaintext;
  try {
    plaintext = await decryptVault(parsed.seals.combined, combineBackupCredential(password, pin));
  } catch {
    throw new Error('Backup verification failed — it could not be reopened with these credentials. Not saved.');
  }
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new Error('Backup verification failed — empty plaintext. Not saved.');
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
      // Slice G+H P1: preserve the raw activityType alongside the human path so
      // PersonalBackup can distinguish SaveToFiles (definitively landed) from
      // Mail / Message / an absent activityType (assume pending confirmation).
      if (result.activityType) {
        return { saved: true, activityType: result.activityType, path: 'Shared via ' + result.activityType };
      }
      return { saved: true, activityType: undefined, path: 'Saved via share sheet' };
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
// writing directly to web storage on native. Use decryptBackupSeal() +
// finalisePinRestore() instead.

/**
 * Decrypt the combined seal to the container JSON. Both backup password and
 * backup PIN are required — they are combined via combineBackupCredential
 * before Argon2id. Does NOT persist anything; caller re-wraps the plaintext
 * under a fresh on-device PIN via finalisePinRestore.
 * @param {object} envelope   result of parseBackupFile()
 * @param {string} password   the backup password
 * @param {string} pin        the backup PIN
 * @returns {Promise<string>} the decrypted container JSON (LIVE SECRET — short-lived)
 * @throws if credentials are wrong or the blob is corrupted
 */
export async function decryptBackupSeal(envelope, password, pin) {
  if (!isValidBackup(envelope)) throw new Error('Invalid backup');
  const env = /** @type {any} */ (envelope);
  return await decryptVault(env.seals.combined, combineBackupCredential(password, pin));
}

/**
 * Final step of a file restore: encrypt the container JSON under the on-device
 * 8-digit PIN the user just set, and save it as the local primary vault.
 * The restored on-device vault is ALWAYS PIN-cohort — unlock and the
 * hardware-KEK gate both use the PIN (owner decision 2026-07-16). Enforces
 * exactly 8 digits so a caller cannot smuggle a non-digit or out-of-range
 * string past this boundary.
 * @param {string} containerJson  result of decryptBackupSeal()
 * @param {string} devicePin      the on-device 8-digit PIN chosen during restore
 */
export async function finalisePinRestore(containerJson, devicePin) {
  if (typeof containerJson !== 'string' || containerJson.length === 0)
    throw new Error('No container to save');
  if (typeof devicePin !== 'string' || !/^\d{8}$/.test(devicePin))
    throw new Error('Device PIN must be exactly 8 digits');
  try {
    await getKeyStore().createVault(containerJson, devicePin);
  } catch (e) {
    // The PIN seal already decrypted — a save failure here is persistence, not a
    // credential error. Tag it so the UI shows an honest, non-misleading message.
    throw Object.assign(new Error('RESTORE_SAVE_FAILED'), { code: 'RESTORE_SAVE_FAILED', cause: e });
  }
}
