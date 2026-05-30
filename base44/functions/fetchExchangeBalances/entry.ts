import { createClientFromRequest } from 'npm:@base44/sdk@0.8.25';

// --- Binance ---
async function binanceSign(queryString, secret) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(queryString));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
}

async function fetchBinanceBalances(apiKey, apiSecret) {
  const ts = Date.now();
  const qs = `timestamp=${ts}`;
  const signature = await binanceSign(qs, apiSecret);
  const res = await fetch(`https://api.binance.com/api/v3/account?${qs}&signature=${signature}`, {
    headers: { "X-MBX-APIKEY": apiKey },
  });
  if (!res.ok) throw new Error(`Binance error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return (data.balances || [])
    .filter(b => parseFloat(b.free) + parseFloat(b.locked) > 0)
    .map(b => ({ currency: b.asset, balance: parseFloat(b.free) + parseFloat(b.locked) }));
}

// --- Kraken ---
async function krakenSign(path, nonce, postData, secret) {
  const enc = new TextEncoder();
  const secretBuf = Uint8Array.from(atob(secret), c => c.charCodeAt(0));
  const sha256 = await crypto.subtle.digest("SHA-256", enc.encode(nonce + postData));
  const pathBuf = enc.encode(path);
  const msg = new Uint8Array(pathBuf.byteLength + sha256.byteLength);
  msg.set(pathBuf, 0);
  msg.set(new Uint8Array(sha256), pathBuf.byteLength);
  const key = await crypto.subtle.importKey(
    "raw", secretBuf, { name: "HMAC", hash: "SHA-512" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, msg);
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function fetchKrakenBalances(apiKey, apiSecret) {
  const path = "/0/private/Balance";
  const nonce = Date.now().toString();
  const postData = `nonce=${nonce}`;
  const signature = await krakenSign(path, nonce, postData, apiSecret);
  const res = await fetch(`https://api.kraken.com${path}`, {
    method: "POST",
    headers: {
      "API-Key": apiKey,
      "API-Sign": signature,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: postData,
  });
  if (!res.ok) throw new Error(`Kraken error: ${res.status}`);
  const data = await res.json();
  if (data.error?.length) throw new Error(data.error.join(", "));
  const SUPPORTED = ["BTC", "ETH", "SOL", "USDC", "USDT", "XBT"];
  const MAP = { XBT: "BTC", XXBT: "BTC", XETH: "ETH", ZUSD: "USDT" };
  return Object.entries(data.result || {})
    .map(([asset, bal]) => {
      const currency = MAP[asset] || asset;
      return { currency, balance: parseFloat(bal) };
    })
    .filter(b => b.balance > 0 && SUPPORTED.includes(b.currency));
}

// --- Coinbase ---
async function fetchCoinbaseBalances(apiKey, apiSecret) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const method = "GET";
  const path = "/v2/accounts";
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(ts + method + path + ""));
  const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, "0")).join("");
  const res = await fetch(`https://api.coinbase.com${path}`, {
    headers: {
      "CB-ACCESS-KEY": apiKey,
      "CB-ACCESS-SIGN": signature,
      "CB-ACCESS-TIMESTAMP": ts,
      "CB-VERSION": "2016-02-18",
    },
  });
  if (!res.ok) throw new Error(`Coinbase error: ${res.status}`);
  const data = await res.json();
  return (data.data || [])
    .filter(a => parseFloat(a.balance?.amount) > 0)
    .map(a => ({ currency: a.balance.currency, balance: parseFloat(a.balance.amount) }));
}

const FETCHERS = { binance: fetchBinanceBalances, kraken: fetchKrakenBalances, coinbase: fetchCoinbaseBalances };

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    const { connectionId } = await req.json();
    const conn = await base44.entities.ExchangeConnection.get(connectionId);
    if (!conn) return Response.json({ error: "Connection not found" }, { status: 404 });

    const fetcher = FETCHERS[conn.exchange];
    if (!fetcher) return Response.json({ error: "Unsupported exchange" }, { status: 400 });

    const balances = await fetcher(conn.api_key, conn.api_secret);

    // Upsert wallets: update existing or create new for each balance
    const existingWallets = await base44.entities.Wallet.list();
    const exchangeLabel = `[${conn.exchange.toUpperCase()}] ${conn.label || ""}`.trim();

    for (const { currency, balance } of balances) {
      const SUPPORTED = ["BTC", "ETH", "SOL", "USDC", "USDT"];
      if (!SUPPORTED.includes(currency)) continue;
      const existing = existingWallets.find(
        w => w.currency === currency && w.name?.startsWith(`[${conn.exchange.toUpperCase()}]`)
      );
      if (existing) {
        await base44.entities.Wallet.update(existing.id, { balance });
      } else {
        await base44.entities.Wallet.create({
          name: `${exchangeLabel} — ${currency}`,
          currency,
          balance,
          address: `${conn.exchange}:${connectionId}:${currency}`,
        });
      }
    }

    await base44.entities.ExchangeConnection.update(connectionId, {
      last_synced: new Date().toISOString(),
      status: "active",
      error_message: "",
    });

    return Response.json({ success: true, imported: balances.length });
  } catch (error) {
    try {
      const base44 = createClientFromRequest(req);
      const { connectionId } = await req.json().catch(() => ({}));
      if (connectionId) {
        await base44.asServiceRole.entities.ExchangeConnection.update(connectionId, {
          status: "error",
          error_message: error.message,
        });
      }
    } catch {}
    return Response.json({ error: error.message }, { status: 500 });
  }
});