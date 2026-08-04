// functions/api/buy/session.js
//
// Transak widget-URL proxy. The client sends (asset, network, address);
// the edge authenticates with Transak's partner API (secret never leaves
// the server) and returns a one-time widget URL with a sessionId.
//
// Flow:
//   1. Refresh Partner Access Token (cached ~6 days via Cache API)
//   2. POST /api/v2/auth/session with x-api-key + x-user-ip
//   3. Return { url } to the client
//
// Secrets (via context.env):
//   TRANSAK_API_KEY       — partner API key (x-api-key header)
//   TRANSAK_API_SECRET    — partner API secret (refresh-token call)
//   TRANSAK_ENVIRONMENT   — 'STAGING' | 'PRODUCTION' (wrangler.toml)

const ENDPOINTS = {
  STAGING: {
    refreshToken: 'https://api-stg.transak.com/partners/api/v2/refresh-token',
    createSession: 'https://api-gateway-stg.transak.com/api/v2/auth/session',
    widget: 'https://global-stg.transak.com',
  },
  PRODUCTION: {
    refreshToken: 'https://api.transak.com/partners/api/v2/refresh-token',
    createSession: 'https://api-gateway.transak.com/api/v2/auth/session',
    widget: 'https://global.transak.com',
  },
};

const SUPPORTED_ASSETS = new Map([
  ['ETH:ethereum',     { code: 'ETH',  network: 'ethereum'   }],
  ['MATIC:polygon',    { code: 'MATIC', network: 'polygon'   }],
  ['ARB:arbitrum',     { code: 'ETH',  network: 'arbitrum'   }],
  ['OP:optimism',      { code: 'ETH',  network: 'optimism'   }],
  ['AVAX:avaxcchain',  { code: 'AVAX', network: 'avaxcchain' }],
  ['BNB:bsc',          { code: 'BNB',  network: 'bsc'        }],
  ['BTC:mainnet',      { code: 'BTC',  network: 'mainnet'    }],
  ['SOL:solana',       { code: 'SOL',  network: 'solana'     }],
  ['USDC:ethereum',    { code: 'USDC', network: 'ethereum'   }],
  ['USDC:polygon',     { code: 'USDC', network: 'polygon'    }],
  ['USDT:ethereum',    { code: 'USDT', network: 'ethereum'   }],
]);

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  throw e;
}

async function getPartnerToken(env) {
  const environment = env.TRANSAK_ENVIRONMENT || 'STAGING';
  const urls = ENDPOINTS[environment];
  if (!urls) err(500, 'Invalid TRANSAK_ENVIRONMENT');

  const cacheKey = new Request(`https://edge-cache.internal/transak-partner-token-${environment}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) {
    const { accessToken } = await cached.json();
    if (accessToken) return { accessToken, urls };
  }

  const apiSecret = env.TRANSAK_API_SECRET;
  if (!apiSecret) err(503, 'Transak not configured');

  const res = await fetch(urls.refreshToken, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-secret': apiSecret,
    },
    body: JSON.stringify({}),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    err(502, `Transak auth failed: ${res.status}`);
  }

  const data = await res.json();
  const accessToken = data?.data?.accessToken || data?.accessToken;
  if (!accessToken) err(502, 'No access token in Transak response');

  const cacheResponse = new Response(JSON.stringify({ accessToken }), {
    headers: { 'Cache-Control': 'max-age=518400' }, // 6 days (token lasts 7)
  });
  await cache.put(cacheKey, cacheResponse);

  return { accessToken, urls };
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const apiKey = env.TRANSAK_API_KEY;
  if (!apiKey) err(503, 'Buy not available');

  let body;
  try {
    body = await request.json();
  } catch {
    err(400, 'Invalid JSON');
  }

  const { asset, network, address, fiatAmount, fiatCurrency, productsAvailed } = body;

  if (!address || typeof address !== 'string' || address.length < 10 || address.length > 128) {
    err(400, 'Invalid address');
  }

  const row = SUPPORTED_ASSETS.get(`${asset}:${network}`);
  if (!row) err(400, 'Unsupported asset/network');

  const product = productsAvailed === 'SELL' ? 'SELL' : 'BUY';

  const { accessToken, urls } = await getPartnerToken(env);

  const clientIp = request.headers.get('CF-Connecting-IP')
    || request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim()
    || '0.0.0.0';

  const sessionBody = {
    apiKey,
    cryptoCurrencyCode: row.code,
    network: row.network,
    walletAddress: address,
    productsAvailed: product,
    disableWalletAddressForm: true,
  };
  if (fiatAmount != null) sessionBody.fiatAmount = Number(fiatAmount);
  if (fiatCurrency) sessionBody.fiatCurrency = String(fiatCurrency).toUpperCase();

  const sessionRes = await fetch(urls.createSession, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'x-user-ip': clientIp,
      'x-partner-access-token': accessToken,
    },
    body: JSON.stringify(sessionBody),
  });

  if (!sessionRes.ok) {
    const text = await sessionRes.text().catch(() => '');
    if (sessionRes.status === 401) {
      await caches.default.delete(
        new Request(`https://edge-cache.internal/transak-partner-token-${env.TRANSAK_ENVIRONMENT || 'STAGING'}`)
      );
    }
    err(502, `Transak session failed: ${sessionRes.status}`);
  }

  const sessionData = await sessionRes.json();
  const sessionId = sessionData?.data?.sessionId || sessionData?.sessionId;
  if (!sessionId) err(502, 'No sessionId in Transak response');

  const widgetUrl = `${urls.widget}?apiKey=${encodeURIComponent(apiKey)}&sessionId=${encodeURIComponent(sessionId)}`;

  return new Response(JSON.stringify({ url: widgetUrl }), {
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function onRequestGet() {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
