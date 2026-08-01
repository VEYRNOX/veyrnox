import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';

export const MOONPAY_ASSET_MAP = [
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

const MOONPAY_ENVIRONMENTS = {
  STAGING:    'https://buy-sandbox.moonpay.com/',
  PRODUCTION: 'https://buy.moonpay.com/',
};

export class BuyError extends Error {
  constructor(code, message) {
    super(message ?? code);
    this.code = code;
  }
}

/**
 * Build a MoonPay on-ramp URL.
 *
 * Throws BuyError. BUY_DENIABILITY_BLOCKED fires before argument validation
 * so a decoy caller cannot distinguish "blocked" from "bad args" (I3/I4).
 *
 * @param {object} opts
 * @param {string} opts.asset               - e.g. 'ETH'
 * @param {string} opts.network             - e.g. 'ethereum'
 * @param {string} opts.walletAddress       - on-device deposit address, read at press-time
 * @param {string} opts.apiKey              - VITE_MOONPAY_API_KEY
 * @param {string} [opts.environment]       - 'STAGING' | 'PRODUCTION' (default: 'STAGING')
 * @param {string} [opts.baseCurrencyCode]  - fiat preference, e.g. 'usd'
 * @param {string|number} [opts.baseCurrencyAmount] - optional pre-filled amount
 * @returns {string} MoonPay widget URL
 */
export function buildMoonpayUrl({
  asset,
  network,
  walletAddress,
  apiKey,
  environment,
  baseCurrencyCode,
  baseCurrencyAmount,
}) {
  // I3: deniability chokepoint — must be FIRST so a decoy caller gets the same
  // error shape regardless of what args it passed.
  if (isDeniabilityOrDemoActive()) {
    throw new BuyError('BUY_DENIABILITY_BLOCKED');
  }

  if (!walletAddress) throw new BuyError('ADDRESS_REQUIRED');
  if (!apiKey) throw new BuyError('API_KEY_REQUIRED');

  const env = environment ?? 'STAGING';
  const baseUrl = MOONPAY_ENVIRONMENTS[env];
  if (!baseUrl) throw new BuyError('ENVIRONMENT_INVALID');

  const anyRow = MOONPAY_ASSET_MAP.some((r) => r.asset === asset);
  if (!anyRow) throw new BuyError('ASSET_UNSUPPORTED');

  const row = MOONPAY_ASSET_MAP.find(
    (r) => r.asset === asset && r.network === network,
  );
  if (!row) throw new BuyError('NETWORK_MISMATCH');

  const params = new URLSearchParams({
    apiKey,
    currencyCode: row.moonpayCode,
    walletAddress,
    lockWalletAddress: 'true',
    redirectURL: 'https://veyrnox.com/buy/return',
  });

  if (baseCurrencyCode) {
    params.set('baseCurrencyCode', baseCurrencyCode.toLowerCase());
  }
  if (baseCurrencyAmount != null && baseCurrencyAmount !== '') {
    params.set('baseCurrencyAmount', String(baseCurrencyAmount));
  }

  return `${baseUrl}?${params.toString()}`;
}
