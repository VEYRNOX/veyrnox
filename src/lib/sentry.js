// src/lib/sentry.js — consent-gated crash reporting.
//
// I2/I3 chokepoint. Sentry captures JS exceptions and unhandled promise
// rejections; a stack trace can incidentally carry seed fragments, PINs,
// addresses, or URL params. Every guard PR #1321 built for anonymous
// telemetry applies here, plus scrubbing on the wire.
//
// initSentry() must run BEFORE React renders so window.onerror/onunhandled
// rejection listeners are installed early. It is a NO-OP when:
//   - VITE_SENTRY_DSN is unset (fail-closed on unconfigured envs)
//   - DEMO or isDeniabilityOrDemoActive() is true (I3 — no egress in decoy)
//   - hasConsent() is false (I2 — opt-in only, same gate as trackEvent)
//
// beforeSend strips: URL query/hash, referrer, cookies, request headers,
// breadcrumbs (may capture inputs), user/IP. Kept: exception type, message,
// stack frames with filename/line/column. If message pattern-matches a
// secret-looking token (long hex/base58/base64), the event is DROPPED.
//
// Not wired: source-map upload, session replay, performance tracing, native
// SDKs. Add when a real crash needs the extra context.

import * as Sentry from '@sentry/react';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { DEMO } from '@/api/demoClient';
import { hasConsent } from '@/lib/consent';

let initialised = false;

// Long hex (seed-word derived key hex), base58 (SOL keys), base64 (envelopes),
// or 12/24-word mnemonics. If ANY match appears in the event, drop it.
const SECRET_PATTERNS = [
  /\b[0-9a-fA-F]{64,}\b/,
  /\b[1-9A-HJ-NP-Za-km-z]{43,88}\b/,
  /\b[A-Za-z0-9+/]{60,}={0,2}\b/,
  /\b(?:[a-z]+\s+){11,23}[a-z]+\b/i,
];

function looksSecret(str) {
  if (typeof str !== 'string' || str.length < 32) return false;
  return SECRET_PATTERNS.some((re) => re.test(str));
}

function scrub(event) {
  // Drop request details entirely — never send URL, query, cookies, body.
  event.request = undefined;
  event.user = undefined;
  event.server_name = undefined;
  event.breadcrumbs = [];
  event.contexts = event.contexts || {};
  delete event.contexts.device;
  delete event.contexts.culture;
  delete event.contexts.browser;

  const values = event.exception?.values || [];
  for (const v of values) {
    if (looksSecret(v.value)) return null;
    if (v.value && v.value.length > 500) v.value = v.value.slice(0, 500);
    const frames = v.stacktrace?.frames || [];
    for (const f of frames) {
      delete f.vars;
      delete f.pre_context;
      delete f.post_context;
      delete f.context_line;
    }
  }
  return event;
}

export function initSentry() {
  if (initialised) return;
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  if (!dsn) return;
  if (DEMO || isDeniabilityOrDemoActive()) return;
  if (!hasConsent()) return;

  Sentry.init({
    dsn,
    release: import.meta.env.VITE_RELEASE || undefined,
    environment: import.meta.env.VITE_ENV_LABEL || import.meta.env.MODE,
    // No auto-instrumentation of network / navigation / UI clicks — those
    // are the breadcrumb sources that capture inputs and URLs.
    defaultIntegrations: false,
    integrations: [
      Sentry.globalHandlersIntegration(),
      Sentry.dedupeIntegration(),
      Sentry.functionToStringIntegration(),
    ],
    sendDefaultPii: false,
    tracesSampleRate: 0,
    beforeSend: scrub,
    beforeBreadcrumb: () => null,
  });

  initialised = true;
}

// For ErrorBoundary. Silently no-ops if init did not run.
export function reportError(error, errorInfo) {
  if (!initialised) return;
  try {
    Sentry.captureException(error, { extra: { componentStack: errorInfo?.componentStack } });
  } catch { /* never surface a reporter failure */ }
}
