// @ts-nocheck
// wallet-core/keystore/web.js — the web KeyStore implementation.
//
// This is the EXISTING web vault path, now behind the keyStore contract. It is
// a structural wrapper over the crypto (../vault.js, Argon2id+AES-GCM) and the
// ciphertext persistence (../evm/vaultStore.js, IndexedDB). The algorithms and
// storage format are unchanged; the only behavioural addition (SAST M3) is a
// transparent KDF-parameter MIGRATION on unlock (see unlock()).

import { Capacitor } from '@capacitor/core';
import { encryptVault, decryptVault, vaultNeedsRekey, deriveKekC, encryptVaultWithDek, decryptVaultWithDek } from '../vault.js';
import { saveVault, loadVault, hasVault, clearVault } from '../evm/vaultStore.js';
import { combineKek, randomDek, wrapDek, unwrapDek, KEK_ERR, decodeKekSalt } from './kek.js';
import { ALLOW_MAINNET } from '../evm/networks.js';
import { bufferToB64u, b64uToBuffer } from './web-base64url.js';

// ── FAIL-CLOSED PLATFORM FENCE (I4 — fail honest, fail closed) ────────────────
//
// keystore/index.js STATICALLY imports this module on ALL platforms (it routes at
// runtime: Capacitor.isNativePlatform() ? nativeFacade : webKeyStore, and also
// re-exports webKeyStore directly). Because the import is static, the web keystore
// CANNOT be excluded from the native bundle — so it can still be REACHED on a
// native device through a routing / platform-detection bug, or via a direct dynamic
// import (e.g. HardwareKekSettings.jsx imports webKeyStore).
//
// On native the correct keystore is hardware-backed (iOS Secure Enclave / Android
// StrongBox). If the web keystore's SECRET-TOUCHING operations ran on native they
// would write a BARE Argon2id vault to the WebView IndexedDB, bypassing the hardware
// KEK — a SILENT SECURITY DOWNGRADE. Today web.js is only INCIDENTALLY safe on
// native: getHardwareFactor() throws because the Capacitor WebView lacks
// window.PublicKeyCredential. But createVault / saveVaultContents have NO PRF
// dependency and would happily write a bare vault; and if a future Android WebView
// gains WebAuthn support, even that incidental backstop disappears.
//
// This is the RUNTIME fence (bundle exclusion is impossible, see above): every
// secret-, key-, or ciphertext-touching method throws WEB_KEYSTORE_ERR.WRONG_PLATFORM
// on native BEFORE any crypto, storage read/write, or WebAuthn call. Metadata-only
// probes (hasVault, isHardwareEnrolled, isSecureHardwareAvailable,
// isHardwareKeystoreAvailable, lock, clearVault) are deliberately NOT fenced — they
// carry no secret and legitimate cross-platform status checks depend on them.
//
// Machine code is the contract (copy can change; codes cannot).
export const WEB_KEYSTORE_ERR = Object.freeze({
  WRONG_PLATFORM: 'WEB_KEYSTORE_WRONG_PLATFORM',
});

/**
 * Throw if we are POSITIVELY on a native platform.
 *
 * Fail-closed means we throw only when native is DEFINITELY detected — never when
 * detection itself errors. On web / in tests without Capacitor semantics the probe
 * may throw (or Capacitor may be absent); we swallow that and treat it as non-native
 * so legitimate web use never breaks. The moment isNativePlatform() returns a truthy
 * value, we refuse the operation before touching any secret or storage.
 */
function assertNotNativePlatform() {
  let isNative = false;
  try {
    isNative = Capacitor.isNativePlatform() === true;
  } catch {
    isNative = false;
  }
  if (isNative) {
    throw /** @type {Error & {code: string}} */ (
      Object.assign(
        new Error(
          'The web keystore was reached on a native platform. Use the native hardware keystore (Secure Enclave / StrongBox) — refusing to write a bare vault.',
        ),
        { code: WEB_KEYSTORE_ERR.WRONG_PLATFORM },
      )
    );
  }
}

// H-A — WEB VAULT PASSWORD ENTROPY (I4 — fail honest, fail closed).
//
// On web, isSecureHardwareAvailable() === false: the seed vault is Argon2id over
// the PIN ALONE — there is NO hardware second factor. Any short PIN is
// offline-exhaustible once the ciphertext is copied off the device, so on a
// LIVE-mainnet web vault the password IS the only protection. That was H-A's
// original intent: enforce a minimum password LENGTH at vault creation on web.
//
// The minimum is now 8 (PR #651), NOT the original H-A ≥12: web was unified onto
// the SAME 8-digit PIN cohort as native (create, confirm, unlock, recover all
// share one PinPad) so the two surfaces could not diverge and re-introduce the
// PIN-lockout bug class. This is a DELIBERATE product decision, accepted because
// web is a TESTING-ONLY surface (never the shipped product); native is the real
// product, and on native the hardware KEK (factor H) provides the
// offline-exhaustion defence on enrolled devices — the web ≥8 length check is the
// residual honest floor for the test surface, not a claim of strong web security.
//
// This restriction is deliberately NOT applied on native (keystore/native.js):
// there the hardware KEK (factor H) is REQUIRED alongside the PIN-derived C, so a
// shorter PIN is still backed by a device-bound secret. Enforcing it on native
// would add no honest security and would break existing short-PIN enrollment.
//
// Machine code is the contract (copy can change; codes cannot).
export const WEB_VAULT_MIN_PASSWORD_LEN = 8; // web mirrors native 8-digit PIN (testing only)

// I6 — HARDWARE BINDING (Phase 1 — Web PRF).
//
// The WebAuthn PRF (hmac-secret extension) is evaluated with a FIXED salt to
// derive a stable 32-byte hardware factor H. The same salt in → same bytes out,
// across calls and app restarts on the same device.
//
// F-03 (audit, I4 honesty): the label was previously "Veyrnox-prf-spike-v1-..."
// — a leftover from the dev spike (src/dev/prfSpike.js). Naming a SHIPPING KEK
// derivation "spike" is dishonest, so it is renamed to the honest "prf-kek"
// label below. This is a PROTOCOL VERSION BUMP: changing the PRF eval salt
// changes the derived H for the same authenticator, so any vault enrolled under
// the old salt would derive a DIFFERENT H and no longer unlock via KEK. This is
// acceptable because no production vault has been enrolled on this web path yet
// (only test/dev). Existing test/dev enrollment data is intentionally invalidated.
export const PRF_FIXED_SALT = new Uint8Array([
  0x56, 0x65, 0x79, 0x72, 0x6e, 0x6f, 0x78, 0x2d, // "Veyrnox-"
  0x70, 0x72, 0x66, 0x2d, 0x6b, 0x65, 0x6b, 0x2d, // "prf-kek-"
  0x76, 0x31, 0x2d, 0x66, 0x69, 0x78, 0x65, 0x64, // "v1-fixed"
  0x2d, 0x73, 0x61, 0x6c, 0x74, 0x21, 0x21, 0x21, // "-salt!!!"
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
 * Best-effort probe for WebAuthn availability. Returns true if
 * PublicKeyCredential exists in this environment — NOT a true PRF/hmac-secret
 * capability check. isConditionalMediationAvailable() tests autofill UI support,
 * not PRF; browsers (including Safari) that pass this check may still lack the
 * prf extension. The real gate is getHardwareFactor(): if the platform doesn't
 * support PRF it will throw and the caller must fall back to PIN-only.
 *
 * Do not use this to advertise "hardware KEK available" to the user — it is
 * only a cheap pre-flight to avoid enrolling on a platform with no WebAuthn at
 * all. Treat the return value as best-effort/unknown, not as confirmed PRF support.
 *
 * @returns {Promise<boolean>} false if WebAuthn is definitely unavailable; true
 *   means WebAuthn exists but PRF support is unconfirmed until getHardwareFactor()
 */
async function isPrfSupported() {
  try {
    if (typeof window === 'undefined' || !window.PublicKeyCredential) {
      return false;
    }
    // isConditionalMediationAvailable probes autofill-UI support, not PRF — but
    // a false return reliably means the platform is too old for our purposes.
    if (window.PublicKeyCredential.isConditionalMediationAvailable) {
      const conditional = await window.PublicKeyCredential.isConditionalMediationAvailable();
      if (conditional === false) return false;
    }
    // PublicKeyCredential exists and no negative signal — assume WebAuthn is
    // present. PRF availability is only confirmed by getHardwareFactor() itself.
    return true;
  } catch {
    return false;
  }
}

// base64url helpers (bufferToB64u / b64uToBuffer) are imported from
// ./web-base64url.js — extracted for unit-testability (L-6 #742). Logic unchanged.

// localStorage key holding the base64url PRF credential id for this device.
const PRF_CRED_KEY = 'veyrnox-prf-cred-id';

/** Read the persisted PRF credential id, or null if none is stored. */
function readStoredCredentialId() {
  const stored = typeof window !== 'undefined' && window.localStorage?.getItem(PRF_CRED_KEY);
  return stored && typeof stored === 'string' ? stored : null;
}

/**
 * Create a NEW passkey with the WebAuthn PRF extension and return its base64url
 * credential id. On first enrollment this registers a platform-authenticator
 * credential.
 *
 * F-05 (audit): this function intentionally does NOT persist the credential id.
 * Persistence is the caller's (getHardwareFactor) responsibility and must happen
 * only AFTER a non-null PRF output is confirmed — otherwise a WebAuthn-capable but
 * PRF-incapable browser (Safari) would leave an orphan credential id in
 * localStorage that can never yield an H.
 *
 * Chrome >=118 returns PRF output directly from create() via extension results.
 * Safari/Firefox do not. This function extracts the PRF output if present and
 * returns it alongside the credential id so the caller can skip the second
 * get() prompt when create() already yielded H (#1030).
 *
 * @returns {Promise<{ credId: string, prfOutput: ArrayBuffer | null }>}
 */
async function createPrfCredential() {
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

  // Chrome >=118: PRF output may already be in create() extension results.
  // Safari/Firefox return no results here — prfOutput will be null.
  const ext = (/** @type {any} */ (cred)).getClientExtensionResults?.() || {};
  const prfOutput = ext.prf?.results?.first || null;

  return { credId: bufferToB64u((/** @type {any} */ (cred)).rawId), prfOutput };
}

/** @type {import('./keyStore.js').KeyStore} */
export const webKeyStore = {
  // Web has no Secure Enclave / StrongBox. Native (M2b) returns true when one
  // is present and is the stronger control documented in the threat model.
  async isSecureHardwareAvailable() {
    return false;
  },

  // Structural PRF capability probe — confirms the API exists; does NOT
  // guarantee a successful PRF credential. The real gate is getHardwareFactor()
  // at enrollment. Returns false on Safari / older browsers without WebAuthn.
  async isHardwareKeystoreAvailable() {
    return isPrfSupported();
  },

  // Delegated straight to the unchanged IndexedDB store (ciphertext only).
  hasVault,

  // Encrypt -> persist ciphertext. Mirrors the prior WalletProvider sequence
  // (encryptVault + saveVault) exactly; saveVault still enforces its
  // plaintext-blob guard.
  async createVault(secret, password) {
    assertNotNativePlatform(); // fail closed BEFORE any crypto/storage (I4)
    // H-A: on web there is no hardware factor, so reject weak passwords up front
    // (fail closed BEFORE any ciphertext is written). See validateWebVaultPassword.
    validateWebVaultPassword(password);
    const blob = await encryptVault(secret, password);
    await saveVault(blob);
  },

  // Check whether a PRF KEK is enrolled on the current vault (web path).
  // Returns true iff the stored vault blob has a kekWrap field, meaning the
  // vault was enrolled with a hardware factor. Does not probe the PRF extension
  // — use isHardwareKeystoreAvailable() for that.
  async isHardwareEnrolled() {
    try {
      const blob = await loadVault();
      return !!(blob && blob.kekWrap);
    } catch {
      return false;
    }
  },

  // Re-persist NEW vault CONTENT (a mutated multi-seed container) while PRESERVING
  // the current at-rest format (KEK DOWNGRADE FIX, I4 fail-closed). WalletProvider
  // routes seed add/remove/import/rename and unlock-time container migrations here.
  //
  // A PRF-enrolled WEB vault DOES have a KEK at rest (kekWrap/kekSalt) — the earlier
  // "web has no KEK to preserve" assumption was WRONG once WebAuthn PRF is enrolled,
  // and made this method silently rewrite an enrolled vault BARE on every content
  // mutation, dropping the wrap so the vault became unlockable by password ALONE with
  // no PRF assertion (the web sibling of the Android "bug 3"; a Phase-1 offline-seizure
  // regression). So we mirror native.saveVaultContents exactly:
  //
  //   - BARE vault (no kekWrap): behaves exactly like createVault — encrypt the new
  //     secret under the password (argon2id) and persist. getHardwareFactor is NEVER
  //     called on a bare vault (no PRF prompt).
  //   - KEK-enrolled vault (kekWrap present): recover the DEK with H (opts.getHardwareFactor
  //     → one PRF assertion) + PIN-derived C, then re-encrypt the NEW plaintext under
  //     that SAME DEK via encryptVaultWithDek, preserving kekWrap/kekSalt and kdf:'kek-dek'.
  //     Only iv/ct (the content ciphertext) change; the DEK is unchanged.
  //
  // FAIL-CLOSED (I4): on a KEK-enrolled vault, if the hardware factor is missing or DEK
  // recovery fails we THROW and leave the vault untouched — we NEVER silently rewrite it
  // bare (that silent downgrade WAS the defect). H, C, KEK and DEK are zeroed on every
  // path (H-NEW-4), mirroring unlock/enrollKek/changePassword.
  async saveVaultContents(secret, password, opts = {}) {
    assertNotNativePlatform(); // fail closed BEFORE any crypto/storage (I4)
    validateWebVaultPassword(password);
    const blob = await loadVault();

    // Bare (or first-write) vault: identical to createVault — plain argon2id, no KEK.
    if (!blob || !blob.kekWrap) {
      const bare = await encryptVault(secret, password);
      await saveVault(bare);
      return;
    }

    // KEK-enrolled: re-encrypt the new content under the EXISTING DEK, preserving wrap.
    const getHF = opts && opts.getHardwareFactor;
    if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
    const saltBytes = decodeKekSalt(blob.kekSalt); // malformed kekSalt → KEK_ERR.MALFORMED_VAULT
    // Web derives H from a FIXED PRF salt (see PRF_FIXED_SALT / getHardwareFactor), so —
    // unlike native's v3 per-enrollment salt binding — getHF() takes no kekSalt argument.
    const H = await getHF(); // one WebAuthn PRF assertion for this content write
    let C;
    let kek;
    let dek;
    // H-NEW-4: wrap the KEK + DEK lifetime in try/finally so H, C, the derived KEK, and
    // the recovered DEK are wiped on EVERY path — including when unwrapDek throws (wrong
    // PIN/device). None may linger in the JS heap until GC (I4), mirroring unlock().
    try {
      C = await deriveKekC(password, saltBytes);
      kek = await combineKek(H, C);
      // combineKek zeroes H/C internally; wipe again at the call site so the guarantee
      // survives any refactor of combineKek (defense in depth, I4).
      H.fill(0);
      C.fill(0);
      dek = await unwrapDek(kek, blob.kekWrap); // throws on wrong PIN/device — fail-closed
      // I-1: destructure `v` from encryptVaultWithDek and propagate it into the
      // saved blob. encryptVaultWithDek() seals GCM AAD over {v, kdf}; if the
      // header `v` on the persisted blob does not match the `v` used to seal
      // the AAD, next unlock's vaultAad() computation mismatches and decrypt
      // fails GCM auth. Today v is stably 2 on both sides so leaking blob.v
      // via `...blob` is benign — a future VAULT_VERSION bump would make it
      // permanently unlockable. Mirror native.js (PR #1079).
      const { v: newV, iv, ct } = await encryptVaultWithDek(secret, dek);
      // Preserve kek-dek format: same kekWrap/kekSalt, only content v/ct/iv change.
      await saveVault({ ...blob, v: newV, iv, ct, kdf: 'kek-dek' });
    } finally {
      if (H) H.fill(0);
      if (C) C.fill(0);
      if (kek) kek.fill(0);
      if (dek) dek.fill(0);
    }
  },

  // Retrieve the WebAuthn PRF-derived 32-byte hardware factor H. This is the
  // device-bound component of the KEK (specs §3). On first call, creates a
  // platform-authenticator passkey with PRF extension; on subsequent calls,
  // retrieves a stored credential ID and evaluates PRF with get(). Throws if
  // PRF is unavailable on the browser (e.g. Safari) or if the user cancels.
  async getHardwareFactor() {
    assertNotNativePlatform(); // fail closed BEFORE any WebAuthn call (I4)
    const prfAvail = await isPrfSupported();
    if (!prfAvail) {
      throw new Error('WebAuthn PRF (hmac-secret) not supported on this browser. Use a strong password (≥12 characters) instead.');
    }

    let credId = readStoredCredentialId();

    // freshCredId is set only when we CREATE a new credential this call. Per F-05
    // its id is persisted to localStorage ONLY after a non-null PRF output is
    // confirmed by the get() below — never before — so a WebAuthn-capable but
    // PRF-incapable browser (Safari) leaves no orphan credential id behind.
    let freshCredId = null;

    if (!credId) {
      // F-01 (audit, I4 — fail closed): if the vault is already KEK-enrolled but the
      // PRF credential id is gone from localStorage (cleared/private-mode), we MUST
      // NOT silently create a new credential — a fresh credential yields a DIFFERENT
      // H, which can never unwrap the existing DEK, so the enrolled vault would be
      // permanently locked out AND an orphan authenticator credential would be left
      // behind. Fail honestly and point the user at seed-phrase recovery.
      let enrolled = false;
      try {
        const existing = await loadVault();
        enrolled = !!(existing && existing.kekWrap);
      } catch {
        enrolled = false;
      }
      if (enrolled) {
        throw new Error(
          'PRF_CREDENTIAL_LOST: vault is KEK-enrolled but PRF credential ID is missing. Recover via seed phrase.',
        );
      }

      // Fresh enrollment: create the credential but DO NOT persist its id yet (F-05).
      const created = await createPrfCredential();
      credId = created.credId;
      freshCredId = created.credId;

      // Chrome >=118: PRF was already evaluated during create() — single prompt (#1030).
      // If the browser returned a valid 32-byte PRF output from create(), use it
      // directly and skip the get() call entirely. F-05 safety: persist the credential
      // id ONLY after confirming PRF output, same as the get() path below.
      if (created.prfOutput) {
        const H = new Uint8Array(created.prfOutput);
        if (H.length === 32) {
          // PRF output confirmed from create() — persist the credential id (F-05).
          if (freshCredId && typeof window !== 'undefined' && window.localStorage) {
            try {
              window.localStorage.setItem(PRF_CRED_KEY, freshCredId);
            } catch {
              // localStorage unavailable (private mode) — proceed without persistence.
            }
          }
          return H;
        }
        // Wrong length — defensive fallthrough to get() (should not happen).
      }
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
      // F-05: PRF unavailable (e.g. Safari). We reach here having possibly CREATED a
      // credential, but we deliberately never persisted its id, so no orphan id is
      // left in localStorage. Fail honestly.
      throw new Error('WebAuthn PRF extension did not return output. This platform may not support hmac-secret.');
    }

    const H = new Uint8Array(prfOutput);
    if (H.length !== 32) {
      throw new Error(`PRF output length mismatch: expected 32 bytes, got ${H.length}.`);
    }

    // PRF output confirmed — NOW it is safe to persist a freshly created credential
    // id for future unlocks (F-05: persist only after a real PRF result).
    if (freshCredId && typeof window !== 'undefined' && window.localStorage) {
      try {
        window.localStorage.setItem(PRF_CRED_KEY, freshCredId);
      } catch {
        // localStorage unavailable (private mode) — proceed without persistence.
      }
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
    assertNotNativePlatform(); // fail closed BEFORE any storage read (I4)
    const blob = await loadVault();
    if (!blob) throw new Error('No wallet found on this device');

    if (blob.kekWrap) {
      // KEK-enrolled vault: BOTH hardware factor H and PIN-derived C are required (I4).
      const getHF = opts && opts.getHardwareFactor;
      if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
      const saltBytes = decodeKekSalt(blob.kekSalt); // malformed kekSalt → KEK_ERR.MALFORMED_VAULT
      const H = await getHF();
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
        // H-2 (issue #721): H is captured before the try; if deriveKekC throws before
        // the in-try eager H.fill(0), H would otherwise linger — zero it here too (I4).
        if (H && H.fill) H.fill(0);
        if (C) C.fill(0);
        if (kek) kek.fill(0);
        if (dek) dek.fill(0);
      }
    }

    // F-08 (audit, I4): a kdf='kek-dek' blob with no kekWrap is malformed — fail closed
    // with the stable code rather than fall through to bare decrypt (misleading error).
    if (blob.kdf === 'kek-dek' && !blob.kekWrap) throw new Error(KEK_ERR.MALFORMED_VAULT);

    // Non-enrolled: existing bare-vault path (unchanged).
    const secret = await decryptVault(blob, password);
    if (vaultNeedsRekey(blob)) {
      // KNOWN LIMITATION — accepted web-only residual (H-1, internal audit 2026-07-14).
      // This at-rest KDF-param rekey runs a current-param KDF ONLY after a CORRECT primary
      // password (a wrong guess never decrypts, so never reaches here), adding a one-time
      // success-vs-miss timing tell on the FIRST post-upgrade unlock of a legacy-param
      // vault. It is deliberately NOT closed here:
      //   * A fire-and-forget defer does NOT move the work off the critical path — the
      //     shared singleton KDF worker serializes the awaited deniability equalizer behind
      //     this job (verified in second-review), so the user-visible unlock still includes
      //     the extra KDF. Only a disproportionate cross-layer change (symmetrize the
      //     failure path, or run the rekey after the whole unlock flow) would truly close it.
      //   * It is NON-PRODUCTION: native (native.js — the shipped iOS/Android product) has
      //     NO unlock-time rekey, so this asymmetry does not exist on the real product; web
      //     is a testing-only surface. It also self-heals after the first successful unlock.
      // Kept as the simple awaited best-effort migration; tracked as an accepted residual.
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
    assertNotNativePlatform(); // fail closed BEFORE any crypto/storage (I4)
    const getHF = opts && opts.getHardwareFactor;
    if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
    const blob = await loadVault();
    if (!blob) throw new Error('No wallet found on this device');
    // F-02 (audit, I4): refuse to re-enroll an already-enrolled vault. Overwriting
    // an existing kekWrap would silently orphan the old DEK-wrap (and, with a fresh
    // random DEK, re-encrypt the seed under a new key), so make it an explicit,
    // machine-coded fail-closed rather than a silent clobber.
    if (blob.kekWrap) throw Object.assign(new Error('KEK_ALREADY_ENROLLED'), { code: 'KEK_ALREADY_ENROLLED' });
    const secret = await decryptVault(blob, password); // verify password and recover seed

    const saltBytes = crypto.getRandomValues(new Uint8Array(32));
    const kekSalt = btoa(String.fromCharCode(...saltBytes));
    // F-01: H is declared here, assigned inside try so the finally always covers it.
    // deriveKekC and randomDek can throw between H assignment and try entry otherwise.
    let H;
    let kek;
    const C = await deriveKekC(password, saltBytes);
    const dek = randomDek();
    // H-NEW-4b: wrap the entire KEK + DEK lifetime in try/finally so BOTH are wiped
    // even if combineKek/wrapDek/encryptVaultWithDek throws — never leave the key
    // that wraps the DEK or the DEK itself in the JS heap on an error path (I4).
    try {
      H = await getHF();
      kek = await combineKek(H, C);
      // H-NEW-4: wipe H/C at the call site (defense in depth over combineKek's own
      // in-place zeroing) — no plaintext key material left in the heap until GC (I4).
      H.fill(0);
      C.fill(0);
      const kekWrap = await wrapDek(kek, dek);
      // Re-encrypt seed under the DEK so PIN rotation doesn't require changing CT (§3).
      // I-1: destructure `v: newV` and persist it — encryptVaultWithDek() sealed
      // GCM AAD over {v, kdf}; the saved header `v` must match or next decrypt
      // fails GCM auth. Benign today (both v:2), fatal if VAULT_VERSION bumps.
      // Mirrors native.js (PR #1079).
      const { v: newV, iv, ct } = await encryptVaultWithDek(secret, dek);
      await saveVault({ ...blob, v: newV, iv, ct, kdf: 'kek-dek', kekWrap, kekSalt });
    } finally {
      // H-NEW-4 / F-01: wipe H, C, the derived KEK and the DEK on every path (I4).
      if (H && H.fill) H.fill(0);
      if (C && C.fill) C.fill(0);
      if (kek) kek.fill(0);
      dek.fill(0);
      // M-1 (issue #724): saltBytes is the raw per-enrollment KEK salt. It is not
      // itself secret key material, but it is generated before the try and would
      // otherwise linger in the JS heap on an error path — wipe it here too (I4).
      if (saltBytes && saltBytes.fill) saltBytes.fill(0);
    }
  },

  // Remove the Hardware KEK from an existing vault. After removal, unlock()
  // requires only the PIN (bare-vault path). Fail-closed (I4): missing/wrong
  // hardware factor → explicit throw, vault unchanged.
  async unenrollKek(password, opts) {
    assertNotNativePlatform(); // fail closed BEFORE any crypto/storage (I4)
    const getHF = opts && opts.getHardwareFactor;
    if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
    const blob = await loadVault();
    if (!blob) throw new Error('No wallet found on this device');
    if (!blob.kekWrap) throw new Error('Hardware KEK not enrolled.');

    const saltBytes = decodeKekSalt(blob.kekSalt); // malformed kekSalt → KEK_ERR.MALFORMED_VAULT
    const H = await getHF();
    let C = null;
    let kek;
    let dek;
    let secret;
    try {
      C = await deriveKekC(password, saltBytes);
      kek = await combineKek(H, C);
      H.fill(0);
      C.fill(0);
      dek = await unwrapDek(kek, blob.kekWrap);
      secret = await decryptVaultWithDek(blob, dek);
    } finally {
      // H-2 (issue #721): H is captured before the try; if deriveKekC throws before
      // the in-try eager H.fill(0), H would otherwise linger — zero it here too (I4).
      if (H && H.fill) H.fill(0);
      if (C) C.fill(0);
      if (kek) kek.fill(0);
      if (dek) dek.fill(0);
    }

    // Re-persist as a bare vault (no KEK wrap). encryptVault writes fresh Argon2id params.
    // F-02: secret is a JS string and cannot be zeroed; structural limitation documented.
    await saveVault(await encryptVault(secret, password));

    // Remove the stored PRF credential ID so re-enrollment creates a fresh credential.
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem('veyrnox-prf-cred-id');
      }
    } catch { /* best-effort */ }
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
    assertNotNativePlatform(); // fail closed BEFORE any storage read (I4)
    // M-8 (issue #731): enforce the web password minimum on the NEW password up
    // front — fail closed BEFORE any vault read or re-wrap — so a rotation can
    // never downgrade an enrolled vault to a too-short PIN. Mirrors createVault.
    validateWebVaultPassword(newPassword);
    const blob = await loadVault();
    if (!blob) throw new Error('No wallet found on this device');

    if (blob.kekWrap) {
      // KEK-enrolled: rotate the PIN by re-wrapping the DEK under a new KEK.
      // The seed ciphertext (blob.ct) stays UNCHANGED — that is the §3 property.
      const getHF = opts && opts.getHardwareFactor;
      if (typeof getHF !== 'function') throw new Error(KEK_ERR.NO_HARDWARE_FACTOR);
      // Verify current PIN first.
      const oldSaltBytes = decodeKekSalt(blob.kekSalt); // malformed kekSalt → KEK_ERR.MALFORMED_VAULT
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
        // I-1 (intentional preserve, NOT the enrollKek/saveVaultContents fix):
        // this branch rotates the DEK wrap only — the seed CT (blob.iv/blob.ct)
        // is NOT re-encrypted (§3: PIN rotation without touching seed CT). The
        // seed CT's GCM auth-tag was sealed with vaultAad({v:blob.v, kdf:'kek-dek'}),
        // so preserving blob.v (via `...blob`) is REQUIRED — bumping v here
        // without re-sealing the seed CT would break next unlock's AAD match
        // and permanently lock the vault. If a future VAULT_VERSION bump ever
        // needs to lift the seed CT, that must be a separate rekey path (like
        // vaultNeedsRekey on unlock), not a silent header-only version bump.
        await saveVault({ ...blob, kekWrap: newKekWrap, kekSalt: newKekSalt });
      } finally {
        // F-06 (audit, I4): H is captured before the try block (needed to make the
        // H2 copy). If ANY step between its capture and its in-try zeroing throws
        // (e.g. deriveKekC), H would otherwise linger in the heap. Zero it here too
        // as a defence — double-zeroing is harmless.
        if (H) H.fill(0);
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

    // F-10: JS-string limitation — secret cannot be zeroed; structural gap documented.
    const secret = await decryptVault(blob, currentPassword);
    await saveVault(await encryptVault(secret, newPassword));
  },

  // Web parity for the native metadata accessor. The explicit "Upgrade protection"
  // action (upgradeKekToV3) is Android/native-specific — the C-1 fixed-salt weakness it
  // fixes does not exist on web, where H is the WebAuthn PRF. The UI gates the upgrade on
  // native anyway, so web reports null (no upgrade applies). If a future web PRF vault ever
  // carries a version field, report it honestly rather than fabricating one.
  async getVaultKekVersion() {
    try {
      const blob = await loadVault();
      if (!blob || !blob.kekWrap) return null;
      // Web PRF wraps do not carry a hardwareKekVersion today; surface it only if present.
      return typeof blob.hardwareKekVersion === 'number' ? blob.hardwareKekVersion : null;
    } catch {
      return null;
    }
  },

  // Web parity for the native upgrade. Web PRF vaults are NOT affected by C-1 (Android
  // fixed-salt HMAC), so there is nothing to re-enroll. Honest NO-OP (I4): do NOT fabricate
  // a hardware re-enroll on web and do NOT prompt — return { upgraded:false, version:null }.
  // eslint-disable-next-line no-unused-vars
  async upgradeKekToV3(_password, _opts) {
    return { upgraded: false, version: null };
  },

  // The unlocked secret lives in WalletProvider's in-memory ref on web, so the
  // store holds nothing to clear here. Native (M2b) drops its hardware grant.
  lock() {},

  // Delegated straight to the unchanged IndexedDB store.
  clearVault,
};
