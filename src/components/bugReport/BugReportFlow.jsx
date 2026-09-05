// @ts-nocheck
// src/components/bugReport/BugReportFlow.jsx
//
// Slice 1c of the opt-in bug-report recording feature. See
// docs/bug-report-recording-plan.md for the full contract.
//
// Renders the state machine that walks a user through explainer → consent +
// countdown → recording (mock in this slice) → back to settings. No capture,
// no upload, no encryption in this slice; those land in 1d + 1e.
//
// Runtime effect: NONE on any current build. Slice 1b's BugReportButton
// only opens this flow when isBugReportEnabled() returns true, which
// requires VITE_BUG_REPORT_ENABLED='1' (default OFF) plus native + not-
// deniability. All three false on every shipped build, so the button
// self-hides and this component never mounts.
//
// State machine:
//   'explainer'   — first sheet, user confirms they understand what happens
//   'countdown'   — 3-2-1 before capture would begin (mock in this slice)
//   'recording'   — 30s timer + STOP button (no actual capture yet)
//   'done'        — closes flow (parent unmounts)
//
// Kill switches implemented in this slice:
//   - Cancel button on every screen
//   - Escape key (via Dialog primitive's built-in handler)
//   - visibilitychange -> abort while recording
//   - 30s hard cap in the recording state
//
// Kill switches DEFERRED to slice 1d (need real capture to be meaningful):
//   - Route change into a denied route
//   - App-lock event
//   - Panic-wipe event

import { useState, useEffect, useCallback } from 'react';
import { X } from 'lucide-react';

const RECORDING_CAP_MS = 30_000;
const COUNTDOWN_START = 3;

export default function BugReportFlow({ open, onClose }) {
  const [state, setState] = useState('explainer');
  const [countdown, setCountdown] = useState(COUNTDOWN_START);
  const [elapsedMs, setElapsedMs] = useState(0);

  // Reset to explainer whenever the flow reopens; a stale terminal state
  // from a previous session must not leak into a fresh open.
  useEffect(() => {
    if (open) {
      setState('explainer');
      setCountdown(COUNTDOWN_START);
      setElapsedMs(0);
    }
  }, [open]);

  const close = useCallback(() => {
    setState('explainer');
    setCountdown(COUNTDOWN_START);
    setElapsedMs(0);
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

  // Recording ticker + 30s hard cap
  useEffect(() => {
    if (state !== 'recording') return;
    const start = Date.now();
    const interval = setInterval(() => {
      const el = Date.now() - start;
      setElapsedMs(el);
      if (el >= RECORDING_CAP_MS) {
        clearInterval(interval);
        // Slice 1c: no capture to finalise, just close. Slice 1d transitions
        // to 'playback' here with the captured buffer.
        close();
      }
    }, 100);
    return () => clearInterval(interval);
  }, [state, close]);

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
              Slice 1c: capture not wired yet. This is the countdown UI only.
            </p>
            <button
              type="button"
              onClick={close}
              data-testid="bug-report-stop"
              className="w-full min-h-[44px] rounded-xl bg-red-600 text-white font-medium hover:bg-red-700 transition-colors"
            >
              Stop
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
