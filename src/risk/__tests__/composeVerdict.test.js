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

  // M-1 (2026-08-25 weekly audit). `level` used to initialise from the local
  // verdict and the tip branch was gated on `!primaryReason`. score() sets a
  // sentence as soon as any signal beats OK, so a single INFO-level local signal
  // permanently suppressed the tip plane and a remote `block` was reported as
  // INFO — a headline level that contradicted the object's own contributors.
  describe('M-1 — level is the max over applicable, settled contributors', () => {
    it('does not let an INFO local sentence suppress a RISK tip contributor', () => {
      const verdict = composeTransactionVerdict({
        localVerdict: {
          level: LEVEL.INFO,
          sentence: 'This contract has been seen before.',
          evidence: null,
          signalId: 'S1',
          signals: [{ id: 'S1', level: LEVEL.INFO, evidence: { reason: 'This contract has been seen before.' } }],
        },
        localApplicable: true,
        localSettled: true,
        tipResult: {
          verdict: 'block',
          level: 'high',
          risks: [{ detail: 'Known threat detected by threat intelligence screening.' }],
        },
        tipApplicable: true,
        tipSettled: true,
        raspTier: TIER.ALLOW,
        presign: { signerReachable: true, owner: 'tx' },
      });

      expect(verdict.level).toBe(INTEL_LEVEL.RISK);
      // Internal consistency: the headline may never sit below its own contributors.
      const tip = verdict.contributors.find((c) => c.id === 'tip');
      expect(tip.level).toBe(INTEL_LEVEL.RISK);
      expect(verdict.owner).toBe('tip');
    });

    it('escalates for a CAUTION tip contributor with no risk rows at all', () => {
      const verdict = composeTransactionVerdict({
        localVerdict: {
          level: LEVEL.INFO,
          sentence: 'This contract has been seen before.',
          evidence: null,
          signalId: 'S1',
          signals: [],
        },
        localApplicable: true,
        localSettled: true,
        tipResult: { verdict: 'unknown', level: 'medium', risks: [] },
        tipApplicable: true,
        tipSettled: true,
        raspTier: TIER.ALLOW,
      });
      expect(verdict.level).toBe(INTEL_LEVEL.CAUTION);
    });

    it('never lets an unsettled or inapplicable contributor raise the level', () => {
      const verdict = composeTransactionVerdict({
        localVerdict: { level: LEVEL.OK, sentence: null, evidence: null, signals: [] },
        localApplicable: true,
        localSettled: true,
        // A stale RISK payload on a plane that does not apply to this tx.
        tipResult: { verdict: 'block', level: 'high', risks: [{ detail: 'stale' }] },
        tipApplicable: false,
        tipSettled: true,
        raspTier: TIER.ALLOW,
      });
      expect(verdict.level).toBe(INTEL_LEVEL.OK);
    });

    it('keeps the in-app Send screen unchanged when local already owns the max', () => {
      const verdict = composeTransactionVerdict({
        localVerdict: {
          level: LEVEL.RISK,
          sentence: 'This approval grants unlimited spending.',
          evidence: { values: { spender: '0xabc' } },
          signalId: 'S2',
          signals: [{ id: 'S2', level: LEVEL.RISK, evidence: { reason: 'This approval grants unlimited spending.' } }],
        },
        localApplicable: true,
        localSettled: true,
        // Send screen runs S9 inside score(), so the tip plane is already folded
        // into the local level; an allow verdict maps to OK here.
        tipResult: { verdict: 'allow', level: 'info', risks: [] },
        tipApplicable: true,
        tipSettled: true,
        raspTier: TIER.ALLOW,
        presign: { signerReachable: true, owner: 'tx' },
      });
      expect(verdict.level).toBe(INTEL_LEVEL.RISK);
      expect(verdict.owner).toBe('local');
      expect(verdict.primaryReason).toBe('This approval grants unlimited spending.');
    });

    it('keeps the review plane as context, not a level driver', () => {
      const verdict = composeTransactionVerdict({
        localVerdict: { level: LEVEL.OK, sentence: null, evidence: null, signals: [] },
        localApplicable: true,
        localSettled: true,
        tipApplicable: false,
        review: {
          applicable: true,
          settled: true,
          level: 'INFO',
          summary: 'This looks like a first-time recipient for this wallet set.',
          evidence: { kind: 'first_time_recipient' },
        },
        raspTier: TIER.ALLOW,
      });
      // A first-time recipient is the common case for any new payee. It is
      // rendered as its own contributor and escalates only via stackedRisk.
      expect(verdict.level).toBe(INTEL_LEVEL.OK);
      expect(verdict.contributors.find((c) => c.id === 'review').level).toBe('INFO');
    });

    it('reports an unrecognised contributor level as CAUTION rather than clean (I4)', () => {
      const verdict = composeTransactionVerdict({
        localVerdict: { level: 'WAT', sentence: 'unparseable', evidence: null, signals: [] },
        localApplicable: true,
        localSettled: true,
        tipApplicable: false,
        raspTier: TIER.ALLOW,
      });
      expect(verdict.level).toBe(INTEL_LEVEL.CAUTION);
    });
  });
});
