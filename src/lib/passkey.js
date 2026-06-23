// lib/passkey.js — app-layer FIDO2 / WebAuthn passkey UNLOCK GATE helpers.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ PASSKEY = AUTHENTICATION FACTOR, *NOT* KEY CUSTODY.                        │
// │                                                                           │
// │ This module registers a real platform passkey and verifies an assertion  │
// │ as an ADDITIONAL gate in front of the unlock action — exactly parallel to │
// │ the app-layer biometric gate in lib/biometric.js. It is the dual of that  │
// │ file for the "unlock with passkey" preference.                            │
// │                                                                           │
// │ HARD INVARIANTS (these protect the non-custodial + privacy model):        │
// │  • It NEVER touches vault crypto (vault.js/vaultStore.js/signing.js) or    │
// │    the password → Argon2id → AES-GCM seed vault. Key material is unchanged.│
// │  • It stores ONLY a public credential id + UI metadata — NO seed, NO       │
// │    private key, NO vault password, NO secret that can decrypt the vault.   │
// │    A WebAuthn assertion yields NO decryption material here (we do NOT use  │
// │    the PRF extension to derive any wrapping key — doing so would make the  │
// │    passkey key custody, which is explicitly out of scope).                 │
// │  • Therefore passkey loss ≠ fund loss. The vault is ALWAYS decrypted by    │
// │    the password (keyStore.unlock), independently of the passkey:           │
// │      - the SEED path (wipe + re-import the phrase) always recovers funds;   │
// │      - the existing-install PASSWORD path is ALSO preserved even when the   │
// │        registered credential is later deleted/unavailable — see the        │
// │        password-only ESCAPE HATCH below (classifyPasskeyError /             │
// │        PasskeyGateError / runPasskeyGate UNAVAILABLE). A broken passkey     │
// │        must never strand a user behind a factor it can no longer satisfy.   │
// │    The passkey is a convenience gate, never the sole path to funds, and     │
// │    recovery is NOT entangled with it (or with any Apple/Google sync).       │
// └─────────────────────────────────────────────────────────────────────────┘
//
// ESCAPE-HATCH THREAT MODEL (SAST M-3 — why falling back to password is safe):
//   The gate sits IN FRONT OF the password; the password is the real control
//   (it alone decrypts the vault — the assertion yields no key material, and is
//   only a browser-enforced presence check, never an app-verified signature).
//   So "unlock with password only" is no weaker than this app's BASELINE custody
//   model: anyone who can complete it already holds the correct vault password.
//   The danger to avoid is turning that into a casual "skip the 2nd factor"
//   button a thief/coercer (who DOES have the password) clicks to dodge a WORKING
//   passkey at will. We keep the two cases distinct:
//     • CANCEL of a working passkey  → fail CLOSED (stay locked), unchanged. The
//       escape hatch is NOT auto-taken; the unlock attempt simply rejects.
//     • Passkey genuinely CANNOT run → degrade to the password path:
//         - UNAVAILABLE (no platform authenticator / WebAuthn gone): the gate
//           can't even prompt, so requiring it would brick EVERY unlock. We
//           degrade automatically but SIGNAL it to the user (no silent skip).
//         - HARD FAILURE / deleted credential: the assertion throws. We still
//           fail closed FIRST (so a plain cancel never auto-passes), then the UI
//           offers a deliberate, signposted password-only escape hatch as
//           RECOVERY — and it STILL requires the correct vault password.
//   WebAuthn deliberately reports a user-cancel and a missing-credential timeout
//   BOTH as NotAllowedError (anti-enumeration), so they are not perfectly
//   separable at the prompt without a server. We therefore make the escape hatch
//   an explicit, password-gated USER action surfaced only AFTER a failure, never
//   a default-visible bypass — see classifyPasskeyError / PasskeyGateError.
//
// PLATFORM SUPPORT (be honest — see report):
//   • web (https / localhost) : real WebAuthn via navigator.credentials. Works
//     in modern desktop/mobile browsers with a platform authenticator.
//   • demo (VITE_DEMO_MODE / ?demo) : SIMULATED — no real WebAuthn call, so the
//     register + unlock flow is demonstrable on the simulator/CI. Clearly
//     labelled; never mistaken for real security.
//   • native (Capacitor webview) : WebAuthn in a webview is unreliable and
//     origin-bound; we attempt the real call where the browser exposes it and
//     otherwise treat the platform as unsupported (the gate degrades to the
//     password, never blocking access to funds). A hardware-bound native
//     passkey API is future work (tracked alongside the M2b/M2c keystore rework).

import { DEMO } from '@/api/demoClient';

// localStorage keys. Mirrors the app's existing preference convention
// (see biometric.js BIOMETRIC_PREF_KEY, demoClient.js). Neither value is a
// secret: PREF is a boolean flag; CRED is a PUBLIC credential id + UI metadata.
export const PASSKEY_PREF_KEY = 'veyrnox-passkey-unlock';
export const PASSKEY_CRED_KEY = 'veyrnox-passkey-cred';
// Separate preference for "use my passkey as the SECOND FACTOR at critical actions"
// (send, reveal seed, duress/stealth setup). Independent of the unlock pref above so
// a user can use a passkey for ONE without the other. Device-global (the passkey
// lives in this device's authenticator), unlike the per-set Action Password.
export const TWOFACTOR_PASSKEY_KEY = 'veyrnox-2fa-passkey';

// In-document notification fired whenever the registered passkey is created or
// cleared. The registered-passkey flag (PASSKEY_CRED_KEY) is read by more than
// one settings surface in the SAME page mount — PasskeyUnlockSettings registers
// it; TwoFactorSettings gates its second-factor toggle on it. localStorage writes
// do NOT notify same-document listeners (the `storage` event fires only in OTHER
// tabs), so a sibling component would otherwise keep a stale read until remount.
// We publish this event so consumers can re-read isPasskeyRegistered() live.
export const PASSKEY_REGISTRATION_EVENT = 'veyrnox-passkey-registration-changed';

function notifyPasskeyRegistrationChanged() {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new Event(PASSKEY_REGISTRATION_EVENT));
    }
  } catch {
    /* best-effort signal — a missing event bus must never block registration. */
  }
}

// Sentinel credential id used by the demo/simulated path so the rest of the app
// can treat "a passkey is registered" uniformly without a real authenticator.
const DEMO_CRED_ID = 'demo-passkey';

// Resolve the working localStorage. In the browser this is just `localStorage`;
// under jsdom/Node test envs the bare global can be Node's disabled experimental
// stub, so we prefer window.localStorage. Returns null if none is usable, and
// every caller treats persistence as best-effort (a hiccup never blocks unlock).
function ls() {
  try { if (typeof window !== 'undefined' && window.localStorage) return window.localStorage; } catch { /* noop */ }
  try { if (typeof localStorage !== 'undefined' && localStorage) return localStorage; } catch { /* noop */ }
  return null;
}

/** @returns {boolean} is the WebAuthn platform API present at all? */
export function isWebAuthnSupported() {
  return typeof window !== 'undefined'
    && !!window.PublicKeyCredential
    && !!(navigator.credentials && navigator.credentials.create);
}

/** @returns {boolean} has the user turned on "unlock with passkey"? */
export function isPasskeyUnlockEnabled() {
  try {
    return ls()?.getItem(PASSKEY_PREF_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the "unlock with passkey" preference. */
export function setPasskeyUnlockEnabled(on) {
  try {
    if (on) ls()?.setItem(PASSKEY_PREF_KEY, '1');
    else ls()?.removeItem(PASSKEY_PREF_KEY);
  } catch {
    /* storage unavailable — preference is best-effort, non-fatal. */
  }
}

/** @returns {boolean} has the user turned on "passkey as my critical-action second factor"? */
export function is2faPasskeyEnabled() {
  try {
    return ls()?.getItem(TWOFACTOR_PASSKEY_KEY) === '1';
  } catch {
    return false;
  }
}

/** Persist the "passkey is my critical-action second factor" preference. */
export function set2faPasskeyEnabled(on) {
  try {
    if (on) ls()?.setItem(TWOFACTOR_PASSKEY_KEY, '1');
    else ls()?.removeItem(TWOFACTOR_PASSKEY_KEY);
  } catch {
    /* storage unavailable — preference is best-effort, non-fatal. */
  }
}

/**
 * @returns {{id:string, rpId:string, label:string, simulated:boolean,
 *   createdAt:number}|null} the registered passkey's PUBLIC handle + metadata,
 *   or null if none is registered. Contains no secret/key material.
 */
export function getRegisteredPasskey() {
  try {
    const raw = ls()?.getItem(PASSKEY_CRED_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj.id !== 'string') return null;
    return obj;
  } catch {
    return null;
  }
}

/** @returns {boolean} is a passkey registered on this device? */
export function isPasskeyRegistered() {
  return getRegisteredPasskey() != null;
}

/** Remove the registered passkey AND disable the unlock preference. The actual
 *  WebAuthn credential lives in the authenticator/OS; the user removes it there.
 *  This only forgets our public handle, so the gate stops applying. */
export function clearRegisteredPasskey() {
  try { ls()?.removeItem(PASSKEY_CRED_KEY); } catch { /* noop */ }
  setPasskeyUnlockEnabled(false);
  notifyPasskeyRegistrationChanged();
}

// --- base64url helpers (credential ids are passed/stored as base64url) ---------

function bufferToBase64Url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = '';
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBuffer(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const str = atob(b64 + pad);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

// CSPRNG-only randomness (the RNG guard forbids Math.random in crypto paths and
// it would be wrong here regardless — challenges/user handles must be unguessable).
function randomBytes(n) {
  const arr = new Uint8Array(n);
  crypto.getRandomValues(arr);
  return arr;
}

/**
 * @typedef {object} PasskeyStatus
 * @property {'demo'|'web'|'native'} mode  Which environment resolved this.
 * @property {boolean} supported           Is the WebAuthn API present?
 * @property {boolean} available           Can we register/verify here?
 * @property {boolean} registered          Is a passkey already registered?
 * @property {boolean} simulated           Is the prompt a demo stub?
 * @property {string}  label               e.g. "Passkey".
 * @property {string}  detail              One-line honest status for the UI.
 */

/**
 * Resolve passkey availability for the current environment. DEMO is checked
 * FIRST (like biometric.js) so the simulator shows the clearly-stubbed flow
 * rather than a real WebAuthn call that may have nothing enrolled.
 * @returns {Promise<PasskeyStatus>}
 */
export async function getPasskeyStatus() {
  const registered = isPasskeyRegistered();

  if (DEMO) {
    return {
      mode: 'demo',
      supported: true,
      available: true,
      registered,
      simulated: true,
      label: 'Passkey',
      detail: 'Demo mode — passkey register/unlock is simulated, not real OS security.',
    };
  }

  const supported = isWebAuthnSupported();
  // A platform authenticator (Face ID / Touch ID / Windows Hello / Android) is
  // what makes a passkey usable for unlock. Probe it where the browser exposes
  // the check; fall back to "supported" if the probe itself is unavailable.
  let platformAvailable = supported;
  if (supported && window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) {
    try {
      platformAvailable = await window.PublicKeyCredential
        .isUserVerifyingPlatformAuthenticatorAvailable();
    } catch {
      platformAvailable = supported;
    }
  }

  if (!supported) {
    return {
      mode: 'web', supported: false, available: false, registered, simulated: false,
      label: 'Passkey',
      detail: 'WebAuthn is not available in this browser. Use your password to unlock.',
    };
  }

  return {
    mode: 'web',
    supported: true,
    available: platformAvailable,
    registered,
    simulated: false,
    label: 'Passkey',
    detail: platformAvailable
      ? (registered
        ? 'A passkey is registered. Use it to unlock alongside your password.'
        : 'A platform authenticator is available. Register a passkey to enable it.')
      : 'No platform authenticator detected. A roaming security key may still work.',
  };
}

/**
 * Register a real platform passkey (or a simulated one in demo) and persist its
 * PUBLIC credential id + metadata. Throws on cancel/failure so the caller can
 * surface it. NEVER stores key material or any vault-decrypting secret.
 *
 * @param {{label?:string, userName?:string}} [opts]
 * @returns {Promise<{ok:true, simulated:boolean, credentialId:string}>}
 */
export async function registerPasskeyCredential(opts = {}) {
  const label = opts.label || 'Veyrnox passkey';

  // DEMO: store a sentinel handle so the rest of the app behaves identically.
  // The visible "registration" UX/prompt is the simulated sheet shown by the
  // settings screen; no real WebAuthn call is made on the simulator/CI.
  if (DEMO) {
    const rec = {
      id: DEMO_CRED_ID,
      rpId: typeof window !== 'undefined' ? window.location.hostname : 'demo',
      label,
      simulated: true,
      createdAt: Date.now(),
    };
    try { ls()?.setItem(PASSKEY_CRED_KEY, JSON.stringify(rec)); } catch { /* noop */ }
    notifyPasskeyRegistrationChanged();
    return { ok: true, simulated: true, credentialId: DEMO_CRED_ID };
  }

  if (!isWebAuthnSupported()) {
    throw new Error('WebAuthn is not supported in this browser');
  }

  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Veyrnox Wallet', id: window.location.hostname },
      // The user handle is a fresh random id, NOT derived from any seed/key. It
      // exists only so the authenticator can store/replace the credential.
      user: {
        id: randomBytes(16),
        name: opts.userName || 'veyrnox-unlock',
        displayName: label,
      },
      pubKeyCredParams: [
        { alg: -7, type: 'public-key' },   // ES256
        { alg: -257, type: 'public-key' }, // RS256
      ],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      timeout: 60000,
    },
  });

  if (!credential) throw new Error('Passkey registration returned no credential');

  const credentialId = bufferToBase64Url((/** @type {any} */ (credential)).rawId);
  const rec = {
    id: credentialId,
    rpId: window.location.hostname,
    label,
    simulated: false,
    createdAt: Date.now(),
  };
  try { ls()?.setItem(PASSKEY_CRED_KEY, JSON.stringify(rec)); } catch { /* noop */ }
  notifyPasskeyRegistrationChanged();
  return { ok: true, simulated: false, credentialId };
}

/**
 * Verify a passkey assertion (real WebAuthn `get`) for the registered
 * credential. Resolves on a successful user-verifying assertion; throws on
 * cancel/failure/unsupported. Returns NO secret — the assertion is used purely
 * as a gate signal, never as decryption material.
 *
 * NOTE: the DEMO path does NOT call this — the provider shows the simulated
 * sheet instead (mirroring how the biometric gate simulates in demo).
 *
 * @returns {Promise<true>}
 */
export async function verifyPasskeyAssertion() {
  const rec = getRegisteredPasskey();
  if (!rec) throw new Error('No passkey registered');
  if (!isWebAuthnSupported()) throw new Error('WebAuthn is not supported in this browser');

  await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      timeout: 60000,
      userVerification: 'required',
      rpId: rec.rpId || window.location.hostname,
      // Scope the assertion to OUR registered credential so an unrelated passkey
      // can't satisfy the gate.
      allowCredentials: [{ id: base64UrlToBuffer(rec.id), type: 'public-key' }],
    },
  });
  return true;
}

// --- gate outcome model (SAST M-1/M-2/M-3) -----------------------------------

/**
 * The outcome of running the passkey gate in front of an unlock. Consumed by the
 * unlock flow (WalletProvider.runPasskeyGate) to choose between "fail closed and
 * let the user retry/cancel" and "the passkey genuinely cannot run here — degrade
 * to the password path, which is the real control." Never a secret.
 * @readonly
 * @enum {string}
 */
export const PASSKEY_GATE = Object.freeze({
  PASSED: 'passed',           // assertion succeeded (or the demo sheet verified)
  SKIPPED: 'skipped',         // gate not applicable (toggle off / not registered)
  UNAVAILABLE: 'unavailable', // registered + enabled, but the passkey CANNOT run
                              // here (no platform authenticator / WebAuthn gone).
                              // Degrade to the password path, but SIGNAL it — the
                              // factor was dropped, not silently skipped (M-1/M-2).
});

/**
 * Classify why a passkey assertion failed, so the unlock UI can tell a deliberate
 * CANCEL of a working passkey (fail closed, let the user retry) apart from a HARD
 * failure where the passkey can no longer be used at all (offer the password-only
 * escape hatch as recovery — SAST M-3).
 *
 * Honest limitation: WebAuthn deliberately reports BOTH a user-cancel AND a
 * missing/After-timeout credential as `NotAllowedError` (anti-enumeration), so we
 * cannot perfectly separate "user cancelled" from "credential was deleted" from
 * the error alone. We therefore treat `NotAllowedError` as the AMBIGUOUS
 * cancel-or-removed case — the UI keeps it fail-closed but still offers the
 * password escape hatch as recovery — and any OTHER error name as an unambiguous
 * hard failure (the passkey machinery is broken / the credential is unusable).
 *
 * @param {*} err
 * @returns {'cancelled'|'error'}
 */
export function classifyPasskeyError(err) {
  // Only a real Error/DOMException carries a `.name`; a string/null/object reads
  // it as undefined and correctly falls through to the hard-failure branch.
  return err?.name === 'NotAllowedError' ? 'cancelled' : 'error';
}

/**
 * Error thrown by the unlock flow's passkey gate when an attempted assertion
 * fails. Carries the classified `reason` so the unlock UI can distinguish
 * cancel-vs-broken and decide whether to surface the password-only escape hatch.
 * It is NOT thrown for the UNAVAILABLE/skip cases — those return a PASSKEY_GATE
 * status instead (no prompt was ever shown, so there is nothing to "fail").
 */
export class PasskeyGateError extends Error {
  /**
   * @param {'cancelled'|'error'} reason
   * @param {unknown} [cause] the underlying assertion error, for diagnostics.
   */
  constructor(reason, cause) {
    super(reason === 'cancelled'
      ? 'Passkey was cancelled or could not be used.'
      : 'Your passkey could not be used.');
    this.name = 'PasskeyGateError';
    // Stable, minification-proof tag so the UI can detect a passkey-gate failure
    // (vs. a wrong-password error) without relying on the class identity.
    this.isPasskeyGateError = true;
    this.reason = reason;
    this.cause = cause;
  }
}

/** @returns {boolean} did this error come from the passkey gate (not the vault)? */
export function isPasskeyGateError(err) {
  return !!(err && typeof err === 'object' && err.isPasskeyGateError);
}
