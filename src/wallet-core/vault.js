// wallet-core/vault.js
//
// Encrypted key vault: the heart of self-custody.
//
// SECURITY RATIONALE
// ------------------
// The seed/keys are encrypted at rest with a key derived from the user's
// password via a MEMORY-HARD KDF (Argon2id). Only the resulting ciphertext
// blob may ever touch the backend or sync. The backend stores ciphertext it
// CANNOT decrypt — this is what makes the wallet non-custodial even with an
// untrusted server (see threat model: "malicious backend").
//
// Construction:
//   - KDF:        Argon2id (hash-wasm) — memory-hard, resists GPU/ASIC cracking.
//   - Cipher:     AES-256-GCM via WebCrypto (authenticated; detects tampering).
//   - Salt/nonce: fresh random per encryption from crypto.getRandomValues.
//
// IMPORTANT LIMITATIONS (be honest about these in your threat model):
//   - JavaScript cannot guarantee memory zeroization or prevent secrets from
//     lingering in GC'd buffers. We zero what we can; true secret hygiene on
//     web is best-effort. Mobile/extension with OS keystore is stronger.
//   - Password strength bounds everything. Pair with a strength meter and,
//     ideally, wrap the vault key in a device keystore (Secure Enclave /
//     Android Keystore) so the password is not the sole factor.

import { argon2id } from 'hash-wasm';

const KDF_PARAMS = Object.freeze({
  // Tune to device class; these are reasonable interactive defaults.
  parallelism: 1,
  iterations: 3,
  memorySize: 65536, // KiB == 64 MiB
  hashLength: 32,    // 256-bit key for AES-256
});

const enc = new TextEncoder();
const dec = new TextDecoder();

function randomBytes(n) {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

async function deriveKey(password, salt) {
  const raw = await argon2id({
    password: enc.encode(password.normalize('NFKC')),
    salt,
    ...KDF_PARAMS,
    outputType: 'binary',
  });
  // Import into WebCrypto as a non-extractable AES-GCM key.
  const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
  zero(raw);
  return key;
}

/**
 * Encrypt a plaintext secret (e.g. the mnemonic) into a portable vault blob.
 * The returned object is safe to persist locally and to sync to a backend.
 * @param {string} secret - LIVE SECRET (mnemonic / seed material)
 * @param {string} password
 * @returns {Promise<object>} serializable vault { v, kdf, salt, iv, ct }
 */
export async function encryptVault(secret, password) {
  const salt = randomBytes(16);
  const iv = randomBytes(12); // 96-bit nonce for GCM
  const key = await deriveKey(password, salt);
  const ptBytes = enc.encode(secret);
  const ctBuf = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, ptBytes);
  zero(ptBytes);
  return {
    v: 1,
    kdf: { name: 'argon2id', ...KDF_PARAMS },
    salt: b64(salt),
    iv: b64(iv),
    ct: b64(new Uint8Array(ctBuf)),
  };
}

/**
 * Decrypt a vault blob back to the plaintext secret.
 * GCM authentication means a wrong password OR tampered blob throws.
 * @returns {Promise<string>} the secret (LIVE SECRET — minimize lifetime)
 */
export async function decryptVault(vault, password) {
  if (vault?.v !== 1) throw new Error('Unsupported vault version');
  const salt = unb64(vault.salt);
  const iv = unb64(vault.iv);
  const ct = unb64(vault.ct);
  const key = await deriveKey(password, salt);
  let ptBuf;
  try {
    ptBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
  } catch {
    // Do not distinguish "wrong password" from "tampered blob" to the caller.
    throw new Error('Decryption failed: wrong password or corrupted vault');
  }
  const out = dec.decode(ptBuf);
  zero(new Uint8Array(ptBuf));
  return out;
}

// Best-effort zeroization. Not a guarantee in JS, but reduces window of exposure.
function zero(u8) { if (u8 && u8.fill) u8.fill(0); }

// base64 helpers (no Buffer dependency; browser-safe)
function b64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
function unb64(str) { const s = atob(str); const u8 = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i); return u8; }
