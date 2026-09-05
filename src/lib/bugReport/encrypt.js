// src/lib/bugReport/encrypt.js
//
// Slice 1e-1 of the opt-in bug-report recording feature. Zero-runtime — no
// callers yet. Slice 1e-3 wires this into the upload path.
//
// SEALED-BOX-EQUIVALENT ENCRYPTION using the crypto stack Veyrnox already
// ships (@noble/curves x25519 + @noble/hashes HKDF + WebCrypto AES-256-GCM).
// Not literally libsodium sealed_box because we do not ship libsodium and
// adding it just for this leaf is not a lazy pick. The security properties
// are the same:
//
//   1. Sender is anonymous: fresh x25519 keypair per encrypt(), private
//      half discarded immediately after ECDH. No long-lived sender identity
//      travels with the ciphertext.
//   2. Recipient private key is held OFFLINE — support has the public half
//      baked into the app; the corresponding secret lives on a device that
//      is never connected to the internet (see docs/bug-report-recording-
//      plan.md §Encryption model).
//   3. Confidentiality + authenticity via AES-256-GCM (12-byte random IV
//      per encrypt). @noble stack matches the wallet's existing crypto
//      posture (never Web Crypto for KEY DERIVATION — see CLAUDE.md rule;
//      WebCrypto here is only the AEAD, using a key derived by @noble
//      HKDF, which is on-policy).
//
// Wire format (returned by encrypt()):
//   { epk:  32 bytes  // ephemeral x25519 public key
//   , iv:   12 bytes  // random per encrypt
//   , ct:   N bytes   // AES-256-GCM ciphertext || 16-byte tag
//   , v:    'br1'     // format tag, allows future rotation
//   }
//
// Payload includes the plaintext and any client-authored metadata; nothing
// is sent server-side outside the sealed box except the wire-format
// envelope. See slice 1e-3 upload for the outer transport.

import { x25519 } from '@noble/curves/ed25519';
import { hkdf } from '@noble/hashes/hkdf';
import { sha256 } from '@noble/hashes/sha256';

const AAD_INFO = new TextEncoder().encode('veyrnox/bug-report/v1/aead');
const AEAD_KEY_LENGTH_BITS = 256;
const IV_LENGTH_BYTES = 12;
export const FORMAT_TAG = 'br1';

/**
 * PLACEHOLDER support public key — 32-byte x25519, all zeros.
 *
 * ⚠️  DO NOT SHIP: replace before flipping VITE_BUG_REPORT_ENABLED. Slice 3
 * is responsible for generating a real keypair on an offline device and
 * embedding the public half here in the same commit that flips the flag.
 * Until then, this key is unusable in the sense that no one holds the
 * corresponding secret — a "sent" bug report would be locked away forever.
 * That is the correct fail-state for a foundations slice.
 *
 * Verified by encrypt() at the boundary — if this constant is still the
 * all-zeros placeholder AND the flag is on, encrypt() throws rather than
 * producing ciphertext no one can read.
 */
export const PLACEHOLDER_SUPPORT_PUBLIC_KEY = new Uint8Array(32);

function isPlaceholderKey(pk) {
  for (let i = 0; i < pk.length; i++) if (pk[i] !== 0) return false;
  return true;
}

async function importAesKey(rawKeyBytes) {
  return crypto.subtle.importKey(
    'raw',
    rawKeyBytes,
    { name: 'AES-GCM', length: AEAD_KEY_LENGTH_BITS },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Derives a shared AES-256-GCM key from the sender's ephemeral secret and
 * the recipient's public key. HKDF-SHA256 with a domain-separation info
 * string binds the derivation to this feature — a leaked key material
 * from another Veyrnox path cannot substitute.
 *
 * The ephemeral public key is mixed into the HKDF info so the derivation
 * is bound to the specific message envelope and cannot be replayed
 * against a different envelope by an attacker who obtained the shared
 * secret out of band.
 */
function deriveAeadKey(sharedSecret, ephemeralPublicKey) {
  const info = new Uint8Array(AAD_INFO.length + ephemeralPublicKey.length);
  info.set(AAD_INFO, 0);
  info.set(ephemeralPublicKey, AAD_INFO.length);
  return hkdf(sha256, sharedSecret, undefined, info, 32);
}

/**
 * Encrypts `plaintext` to the support keypair. Returns the wire envelope.
 *
 * @param {Uint8Array} plaintext
 * @param {Uint8Array} [supportPublicKey] override for tests
 * @returns {Promise<{v: string, epk: Uint8Array, iv: Uint8Array, ct: Uint8Array}>}
 */
export async function encrypt(plaintext, supportPublicKey = PLACEHOLDER_SUPPORT_PUBLIC_KEY) {
  if (!(plaintext instanceof Uint8Array)) {
    throw new TypeError('encrypt: plaintext must be a Uint8Array');
  }
  if (!(supportPublicKey instanceof Uint8Array) || supportPublicKey.length !== 32) {
    throw new TypeError('encrypt: supportPublicKey must be a 32-byte Uint8Array');
  }
  if (isPlaceholderKey(supportPublicKey)) {
    // Slice-3 gate: encrypt() must refuse the placeholder to prevent a
    // build that accidentally flips the flag while the real support key is
    // still absent from producing ciphertext no one can decrypt. Test-
    // callers supply their OWN keypair so this branch does not fire.
    throw new Error('BUG_REPORT_ENCRYPT_PLACEHOLDER_KEY');
  }

  // Ephemeral sender keypair. Private half zeroised as soon as ECDH
  // finishes — the sender is anonymous by construction.
  const ephemeralSecret = x25519.utils.randomPrivateKey();
  const ephemeralPublic = x25519.getPublicKey(ephemeralSecret);
  const sharedSecret = x25519.getSharedSecret(ephemeralSecret, supportPublicKey);
  ephemeralSecret.fill(0);

  const aeadKeyBytes = deriveAeadKey(sharedSecret, ephemeralPublic);
  sharedSecret.fill(0);

  const key = await importAesKey(aeadKeyBytes);
  aeadKeyBytes.fill(0);

  const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH_BYTES));
  const ctBuf = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext,
  );

  return {
    v: FORMAT_TAG,
    epk: ephemeralPublic,
    iv,
    ct: new Uint8Array(ctBuf),
  };
}

/**
 * Decrypts a wire envelope with the recipient private key. Used only in
 * tests to prove the round-trip. Production has NO decrypt path in the
 * app — decryption happens on the offline support device.
 *
 * @param {{ v: string, epk: Uint8Array, iv: Uint8Array, ct: Uint8Array }} envelope
 * @param {Uint8Array} recipientPrivateKey  32-byte x25519 secret
 * @returns {Promise<Uint8Array>} plaintext
 */
export async function decrypt(envelope, recipientPrivateKey) {
  if (!envelope || envelope.v !== FORMAT_TAG) {
    throw new Error('BUG_REPORT_ENCRYPT_UNKNOWN_FORMAT');
  }
  const sharedSecret = x25519.getSharedSecret(recipientPrivateKey, envelope.epk);
  const aeadKeyBytes = deriveAeadKey(sharedSecret, envelope.epk);
  sharedSecret.fill(0);
  const key = await importAesKey(aeadKeyBytes);
  aeadKeyBytes.fill(0);
  const ptBuf = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: envelope.iv },
    key,
    envelope.ct,
  );
  return new Uint8Array(ptBuf);
}
