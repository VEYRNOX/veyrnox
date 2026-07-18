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

// Tap feedback — key press, dot fill, small confirmations. Light impact.
export function tapHaptic() {
  if (isNative()) {
    Haptics.impact({ style: ImpactStyle.Light }).catch(() => {});
    return;
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(10);
    }
  } catch { /* silent */ }
}

// Medium impact for a completed action (Submit, Continue).
export function actionHaptic() {
  if (isNative()) {
    Haptics.impact({ style: ImpactStyle.Medium }).catch(() => {});
    return;
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(20);
    }
  } catch { /* silent */ }
}

// Notification patterns for success / warning / error toasts and gates.
export function successHaptic() {
  if (isNative()) {
    Haptics.notification({ type: NotificationType.Success }).catch(() => {});
    return;
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([15, 30, 15]);
    }
  } catch { /* silent */ }
}

export function errorHaptic() {
  if (isNative()) {
    Haptics.notification({ type: NotificationType.Error }).catch(() => {});
    return;
  }
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate([30, 40, 30]);
    }
  } catch { /* silent */ }
}
