// lib/buy/__tests__/transakUrl.test.js
//
// Pure-logic tests for the Transak hosted-widget URL builder. Two responsibilities
// pinned by this suite:
//
//   1. FAIL-CLOSED egress gate (I3/I4). buildTransakUrl MUST throw
//      BUY_DENIABILITY_BLOCKED whenever isDeniabilityOrDemoActive() is true. This
//      is the second chokepoint from the K-2 pattern (2026-07-20 audit): the
//      Buy render gate hides the button in a decoy session, this gate refuses
//      even a direct programmatic call. Both writers must be gated separately;
//      relying on the render gate alone is exactly how K-2 leaked real state to
//      shared storage.
//
//   2. Per-chain param correctness (I5). Getting `network` wrong for a
//      multi-network asset (USDC on ETH vs Polygon) sends funds to an unusable
//      address. Matrix asserted here so the mapping cannot drift silently.
//
// The URL builder is pure — no side effects, no crypto, no network. Address
// correctness at the CALL SITE (derived at press time, not at mount) is the
// caller's responsibility and is covered in BuyCrypto.test.jsx.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setDeniabilitySession } from '../../../wallet-core/deniabilitySession.js';
import { buildTransakUrl, BuyError } from '../transakUrl.js';

// Realistic per-chain addresses (checksum-normalised where relevant). Content is
// not validated by the builder; these are shape-realistic for readability.
const EVM_ADDR = '0x1111111111111111111111111111111111111111';
const BTC_ADDR = 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh';
const SOL_ADDR = '11111111111111111111111111111112';

const BASE = {
  fiatAmount: 50,
  fiatCurrency: 'GBP',
  apiKey: 'stg_test_key',
  environment: 'STAGING',
  redirectURL: 'https://veyrnox.com/buy/return',
};

describe('buildTransakUrl — deniability egress gate (I3/I4)', () => {
  beforeEach(() => {
    setDeniabilitySession(false);
    try { localStorage.removeItem('veyrnox-demo'); } catch { /* jsdom */ }
  });
  afterEach(() => {
    setDeniabilitySession(false);
    try { localStorage.removeItem('veyrnox-demo'); } catch { /* jsdom */ }
  });

  it('throws BUY_DENIABILITY_BLOCKED under an active decoy/hidden session', () => {
    setDeniabilitySession(true);
    expect(() => buildTransakUrl({
      ...BASE, asset: 'ETH', network: 'ethereum', address: EVM_ADDR,
    })).toThrow('BUY_DENIABILITY_BLOCKED');
  });

  it('throws BUY_DENIABILITY_BLOCKED under the persisted demo flag', () => {
    try { localStorage.setItem('veyrnox-demo', '1'); } catch { /* jsdom */ }
    expect(() => buildTransakUrl({
      ...BASE, asset: 'BTC', network: 'mainnet', address: BTC_ADDR,
    })).toThrow('BUY_DENIABILITY_BLOCKED');
  });

  it('gate fires BEFORE any argument validation (a decoy caller must not learn WHY it was refused)', () => {
    // Missing address would normally throw ADDRESS_REQUIRED. Deniability wins.
    setDeniabilitySession(true);
    expect(() => buildTransakUrl({
      ...BASE, asset: 'ETH', network: 'ethereum', address: undefined,
    })).toThrow('BUY_DENIABILITY_BLOCKED');
  });
});

describe('buildTransakUrl — argument validation', () => {
  beforeEach(() => setDeniabilitySession(false));
  afterEach(() => setDeniabilitySession(false));

  it('throws ADDRESS_REQUIRED when address is missing', () => {
    expect(() => buildTransakUrl({
      ...BASE, asset: 'ETH', network: 'ethereum', address: undefined,
    })).toThrow('ADDRESS_REQUIRED');
  });

  it('throws ADDRESS_REQUIRED when address is empty string', () => {
    expect(() => buildTransakUrl({
      ...BASE, asset: 'ETH', network: 'ethereum', address: '',
    })).toThrow('ADDRESS_REQUIRED');
  });

  it('throws ASSET_UNSUPPORTED for an unknown asset', () => {
    expect(() => buildTransakUrl({
      ...BASE, asset: 'DOGE', network: 'dogecoin', address: EVM_ADDR,
    })).toThrow('ASSET_UNSUPPORTED');
  });

  it('throws NETWORK_MISMATCH when asset/network pair is not in the matrix', () => {
    // ETH exists, `polygon` exists elsewhere, but ETH-on-polygon is not a Veyrnox pair.
    expect(() => buildTransakUrl({
      ...BASE, asset: 'ETH', network: 'polygon', address: EVM_ADDR,
    })).toThrow('NETWORK_MISMATCH');
  });

  it('throws API_KEY_REQUIRED when apiKey is missing', () => {
    expect(() => buildTransakUrl({
      ...BASE, apiKey: undefined, asset: 'ETH', network: 'ethereum', address: EVM_ADDR,
    })).toThrow('API_KEY_REQUIRED');
  });

  it('throws ENVIRONMENT_INVALID when environment is not STAGING or PRODUCTION', () => {
    expect(() => buildTransakUrl({
      ...BASE, environment: 'DEV', asset: 'ETH', network: 'ethereum', address: EVM_ADDR,
    })).toThrow('ENVIRONMENT_INVALID');
  });

  it('exposes a typed BuyError with a `code` property (not just a message)', () => {
    try {
      buildTransakUrl({ ...BASE, asset: 'ETH', network: 'ethereum', address: '' });
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(BuyError);
      expect(err.code).toBe('ADDRESS_REQUIRED');
    }
  });
});

describe('buildTransakUrl — base URL selection by environment', () => {
  beforeEach(() => setDeniabilitySession(false));

  it('STAGING resolves to global-stg.transak.com', () => {
    const url = buildTransakUrl({
      ...BASE, environment: 'STAGING', asset: 'ETH', network: 'ethereum', address: EVM_ADDR,
    });
    expect(url).toMatch(/^https:\/\/global-stg\.transak\.com\//);
  });

  it('PRODUCTION resolves to global.transak.com', () => {
    const url = buildTransakUrl({
      ...BASE, environment: 'PRODUCTION', asset: 'ETH', network: 'ethereum', address: EVM_ADDR,
    });
    expect(url).toMatch(/^https:\/\/global\.transak\.com\//);
  });
});

describe('buildTransakUrl — required widget params always present', () => {
  beforeEach(() => setDeniabilitySession(false));

  const url = () => buildTransakUrl({
    ...BASE, asset: 'ETH', network: 'ethereum', address: EVM_ADDR,
  });

  it('includes apiKey', () => {
    expect(new URL(url()).searchParams.get('apiKey')).toBe('stg_test_key');
  });

  it('includes productsAvailed=BUY (default when productsAvailed not passed)', () => {
    expect(new URL(url()).searchParams.get('productsAvailed')).toBe('BUY');
  });

  it('locks the deposit address (disableWalletAddressForm=true) so the user cannot edit it inside the widget', () => {
    expect(new URL(url()).searchParams.get('disableWalletAddressForm')).toBe('true');
  });

  it('includes walletAddress verbatim (no lowercasing, no checksum re-derivation)', () => {
    const custom = buildTransakUrl({
      ...BASE, asset: 'ETH', network: 'ethereum',
      address: '0xAbCdEf1234567890AbCdEf1234567890AbCdEf12',
    });
    expect(new URL(custom).searchParams.get('walletAddress'))
      .toBe('0xAbCdEf1234567890AbCdEf1234567890AbCdEf12');
  });

  it('includes redirectURL', () => {
    expect(new URL(url()).searchParams.get('redirectURL'))
      .toBe('https://veyrnox.com/buy/return');
  });

  it('includes fiatAmount and fiatCurrency when supplied', () => {
    const u = new URL(url());
    expect(u.searchParams.get('fiatAmount')).toBe('50');
    expect(u.searchParams.get('fiatCurrency')).toBe('GBP');
  });

  it('omits fiatAmount when not supplied (widget picks its own default)', () => {
    const u = new URL(buildTransakUrl({
      apiKey: 'k', environment: 'STAGING', redirectURL: 'https://veyrnox.com/buy/return',
      fiatCurrency: 'GBP',
      asset: 'ETH', network: 'ethereum', address: EVM_ADDR,
    }));
    expect(u.searchParams.get('fiatAmount')).toBeNull();
  });
});

describe('buildTransakUrl — productsAvailed', () => {
  beforeEach(() => setDeniabilitySession(false));

  it('accepts productsAvailed=SELL for off-ramp (phase 4)', () => {
    const url = buildTransakUrl({
      ...BASE, productsAvailed: 'SELL',
      asset: 'ETH', network: 'ethereum', address: EVM_ADDR,
    });
    expect(new URL(url).searchParams.get('productsAvailed')).toBe('SELL');
  });

  it('rejects an unknown productsAvailed value', () => {
    expect(() => buildTransakUrl({
      ...BASE, productsAvailed: 'SWAP',
      asset: 'ETH', network: 'ethereum', address: EVM_ADDR,
    })).toThrow('PRODUCTS_AVAILED_INVALID');
  });
});

describe('buildTransakUrl — per-chain matrix (10 supported pairs)', () => {
  beforeEach(() => setDeniabilitySession(false));

  // Each row: our asset code, our network key, the Transak crypto code, the
  // Transak network name, an address shape valid for that chain.
  const MATRIX = [
    ['ETH',  'ethereum',   'ETH',   'ethereum',  EVM_ADDR],
    ['MATIC','polygon',    'MATIC', 'polygon',   EVM_ADDR],
    ['ARB',  'arbitrum',   'ETH',   'arbitrum',  EVM_ADDR],
    ['OP',   'optimism',   'ETH',   'optimism',  EVM_ADDR],
    ['AVAX', 'avaxcchain', 'AVAX',  'avaxcchain',EVM_ADDR],
    ['BNB',  'bsc',        'BNB',   'bsc',       EVM_ADDR],
    ['BTC',  'mainnet',    'BTC',   'mainnet',   BTC_ADDR],
    ['SOL',  'solana',     'SOL',   'solana',    SOL_ADDR],
    ['USDC', 'ethereum',   'USDC',  'ethereum',  EVM_ADDR],
    ['USDC', 'polygon',    'USDC',  'polygon',   EVM_ADDR],
    ['USDT', 'ethereum',   'USDT',  'ethereum',  EVM_ADDR],
  ];

  it.each(MATRIX)(
    '%s on %s → cryptoCurrencyCode=%s network=%s',
    (asset, network, expectedCode, expectedNetwork, address) => {
      const u = new URL(buildTransakUrl({ ...BASE, asset, network, address }));
      expect(u.searchParams.get('cryptoCurrencyCode')).toBe(expectedCode);
      expect(u.searchParams.get('network')).toBe(expectedNetwork);
      expect(u.searchParams.get('walletAddress')).toBe(address);
    },
  );

  it('exports supportedAssetNetworks so UI can render the picker from the same source of truth', async () => {
    const mod = await import('../transakUrl.js');
    expect(Array.isArray(mod.supportedAssetNetworks)).toBe(true);
    expect(mod.supportedAssetNetworks.length).toBe(MATRIX.length);
  });
});
