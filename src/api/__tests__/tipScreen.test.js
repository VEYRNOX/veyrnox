import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

vi.mock('@/api/tipClient.js', () => ({
  createTipClient: vi.fn(),
  verdictToRiskLevel: vi.fn((v) => v === 'block' ? 'high' : v === 'warn' ? 'medium' : 'info'),
  signalsToRiskRows: vi.fn((s) => (s || []).map(x => ({ level: 'high', title: x.signal_type }))),
}));

describe('screenTransaction', () => {
  let screenTransaction;
  let isDeniabilityOrDemoActive;
  let createTipClient;

  beforeEach(async () => {
    vi.resetModules();
    vi.stubEnv('VITE_TIP_API_KEY', 'test-key');
    vi.stubEnv('VITE_TIP_SIGNING_SECRET', 'test-secret');
    vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');

    isDeniabilityOrDemoActive = (await import('@/wallet-core/deniabilitySession.js')).isDeniabilityOrDemoActive;
    createTipClient = (await import('@/api/tipClient.js')).createTipClient;
    screenTransaction = (await import('../tipScreen.js')).screenTransaction;
  });

  it('returns null in deniability mode (I3)', async () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    const result = await screenTransaction({ chain: 'evm', actionType: 'transfer', from: '0xa', to: '0xb' });
    expect(result).toBeNull();
  });

  it('returns null when TIP is not configured', async () => {
    vi.stubEnv('VITE_TIP_BASE_URL', '');
    vi.resetModules();
    isDeniabilityOrDemoActive = (await import('@/wallet-core/deniabilitySession.js')).isDeniabilityOrDemoActive;
    isDeniabilityOrDemoActive.mockReturnValue(false);
    screenTransaction = (await import('../tipScreen.js')).screenTransaction;
    const result = await screenTransaction({ chain: 'evm', actionType: 'transfer', from: '0xa', to: '0xb' });
    expect(result).toBeNull();
  });

  it('returns structured result on successful screen', async () => {
    const mockScreen = vi.fn().mockResolvedValue({
      verdict: 'block',
      risk_data: { threat_signals: [{ signal_type: 'known_drainer', confidence: 0.95, source: 'test' }], sanctions_hit: false },
    });
    createTipClient.mockReturnValue({ screen: mockScreen });

    const result = await screenTransaction({ chain: 'evm', actionType: 'transfer', from: '0xa', to: '0xb' });
    expect(result.verdict).toBe('block');
    expect(result.level).toBe('high');
    expect(result.sanctions).toBe(false);
  });

  it('returns CAUTION on error (I4 fail closed)', async () => {
    createTipClient.mockReturnValue({ screen: vi.fn().mockRejectedValue(new Error('network')) });

    const result = await screenTransaction({ chain: 'evm', actionType: 'transfer', from: '0xa', to: '0xb' });
    expect(result.verdict).toBe('error');
    expect(result.level).toBe('medium');
    expect(result.risks[0].title).toContain('unavailable');
  });
});
