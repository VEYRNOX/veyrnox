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
