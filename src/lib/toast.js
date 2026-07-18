// Thin wrapper around sonner's `toast` (WCAG 2.2.1 — Timing Adjustable).
//
// sonner's Toaster duration is global and defaults to a single value for every
// toast type. Error and warning toasts should stay on screen longer than
// success/info toasts so a user has time to actually read them. Rather than
// re-litigating a duration at every call site, this wrapper applies sane
// longer defaults for `.error()` / `.warning()` and re-exports everything
// else from sonner unchanged.
//
// Callers can still override the duration (or any other option) per-call:
//   toast.error("Something failed", { duration: 15000 })
import { toast as sonnerToast } from "sonner";

export const ERROR_TOAST_DURATION_MS = 8000;
export const WARNING_TOAST_DURATION_MS = 6000;

function errorToast(message, opts) {
  return sonnerToast.error(message, { duration: ERROR_TOAST_DURATION_MS, ...opts });
}

function warningToast(message, opts) {
  return sonnerToast.warning(message, { duration: WARNING_TOAST_DURATION_MS, ...opts });
}

// `toast` re-exported with `.error`/`.warning` overridden to the longer
// defaults above. All other members (success, info, message, promise,
// dismiss, custom, loading, ...) are passed through untouched via the
// prototype-less object below plus a fallback to the original function call
// signature (sonner's `toast` is itself callable, e.g. `toast("hi")`).
export const toast = Object.assign(
  (...args) => sonnerToast(...args),
  sonnerToast,
  {
    error: errorToast,
    warning: warningToast,
  }
);

// Convenience named exports for call sites that prefer them over
// `toast.error(...)` / `toast.warning(...)`.
export function showError(message, opts) {
  return errorToast(message, opts);
}

export function showWarning(message, opts) {
  return warningToast(message, opts);
}
