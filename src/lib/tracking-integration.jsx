// src/lib/tracking-integration.jsx — Tracking integration hooks + notification
// scheduling. One hook per screen/event in the telemetry wiring guide.
//
// All emit() calls go through Promise.resolve(...).catch(() => {}) because
// emit() returns a Promise in production but the test mock (and any consumer
// that hasn't awaited) may return undefined — Promise.resolve() normalizes
// both, and .catch() keeps a rejected emit() from becoming an unhandled
// rejection / crashing a render.
//
// I3 (deniability): this module does not itself gate on deniability/demo —
// emit() already suppresses egress via trackEvent()'s guards, and hasConsent()
// gates every emit(). Hooks here are safe to mount unconditionally.

import { useEffect, useRef } from "react";
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { emit, FunnelEvent } from "@/lib/analytics";
import { assignHoldout } from "@/lib/holdout";

function safeEmit(event, metadata) {
  const result = metadata === undefined ? emit(event) : emit(event, metadata);
  Promise.resolve(result).catch(() => {});
}

function fireOnce(key, fn) {
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

export function useWalletReady() {
  useEffect(() => {
    fireOnce("veyrnox-wallet-ready-fired", () => {
      assignHoldout();
      safeEmit(FunnelEvent.WALLET_READY);
    });
  }, []);
}

export function useFirstInbound(balance) {
  const firedRef = useRef(false);
  useEffect(() => {
    if (firedRef.current) return;
    if (!(balance > 0)) return;
    try {
      if (localStorage.getItem("veyrnox-first-inbound-fired")) {
        firedRef.current = true;
        return;
      }
      localStorage.setItem("veyrnox-first-inbound-fired", "1");
    } catch {}
    firedRef.current = true;
    safeEmit(FunnelEvent.FIRST_INBOUND_DETECTED, { balance });
  }, [balance]);
}

export function useFirstSend() {
  return () => {
    fireOnce("veyrnox-first-send-fired", () => {
      safeEmit(FunnelEvent.FIRST_SEND);
    });
  };
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
    confirm: () => safeEmit(FunnelEvent.SEND_FLOW_STARTED, { step: 'confirmed' }),
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
  } catch {}
}

async function cancelReminders(ids) {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await LocalNotifications.cancel({
      notifications: ids.map((id) => ({ id })),
    });
  } catch {}
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
