// lib/buy/transakUrl.js
//
// Pure URL builder for Transak's hosted widget. Called immediately before
// `Browser.open(url)` (@capacitor/browser) to hand off into SFSafariViewController
// / Chrome Custom Tabs. NO side effects, NO network, NO crypto — this is a
// deterministic mapping from (asset, network, address, …) to a Transak widget URL.
//
// Two hard rules pinned by src/lib/buy/__tests__/transakUrl.test.js:
//
//   1. FAIL-CLOSED egress gate (I3/I4). isDeniabilityOrDemoActive() is checked
//      as the FIRST statement, before argument validation. The K-2 lesson
//      (2026-07-20 audit) is that a render-time gate alone is not enough — a
//      programmatic call from unrelated code must also refuse. Rendering the
//      Buy entry is gated separately in BuyCrypto.jsx; this is the WRITE gate.
//
//   2. Per-chain matrix is the SINGLE source of truth. Both the UI picker (which
//      asset+network rows to render) and the URL builder (how to translate our
//      names to Transak's) read from `supportedAssetNetworks`. If Transak renames
//      a network, one edit fixes both surfaces.
//
// Address correctness at the CALL SITE is the caller's responsibility: derive
// from the on-device wallet at press time, never from a cached value, never
// from a URL param, never from a WC-supplied `from`. Same rule as SendCrypto.
// Enforcing that here is impossible — this file has no access to the wallet.

import { isDeniabilityOrDemoActive } from '../../wallet-core/deniabilitySession.js';

/**
 * Typed error so call sites can branch on `err.code` without string-matching
 * the message. All throw paths in this file use this shape.
 */
export class BuyError extends Error {
  constructor(code, message) {
    super(message || code);
    this.name = 'BuyError';
    this.code = code;
  }
}

/**
 * The one-and-only supported asset × network matrix. Order matters for the UI
 * picker (this is the display order). Add a new row here — and only here — to
 * enable a new asset. Removing a row is a shipping change: users mid-flow with
 * that asset must be handled by the caller.
 */
export const supportedAssetNetworks = Object.freeze([
  { asset: 'ETH',   network: 'ethereum',   transakCode: 'ETH',   transakNetwork: 'ethereum'   },
  { asset: 'MATIC', network: 'polygon',    transakCode: 'MATIC', transakNetwork: 'polygon'    },
  { asset: 'ARB',   network: 'arbitrum',   transakCode: 'ETH',   transakNetwork: 'arbitrum'   },
  { asset: 'OP',    network: 'optimism',   transakCode: 'ETH',   transakNetwork: 'optimism'   },
  { asset: 'AVAX',  network: 'avaxcchain', transakCode: 'AVAX',  transakNetwork: 'avaxcchain' },
  { asset: 'BNB',   network: 'bsc',        transakCode: 'BNB',   transakNetwork: 'bsc'        },
  { asset: 'BTC',   network: 'mainnet',    transakCode: 'BTC',   transakNetwork: 'mainnet'    },
  { asset: 'SOL',   network: 'solana',     transakCode: 'SOL',   transakNetwork: 'solana'     },
  { asset: 'USDC',  network: 'ethereum',   transakCode: 'USDC',  transakNetwork: 'ethereum'   },
  { asset: 'USDC',  network: 'polygon',    transakCode: 'USDC',  transakNetwork: 'polygon'    },
  { asset: 'USDT',  network: 'ethereum',   transakCode: 'USDT',  transakNetwork: 'ethereum'   },
]);

/**
 * The ONLY hosts the Buy flow will ever talk to. Single source of truth for all
 * three places that need it — the widget URL bases below, the returned-URL check
 * in api/edgeApi.js createBuySession(), and the postMessage origin allowlist in
 * pages/BuyCrypto.jsx.
 *
 * Branch review 2026-08-15 (C-1): these two hosts were hardcoded independently in
 * all three files, in three different shapes (a Set of origins, a bare `!==`
 * pair, and URL bases with a trailing slash). edgeApi.js's own comment noted it
 * was keeping the other two in sync by hand.
 *
 * The drift is fail-CLOSED, not a bypass — a new Transak region domain added in
 * two places out of three rejects a legitimate buy session, or drops the
 * TRANSAK_ORDER_SUCCESSFUL / TRANSAK_WIDGET_CLOSE events so the widget never
 * closes. Availability, not a hole. But it is the same duplicated-constant shape
 * that turned one copy defect into two files on the passkey unlock screens the
 * same day, so it is centralised before it drifts rather than after.
 *
 * ORIGINS (scheme + host) is what postMessage compares against — `event.origin`
 * is always an origin, never a bare host. HOSTS is what URL validation compares
 * against, because `new URL(...).host` carries no scheme. Deriving one from the
 * other keeps them from disagreeing.
 */
export const TRANSAK_ORIGIN_PRODUCTION = 'https://global.transak.com';
export const TRANSAK_ORIGIN_STAGING = 'https://global-stg.transak.com';

/** @type {ReadonlySet<string>} */
export const TRANSAK_ORIGINS = Object.freeze(new Set([
  TRANSAK_ORIGIN_PRODUCTION,
  TRANSAK_ORIGIN_STAGING,
]));

/** Hosts of TRANSAK_ORIGINS, for `new URL(...).host` comparisons. */
export const TRANSAK_HOSTS = Object.freeze(
  new Set([...TRANSAK_ORIGINS].map((o) => new URL(o).host)),
);

/**
 * @param {string} urlStr
 * @returns {boolean} true only for an https URL on a known Transak host.
 */
export function isTransakUrl(urlStr) {
  // https REQUIRED, not just host: `new URL(...).host` ignores the scheme, so a
  // host-only check passes http://global.transak.com. On an https app that is
  // blocked as mixed content rather than exploited, but a Buy URL that can only
  // ever be https is one less thing to reason about (review finding S-2).
  try {
    const u = new URL(urlStr);
    return u.protocol === 'https:' && TRANSAK_HOSTS.has(u.host);
  } catch {
    return false; // unparseable, or a javascript:/data: URL — fail closed
  }
}

// Trailing slash is load-bearing — these are URL BASES, concatenated below.
const ENVIRONMENTS = {
  STAGING:    `${TRANSAK_ORIGIN_STAGING}/`,
  PRODUCTION: `${TRANSAK_ORIGIN_PRODUCTION}/`,
};

const PRODUCTS_AVAILED = new Set(['BUY', 'SELL']);

/**
 * Build the Transak hosted-widget URL for the given purchase intent.
 *
 * @param {object} opts
 * @param {string} opts.asset      One of the app's asset codes (ETH, BTC, USDC, …).
 * @param {string} opts.network    One of the app's network keys (ethereum, polygon, …).
 * @param {string} opts.address    The receive address on that network, derived
 *                                 from the on-device wallet at press time.
 * @param {string} opts.apiKey     Transak partner API key (staging or prod).
 * @param {'STAGING'|'PRODUCTION'} opts.environment
 * @param {string} opts.redirectURL  Universal-link URL Transak returns to on completion.
 * @param {number} [opts.fiatAmount]      Optional pre-filled amount.
 * @param {string} [opts.fiatCurrency]    Optional pre-filled currency (e.g. GBP).
 * @param {'BUY'|'SELL'} [opts.productsAvailed='BUY']
 * @returns {string} A full URL ready for `Browser.open({ url })`.
 * @throws {BuyError}
 */
export function buildTransakUrl(opts) {
  // (1) FAIL-CLOSED egress gate — MUST be first. Do not disclose WHY the call
  // was refused beyond BUY_DENIABILITY_BLOCKED; a decoy caller must not be able
  // to distinguish "deniability" from "bad args".
  if (isDeniabilityOrDemoActive()) {
    throw new BuyError('BUY_DENIABILITY_BLOCKED');
  }

  const {
    asset, network, address,
    apiKey, environment, redirectURL,
    fiatAmount, fiatCurrency,
    productsAvailed = 'BUY',
  } = opts || {};

  // (2) Argument validation.
  if (!address || typeof address !== 'string') {
    throw new BuyError('ADDRESS_REQUIRED');
  }
  if (!apiKey || typeof apiKey !== 'string') {
    throw new BuyError('API_KEY_REQUIRED');
  }
  const base = ENVIRONMENTS[environment];
  if (!base) {
    throw new BuyError('ENVIRONMENT_INVALID');
  }
  if (!PRODUCTS_AVAILED.has(productsAvailed)) {
    throw new BuyError('PRODUCTS_AVAILED_INVALID');
  }

  // (3) Asset/network matrix lookup. Distinguish "we don't know this asset at
  // all" from "we know the asset but not on this network" — the latter is the
  // multi-network USDC/USDT footgun and deserves its own error code.
  const assetSupported = supportedAssetNetworks.some(r => r.asset === asset);
  if (!assetSupported) {
    throw new BuyError('ASSET_UNSUPPORTED');
  }
  const row = supportedAssetNetworks.find(r => r.asset === asset && r.network === network);
  if (!row) {
    throw new BuyError('NETWORK_MISMATCH');
  }

  // (4) URL construction. URLSearchParams handles encoding; we never string-
  // concatenate values into the URL directly.
  const params = new URLSearchParams();
  params.set('apiKey', apiKey);
  params.set('productsAvailed', productsAvailed);
  params.set('cryptoCurrencyCode', row.transakCode);
  params.set('network', row.transakNetwork);
  params.set('walletAddress', address);
  params.set('disableWalletAddressForm', 'true');
  params.set('redirectURL', redirectURL);
  if (fiatAmount != null) params.set('fiatAmount', String(fiatAmount));
  if (fiatCurrency)       params.set('fiatCurrency', fiatCurrency);

  return `${base}?${params.toString()}`;
}
