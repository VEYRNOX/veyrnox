import { describe, expect, it, vi } from 'vitest';

vi.mock('@/api/demoClient', () => ({ DEMO: true }));

const { isDeniabilityOrDemoActive } = await import('../deniabilitySession.js');

describe('isDeniabilityOrDemoActive build-mode gate', () => {
  it('blocks egress when demo is enabled without a persisted demo flag', () => {
    localStorage.removeItem('veyrnox-demo');
    expect(isDeniabilityOrDemoActive()).toBe(true);
  });
});
