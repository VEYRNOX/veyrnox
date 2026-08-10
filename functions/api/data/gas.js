// functions/api/data/gas.js
//
// Gas/fee tracker proxy. Aggregates BTC (mempool.space), ETH (Etherscan),
// and SOL (Solana RPC) fee data into a single edge response. All three
// sources are public (no API key). Edge caching keeps upstream rate limits
// happy and gives the client a single round-trip instead of three.

import { enforceRateLimit, clientIpOf } from '../_lib/rate-limit.js';

const BTC_FEES_URL = 'https://mempool.space/api/v1/fees/recommended';
const ETH_GAS_URL = 'https://api.etherscan.io/api?module=gastracker&action=gasoracle';
const SOL_DEVNET_RPC = 'https://api.devnet.solana.com';
const SOL_MAINNET_RPC = 'https://api.mainnet-beta.solana.com';

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  throw e;
}

async function fetchBtcFees() {
  const res = await fetch(BTC_FEES_URL);
  if (!res.ok) return null;
  const data = await res.json();
  return {
    slow: data.hourFee,
    standard: data.halfHourFee,
    fast: data.fastestFee,
  };
}

async function fetchEthGas() {
  const res = await fetch(ETH_GAS_URL);
  if (!res.ok) return null;
  const data = await res.json();
  if (!data?.result) return null;
  return {
    slow: parseFloat(data.result.SafeGasPrice),
    standard: parseFloat(data.result.ProposeGasPrice),
    fast: parseFloat(data.result.FastGasPrice),
  };
}

async function fetchSolFees(rpcUrl) {
  try {
    const res = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getRecentPrioritizationFees',
        params: [[]],
      }),
    });
    if (!res.ok) return { baseLamports: 5000, priorityMicroLamports: null };
    const data = await res.json();
    if (!Array.isArray(data?.result)) return { baseLamports: 5000, priorityMicroLamports: null };

    const vals = data.result
      .map(f => f.prioritizationFee)
      .filter(n => Number.isFinite(n))
      .sort((a, b) => a - b);

    const median = vals.length ? vals[Math.floor(vals.length / 2)] : null;
    return { baseLamports: 5000, priorityMicroLamports: median };
  } catch {
    return { baseLamports: 5000, priorityMicroLamports: null };
  }
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const useMainnet = url.searchParams.get('mainnet') === 'true';

  // Per-IP cap: aggregates three upstream public APIs (mempool.space, Etherscan,
  // Solana RPC). Uncapped, a single caller multiplies our egress.
  await enforceRateLimit({ bucket: 'data-gas', clientIp: clientIpOf(request) });

  const cacheKey = new Request(`https://edge-cache.internal/gas-fees-${useMainnet ? 'mainnet' : 'devnet'}`);
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const [btc, eth, sol] = await Promise.all([
    fetchBtcFees(),
    fetchEthGas(),
    fetchSolFees(useMainnet ? SOL_MAINNET_RPC : SOL_DEVNET_RPC),
  ]);

  const body = JSON.stringify({ btc, eth, sol });
  const response = new Response(body, {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=15',
    },
  });

  context.waitUntil(cache.put(cacheKey, response.clone()));
  return response;
}
