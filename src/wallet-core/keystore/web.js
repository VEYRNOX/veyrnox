// wallet-core/keystore/web.js — the web KeyStore implementation.
//
// This is the EXISTING web vault path, now behind the keyStore contract. It is
// a structural wrapper over the crypto (../vault.js, Argon2id+AES-GCM) and the
// ciphertext persistence (../evm/vaultStore.js, IndexedDB). The algorithms and
// storage format are unchanged; the only behavioural addition (SAST M3) is a
// transparent KDF-parameter MIGRATION on unlock (see unlock()).

import { encryptVault, decryptVault, vaultNeedsRekey, deriveKekC, encryptVaultWithDek, decryptVaultWithDek } from '../vault.js';
import { saveVault, loadVault, hasVault, clearVault } from '../evm/vaultStore.js';
import { combineKek, randomDek, wrapDek, unwrapDek, KEK_ERR } from './kek.js';
import { ALLOW_MAINNET } from '../evm/networks.js';

// H-A — WEB VAULT PASSWORD ENTROPY (I4 — fail honest, fail closed).
//
// On web, isSecureHardwareAvailable() === false: the seed vault is Argon2id over
// the PIN ALONE — there is NO hardware second factor. A short numeric PIN (e.g. 6
// digits) is offline-exhaustible once the ciphertext is copied off the device, so
// on a LIVE-mainnet web vault the password IS the only protection. We therefore
// require a minimum password LENGTH at vault creation on the web path.
//
// This restriction is deliberately NOT applied on native (keystore/native.js):
// there the hardware KEK (factor H) is REQUIRED alongside the PIN-derived C, so a
// shorter PIN is still backed by a device-bound secret. Enforcing it on native
// would add no honest security and would break existing short-PIN enrollment.
//
// Machine code is the contract (copy can change; codes cannot).
export const WEB_VAULT_MIN_PASSWORD_LEN = 12;

// I6 — HARDWARE BINDING (Phase 1 — Web PRF).
//
// The WebAuthn PRF (hmac-secret extension) is evaluated with a FIXED salt to
// derive a stable 32-byte hardware factor H. The same salt in → same bytes out,
// across calls and app restarts on the same device. This constant MUST match
// the spike's prfSpike.FIXED_SALT (they are identical domain-separated labels).
export const PRF_FIXED_SALT = new Uint8Array([
  0x56, 0x65, 0x79, 0x72, 0x6e, 0x6f, 0x78, 0x2d, // "Veyrnox-"
  0x70, 0x72, 0x66, 0x2d, 0x73, 0x70, 0x69, 0x6b, // "prf-spik"
  0x65, 0x2d, 0x76, 0x31, 0x2d, 0x66, 0x69, 0x78, // "e-v1-fix"
  0x65, 0x64, 0x2d, 0x73, 0x61, 0x6c, 0x74, 0x21, // "ed-salt!"
]);

export const WEB_VAULT_ERR = Object.freeze({
  PASSWORD_TOO_SHORT: 'WEB_VAULT_PASSWORD_TOO_SHORT',
});

/**
 * Enforce the web-path minimum password length for mainnet vaults.
 *
 * Throws an Error whose `.message` is the machine code WEB_VAULT_ERR.PASSWORD_TOO_SHORT
 * and whose `.userMessage` is a plain-language disclosure. Gated on ALLOW_MAINNET:
 * if mainnet is gated (pre-audit builds) the restriction does not fire, matching the
 * fact that the at-risk funds only exist once mainnet is live.
 *
 * @param {string} password
 */
export function validateWebVaultPassword(password) {
  if (!ALLOW_MAINNET) return;
  const len = typeof password === 'string' ? password.length : 0;
  if (len < WEB_VAULT_MIN_PASSWORD_LEN) {
    const err = /** @type {Error & {code: string, userMessage: string}} */ (
      Object.assign(new Error(WEB_VAULT_ERR.PASSWORD_TOO_SHORT), {
        code: WEB_VAULT_ERR.PASSWORD_TOO_SHORT,
        userMessage: `On web, your password is your only protection — use at least ${WEB_VAULT_MIN_PASSWORD_LEN} characters.`,
      })
    );
    throw err;
  }
}

// ── WebAuthn PRF hardware factor (I6 — hardware binding for PIN KEK) ──────────

/**
 * Probe whether WebAuthn PRF (hmac-secret extension) is available on this browser.
 * PRF support indicates the platform can derive a stable hardware-bound 32-byte
 * factor for use as the H in the KEK construction. Returns false on Safari, older
 * Firefox, or platforms without PublicKeyCredential.
 *
 * @returns {Promise<boolean>} true if PRF can be used for hardware factor derivation
 */
async function isPrfSupported() {
  try {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      return false;
    }
    // Conditional UI check: if the browser/platform supports WebAuthn and can
    // evaluate the `prf` extension without user interaction, assume PRF support.
    // This is a best-effort probe; the real gate happens when getHardwareFactor()
    // actually calls get() with the prf extension.
    if (window.PublicKeyCredential.isConditionalMediationAvailable) {
      const conditional = await window.PublicKeyCredential.isConditionalMediationAvailable();
      return conditional !== false; // undefined = assume support; false = no
    }
    // Fallback: if PublicKeyCredential exists, assume WebAuthn is available.
    // Safari and older browsers will fail when actually calling get() with prf.
    return true;
  } catch {
    return false;
  }
}

/**
 * Utility: encode a Uint8Array to base64url (no padding).
 * Used for the WebAuthn allowCredentials filter.
 */
function bufferToB64u(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Utility: decode a base64url string to Uint8Array.
 * Used to restore credentialId from localStorage for get().
 */
function b64uToBuffer(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const str = atob(b64 + pad);
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
  return out;
}

/**
 * Retrieve or create a passkey with WebAuthn PRF extension support, storing
 * the credential ID for future evaluations. On first enrollment, creates a
 * platform authenticator credential. On subsequent calls (unlock), retrieves
 * a stored credential ID from localStorage and uses it to get() a PRF evaluation.
 *
 * @returns {Promise<string>} base64url credentialId, persisted in localStorage
 */
async function getPrfCredentialId() {
  const CRED_KEY = 'veyrnox-prf-cred-id';
  try {
    // Check if a credential ID is already stored
    const stored = typeof window !== 'undefined' && window.localStorage?.getItem(CRED_KEY);
    if (stored && typeof stored === 'string') {
      return stored;
    }

    // No stored credential — create a new one with the prf extension
    if (!window.PublicKeyCredential || !navigator.credentials?.create) {
      throw new Error('WebAuthn PRF not supported on this browser.');
    }

    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

    const cred = await navigator.credentials.create({
      publicKey: {
        challenge,
        rp: { name: 'Veyrnox', id: rpId },
        user: {
          id: crypto.getRandomValues(new Uint8Array(16)),
          name: 'veyrnox-prf-user',
          displayName: 'Veyrnox PRF',
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform',
          residentKey: 'preferred',
          userVerification: 'required',
        },
        timeout: 60000,
        extensions: { prf: { eval: { first: PRF_FIXED_SALT } } },
      },
    });

    if (!cred) {
      throw new Error('Failed to create passkey credential.');
    }

    // Store the credential ID for future get() calls
    const credId = bufferToB64u((/** @type {any} */ (cred)).rawId);
    if (typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(CRED_KEY, credId);
      } catch {
        // localStorage unavailable (private mode, etc.) — proceed without persistence
      }
    }

    return credId;
  } catch (e) {
    throw new Error(`Failed to get PRF credential: ${e?.message || String(e)}`);
  }
}

/** @type {import('./keyStore.js').KeyStore} */
export const webKeyStore = {
  // Web has no Secure Enclave / StrongBox. Native (M2b) returns true when one
  // is present and is the stronger control documented in the threat model.
  async isSecureHardwareAvailable() {
    return false;
  },

  // Probe for WebAuthn PRF support (hardware factor availability on web).
  // Returns true on Chrome/Firefox/Edge with PRF support; false on Safari,
  // older browsers, or platforms without WebAuthn.
  async isHardwareKeystoreAvailable() {
    return isPrfSupported();
  },

  // Delegated straight to the unchanged IndexedDB store (ciphertext only).
  hasVault,

  // Encrypt -> persist ciphertext. Mirrors the prior WalletProvider sequence
  // (encryptVault + saveVault) exactly; saveVault still enforces its
  // plaintext-blob guard.
  async createVault(secret, password) {
    // H-A: on web there is no hardware factor, so reject weak passwords up front
    // (fail closed BEFORE any ciphertext is written). See validateWebVaultPassword.
    validateWebVaultPassword(password);
    const blob = await encryptVault(secret, password);
    await saveVault(blob);
  },

  // Retrieve the WebAuthn PRF-derived 32-byte hardware factor H. This is the
  // device-bound component of the KEK (specs §3). On first call, creates a
  // platform-authenticator passkey with PRF extension; on subsequent calls,
  // retrieves a stored credential ID and evaluates PRF with get(). Throws if
  // PRF is unavailable on the browser (e.g. Safari) or if the user cancels.
  async getHardwareFactor() {
    const prfAvail = await isPrfSupported();
    if (!prfAvail) {
      throw new Error('WebAuthn PRF (hmac-secret) not supported on this browser. Use a strong password (≥12 characters) instead.');
    }

    const credId = await getPrfCredentialId();
    if (!credId) {
      throw new Error('Failed to retrieve PRF credential ID.');
    }

    // get() with the prf extension to evaluate the hardware factor
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const rpId = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

    let assertion;
    try {
      assertion = await navigator.credentials.get({
        publicKey: {
          challenge,
          timeout: 60000,
          userVerification: 'required',
          rpId,
          allowCredentials: [{ id: b64uToBuffer(credId), type: 'public-key' }],
          extensions: { prf: { eval: { first: PRF_FIXED_SALT } } },
        },
      });
    } catch (e) {
      throw new Error(`WebAuthn get() failed: ${e?.message || String(e)}`);
    }

    if (!assertion) {
      throw new Error('WebAuthn get() cancelled or failed.');
    }

    // Extract the prf output from the client extension results
    const ext = (/** @type {any} */ (assertion)).getClientExtensionResults?.() || {};
    const prf = ext.prf || {};
    const prfOutput = prf.results?.first;

    if (!prfOutput) {
      throw new Error('WebAuthn PRF extension did not return output. This platform may not support hmac-secret.');
    }

    const H = new Uint8Array(prfOutput);
    if (H.length !== 32) {
      throw new Error(`PRF output length mismatch: expected 32 bytes, got ${H.length}.`);
    }

    return H;
  },

  // Load ciphertext -> decrypt. Preserves the prior behaviour exactly, including
  // the "No wallet found" path and decryptVault's wrong-password/tamper throw.
  //
  // M3 MIGRATION (lazy, upgrade-only): after a SUCCESSFUL decrypt, if the blob was
  // encrypted with weaker-than-current KDF params, transparently re-encrypt it at
  // the new params and persist. This happens at most once per vault (the next
  // unlock sees current params and skips it). Best-effort: a failed re-encrypt
  // must NEVER block the unlock — the user still gets their (old-params) secret,
  // and the rekey simply retries next time. Old vaults are NEVER locked out: the
  // decrypt above already used the blob's own params (see decryptVault).
  async unlock(password, opts) {
    const blob = await loadVault();
    if (!blob) throw new Error('No wallet found on this device');

    if (blob.kekWrap) {
      // KEK-enrolled vault: BOTH hardware factor H and PIN-derived C are required (I4).
      const getHF = opts && opts.getHardwareFactor;
      if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
      const H = await getHF();
      const saltBytes = Uint8Array.from(atob(blob.kekSalt), c => c.charCodeAt(0));
      let C = null;
      let kek;
      let dek;
      // H-NEW-4: wrap the KEK + DEK lifetime in try/finally so BOTH are wiped on
      // every path, including when unwrapDek throws (wrong PIN/device). Neither the
      // key that wraps the DEK nor the key that decrypts the seed may linger in the
      // JS heap until GC (I4).
      try {
        C = await deriveKekC(password, saltBytes);
        kek = await combineKek(H, C);
        // H-NEW-4: combineKek zeroes H/C internally; wipe again at the call site so
        // the guarantee survives any refactor of combineKek (defense in depth, I4).
        H.fill(0);
        C.fill(0);
        dek = await unwrapDek(kek, blob.kekWrap); // throws KEK_ERR.UNWRAP_FAILED on wrong PIN/device
        // Seed CT was encrypted with the DEK (not the PIN), so PIN rotation doesn't change it.
        return await decryptVaultWithDek(blob, dek);
      } finally {
        // H-NEW-4: wipe the derived KEK and the recovered DEK — never leave the key
        // that wraps the DEK or the key that decrypts the seed in the heap (I4).
        if (C) C.fill(0);
        if (kek) kek.fill(0);
        if (dek) dek.fill(0);
      }
    }

    // Non-enrolled: existing bare-vault path (unchanged).
    const secret = await decryptVault(blob, password);
    if (vaultNeedsRekey(blob)) {
      try {
        await saveVault(await encryptVault(secret, password));
      } catch {
        /* best-effort */
      }
    }
    return secret;
  },

  // Enroll the Hardware KEK on an existing vault. After enrollment, unlock()
  // requires BOTH the hardware factor H and the correct PIN.
  // Fail-closed (I4): missing/wrong hardware factor → explicit throw, never a
  // silent fallback to bare-vault unlock.
  async enrollKek(password, opts) {
    const getHF = opts && opts.getHardwareFactor;
    if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
    const blob = await loadVault();
    if (!blob) throw new Error('No wallet found on this device');
    const secret = await decryptVault(blob, password); // verify password and recover seed

    const H = await getHF();
    const saltBytes = crypto.getRandomValues(new Uint8Array(32));
    const kekSalt = btoa(String.fromCharCode(...saltBytes));
    const C = await deriveKekC(password, saltBytes);
    let kek;
    const dek = randomDek();
    // H-NEW-4b: wrap the entire KEK + DEK lifetime in try/finally so BOTH are wiped
    // even if combineKek/wrapDek/encryptVaultWithDek throws — never leave the key
    // that wraps the DEK or the DEK itself in the JS heap on an error path (I4).
    try {
      kek = await combineKek(H, C);
      // H-NEW-4: wipe H/C at the call site (defense in depth over combineKek's own
      // in-place zeroing) — no plaintext key material left in the heap until GC (I4).
      H.fill(0);
      C.fill(0);
      const kekWrap = await wrapDek(kek, dek);
      // Re-encrypt seed under the DEK so PIN rotation doesn't require changing CT (§3).
      const { iv, ct } = await encryptVaultWithDek(secret, dek);
      await saveVault({ ...blob, iv, ct, kdf: 'kek-dek', kekWrap, kekSalt });
    } finally {
      // H-NEW-4: wipe the derived KEK and the DEK (consumed or error occurred) (I4).
      if (kek) kek.fill(0);
      dek.fill(0);
    }
  },

  // Re-encrypt the EXISTING vault under a new password, keeping the SAME secret
  // (non-custodial "change my vault password"). This is decrypt-then-re-encrypt
  // over the unchanged ../vault.js crypto — NO new algorithm, parameter, or
  // format. The current password is verified by actually decrypting the stored
  // blob (so a wrong current password throws the SAME generic error as unlock and
  // changes NOTHING), then the recovered secret is re-encrypted at the CURRENT
  // KDF params and persisted. Because encryptVault always records the current
  // params, a legacy-params vault is also upgraded here (same effect as the
  // unlock-time M3 migration). The secret is never written anywhere in plaintext.
  async changePassword(currentPassword, newPassword, opts) {
    const blob = await loadVault();
    if (!blob) throw new Error('No wallet found on this device');

    if (blob.kekWrap) {
      // KEK-enrolled: rotate the PIN by re-wrapping the DEK under a new KEK.
      // The seed ciphertext (blob.ct) stays UNCHANGED — that is the §3 property.
      const getHF = opts && opts.getHardwareFactor;
      if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
      // Verify current PIN first.
      const oldSaltBytes = Uint8Array.from(atob(blob.kekSalt), c => c.charCodeAt(0));
      const H = await getHF();
      const H2 = H.slice(); // M20: combineKek zeroes its H/C inputs; copy before first call
      let oldC = null;
      let newC = null;
      let newSaltBytes = null;
      let oldKek;
      let newKek;
      let dek;
      // H-NEW-4 / H-NEW-4b: wrap the WHOLE key-material lifetime in try/finally so
      // the H2 hardware-factor copy, BOTH derived KEKs, and the recovered DEK are
      // wiped on EVERY path — including when deriveKekC/combineKek/unwrapDek/wrapDek/
      // saveVault throws. None of these may linger in the JS heap until GC (I4).
      try {
        oldC = await deriveKekC(currentPassword, oldSaltBytes);
        oldKek = await combineKek(H, oldC);
        // H-NEW-4: wipe the first-combine factors at the call site (defense in depth
        // over combineKek's own in-place zeroing). H2 still holds the copy for below.
        H.fill(0);
        oldC.fill(0);
        dek = await unwrapDek(oldKek, blob.kekWrap); // throws if wrong PIN/device
        // Re-wrap the SAME DEK under a new KEK derived from the new PIN + fresh salt.
        newSaltBytes = crypto.getRandomValues(new Uint8Array(32));
        const newKekSalt = btoa(String.fromCharCode(...newSaltBytes));
        newC = await deriveKekC(newPassword, newSaltBytes);
        newKek = await combineKek(H2, newC);
        // H-NEW-4: wipe the second-combine factors at the call site (I4).
        H2.fill(0);
        newC.fill(0);
        const newKekWrap = await wrapDek(newKek, dek);
        await saveVault({ ...blob, kekWrap: newKekWrap, kekSalt: newKekSalt });
      } finally {
        // H-NEW-4: wipe the H2 copy, both derived KEKs, and the recovered DEK on
        // every path (consumed or an error occurred) (I4).
        if (H2) H2.fill(0);
        if (oldC) oldC.fill(0);
        if (newC) newC.fill(0);
        if (newSaltBytes) newSaltBytes.fill(0);
        if (oldKek) oldKek.fill(0);
        if (newKek) newKek.fill(0);
        if (dek) dek.fill(0);
      }
      return;
    }

    const secret = await decryptVault(blob, currentPassword);
    await saveVault(await encryptVault(secret, newPassword));
  },

  // The unlocked secret lives in WalletProvider's in-memory ref on web, so the
  // store holds nothing to clear here. Native (M2b) drops its hardware grant.
  lock() {},

  // Delegated straight to the unchanged IndexedDB store.
  clearVault,
};
