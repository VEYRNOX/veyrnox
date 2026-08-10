// src/lib/tracking-integration.jsx — Tracking integration hooks + notification
// scheduling. One hook per screen/event in the telemetry wiring guide.
//
// All emit() calls go through Promise.resolve(...).catch(() => {}) because
// emit() returns a Promise in production but the test mock (and any consumer
// that hasn't awaited) may return undefined — Promise.resolve() normalizes
// both, and .catch() keeps a rejected emit() from becoming an unhandled
// rejection / crashing a render.
//
// ── I3 (deniability): TWO different gates, in two different places ───────
//
// EGRESS is gated downstream, at the single chokepoint in api/trackEvent.js
// (demo/deniability guards + the consent check). Nothing here duplicates that;
// one chokepoint is what stops a new call site reintroducing a bypass.
//
// LOCAL DEVICE STATE is gated HERE, because trackEvent() cannot see it. This
// module writes three kinds of state that never reach the network and were
// therefore never covered by "emit() suppresses egress":
//
//   1. once-per-install markers   (veyrnox-*-fired, via fireOnce)
//   2. the A/B holdout bucket     (veyrnox-holdout, via assignHoldout)
//   3. scheduled local notifications
//
// WalletPortfolioPage and SendCrypto both render in decoy/duress sessions by
// design, and `isUnlocked` is true there — so before this gate existed, a
// coerced session wrote all three into storage the REAL session shares. Two
// distinct harms, and a fix has to close both:
//
//   RESIDUE — persistent artifacts proving a real Veyrnox install reached a
//     given milestone, created by the one session that must leave none.
//     `veyrnox-first-inbound-fired` is the sharp one: it asserts that funds
//     were once received. (panic.js wipes these keys, which fixes the
//     post-wipe honesty claim — not their existence during the decoy session.)
//   FUNNEL THEFT — the decoy burns the once-per-install flag, so the real
//     session's milestone can never fire afterwards. Analytics understates
//     real activations with no signal that it happened (I4, fail honest).
//
// The guard mirrors api/trackEvent.js verbatim (`DEMO ||
// isDeniabilityOrDemoActive()`) deliberately, so there is one predicate shape
// to reason about. Neither half is redundant: isDeniabilityOrDemoActive() reads
// `veyrnox-demo` LIVE (catching a flag set after module import, and covering
// `?demo=1`, which persists it), while DEMO is a load-time snapshot that also
// covers VITE_DEMO_MODE=1 and native dev builds, which never write that key.
//
// Cancelling notifications is deliberately NOT gated — see cancelReminders.
//
// ── WIRING STATUS (keep this list honest) ────────────────────────────────
// WIRED (have real call sites):
//   useCryptoDiagnostics  → App.jsx
//   useWalletReady        → WalletPortfolioPage.jsx
//   useFirstInbound       → WalletPortfolioPage.jsx
//   useSendFlowTracking   → SendCrypto.jsx
//   useFirstSend          → SendCrypto.jsx
//   useFirstReceiveShown  → WalletEntry.jsx (via FirstReceiveCardWithTelemetry)
//   cancelVerificationReminders → SeedVerificationPage.jsx
//
// NOT WIRED — exported but no call site anywhere in src/. These do not
// produce funnel coverage today and must not be counted as if they did:
//   useFirstOpen, useOnboardingStart, useCustodyPathChosen, useSeedGenerated,
//   useSeedRevealed, useSeedBackupAcknowledged, useSeedVerification,
//   useLockMethodSet, useUnlockTracking, useDappConnectTracking,
//   emitTamperSignal, emitSecurityModal, emitKekUnwrapFailed,
//   scheduleFundingReminders, cancelFundingReminders,
//   scheduleVerificationReminders
// Before wiring useDappConnectTracking, note that it sends the dApp `origin`
// — browsing-shaped data the consent copy does not currently cover.

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { emit, FunnelEvent } from "@/lib/analytics";
import { assignHoldout } from "@/lib/holdout";
import { isDeniabilityOrDemoActive } from "@/wallet-core/deniabilitySession";
import { DEMO } from "@/api/demoClient";

/**
 * Must this session leave no local trace? Fails CLOSED — every read inside
 * isDeniabilityOrDemoActive() returns true if it throws, so an unreadable
 * localStorage suppresses rather than proceeds (I4).
 */
function suppressed() {
  return DEMO || isDeniabilityOrDemoActive();
}

function safeEmit(event, metadata) {
  const result = metadata === undefined ? emit(event) : emit(event, metadata);
  Promise.resolve(result).catch(() => {});
}

function fireOnce(key, fn) {
  // BEFORE the read, not just before the write. Returning early here is what
  // makes the decoy session cost the real session nothing: the flag is neither
  // written (no residue) nor consumed (no funnel theft). `false` is the honest
  // return value — this did not fire.
  if (suppressed()) return false;
  try {
    if (localStorage.getItem(key)) return false;
    localStorage.setItem(key, "1");
  } catch {
    // If localStorage is unavailable, fall through and fire anyway — better
    // to over-count once than silently lose the funnel event forever.
  }
  fn();
  return true;
}

// ─────────────────────────────────────────────────────────────────────────
// Once-per-install hooks
// ─────────────────────────────────────────────────────────────────────────

export function useFirstOpen() {
  useEffect(() => {
    fireOnce("veyrnox-first-open-fired", () => {
      safeEmit(FunnelEvent.FIRST_OPEN);
    });
  }, []);
}

// `ready` MUST be passed. WalletPortfolioPage calls this above its
// `if (!isUnlocked)` early return (hooks must run unconditionally), so without
// a guard the milestone fired in explore mode with no wallet — and fireOnce()
// burned `veyrnox-wallet-ready-fired` permanently, meaning the REAL
// wallet-ready moment could never be recorded and the holdout bucket was
// assigned to a device that had no wallet.
export function useWalletReady(ready) {
  useEffect(() => {
    if (!ready) return;
    fireOnce("veyrnox-wallet-ready-fired", () => {
      assignHoldout();
      safeEmit(FunnelEvent.WALLET_READY);
    });
  }, [ready]);
}

// NEVER send the balance itself. This previously emitted `{ balance }` — the
// user's real portfolio USD total — against a persistent device ID, while the
// consent screen promised "no wallet data". The milestone (funding happened)
// is the whole signal we need; the amount is the user's financial position and
// has no business leaving the device.
//
// Routed through fireOnce() rather than hand-rolling the same localStorage
// dance inline. It was the one marker written by a second, near-identical code
// path — which is precisely why gating fireOnce() alone would have missed it.
// One helper owns the marker protocol now, and one gate covers every marker.
export function useFirstInbound(balance) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    if (!(balance > 0)) return;
    // Checked before firedRef is set so a suppressed session does not burn the
    // in-memory memo either. fireOnce() would already refuse to write, but
    // leaving the ref set would mean that if this component were still mounted
    // when a real session began, the milestone could never fire. That relies on
    // "a decoy session always remounts" being true forever; this does not.
    if (suppressed()) return;
    firedRef.current = true;
    fireOnce("veyrnox-first-inbound-fired", () => {
      safeEmit(FunnelEvent.FIRST_INBOUND_DETECTED);
    });
  }, [balance]);
}

export function useFirstSend() {
  return () => {
    fireOnce("veyrnox-first-send-fired", () => {
      safeEmit(FunnelEvent.FIRST_SEND);
    });
  };
}

// Mirrors useFirstOpen's shape (useEffect + fireOnce), parameterised on `fn`
// so the caller supplies the event to emit. Must be called from a component
// that only mounts on the render that shows the card (e.g. a small wrapper
// around FirstReceiveCard in WalletEntry's render branch) — NOT from
// WalletEntry itself, whose top-level hooks run on every render regardless
// of which branch it returns.
export function useFirstReceiveShown(fn) {
  useEffect(() => {
    fireOnce("veyrnox-first-receive-shown-fired", fn);
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────
// On-mount hooks
// ─────────────────────────────────────────────────────────────────────────

export function useOnboardingStart() {
  useEffect(() => {
    safeEmit(FunnelEvent.ONBOARDING_START);
  }, []);
}

export function useCryptoDiagnostics() {
  useEffect(() => {
    const secureContext = typeof window !== "undefined" && window.isSecureContext;
    const hasSubtle =
      typeof crypto !== "undefined" && crypto != null && crypto.subtle != null;
    if (!secureContext || !hasSubtle) {
      safeEmit(FunnelEvent.CRYPTO_DIAGNOSTICS, {
        isSecureContext: !!secureContext,
        hasSubtleCrypto: !!hasSubtle,
      });
    }
  }, []);
}

// ─────────────────────────────────────────────────────────────────────────
// Callback-returning hooks
// ─────────────────────────────────────────────────────────────────────────

export function useCustodyPathChosen() {
  return (path) => {
    safeEmit(FunnelEvent.CUSTODY_PATH_CHOSEN, { path });
  };
}

export function useSeedGenerated(ready) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (!ready || firedRef.current) return;
    firedRef.current = true;
    safeEmit(FunnelEvent.SEED_GENERATED);
  }, [ready]);
}

export function useSeedRevealed() {
  return () => {
    safeEmit(FunnelEvent.SEED_REVEALED);
  };
}

export function useSeedBackupAcknowledged() {
  return () => {
    safeEmit(FunnelEvent.SEED_BACKUP_ACKNOWLEDGED);
  };
}

export function useSeedVerification() {
  return {
    started: () => safeEmit(FunnelEvent.SEED_VERIFY_STARTED),
    attempt: () => safeEmit(FunnelEvent.SEED_VERIFY_ATTEMPT),
    passed: () => safeEmit(FunnelEvent.SEED_VERIFY_PASSED),
    failed: () => safeEmit(FunnelEvent.SEED_VERIFY_FAILED),
    deferred: () => safeEmit(FunnelEvent.SEED_VERIFY_DEFERRED),
  };
}

export function useLockMethodSet() {
  return (method) => {
    safeEmit(FunnelEvent.LOCK_METHOD_SET, { method });
  };
}

export function useSendFlowTracking() {
  return {
    start: () => safeEmit(FunnelEvent.SEND_FLOW_STARTED),
    stepReached: (step) => safeEmit(FunnelEvent.SEND_STEP_REACHED, { step }),
    abandon: (step) => safeEmit(FunnelEvent.SEND_ABANDONED, { step }),
    // Was emitting SEND_FLOW_STARTED — a copy-paste that double-counted every
    // confirm as a new funnel start and left confirms unmeasurable.
    confirm: () => safeEmit(FunnelEvent.SEND_STEP_REACHED, { step: 'confirmed' }),
  };
}

export function useUnlockTracking() {
  return {
    attempt: (method) => safeEmit(FunnelEvent.UNLOCK_ATTEMPT, { method }),
    result: (method, success) =>
      safeEmit(FunnelEvent.UNLOCK_RESULT, { method, success }),
  };
}

export function useDappConnectTracking() {
  return {
    start: (origin) => safeEmit(FunnelEvent.DAPP_CONNECT_START, { origin }),
    result: (origin, success) =>
      safeEmit(FunnelEvent.DAPP_CONNECT_RESULT, { origin, success }),
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Standalone emitters (not hooks)
// ─────────────────────────────────────────────────────────────────────────

export function emitTamperSignal(signal) {
  safeEmit(FunnelEvent.TAMPER_SIGNAL, { signal });
}

export function emitSecurityModal(source) {
  safeEmit(FunnelEvent.SECURITY_MODAL_SHOWN, { source });
}

export function emitKekUnwrapFailed() {
  safeEmit(FunnelEvent.KEK_UNWRAP_FAILED);
}

// ─────────────────────────────────────────────────────────────────────────
// Notification scheduling
//
// Anti-phishing copy rules (CRITICAL): notifications never include links,
// never say "verify", "confirm", "action required", "suspended", or
// "at risk". They state plainly what's unfinished so users can't be trained
// to trust urgent-sounding wallet notifications (a common phishing vector).
//
// IDs use a 9000+ base to avoid colliding with usePriceAlertNotifier's
// monotonic counter (which starts at 1 and grows per-alert).
// ─────────────────────────────────────────────────────────────────────────

const FUNDING_REMINDER_IDS = [9001, 9002];
const VERIFICATION_REMINDER_IDS = [9003, 9004];

const FUNDING_REMINDER_TITLE = "Veyrnox";
const FUNDING_REMINDER_BODY =
  "You haven't added funds yet. Open Veyrnox to get started.";

const VERIFICATION_REMINDER_TITLE = "Veyrnox";
const VERIFICATION_REMINDER_BODY =
  "Your wallet setup isn't finished yet. Open Veyrnox to complete it.";

async function scheduleReminders(ids, delaysHours, title, body) {
  // A reminder that surfaces 24h later — "You haven't added funds yet. Open
  // Veyrnox to get started." — is a Veyrnox-install tell on the lock screen,
  // created by the one session that must leave none. It also outlives the
  // session that scheduled it, which localStorage residue at least does not.
  if (suppressed()) return;
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.schedule({
      notifications: ids.map((id, i) => ({
        id,
        title,
        body,
        schedule: { at: new Date(Date.now() + delaysHours[i] * 60 * 60 * 1000) },
      })),
    });
  } catch (e) {
    console.warn('[tracking] schedule notifications failed:', e);
  }
}

// NOT gated on suppressed(), unlike scheduleReminders — deliberately, and it
// is the asymmetry that matters. Cancelling only ever REMOVES pending device
// state, so it can never create a tell. Gating it would mean a decoy session
// silently declines to cancel a reminder the real session scheduled, leaving
// it to fire later: the gate would manufacture the exact leak it exists to
// prevent. "Deny by default" applies to creating state, not to erasing it.
async function cancelReminders(ids) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({
      notifications: ids.map((id) => ({ id })),
    });
  } catch (e) {
    console.warn('[tracking] cancel notifications failed:', e);
  }
}

export function scheduleFundingReminders() {
  return scheduleReminders(
    FUNDING_REMINDER_IDS,
    [24, 72],
    FUNDING_REMINDER_TITLE,
    FUNDING_REMINDER_BODY,
  );
}

export function cancelFundingReminders() {
  return cancelReminders(FUNDING_REMINDER_IDS);
}

export function scheduleVerificationReminders() {
  return scheduleReminders(
    VERIFICATION_REMINDER_IDS,
    [1, 24],
    VERIFICATION_REMINDER_TITLE,
    VERIFICATION_REMINDER_BODY,
  );
}

export function cancelVerificationReminders() {
  return cancelReminders(VERIFICATION_REMINDER_IDS);
}
