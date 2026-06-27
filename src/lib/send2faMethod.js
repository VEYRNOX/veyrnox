// src/lib/send2faMethod.js
//
// The pure resolver for WHICH second factor the Send screen enforces at confirm
// time. This is the single source of truth for that decision, mirroring
// useActionGuard.resolveMethod — extracted as a pure function of booleans so the
// Send screen and the action-guard cannot drift, and so the rule is exhaustively
// unit-testable.
//
// AUDIT H-1: the previous Send-screen code keyed the 2FA gate solely off
// `actionPasswordConfigured`. For a PASSKEY-ONLY 2FA configuration that flag is
// false, so the gate was skipped and no second factor was applied — while Settings
// claimed every send was protected by "PIN + Passkey". This resolver fixes that:
// passkey wins whenever it is both enabled AND a passkey is actually registered
// (so we can honestly run the assertion); otherwise it falls back to the Action
// Password; otherwise there is no second factor (opt-in, unchanged behaviour).
//
// FAIL SAFE: missing/undefined inputs resolve to NONE rather than a half-applied
// gate — the caller still runs its baseline windowed PIN step-up; this resolver
// only adds a second factor, never removes the baseline.
//
// No I/O, no crypto, no React — pure values. The impure reads (localStorage prefs,
// the WebAuthn assertion itself) stay in the caller.

export const SEND_2FA = Object.freeze({
  BIOMETRIC: 'biometric',
  PASSKEY: 'passkey',
  PASSWORD: 'password',
  NONE: 'none',
});

/**
 * Resolve the active send-time second factor.
 *
 * MOBILE (audit follow-up): WebAuthn passkeys do NOT work inside the Android
 * Capacitor WebView (no platform authenticator is exposed to it), so on a real
 * device the genuine, working possession factor is the OS biometric via
 * @aparajita/capacitor-biometric-auth — the SAME prompt the wallet already uses to
 * unlock. It therefore takes precedence on native when enabled. It is gated on
 * `isNative` (the OS prompt cannot run on plain web) and FAILS CLOSED at verify
 * time if biometrics are later removed (a blocked send is safe; the user can turn
 * the factor off). Enabling it requires a live availability check + test in the UI.
 *
 * @param {object}  [i]
 * @param {boolean} [i.demo]                    demo mode — fake sends, no vault, no factor
 * @param {boolean} [i.isNative]                running in the native (Capacitor) app
 * @param {boolean} [i.biometric2faEnabled]     user turned on "OS biometric as my 2nd factor"
 * @param {boolean} [i.passkey2faEnabled]       user turned on "passkey as my 2nd factor"
 * @param {boolean} [i.passkeyRegistered]       a passkey is actually registered on this device
 * @param {boolean} [i.actionPasswordConfigured] the active set has an Action Password
 * @returns {'biometric'|'passkey'|'password'|'none'}
 */
export function resolveSend2faMethod({
  demo = false,
  isNative = false,
  biometric2faEnabled = false,
  passkey2faEnabled = false,
  passkeyRegistered = false,
  actionPasswordConfigured = false,
} = {}) {
  if (demo) return SEND_2FA.NONE; // demo has no vault → no real second factor
  // Native OS biometric wins on a real device — the only possession factor that
  // actually runs in the app (WebAuthn passkeys can't in the Android WebView).
  if (isNative && biometric2faEnabled) return SEND_2FA.BIOMETRIC;
  // Passkey next, but ONLY when one is genuinely registered so the assertion can
  // honestly run (a stale "on" pref with nothing registered must not gate on a
  // factor we cannot satisfy — that would brick the send, not secure it).
  if (passkey2faEnabled && passkeyRegistered) return SEND_2FA.PASSKEY;
  if (actionPasswordConfigured) return SEND_2FA.PASSWORD;
  return SEND_2FA.NONE;
}
