import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildMoonpayUrl, MOONPAY_ASSET_MAP, BuyError } from '../moonpayUrl.js';

vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';

const VALID = {
  asset: 'ETH',
  network: 'ethereum',
  walletAddress: '0xAbCd',
  apiKey: 'pk_test_abc',
  environment: 'STAGING',
  baseCurrencyCode: 'USD',
};

describe('BUY_DENIABILITY_BLOCKED — I3 egress chokepoint', () => {
  afterEach(() => vi.restoreAllMocks());

  it('throws before arg validation when deniability is active', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    expect(() => buildMoonpayUrl({ ...VALID, walletAddress: '' }))
      .toThrow(expect.objectContaining({ code: 'BUY_DENIABILITY_BLOCKED' }));
  });

  it('throws even when API key is missing', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    expect(() => buildMoonpayUrl({ ...VALID, apiKey: '' }))
      .toThrow(expect.objectContaining({ code: 'BUY_DENIABILITY_BLOCKED' }));
  });

  it('throws even when asset is unsupported', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    expect(() => buildMoonpayUrl({ ...VALID, asset: 'UNKNOWN' }))
      .toThrow(expect.objectContaining({ code: 'BUY_DENIABILITY_BLOCKED' }));
  });

  it('does not throw when deniability is inactive', () => {
    isDeniabilityOrDemoActive.mockReturnValue(false);
    expect(() => buildMoonpayUrl(VALID)).not.toThrow();
  });
});

describe('Argument validation', () => {
  beforeEach(() => isDeniabilityOrDemoActive.mockReturnValue(false));
  afterEach(() => vi.restoreAllMocks());

  it('throws ADDRESS_REQUIRED for empty walletAddress', () => {
    expect(() => buildMoonpayUrl({ ...VALID, walletAddress: '' }))
      .toThrow(expect.objectContaining({ code: 'ADDRESS_REQUIRED' }));
  });

  it('throws ADDRESS_REQUIRED for null walletAddress', () => {
    expect(() => buildMoonpayUrl({ ...VALID, walletAddress: null }))
      .toThrow(expect.objectContaining({ code: 'ADDRESS_REQUIRED' }));
  });

  it('throws ADDRESS_REQUIRED for undefined walletAddress', () => {
    const { walletAddress: _w, ...rest } = VALID;
    expect(() => buildMoonpayUrl(rest))
      .toThrow(expect.objectContaining({ code: 'ADDRESS_REQUIRED' }));
  });

  it('throws API_KEY_REQUIRED for empty apiKey', () => {
    expect(() => buildMoonpayUrl({ ...VALID, apiKey: '' }))
      .toThrow(expect.objectContaining({ code: 'API_KEY_REQUIRED' }));
  });

  it('throws API_KEY_REQUIRED for undefined apiKey', () => {
    const { apiKey: _k, ...rest } = VALID;
    expect(() => buildMoonpayUrl(rest))
      .toThrow(expect.objectContaining({ code: 'API_KEY_REQUIRED' }));
  });

  it('throws ENVIRONMENT_INVALID for unrecognised environment', () => {
    expect(() => buildMoonpayUrl({ ...VALID, environment: 'DEVNET' }))
      .toThrow(expect.objectContaining({ code: 'ENVIRONMENT_INVALID' }));
  });

  it('throws ASSET_UNSUPPORTED for unknown asset', () => {
    expect(() => buildMoonpayUrl({ ...VALID, asset: 'DOGE' }))
      .toThrow(expect.objectContaining({ code: 'ASSET_UNSUPPORTED' }));
  });

  it('throws NETWORK_MISMATCH when asset is valid but network is wrong', () => {
    expect(() => buildMoonpayUrl({ ...VALID, asset: 'ETH', network: 'polygon' }))
      .toThrow(expect.objectContaining({ code: 'NETWORK_MISMATCH' }));
  });

  it('BuyError instances are instanceof Error and BuyError', () => {
    try {
      buildMoonpayUrl({ ...VALID, walletAddress: '' });
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(Error);
      expect(e).toBeInstanceOf(BuyError);
    }
  });
});

describe('URL correctness — common params', () => {
  beforeEach(() => isDeniabilityOrDemoActive.mockReturnValue(false));
  afterEach(() => vi.restoreAllMocks());

  it('uses staging base URL when STAGING', () => {
    const url = buildMoonpayUrl({ ...VALID, environment: 'STAGING' });
    expect(url).toMatch(/^https:\/\/buy-sandbox\.moonpay\.com\//);
  });

  it('uses production base URL when PRODUCTION', () => {
    const url = buildMoonpayUrl({ ...VALID, environment: 'PRODUCTION' });
    expect(url).toMatch(/^https:\/\/buy\.moonpay\.com\//);
  });

  it('defaults to STAGING when environment is omitted', () => {
    const { environment: _e, ...rest } = VALID;
    const url = buildMoonpayUrl(rest);
    expect(url).toMatch(/^https:\/\/buy-sandbox\.moonpay\.com\//);
  });

  it('always sets lockWalletAddress=true', () => {
    const url = buildMoonpayUrl(VALID);
    expect(new URL(url).searchParams.get('lockWalletAddress')).toBe('true');
  });

  it('sets redirectURL to current origin + /buy/return', () => {
    const url = buildMoonpayUrl(VALID);
    expect(new URL(url).searchParams.get('redirectURL')).toBe(
      `${window.location.origin}/buy/return`,
    );
  });

  it('passes walletAddress correctly', () => {
    const url = buildMoonpayUrl({ ...VALID, walletAddress: '0xDead' });
    expect(new URL(url).searchParams.get('walletAddress')).toBe('0xDead');
  });

  it('lowercases baseCurrencyCode', () => {
    const url = buildMoonpayUrl({ ...VALID, baseCurrencyCode: 'GBP' });
    expect(new URL(url).searchParams.get('baseCurrencyCode')).toBe('gbp');
  });

  it('includes baseCurrencyAmount when provided', () => {
    const url = buildMoonpayUrl({ ...VALID, baseCurrencyAmount: '100' });
    expect(new URL(url).searchParams.get('baseCurrencyAmount')).toBe('100');
  });

  it('omits baseCurrencyAmount when not provided', () => {
    const { baseCurrencyAmount: _a, ...rest } = VALID;
    const url = buildMoonpayUrl(rest);
    expect(new URL(url).searchParams.has('baseCurrencyAmount')).toBe(false);
  });

  it('omits baseCurrencyCode when not provided', () => {
    const { baseCurrencyCode: _c, ...rest } = VALID;
    const url = buildMoonpayUrl(rest);
    expect(new URL(url).searchParams.has('baseCurrencyCode')).toBe(false);
  });
});

describe('Per-chain currencyCode matrix', () => {
  beforeEach(() => isDeniabilityOrDemoActive.mockReturnValue(false));
  afterEach(() => vi.restoreAllMocks());

  const cases = [
    { asset: 'ETH',  network: 'ethereum',   moonpayCode: 'eth' },
    { asset: 'MATIC',network: 'polygon',    moonpayCode: 'matic_polygon' },
    { asset: 'ARB',  network: 'arbitrum',   moonpayCode: 'eth_arbitrum' },
    { asset: 'OP',   network: 'optimism',   moonpayCode: 'eth_optimism' },
    { asset: 'AVAX', network: 'avaxcchain', moonpayCode: 'avax_cchain' },
    { asset: 'BNB',  network: 'bsc',        moonpayCode: 'bnb_bsc' },
    { asset: 'BTC',  network: 'mainnet',    moonpayCode: 'btc' },
    { asset: 'SOL',  network: 'solana',     moonpayCode: 'sol' },
    { asset: 'USDC', network: 'ethereum',   moonpayCode: 'usdc' },
    { asset: 'USDC', network: 'polygon',    moonpayCode: 'usdc_polygon' },
    { asset: 'USDT', network: 'ethereum',   moonpayCode: 'usdt' },
  ];

  it.each(cases)(
    '$asset/$network → currencyCode=$moonpayCode',
    ({ asset, network, moonpayCode }) => {
      const url = buildMoonpayUrl({
        asset,
        network,
        walletAddress: '0xAbCd',
        apiKey: 'pk_test_abc',
      });
      expect(new URL(url).searchParams.get('currencyCode')).toBe(moonpayCode);
    },
  );

  it('MOONPAY_ASSET_MAP exports exactly 11 rows', () => {
    expect(MOONPAY_ASSET_MAP).toHaveLength(11);
  });
});
