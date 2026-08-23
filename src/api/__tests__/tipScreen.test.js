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
  let screenAssetContract;
  let isDeniabilityOrDemoActive;
  let createTipClient;

  beforeEach(async () => {
    vi.resetModules();
    // H-4 (audit 2026-08-03): the configuration contract changed. The client no
    // longer holds VITE_TIP_API_KEY / VITE_TIP_SIGNING_SECRET — those are Edge
    // Function secrets now, and setting them here would make getClient() REFUSE
    // (which tipScreen.proxy.test.js asserts). The client is configured with
    // Supabase credentials plus VITE_TIP_BASE_URL as the feature switch.
    vi.stubEnv('VITE_SUPABASE_URL', 'https://sb.test');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-key');
    vi.stubEnv('VITE_TIP_BASE_URL', 'https://tip.test');

    isDeniabilityOrDemoActive = (await import('@/wallet-core/deniabilitySession.js')).isDeniabilityOrDemoActive;
    createTipClient = (await import('@/api/tipClient.js')).createTipClient;
    isDeniabilityOrDemoActive.mockReturnValue(false);
    screenTransaction = (await import('../tipScreen.js')).screenTransaction;
    screenAssetContract = (await import('../tipScreen.js')).screenAssetContract;
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

  it('screens an asset contract through TIP without sending a wallet address', async () => {
    const mockScreen = vi.fn().mockResolvedValue({
      kind: 'asset_review',
      verdict: 'warn',
      review_summary: 'Proxy contract uses a suspicious upgrade pattern.',
      findings: [
        { title: 'Upgradeable proxy', detail: 'Admin can swap implementation.', severity: 'medium', confidence: 0.88, code: 'upgradeable_proxy' },
      ],
      sources_consulted: [{ source: 'tip-asset-engine', status: 'hit', latency_ms: 42 }],
      sanctions_hit: false,
    });
    createTipClient.mockReturnValue({ screen: mockScreen });

    const result = await screenAssetContract({
      chain: 'evm',
      contractAddress: '0x1234567890123456789012345678901234567890',
    });

    expect(mockScreen).toHaveBeenCalledWith(expect.objectContaining({
      chain: 'ethereum',
      action_type: 'asset_review',
      from_address: '0x0000000000000000000000000000000000000000',
      to_address: '0x1234567890123456789012345678901234567890',
      contract_address: '0x1234567890123456789012345678901234567890',
      token_address: '0x1234567890123456789012345678901234567890',
    }), expect.anything());
    expect(result.verdict).toBe('warn');
    expect(result.level).toBe('medium');
    expect(result.kind).toBe('asset_review');
    expect(result.reviewSummary).toContain('suspicious upgrade pattern');
    expect(result.findings[0].title).toBe('Upgradeable proxy');
  });

  it('returns null for asset review when the contract address or chain cannot be resolved', async () => {
    expect(await screenAssetContract({ chain: '', contractAddress: '' })).toBeNull();
    expect(await screenAssetContract({ chain: 'unknown', contractAddress: 'abc' })).toBeNull();
  });

  it('makes zero asset-review egress in deniability mode (I3)', async () => {
    const mockScreen = vi.fn();
    createTipClient.mockReturnValue({ screen: mockScreen });
    isDeniabilityOrDemoActive.mockReturnValue(true);

    const result = await screenAssetContract({
      chain: 'evm',
      contractAddress: '0x1234567890123456789012345678901234567890',
    });

    expect(result).toBeNull();
    expect(mockScreen).not.toHaveBeenCalled();
  });

  it('falls back to the generic TIP screen shape for asset review when needed', async () => {
    const mockScreen = vi.fn().mockResolvedValue({
      verdict: 'warn',
      risk_data: { threat_signals: [{ signal_type: 'suspicious_contract', confidence: 0.88, source: 'test' }], sanctions_hit: false },
    });
    createTipClient.mockReturnValue({ screen: mockScreen });

    const result = await screenAssetContract({
      chain: 'evm',
      contractAddress: '0x1234567890123456789012345678901234567890',
    });

    expect(result.kind).toBe('generic_screen');
    expect(result.risks[0].title).toBe('suspicious_contract');
  });
});
