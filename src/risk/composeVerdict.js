// @ts-nocheck
// src/risk/composeVerdict.js
//
// Shared transaction-intelligence verdict composer.
//
// This module does not replace the local risk scorer or the pure pre-sign gate.
// It sits between them and the UI, normalising the currently-separate planes
// (local tx risk, remote TIP threat intel, and runtime/RASP posture) into one
// explainable object. Pure only: no I/O, no network, no signer access.

import { LEVEL } from './levels.js';
import { TIER } from '@/rasp';

export const INTEL_LEVEL = Object.freeze({
  OK: 'OK',
  INFO: 'INFO',
  CAUTION: 'CAUTION',
  RISK: 'RISK',
  BLOCK: 'BLOCK',
});

// M-1 (2026-08-25 weekly audit) — the explicit rank table the headline level is
// maxed over. `level` used to initialise from the local verdict and the tip plane
// was reachable only via `!primaryReason`, so ONE INFO-level local signal
// suppressed a remote `block`: the object reported level:'INFO' beside a
// {id:'tip', level:'RISK'} contributor, and deriveSigningPolicy answered ALLOW.
const LEVEL_RANK = Object.freeze({
  [INTEL_LEVEL.OK]: 0,
  [INTEL_LEVEL.INFO]: 1,
  [INTEL_LEVEL.CAUTION]: 2,
  [INTEL_LEVEL.RISK]: 3,
  [INTEL_LEVEL.BLOCK]: 4,
});

// I4: a level this build does not recognise is not clean. INDETERMINATE carries
// the risk plane's own fail-closed escalation to CAUTION (levels.js); anything
// else unranked would otherwise sort as 0 and read as safe to sign.
function normaliseLevel(level) {
  if (level == null) return null;
  if (level === LEVEL.INDETERMINATE) return INTEL_LEVEL.CAUTION;
  return LEVEL_RANK[level] === undefined ? INTEL_LEVEL.CAUTION : level;
}

function rankOf(level) {
  return LEVEL_RANK[normaliseLevel(level) ?? INTEL_LEVEL.OK] ?? 0;
}

function maxLevel(a, b) {
  if (!b) return a;
  if (!a) return b;
  return rankOf(b) > rankOf(a) ? b : a;
}

function mapRuntimeLevel(raspTier) {
  switch (raspTier) {
    case TIER.ALLOW: return INTEL_LEVEL.OK;
    case TIER.WARN: return INTEL_LEVEL.CAUTION;
    case TIER.BLOCK: return INTEL_LEVEL.BLOCK;
    default: return INTEL_LEVEL.CAUTION;
  }
}

function mapTipLevel(tipResult) {
  switch (tipResult?.level) {
    case 'low': return INTEL_LEVEL.INFO;
    case 'medium': return INTEL_LEVEL.CAUTION;
    case 'high': return INTEL_LEVEL.RISK;
    default: return INTEL_LEVEL.OK;
  }
}

function withFallbackSummary(summary, fallback) {
  return typeof summary === 'string' && summary.trim() ? summary : fallback;
}

function normalizeSignal(signal) {
  if (!signal || typeof signal !== 'object') return null;
  if (!signal.level || signal.level === LEVEL.OK) return null;
  return {
    id: signal.id ?? 'UNKNOWN',
    level: signal.level,
    summary: signal.evidence?.reason ?? '',
    evidence: signal.evidence ?? null,
  };
}

function contributorById(contributors, id) {
  return contributors.find((c) => c.id === id) ?? null;
}

/**
 * Compose one shared UI verdict for the current transaction.
 *
 * @param {object} opts
 * @param {object|null} [opts.localVerdict]
 * @param {boolean} [opts.localApplicable]
 * @param {boolean} [opts.localSettled]
 * @param {object|null} [opts.tipResult]
 * @param {boolean} [opts.tipApplicable]
 * @param {boolean} [opts.tipSettled]
 * @param {object|null} [opts.review]
 * @param {string|null} [opts.raspTier]
 * @param {object|null} [opts.raspArtifact]
 * @param {object|null} [opts.presign]
 * @returns {{
 *   status: 'pending'|'ready',
 *   level: string,
 *   owner: string|null,
 *   primaryReason: string|null,
 *   evidence: object|null,
 *   localSignals: Array<object>,
 *   contributors: Array<object>,
 *   sourcesConsulted: Array<object>,
 *   unknowns: Array<object>,
 * }}
 */
export function composeTransactionVerdict({
  localVerdict = null,
  localApplicable = false,
  localSettled = false,
  tipResult = null,
  tipApplicable = false,
  tipSettled = false,
  review = null,
  raspTier = null,
  raspArtifact = null,
  presign = null,
} = {}) {
  const status = (localApplicable && !localSettled) || (tipApplicable && !tipSettled)
    ? 'pending'
    : 'ready';

  const localSignals = Array.isArray(localVerdict?.signals)
    ? localVerdict.signals.map(normalizeSignal).filter(Boolean)
    : [];

  const contributors = [
    {
      id: 'local',
      label: 'Local analysis',
      applicable: localApplicable,
      settled: !localApplicable || localSettled,
      level: localVerdict?.level ?? null,
      summary: localVerdict?.sentence ?? null,
      owner: localVerdict?.signalId ?? null,
    },
    {
      id: 'tip',
      label: 'Threat intelligence',
      applicable: tipApplicable,
      settled: !tipApplicable || tipSettled,
      level: tipResult ? mapTipLevel(tipResult) : null,
      summary: tipResult?.verdictReason
        ?? (tipResult?.risks?.[0]?.detail || null)
        ?? (tipSettled ? 'No remote threat signals returned.' : null),
      owner: tipResult?.verdict ?? null,
    },
    {
      id: 'review',
      label: 'Review & history',
      applicable: review?.applicable === true,
      settled: review?.settled !== false,
      level: review?.level ?? null,
      summary: review?.summary ?? null,
      owner: review?.evidence?.kind ?? null,
    },
    {
      id: 'runtime',
      label: 'Runtime safety',
      applicable: true,
      settled: true,
      level: mapRuntimeLevel(raspTier),
      summary: withFallbackSummary(raspArtifact?.sentence, 'Runtime integrity checks are active.'),
      owner: raspTier ?? null,
    },
  ];

  const unknowns = contributors
    .filter((c) => c.applicable && !c.settled)
    .map((c) => ({ id: c.id, reason: `${c.label} has not finished yet.` }));

  // The headline is the MAX over every VERDICT plane that both APPLIES and has
  // SETTLED. An unsettled or inapplicable plane contributes nothing (it is
  // reported through `unknowns`/`status` instead), so a stale payload on a plane
  // that does not apply to this tx can never raise the level.
  //
  // `review` is deliberately NOT a verdict plane and is deliberately absent from
  // this list. It is context ("first-time recipient for this wallet set"), not a
  // threat finding: its INFO is the common case for any new payee, so folding it
  // in would relabel every ordinary first send as INFO while changing no gate
  // decision (compose.js maps OK and INFO to the same DECISION.ALLOW). Its real
  // escalation route is `stackedRisk` below, which is where the design already
  // treats it as a modifier on top of a tip hit. If you add it here, expect
  // WalletConnectProvider.txRiskGate's "no risk fires" case to go red — that is
  // the guard, not a stale expectation.
  const LEVEL_PLANES = ['local', 'tip', 'runtime'];
  let level = contributors
    .filter((c) => LEVEL_PLANES.includes(c.id) && c.applicable && c.settled)
    .map((c) => normaliseLevel(c.level))
    .filter(Boolean)
    .reduce(maxLevel, INTEL_LEVEL.OK);
  let owner = 'local';
  let primaryReason = localVerdict?.sentence ?? null;
  let evidence = localVerdict?.evidence ?? null;
  const tipContributor = contributorById(contributors, 'tip');
  const reviewContributor = contributorById(contributors, 'review');
  const runtimeContributor = contributorById(contributors, 'runtime');
  // The tip plane owns the one sentence when it OUTRANKS local — otherwise the
  // headline would carry a RISK level beside local's INFO copy, which is the same
  // internal inconsistency M-1 is about, just moved one field over.
  const tipOutranksLocal = tipContributor?.applicable === true
    && tipContributor?.settled === true
    && rankOf(tipContributor.level)
      > (localApplicable && localSettled ? rankOf(localVerdict?.level) : 0);
  const stackedRisk = tipContributor?.applicable
    && tipContributor?.level === INTEL_LEVEL.RISK
    && reviewContributor?.applicable
    && reviewContributor?.level === INTEL_LEVEL.INFO
    && runtimeContributor?.level === INTEL_LEVEL.CAUTION;

  if (presign?.signerReachable === false) {
    level = INTEL_LEVEL.BLOCK;
    owner = 'runtime';
    primaryReason = withFallbackSummary(raspArtifact?.sentence, 'Signing is blocked by runtime safety policy.');
    evidence = null;
  } else if (stackedRisk) {
    // Escalation ON TOP of the max, never a replacement for it.
    level = maxLevel(level, INTEL_LEVEL.RISK);
    owner = 'composite';
    primaryReason = 'A first-time recipient, a remote threat-intel hit, and degraded runtime posture together make this transaction high risk.';
    evidence = {
      contributors: ['review', 'tip', 'runtime'],
    };
  } else if (presign?.owner === 'rasp' && raspArtifact?.sentence) {
    // Runtime owns the COPY. Its level is already inside the max above, so this
    // branch no longer overwrites (and previously could downgrade) `level`.
    owner = 'runtime';
    primaryReason = raspArtifact.sentence;
    evidence = null;
  } else if (tipOutranksLocal || (!primaryReason && tipResult?.risks?.length)) {
    owner = 'tip';
    primaryReason = tipResult?.risks?.[0]?.detail
      ?? tipResult?.verdictReason
      // A `block` verdict with no threat_signals rows is a shape TIP is allowed
      // to return (tipScreen.js). It must still say something rather than
      // silently carry a null reason next to a non-OK level.
      ?? 'Remote threat screening flagged this transaction.';
    evidence = null;
  }

  return {
    status,
    level: level ?? INTEL_LEVEL.OK,
    owner,
    primaryReason,
    evidence,
    localSignals,
    contributors,
    sourcesConsulted: Array.isArray(tipResult?.sourcesConsulted) ? tipResult.sourcesConsulted : [],
    unknowns,
  };
}
