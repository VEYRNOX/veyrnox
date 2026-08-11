import { describe, it, expect } from 'vitest';
import { buildAdvisoriesBlock } from '../advisorKnowledge.js';

describe('buildAdvisoriesBlock', () => {
  it('returns empty string when no entries', () => {
    expect(buildAdvisoriesBlock({ entries: [] })).toBe('');
    expect(buildAdvisoriesBlock({})).toBe('');
    expect(buildAdvisoriesBlock(null)).toBe('');
  });

  it('renders header + entries when populated', () => {
    const out = buildAdvisoriesBlock({
      generated: '2026-08-11T03:00:00.000Z',
      window_days: 90,
      cvss_floor: 7.0,
      entries: [
        { vendor: 'coldcard', cve: 'CVE-2026-9999', published: '2026-08-01', cvss: 8.5, severity: 'HIGH', summary: 'example issue' },
      ],
    });
    expect(out).toContain('Recent Vendor Security Advisories');
    expect(out).toContain('CVE-2026-9999');
    expect(out).toContain('coldcard');
    expect(out).toContain('CVSS 8.5');
  });

  it('caps entries at max', () => {
    const many = Array.from({ length: 30 }, (_, i) => ({
      vendor: 'ledger', cve: `CVE-2026-${i}`, published: '2026-08-01', cvss: 8, severity: 'HIGH', summary: 's',
    }));
    const out = buildAdvisoriesBlock({ entries: many }, 5);
    const matches = out.match(/CVE-2026-/g) ?? [];
    expect(matches.length).toBe(5);
  });
});
