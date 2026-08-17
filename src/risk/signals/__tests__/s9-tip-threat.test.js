import { describe, it, expect } from 'vitest';
import { s9TipThreat } from '../s9-tip-threat.js';

describe('s9TipThreat', () => {
  it('returns OK when tipResult is absent', () => {
    const r = s9TipThreat({}, {}, {});
    expect(r.level).toBe('OK');
  });

  it('returns OK when tipResult is null', () => {
    const r = s9TipThreat({}, {}, { tipResult: null });
    expect(r.level).toBe('OK');
  });

  it('returns RISK on sanctions hit', () => {
    const r = s9TipThreat({}, {}, {
      tipResult: { verdict: 'block', sanctions: true, signals: [] },
    });
    expect(r.level).toBe('RISK');
    expect(r.evidence.reason).toContain('sanctions');
  });

  it('returns RISK on block verdict without sanctions', () => {
    const r = s9TipThreat({}, {}, {
      tipResult: {
        verdict: 'block', sanctions: false,
        signals: [{ signal_type: 'known_drainer', confidence: 0.95, source: 'chainalysis' }],
      },
    });
    expect(r.level).toBe('RISK');
    expect(r.evidence.reason).toContain('known drainer');
    expect(r.evidence.reason).toContain('95%');
  });

  it('returns CAUTION on warn verdict', () => {
    const r = s9TipThreat({}, {}, {
      tipResult: {
        verdict: 'warn', sanctions: false,
        signals: [{ signal_type: 'flagged_address', confidence: 0.6, source: 'community' }],
      },
    });
    expect(r.level).toBe('CAUTION');
    expect(r.evidence.reason).toContain('flagged address');
  });

  it('returns CAUTION on error verdict (I4 fail closed)', () => {
    const r = s9TipThreat({}, {}, {
      tipResult: { verdict: 'error', sanctions: false, signals: [] },
    });
    expect(r.level).toBe('CAUTION');
    expect(r.evidence.reason).toContain('could not complete');
  });

  it('returns OK on allow verdict', () => {
    const r = s9TipThreat({}, {}, {
      tipResult: { verdict: 'allow', sanctions: false, signals: [] },
    });
    expect(r.level).toBe('OK');
  });

  it('uses fallback sentence when signals array is empty', () => {
    const r = s9TipThreat({}, {}, {
      tipResult: { verdict: 'block', sanctions: false, signals: [] },
    });
    expect(r.level).toBe('RISK');
    expect(r.evidence.reason).toContain('Known threat detected');
  });
});

describe('s9TipThreat — static OFAC fallback (issue #1664)', () => {
  const TORNADO_01_ETH = '0x8589427373D6D84E98730D7795D8f6f8731FDA16';

  it('forces RISK on a Tornado Cash router regardless of tipResult', () => {
    const r = s9TipThreat({ to: TORNADO_01_ETH }, {}, { tipResult: null });
    expect(r.level).toBe('RISK');
    expect(r.evidence.reason).toMatch(/OFAC sanctions list/i);
  });

  it('forces RISK even if TIP returned verdict=allow (the #1664 bug shape)', () => {
    const r = s9TipThreat(
      { to: TORNADO_01_ETH },
      {},
      { tipResult: { verdict: 'allow', sanctions: false, signals: [] } },
    );
    expect(r.level).toBe('RISK');
    // Source string names the static fallback so the reader sees TIP was overridden.
    expect(r.evidence.values.source).toMatch(/static ofac/i);
  });

  it('case-insensitive on the recipient address', () => {
    const r = s9TipThreat({ to: TORNADO_01_ETH.toUpperCase() }, {}, {});
    expect(r.level).toBe('RISK');
  });

  it('does NOT trigger on non-sanctioned recipients (regression guard)', () => {
    const r = s9TipThreat({ to: '0x742d35Cc6634C0532925a3b844Bc834e7e6e336f' }, {}, {});
    // Falls through to the TIP-result path; tipResult is missing, so OK.
    expect(r.level).toBe('OK');
  });

  it('does NOT throw when unsignedTx is null / undefined', () => {
    expect(() => s9TipThreat(null, {}, {})).not.toThrow();
    expect(() => s9TipThreat(undefined, {}, {})).not.toThrow();
    expect(s9TipThreat(null, {}, {}).level).toBe('OK');
  });
});
