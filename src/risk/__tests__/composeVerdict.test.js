import { describe, expect, it } from 'vitest';

import { composeTransactionVerdict, INTEL_LEVEL } from '@/risk/composeVerdict.js';
import { LEVEL } from '@/risk/levels.js';
import { TIER } from '@/rasp';

describe('composeTransactionVerdict', () => {
  it('reports pending while an applicable contributor is still unsettled', () => {
    const verdict = composeTransactionVerdict({
      localApplicable: true,
      localSettled: false,
      tipApplicable: false,
      raspTier: TIER.ALLOW,
    });
    expect(verdict.status).toBe('pending');
    expect(verdict.unknowns).toEqual([{ id: 'local', reason: 'Local analysis has not finished yet.' }]);
  });

  it('promotes a presign hard block to the overall BLOCK level', () => {
    const verdict = composeTransactionVerdict({
      localVerdict: { level: LEVEL.RISK, sentence: 'Unlimited approval.', evidence: null, signals: [] },
      localApplicable: true,
      localSettled: true,
      raspTier: TIER.BLOCK,
      raspArtifact: { sentence: 'Runtime safety check failed.' },
      presign: { signerReachable: false, owner: 'rasp' },
    });
    expect(verdict.level).toBe(INTEL_LEVEL.BLOCK);
    expect(verdict.owner).toBe('runtime');
    expect(verdict.primaryReason).toBe('Runtime safety check failed.');
  });

  it('uses the RASP sentence when the gate says runtime owns the decision', () => {
    const verdict = composeTransactionVerdict({
      localVerdict: { level: LEVEL.CAUTION, sentence: 'Remote screening unavailable.', evidence: null, signals: [] },
      localApplicable: true,
      localSettled: true,
      raspTier: TIER.WARN,
      raspArtifact: { sentence: 'Device integrity could not be confirmed.' },
      presign: { signerReachable: true, owner: 'rasp' },
    });
    expect(verdict.level).toBe(INTEL_LEVEL.CAUTION);
    expect(verdict.owner).toBe('runtime');
    expect(verdict.primaryReason).toBe('Device integrity could not be confirmed.');
  });

  it('surfaces non-OK local signals for the UI', () => {
    const verdict = composeTransactionVerdict({
      localVerdict: {
        level: LEVEL.RISK,
        sentence: 'Unlimited approval.',
        evidence: { values: { spender: '0xabc' } },
        signalId: 'S2',
        signals: [
          { id: 'S2', level: LEVEL.RISK, evidence: { reason: 'Unlimited approval.' } },
          { id: 'S1', level: LEVEL.OK, evidence: { reason: '' } },
        ],
      },
      localApplicable: true,
      localSettled: true,
      tipApplicable: true,
      tipSettled: true,
      tipResult: { level: 'high', sourcesConsulted: [{ source: 'tip', status: 'hit', latency_ms: 12 }] },
      raspTier: TIER.ALLOW,
    });
    expect(verdict.localSignals).toHaveLength(1);
    expect(verdict.localSignals[0].id).toBe('S2');
    expect(verdict.sourcesConsulted).toHaveLength(1);
  });

  it('renders review and history as a separate contributor', () => {
    const verdict = composeTransactionVerdict({
      localVerdict: {
        level: LEVEL.OK,
        sentence: null,
        evidence: null,
        signals: [],
      },
      localApplicable: true,
      localSettled: true,
      review: {
        applicable: true,
        settled: true,
        level: 'INFO',
        summary: 'This looks like a first-time recipient for this wallet set.',
        evidence: { kind: 'first_time_recipient' },
      },
      tipApplicable: false,
      tipSettled: true,
      raspTier: TIER.ALLOW,
    });
    expect(verdict.contributors).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'review',
          applicable: true,
          settled: true,
          level: 'INFO',
          summary: 'This looks like a first-time recipient for this wallet set.',
        }),
      ]),
    );
  });

  it('promotes stacked review + tip + runtime signals into a composite high-risk reason', () => {
    const verdict = composeTransactionVerdict({
      localVerdict: {
        level: LEVEL.OK,
        sentence: null,
        evidence: null,
        signals: [],
      },
      localApplicable: true,
      localSettled: true,
      tipResult: {
        level: 'high',
        verdict: 'block',
        risks: [{ detail: 'Known threat detected by threat intelligence screening.' }],
      },
      tipApplicable: true,
      tipSettled: true,
      review: {
        applicable: true,
        settled: true,
        level: 'INFO',
        summary: 'This looks like a first-time recipient for this wallet set.',
        evidence: { kind: 'first_time_recipient' },
      },
      raspTier: TIER.WARN,
      raspArtifact: { sentence: 'Device integrity could not be confirmed.' },
      presign: { signerReachable: true, owner: 'tx' },
    });
    expect(verdict.level).toBe(INTEL_LEVEL.RISK);
    expect(verdict.owner).toBe('composite');
    expect(verdict.primaryReason).toMatch(/first-time recipient/i);
    expect(verdict.evidence).toEqual({ contributors: ['review', 'tip', 'runtime'] });
  });
});
