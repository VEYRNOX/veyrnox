// Shared haptic-feedback helpers for interactive controls (PinPad taps, etc.).
// Native: @capacitor/haptics — real device vibration.
// Web: navigator.vibrate() where supported (Android Chrome, Firefox; iOS Safari
// silently no-ops per Apple policy).
// Best-effort — every call is swallowed on failure so a feedback problem can
// never break the input path (I4 spirit for a non-security surface).

import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";

function isNative() {
  try { return Capacitor.isNativePlatform(); } catch { return false; }
}

function webVibrate(ms) {
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(ms);
    }
  } catch { /* silent */ }
}

// Tap feedback — key press, dot fill, small confirmations.
export function tapHaptic() {
  if (isNative()) {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    return;
  }
  webVibrate(5);
}

// Completed action (Submit, Continue) — one step above a tap.
export function actionHaptic() {
  if (isNative()) {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    return;
  }
  webVibrate(10);
}

// Success confirmation — subtle double-tap feel.
export function successHaptic() {
  if (isNative()) {
    Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    return;
  }
  webVibrate([8, 20, 8]);
}

// Error / wrong PIN — slightly stronger than success.
export function errorHaptic() {
  if (isNative()) {
    Haptics.notification({ type: NotificationType.Warning }).catch(() => {});
    return;
  }
  webVibrate([15, 30, 15]);
}
