// @ts-nocheck
// src/components/SecurityPosture.jsx — dashboard WIDGET (compact card) showing the
// aggregate security-posture score. This is NOT a replacement for
// src/pages/SecurityDashboard.jsx (the full per-signal review page) — it is a small
// "how are we doing" summary meant for the main wallet page, and it links THROUGH to
// SecurityDashboard for the detailed breakdown ("Review" link -> /security-dashboard).
//
// SCORE SOURCE: src/lib/securityPosture.js `computePostureScore(state)` (spec
// §9.0.1a) — a pure function this component does not implement. This widget only
// renders whatever that function returns; it adds no new detection.
//
// STATE ASSEMBLY: `computePostureScore` scores five dimensions (authentication,
// device integrity, hardware binding, recovery, session security) from a
// `PostureState` object (see securityPosture.js's JSDoc typedef). This widget can
// only SAFELY self-detect a subset of that state from UI-reachable hooks
// (RASP tier, the biometric-unlock preference, hardware-KEK enrollment). The
// remaining fields — PIN length, Shamir recovery-share status, WalletConnect
// session settings — are NOT read here (no existing R2 facade for them was in
// scope for this widget), so they default to a conservative `false`/`null`
// (contributes 0 to that dimension, never fabricates a higher score — I4). The
// integrator (WalletPortfolioPage wiring, tracked separately) can supply real
// values for those fields via the optional `state` prop, which is shallow-merged
// OVER the self-detected fields:
//   <SecurityPosture state={{ pinCreated, pinLength, recoveryPassphraseSet, ... }} />
// Omitting the prop still renders a correct (if partial-information) score — never
// a crash, never a fabricated "safe".
//
// I3 (deniability): the score is computed LIVE from whatever session is currently
// live — a decoy/demo session naturally produces the DECOY's own score, because the
// self-detected inputs (useRaspArtifact, isBiometricUnlockEnabled,
// isHardwareKekEnrolled) already return decoy-scoped state; there is no
// isDecoy/isHidden branch here (same pattern as SecurityDashboard.jsx's RASP read).
// The only thing gated is the dismiss-state WRITE: dismissing this card must never
// write to shared localStorage from a decoy/demo session (C-1/K-2 pattern — see
// wallet-core/deniabilitySession.js and components/FirstRunTour.jsx for the
// precedent). Reads of a stored dismiss are left UNGATED: reading a primary
// session's prior dismissal from a decoy leaves no NEW trace, matching
// lib/consent.js's documented rationale.
//
// PERSISTENCE: the score itself is NEVER persisted (computed fresh on every mount —
// each credential set gets its own read). Only the "user dismissed this card"
// preference persists, and only for a primary session.
//
// localStorage key: veyrnox-posture-dismissed = JSON { at: number (ms), score: number (0-100) }
// Registered in wallet-core/panic.js METADATA_RESIDUE_KEYS.

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router';
import { Shield, ChevronRight, X } from 'lucide-react';
import { useRaspArtifact } from '../rasp/useRaspArtifact';
import { isBiometricUnlockEnabled } from '../lib/biometric';
// Ring boundary (eslint/rules/ring-import-lint.js): src/components must NOT import
// wallet-core/keystore/* directly. hardwareKekStatus.js is the R2 read-only facade
// (same pattern as lib/useKekEnrollmentGate.js) — it does the wallet-core import so
// this file doesn't have to.
import { isHardwareKekEnrolled } from '../lib/hardwareKekStatus';
import { isDeniabilityOrDemoActive } from '../wallet-core/deniabilitySession';
import { computePostureScore } from '../lib/securityPosture';

export const POSTURE_DISMISSED_KEY = 'veyrnox-posture-dismissed';

/** @type {readonly string[]} Fields callers must never override in deniability mode. */
const SECURITY_AUTHORITATIVE_FIELDS = ['raspTier', 'kekActive'];

function readDismissState() {
  // M-3: don't read dismiss state in deniability/demo — leaves no new trace,
  // but reading could reveal the real user's prior dismiss decision to a coerced observer.
  if (isDeniabilityOrDemoActive()) return null;
  try {
    const raw = localStorage.getItem(POSTURE_DISMISSED_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.at !== 'number' || typeof parsed.score !== 'number') return null;
    // M-3: range validation — reject out-of-bounds or non-finite values
    if (!Number.isFinite(parsed.score) || parsed.score < 0 || parsed.score > 100) return null;
    if (!Number.isFinite(parsed.at) || parsed.at <= 0) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeDismissState(score) {
  // I3: never write real dismiss state from a decoy/demo session.
  if (isDeniabilityOrDemoActive()) return;
  try {
    localStorage.setItem(POSTURE_DISMISSED_KEY, JSON.stringify({ at: Date.now(), score }));
  } catch {
    /* best-effort — dismiss preference is non-fatal */
  }
}

const ARC_RADIUS = 40;
const ARC_CIRCUMFERENCE = 2 * Math.PI * ARC_RADIUS;

/**
 * Compact dashboard widget: shield + arc meter, score, label, banner, Review link.
 * @param {{ state?: Partial<import('../lib/securityPosture').PostureState> }} props
 *   Optional PostureState fields this widget cannot self-detect (recovery / WC /
 *   PIN-length), shallow-merged over the self-detected fields.
 */
export default function SecurityPosture({ state: stateOverride } = {}) {
  // I3: RASP verdict is environment-only (set-blind by construction in degrade()) —
  // identical result in any session, same as SecurityDashboard.jsx's usage.
  const raspArtifact = useRaspArtifact();

  const [biometricOn] = useState(() => isBiometricUnlockEnabled());
  const [hardwareEnrolled, setHardwareEnrolled] = useState(false);
  const [dismissedState] = useState(() => readDismissState());
  const [justDismissed, setJustDismissed] = useState(false);

  const deniabilityActive = useMemo(() => isDeniabilityOrDemoActive(), []);

  useEffect(() => {
    // H-3: don't probe hardware KEK status in deniability/demo — the probe
    // reads native storage which could leave a timing/access trace.
    if (deniabilityActive) return;
    let cancelled = false;
    isHardwareKekEnrolled()
      .then((v) => { if (!cancelled) setHardwareEnrolled(!!v); })
      .catch(() => { if (!cancelled) setHardwareEnrolled(false); });
    return () => { cancelled = true; };
  }, [deniabilityActive]);

  // M-2: sanitize stateOverride — in deniability mode, strip security-authoritative
  // fields so callers cannot inflate the score with fabricated values. Live signals
  // (RASP, KEK) are applied AFTER the override, so they always win.
  const sanitizedOverride = useMemo(() => {
    if (!stateOverride) return undefined;
    if (!deniabilityActive) return stateOverride;
    const cleaned = { ...stateOverride };
    for (const field of SECURITY_AUTHORITATIVE_FIELDS) {
      delete cleaned[field];
    }
    return cleaned;
  }, [stateOverride, deniabilityActive]);

  const state = useMemo(() => ({
    // Self-detected (UI-reachable, safe):
    biometricEnabled: biometricOn,
    raspTier: raspArtifact?.tier,
    kekActive: hardwareEnrolled,
    // Not self-detected here — conservative default (0 points, never fabricated):
    pinCreated: false,
    pinLength: null,
    hardwareTier: null,
    recoveryPassphraseSet: false,
    shareAWrapped: false,
    shareBUploaded: false,
    shareCExported: false,
    shareCVerified: false,
    wcSpendLimitSet: false,
    wcSessionExpiry: false,
    wcStepUpReauth: false,
    // Integrator-supplied overrides (WalletPortfolioPage wiring) win —
    // but security-authoritative fields are stripped in deniability mode (M-2).
    ...sanitizedOverride,
    // Live signals applied LAST so they always win over any override:
    raspTier: raspArtifact?.tier,
    kekActive: hardwareEnrolled,
  }), [biometricOn, raspArtifact?.tier, hardwareEnrolled, sanitizedOverride]);

  const posture = useMemo(() => computePostureScore(state), [state]);

  const percent = Math.max(0, Math.min(100, Number(posture?.percentage) || 0));
  const color = posture?.color || '#4ADAC2';
  const label = posture?.label || '';
  const bannerMessage = posture?.bannerMessage || '';

  // A stored dismissal stays valid only while the CURRENT score has not dropped
  // below the score it was dismissed at ("score dropped -> re-show regardless of
  // dismiss"). A same-session Dismiss click hides immediately via justDismissed.
  const storedDismissStillValid = !!dismissedState && percent >= dismissedState.score;
  const hidden = justDismissed || storedDismissStillValid;

  function handleDismiss() {
    setJustDismissed(true);
    writeDismissState(percent);
  }

  if (hidden) return null;

  const dashOffset = ARC_CIRCUMFERENCE * (1 - percent / 100);

  return (
    <div className="p-4 rounded-xl border border-border bg-card" data-testid="security-posture-card">
      <div className="flex items-start gap-3">
        <div className="relative h-[72px] w-[72px] shrink-0" data-testid="posture-arc">
          <svg width="72" height="72" viewBox="0 0 96 96" className="-rotate-90" role="img"
            aria-label={`Security posture score: ${percent}%, ${label}`}>
            <circle cx="48" cy="48" r={ARC_RADIUS} fill="none" strokeWidth="8" className="stroke-secondary" />
            <circle
              cx="48" cy="48" r={ARC_RADIUS} fill="none" strokeWidth="8" strokeLinecap="round"
              style={{
                stroke: color,
                strokeDasharray: ARC_CIRCUMFERENCE,
                strokeDashoffset: dashOffset,
                transition: 'stroke-dashoffset 300ms ease, stroke 300ms ease',
              }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <Shield className="h-4 w-4 mb-0.5" style={{ color }} aria-hidden="true" />
            <span className="mono-value text-sm font-semibold leading-none" style={{ color }}>
              {percent}%
            </span>
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold" style={{ color }}>{label}</p>
            <button
              type="button"
              onClick={handleDismiss}
              aria-label="Dismiss security posture card"
              className="text-muted-foreground hover:text-foreground shrink-0"
              data-testid="posture-dismiss"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {bannerMessage && (
            <p className="text-xs text-muted-foreground mt-0.5" data-testid="posture-banner">
              {bannerMessage}
            </p>
          )}

          <Link
            to="/security-dashboard"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary mt-2 hover:underline"
          >
            Review
            {/* Icon mirrors under dir="rtl" — list-row disclosure chevron. */}
            <ChevronRight className="h-3 w-3 rtl:-scale-x-100" />
          </Link>
        </div>
      </div>
    </div>
  );
}
