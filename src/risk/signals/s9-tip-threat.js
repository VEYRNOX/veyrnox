// @ts-nocheck
// S9 — TIP remote threat intelligence.
//
// Unlike S1–S8 (pure, local, synchronous), S9 is async and depends on a
// pre-fetched TIP screening result passed via chainData.tipResult. The
// score() caller (SendCrypto.jsx) fetches TIP before scoring and injects
// the result — S9 itself makes NO network calls. If chainData.tipResult
// is absent (opt-out, deniability, unconfigured), S9 returns OK so it
// contributes nothing to the composite.
//
// I3: returns OK when tipResult is null (deniability suppresses the fetch).
// I5: backend untrusted — S9 is just one signal in the composite; score()
//     picks the highest-priority across all signals. TIP cannot downgrade a
//     higher local signal.

import { LEVEL } from '../levels.js';
import { isStaticSanctionedEvm } from './static-ofac-list.js';

/**
 * @param {{ to?: string }} unsignedTx  recipient address is the only field read here
 * @param {object} _localState   unused
 * @param {{ tipResult?: { verdict: string, sanctions: boolean, signals: Array } | null }} chainData
 * @returns {{ level: string, evidence: { reason: string, values?: object } }}
 */
export function s9TipThreat(unsignedTx, _localState, chainData) {
  // Issue #1664 — belt-and-braces static OFAC fallback. TIP has drifted before
  // (Advisor vs Send Preview called with different `actionType`, only one path
  // set `sanctions_hit`), so we check a small hard-coded set of well-known
  // sanctioned mixer contracts FIRST. If the recipient is on the static list,
  // force RISK regardless of what TIP said (I5: backend untrusted). List is
  // deliberately small — see static-ofac-list.js for scope + failure mode.
  if (isStaticSanctionedEvm(unsignedTx?.to)) {
    return {
      level: LEVEL.RISK,
      evidence: {
        reason: 'This address appears on the OFAC sanctions list. Sending is strongly discouraged.',
        values: { source: 'Static OFAC fallback (belt-and-braces to TIP)' },
      },
    };
  }

  const tip = chainData?.tipResult;
  if (!tip) {
    return { level: LEVEL.OK, evidence: { reason: '' } };
  }

  if (tip.sanctions) {
    return {
      level: LEVEL.RISK,
      evidence: {
        reason: 'This address appears on a sanctions list. Sending is strongly discouraged.',
        values: { source: 'TIP Threat Intelligence' },
      },
    };
  }

  if (tip.verdict === 'block') {
    return {
      level: LEVEL.RISK,
      evidence: {
        reason: tipSentence(tip.signals, 'Known threat detected by threat intelligence screening.'),
        values: tipValues(tip.signals),
      },
    };
  }

  if (tip.verdict === 'warn') {
    return {
      level: LEVEL.CAUTION,
      evidence: {
        reason: tipSentence(tip.signals, 'Recipient flagged by threat intelligence screening.'),
        values: tipValues(tip.signals),
      },
    };
  }

  if (tip.verdict === 'error') {
    return {
      level: LEVEL.CAUTION,
      evidence: { reason: 'Remote threat screening could not complete. Proceed with caution.' },
    };
  }

  // M-4 — only an EXPLICIT allow is OK. This used to be a bare fall-through to
  // OK, so a verdict this build did not recognise — renamed, absent, a future
  // value, or attacker-supplied — read as "no threat". tipScreen.js now
  // validates the shape upstream, but S9 is reachable from anywhere that
  // populates chainData.tipResult, and "the caller already validated it" is the
  // same advisory-contract mistake H-6 was about.
  if (tip.verdict === 'allow') {
    return { level: LEVEL.OK, evidence: { reason: '' } };
  }

  return {
    level: LEVEL.CAUTION,
    evidence: { reason: 'Remote threat screening returned an unrecognised result. Proceed with caution.' },
  };
}

function tipSentence(signals, fallback) {
  if (!signals || signals.length === 0) return fallback;
  const top = signals[0];
  const type = top.signal_type?.replace(/_/g, ' ') || 'threat';
  const pct = Math.round((top.confidence || 0) * 100);
  return `${type} (${pct}% confidence, ${top.source || 'unknown source'}).`;
}

function tipValues(signals) {
  if (!signals || signals.length === 0) return {};
  const top = signals[0];
  return {
    signal: top.signal_type || 'unknown',
    source: top.source || 'unknown',
    ...(top.value && { address: top.value }),
  };
}
