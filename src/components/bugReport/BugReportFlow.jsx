// @ts-nocheck
// src/components/bugReport/BugReportFlow.jsx
//
// Slice 1a-1d of the opt-in bug-report recording feature. See
// docs/bug-report-recording-plan.md for the full contract.
//
// Renders the state machine that walks a user through:
//   explainer → countdown (3-2-1) → recording → review → done
//
// Runtime effect: NONE on any current build. Slice 1b's BugReportButton
// only opens this flow when isBugReportEnabled() returns true, which
// requires VITE_BUG_REPORT_ENABLED='1' (default OFF) plus native + not-
// deniability. All three false on every shipped build, so the button
// self-hides and this component never mounts.
//
// Slice history:
//   1c added state machine + explainer + countdown + recording UI + 30s
//      cap + visibilitychange kill switch.
//   1d added mock capture handle, review screen (Send / Delete / Cancel),
//      and route-change kill switch via useRouteKillSwitch.
//
// Kill switches now live:
//   - Cancel button on every screen
//   - X close button
//   - visibilitychange -> abort while recording
//   - 30s hard cap in recording
//   - route change into a denied route -> abort while recording OR review
//
// Kill switches DEFERRED (need real capture / native events to be meaningful):
//   - App-lock event  (Slice 1e or Slice 2)
//   - Panic-wipe event (Slice 1e or Slice 2)

import { useState, useEffect, useCallback, useRef } from 'react';
import { Capacitor } from '@capacitor/core';
import { X } from 'lucide-react';
import { startCapture } from '@/lib/bugReport/captureBridge';
import { useRouteKillSwitch } from '@/lib/bugReport/useRouteKillSwitch';
import { sendBugReport } from '@/lib/bugReport/uploadClient';
import { PLACEHOLDER_SUPPORT_PUBLIC_KEY } from '@/lib/bugReport/encrypt';

const RECORDING_CAP_MS = 30_000;
const COUNTDOWN_START = 3;

// Read once at module load — Vite inlines this, so the constant is
// dead-code-friendly and doesn't cost anything on the shipped bundle.
// Slice 3 will replace with a version pulled from Capacitor's App info
// at runtime (or a build-time inject) so the support triage identifier
// matches the actual shipping build. Hardcoded for now to avoid
// depending on @capacitor/app just for this string.
const APP_VERSION = '1.0.1';

export default function BugReportFlow({ open, onClose }) {
  const [state, setState] = useState('explainer');
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [captureResult, setCaptureResult] = useState(null);
  const [ticketId, setTicketId] = useState(null);
  const [sendError, setSendError] = useState(null);
  const captureHandleRef = useRef(null);

  // Reset to explainer whenever the flow reopens; a stale terminal state
  // from a previous session must not leak into a fresh open.
  useEffect(() => {
    if (open) {
      setState('explainer');
      setCountdown(COUNTDOWN_START);
      setElapsedMs(0);
      setCaptureResult(null);
      setTicketId(null);
      setSendError(null);
      captureHandleRef.current = null;
    }
  }, [open]);

  // Central close helper. Aborts any live capture handle before unmounting
  // so a buffer never survives the flow. Slice 1e adds encryption + upload
  // — the abort-on-close guarantee must hold before then to keep the
  // "nothing leaves the device unless Send is tapped" property honest.
  const close = useCallback(() => {
    if (captureHandleRef.current) {
      try { captureHandleRef.current.abort(); } catch {}
      captureHandleRef.current = null;
    }
    setState('explainer');
    setCountdown(COUNTDOWN_START);
    setElapsedMs(0);
    setCaptureResult(null);
    onClose?.();
  }, [onClose]);

  // Countdown ticker: 3 -> 2 -> 1 -> transition to 'recording'.
  // Single setInterval, both the decrement and the transition fire from the
  // one callback — no cross-effect handoff, no dependence on React batching
  // a setState-inside-a-setState. Tests using fake timers see the state
  // change on the same act() flush as the last tick.
  useEffect(() => {
    if (state !== 'countdown') return;
    const interval = setInterval(() => {
      setCountdown((c) => {
        const next = c - 1;
        if (next <= 0) {
          setState('recording');
          clearInterval(interval);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [state]);

  // Start capture on entering 'recording'; keep the handle for stop/abort.
  useEffect(() => {
    if (state !== 'recording') return;
    let cancelled = false;
    startCapture().then((handle) => {
      if (cancelled) { try { handle.abort(); } catch {} return; }
      captureHandleRef.current = handle;
    }).catch(() => { /* mock cannot fail; real capture will surface here */ });
    return () => { cancelled = true; };
  }, [state]);

  // Recording ticker + 30s hard cap. On cap-hit, stop the capture and
  // move to review — same shape as the user tapping Stop.
  useEffect(() => {
    if (state !== 'recording') return;
    const start = Date.now();
    const interval = setInterval(() => {
      const el = Date.now() - start;
      setElapsedMs(el);
      if (el >= RECORDING_CAP_MS) {
        clearInterval(interval);
        stopAndReview();
      }
    }, 100);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // Stop capture and transition to review. Isolated so both the 30s cap
  // and the Stop button call the same path.
  const stopAndReview = useCallback(() => {
    const handle = captureHandleRef.current;
    captureHandleRef.current = null;
    if (!handle) { setState('review'); setCaptureResult(null); return; }
    handle.stop().then((result) => {
      setCaptureResult(result);
      setState('review');
    }).catch(() => {
      // If the capture handle failed (e.g. real plugin returned an error),
      // do NOT silently succeed — close the flow and let the user try
      // again. Explicit fail-closed matches I4.
      close();
    });
  }, [close]);

  // visibilitychange kill switch: abort while recording (I2 - no silent
  // capture continuing behind another app). No effect in other states -
  // an explainer or countdown that pauses when backgrounded is fine.
  useEffect(() => {
    if (state !== 'recording') return;
    const onVis = () => {
      if (document.visibilityState === 'hidden') close();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [state, close]);

  // Route kill switch: navigation into a denied route while a recording is
  // armed (recording OR review — review still holds a capture buffer) aborts
  // the flow. See src/lib/bugReport/recordableRoutes.js for the allow/deny
  // lists and useRouteKillSwitch.js for the hook's contract.
  useRouteKillSwitch({
    active: state === 'recording' || state === 'review',
    onAbort: close,
  });

  const onSend = useCallback(async () => {
    setSendError(null);
    setState('sending');
    try {
      // captureResult.blob is a Uint8Array on native (slice 2c). On web
      // it is null and sendBugReport throws BUG_REPORT_NO_CAPTURE — the
      // review button should never have been reachable in that case
      // because the whole feature is gated behind isBugReportEnabled().
      const platform = (() => {
        try { return Capacitor.getPlatform(); } catch { return 'web'; }
      })();
      // Support key: PLACEHOLDER (all zeros) until slice 3 replaces it
      // with a real x25519 public key generated on an offline device.
      // encrypt.js refuses the placeholder, so onSend fails clearly
      // rather than shipping ciphertext no one can decrypt. That is the
      // correct behaviour for a slice-2 build.
      const { report_id } = await sendBugReport({
        captureBuffer: captureResult?.blob ?? null,
        deviceId: crypto.randomUUID(),
        platform: platform === 'ios' ? 'ios' : 'android',
        appVersion: APP_VERSION,
        supportPublicKey: PLACEHOLDER_SUPPORT_PUBLIC_KEY,
      });
      setTicketId(report_id);
      setState('sent');
    } catch (e) {
      setSendError(e?.message || 'Send failed');
      setState('error');
    }
  }, [captureResult]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="bug-report-title"
      data-testid="bug-report-flow"
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-4"
    >
      <div className="w-full max-w-md rounded-2xl border border-border bg-background p-6 shadow-2xl">
        <div className="flex items-start justify-between mb-4">
          <h2 id="bug-report-title" className="text-lg font-semibold">
            {state === 'explainer' && 'Report a problem'}
            {state === 'countdown' && 'Recording starts in…'}
            {state === 'recording' && 'Recording'}
            {state === 'review' && 'Review recording'}
            {state === 'sending' && 'Sending…'}
            {state === 'sent' && 'Report sent'}
            {state === 'error' && 'Send failed'}
          </h2>
          <button
            type="button"
            onClick={close}
            data-testid="bug-report-close"
            aria-label="Cancel"
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {state === 'explainer' && (
          <div data-testid="bug-report-explainer">
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              We can record up to 30 seconds of your screen so you can show us
              what went wrong. You'll watch it back before deciding whether to
              send it.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Sensitive screens — seed phrase, PIN, transaction signing —
              automatically pause recording. Nothing leaves your device
              unless you tap Send.
            </p>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={() => { setCountdown(COUNTDOWN_START); setState('countdown'); }}
                data-testid="bug-report-continue"
                className="w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                Continue
              </button>
              <button
                type="button"
                onClick={close}
                data-testid="bug-report-cancel"
                className="w-full min-h-[44px] rounded-xl border border-border text-foreground hover:bg-card transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {state === 'countdown' && (
          <div data-testid="bug-report-countdown" className="text-center py-6">
            <p className="text-6xl font-semibold text-primary mono-value" aria-live="polite">
              {countdown > 0 ? countdown : 'Go'}
            </p>
            <p className="text-sm text-muted-foreground mt-4">
              Recording begins when the counter reaches zero.
            </p>
          </div>
        )}

        {state === 'recording' && (
          <div data-testid="bug-report-recording">
            <div className="flex items-center justify-center gap-3 py-4">
              <span className="h-3 w-3 rounded-full bg-red-500 animate-pulse" aria-hidden="true" />
              <p className="text-sm font-medium">
                <span className="mono-value">
                  {Math.floor(elapsedMs / 1000).toString().padStart(2, '0')}
                </span>
                {' / 30 s'}
              </p>
            </div>
            <p className="text-xs text-muted-foreground text-center mb-4">
              Capture handle is mocked in slice 1d. Real capture lands in slice 2.
            </p>
            <button
              type="button"
              onClick={stopAndReview}
              data-testid="bug-report-stop"
              className="w-full min-h-[44px] rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
            >
              Stop
            </button>
          </div>
        )}

        {state === 'review' && (
          <div data-testid="bug-report-review">
            <div className="rounded-xl border border-border bg-card p-4 mb-4 text-center">
              <p className="text-sm font-medium mb-1">Recording captured</p>
              <p className="text-xs text-muted-foreground">
                Source: <span className="mono-value">{captureResult?.source ?? 'unknown'}</span>
                {' · '}
                Duration: <span className="mono-value">
                  {Math.round((captureResult?.durationMs ?? 0) / 100) / 10}s
                </span>
              </p>
              <p className="text-xs text-muted-foreground mt-3">
                Preview player lands in slice 1e — the current handle
                returns metadata only (no video buffer yet).
              </p>
            </div>
            <div className="grid gap-2">
              <button
                type="button"
                onClick={onSend}
                data-testid="bug-report-send"
                className="w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
              >
                Send to support
              </button>
              <button
                type="button"
                onClick={close}
                data-testid="bug-report-delete"
                className="w-full min-h-[44px] rounded-xl border border-border text-foreground hover:bg-card transition-colors"
              >
                Delete and close
              </button>
            </div>
          </div>
        )}

        {state === 'sending' && (
          <div data-testid="bug-report-sending" className="text-center py-6">
            <p className="text-sm text-muted-foreground">
              Encrypting on your device and uploading…
            </p>
          </div>
        )}

        {state === 'sent' && (
          <div data-testid="bug-report-sent">
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              Thanks — the recording is on its way to support.
            </p>
            <p className="text-sm text-muted-foreground leading-relaxed mb-4">
              Reference this ticket ID if you email us about the issue:
            </p>
            <div className="rounded-xl border border-border bg-card p-4 mb-4 text-center">
              <p className="mono-value text-sm break-all">{ticketId ?? ''}</p>
            </div>
            <button
              type="button"
              onClick={close}
              data-testid="bug-report-done"
              className="w-full min-h-[44px] rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors"
            >
              Done
            </button>
          </div>
        )}

        {state === 'error' && (
          <div data-testid="bug-report-error">
            <p className="text-sm text-muted-foreground leading-relaxed mb-3">
              We couldn't send the report. Your recording was not
              uploaded.
            </p>
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 mb-4">
              <p className="text-xs text-destructive mono-value break-all">
                {sendError ?? 'Unknown error'}
              </p>
            </div>
            <button
              type="button"
              onClick={close}
              data-testid="bug-report-error-close"
              className="w-full min-h-[44px] rounded-xl border border-border text-foreground hover:bg-card transition-colors"
            >
              Close
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
