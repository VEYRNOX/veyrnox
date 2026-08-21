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

  let level = localVerdict?.level ?? INTEL_LEVEL.OK;
  let owner = 'local';
  let primaryReason = localVerdict?.sentence ?? null;
  let evidence = localVerdict?.evidence ?? null;
  const tipContributor = contributorById(contributors, 'tip');
  const reviewContributor = contributorById(contributors, 'review');
  const runtimeContributor = contributorById(contributors, 'runtime');
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
    level = INTEL_LEVEL.RISK;
    owner = 'composite';
    primaryReason = 'A first-time recipient, a remote threat-intel hit, and degraded runtime posture together make this transaction high risk.';
    evidence = {
      contributors: ['review', 'tip', 'runtime'],
    };
  } else if (presign?.owner === 'rasp' && raspArtifact?.sentence) {
    level = mapRuntimeLevel(raspTier);
    owner = 'runtime';
    primaryReason = raspArtifact.sentence;
    evidence = null;
  } else if (!primaryReason && tipResult?.risks?.length) {
    level = mapTipLevel(tipResult);
    owner = 'tip';
    primaryReason = tipResult.risks[0]?.detail ?? null;
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
