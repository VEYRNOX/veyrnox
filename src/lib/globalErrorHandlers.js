// @ts-nocheck
// Window-level catch-all for uncaught errors and unhandled promise
// rejections that escape React's ErrorBoundary tree (fire-and-forget
// promises, async callbacks outside a component's lifecycle, chunk-load
// failures on lazy routes). The browser only fires `unhandledrejection`
// when NO `.catch` handled the rejection, so this cannot double-toast on
// paths that already surface an error via `toast.error()`.
//
// Purely client-side: sanitised message, throttled toast, `console.error`
// of the raw error. No telemetry, no egress — I2/I3 safe.
import { toast } from "@/lib/toast";

const DEDUPE_WINDOW_MS = 5000;
let lastToastAt = 0;
let installed = false;

function toastOnce(message) {
  const now = Date.now();
  if (now - lastToastAt < DEDUPE_WINDOW_MS) return;
  lastToastAt = now;
  toast.error(message);
}

function isChunkLoadError(err) {
  const name = err && err.name;
  const msg = (err && (err.message || String(err))) || "";
  return (
    name === "ChunkLoadError" ||
    /Loading chunk [\w-]+ failed/i.test(msg) ||
    /Failed to fetch dynamically imported module/i.test(msg)
  );
}

// Spurious rejections from Capacitor plugin proxies whose `.then` accessor is
// routed to native as a method call and rejected as "not implemented on
// android". Nothing in the app actually awaits these plugin objects; the
// rejection is inert but leaks past the try/catch it originated in and
// surfaces here as an "uncaught" event. Suppress the user-facing toast for
// this specific shape only — the console.error above still logs it for
// debugging, and any real logic error keeps producing the generic toast.
//
// Seen on Android for @aparajita/capacitor-secure-storage; the same proxy
// shape is used across Capacitor plugins so the match is broad enough to
// cover a future recurrence without matching real errors.
function isCapacitorPluginThenNoise(err) {
  const msg = (err && (err.message || String(err))) || "";
  return /['"]\w+\.then\(\)['"] is not implemented on (android|ios|web)/i.test(msg);
}

function handle(err) {
  if (import.meta.env.DEV) {
    console.error("[globalErrorHandler]", err);
  } else {
    console.error("[globalErrorHandler] uncaught error");
  }
  if (isChunkLoadError(err)) {
    toastOnce("A new version is available. Reload to continue.");
    return;
  }
  if (isCapacitorPluginThenNoise(err)) {
    // Logged above, not toasted — plugin-side quirk, not a user-actionable error.
    return;
  }
  toastOnce("Something went wrong. Please try again.");
}

export function installGlobalErrorHandlers() {
  if (installed || typeof window === "undefined") return () => {};
  installed = true;
  const onError = (event) => handle(event.error || event.message);
  const onRejection = (event) => handle(event.reason);
  window.addEventListener("error", onError);
  window.addEventListener("unhandledrejection", onRejection);
  return () => {
    window.removeEventListener("error", onError);
    window.removeEventListener("unhandledrejection", onRejection);
    installed = false;
  };
}

export default installGlobalErrorHandlers;
