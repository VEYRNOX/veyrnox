// src/api/demoClient.js
//
// DEMO MODE — a fully client-side mock of the base44 client so the entire app
// can be browsed without a backend or authentication. Enabled by any of:
//   1. Visiting a URL with `?demo=1` (persisted to localStorage; `?demo=0` off).
//   2. A build-time flag `VITE_DEMO_MODE=1` baked in at build time — used for
//      backend-less native/simulator builds.
//   3. Running on a native (Capacitor) platform during a *development* build,
//      so the iOS/Android simulator works without a backend or login wall.
//
// The native/flag paths are deliberately gated so a real production build
// (web or app store) never turns demo on unless VITE_DEMO_MODE was explicitly
// set for that build.
//
// It returns seeded demo data for the high-traffic entities (wallets,
// transactions, KYC, etc.) and empty arrays for everything else, so every page
// renders its real UI/UX. Nothing here touches real keys or the network.

import { Capacitor } from "@capacitor/core";

export const DEMO = (() => {
  // (2) Explicit build-time opt-in. Works in any build, including native
  //     simulator builds produced with `VITE_DEMO_MODE=1 npm run mobile:build`.
  if (import.meta.env.VITE_DEMO_MODE === "1") return true;

  // (1) Browser query param / persisted preference.
  try {
    const p = new URLSearchParams(window.location.search);
    if (p.get("demo") === "0") localStorage.removeItem("veyrnox-demo");
    else if (p.has("demo")) localStorage.setItem("veyrnox-demo", "1");
    if (localStorage.getItem("veyrnox-demo") === "1") return true;
  } catch {
    // window/localStorage unavailable — fall through to the native check.
  }

  // (3) Native dev builds (e.g. `cap run` against the dev server) default to
  //     demo. import.meta.env.DEV is false in any production build, so this
  //     never fires for a real release.
  try {
    if (import.meta.env.DEV && Capacitor.isNativePlatform()) return true;
  } catch {
    // Capacitor unavailable (plain web build) — ignore.
  }

  return false;
})();

const iso = (d) => new Date(d).toISOString();
const addr = (p) => p + Array.from({ length: 36 }, (_, i) => "0123456789abcdef"[(i * 7 + 3) % 16]).join("");

// Address-poisoning demo pair (Phase S2). DEMO_KNOWN_COUNTERPARTY is a real
// counterparty the demo user has paid before (seeded into Transaction history
// below). DEMO_POISON_ADDRESS is its LOOK-ALIKE: identical first 4 + last 4 hex
// nibbles (a11c…ffee), different middle — exactly what an address-poisoning
// scammer crafts. Pasting the poison address into Send fires the warning.
// Both are valid lowercase EVM addresses (42 chars) so ethers' isAddress passes.
export const DEMO_KNOWN_COUNTERPARTY = "0xa11ce1234567890abcdef1234567890abcc0ffee";
export const DEMO_POISON_ADDRESS     = "0xa11cefedcba0987654321fedcba0987654c0ffee";

const DEMO_USER = {
  id: "demo-user",
  email: "demo@veyrnox.com",
  full_name: "Alex Demo",
  role: "admin",
  created_date: iso("2025-09-01"),
};

// Seeds for the most-used entities. Everything else defaults to [].
const SEEDS = {
  Wallet: [
    { id: "w1", name: "Main ETH",      currency: "ETH",  address: addr("0x"),   balance: 2.4831,  passkey_registered: true,  created_date: iso("2025-10-01") },
    { id: "w2", name: "Bitcoin Vault", currency: "BTC",  address: addr("bc1q"), balance: 0.0521,  passkey_registered: true,  created_date: iso("2025-10-02") },
    { id: "w3", name: "Solana",        currency: "SOL",  address: addr("So1"),  balance: 18.42,   passkey_registered: false, created_date: iso("2025-10-03") },
    { id: "w4", name: "USDC Savings",  currency: "USDC", address: addr("0x"),   balance: 1250.0,  passkey_registered: false, created_date: iso("2025-10-04") },
    { id: "w5", name: "BNB Trading",   currency: "BNB",  address: addr("0x"),   balance: 6.20,    passkey_registered: false, created_date: iso("2025-10-05") },
    { id: "w6", name: "XRP Wallet",    currency: "XRP",  address: addr("r"),    balance: 1820.5,  passkey_registered: false, created_date: iso("2025-10-06") },
    // Rounds the Main Page token/price list out to all 10 canonical TOP_CRYPTOS
    // (src/lib/cryptos.js) so it shows 10 assets, not 6. Display-only demo data —
    // these are coming_soon in wallet-core/assets.js and grant no send capability.
    { id: "w7", name: "USDT Reserve",  currency: "USDT", address: addr("0x"),   balance: 540.0,   passkey_registered: false, created_date: iso("2025-10-07") },
    { id: "w8", name: "Doge Stash",    currency: "DOGE", address: addr("D"),    balance: 12500.0, passkey_registered: false, created_date: iso("2025-10-08") },
    { id: "w9", name: "Cardano",       currency: "ADA",  address: addr("addr1"),balance: 3200.0,  passkey_registered: false, created_date: iso("2025-10-09") },
    { id: "w10", name: "TRON Wallet",  currency: "TRX",  address: addr("T"),    balance: 8400.0,  passkey_registered: false, created_date: iso("2025-10-10") },
  ],
  Transaction: [
    { id: "t1", type: "receive", currency: "ETH",  amount: 0.5,   status: "confirmed", created_date: iso("2026-05-30T10:00:00"), address: addr("0x"), to_address: addr("0x"), hash: addr("0x"), fee: 0.0012 },
    { id: "t2", type: "send",    currency: "USDC", amount: 200,   status: "confirmed", created_date: iso("2026-05-29T14:30:00"), address: addr("0x"), to_address: addr("0x"), hash: addr("0x"), fee: 0.21 },
    { id: "t3", type: "receive", currency: "BTC",  amount: 0.012, status: "pending",   created_date: iso("2026-05-29T09:15:00"), address: addr("bc1q"), to_address: addr("bc1q"), hash: addr("0x"), fee: 0.00003 },
    { id: "t4", type: "send",    currency: "SOL",  amount: 3.2,   status: "confirmed", created_date: iso("2026-05-28T18:45:00"), address: addr("So1"), to_address: addr("So1"), hash: addr("0x"), fee: 0.00005 },
    { id: "t5", type: "receive", currency: "BNB",  amount: 1.5,   status: "failed",    created_date: iso("2026-05-27T11:20:00"), address: addr("0x"), to_address: addr("0x"), hash: addr("0x"), fee: 0.0008 },
    // A genuine past payment to a known counterparty (valid 42-char EVM address).
    // The S2 address-poisoning screen treats this as "an address you've interacted
    // with"; DEMO_POISON_ADDRESS look-alikes it. See the constants above.
    { id: "t6", type: "send",    currency: "ETH",  amount: 0.25,  status: "confirmed", created_date: iso("2026-05-15T12:00:00"), address: addr("0x"), to_address: DEMO_KNOWN_COUNTERPARTY, hash: addr("0x"), fee: 0.0011 },
    // A send dated TODAY (dynamic) so the Security Center daily-limit running
    // total ("sent today") is non-zero out of the box and the CUMULATIVE daily
    // cap is demonstrable in the demo without first broadcasting a live send.
    // ~$160 at the demo ETH rate. Display/demo data only — never signed/sent.
    { id: "t7", type: "send",    currency: "ETH",  amount: 0.05,  status: "confirmed", created_date: iso(Date.now()), address: addr("0x"), to_address: addr("0x"), hash: addr("0x"), fee: 0.0009 },
  ],
  KYCProfile: [{ id: "kyc1", status: "verified", level: 2, full_name: "Alex Demo", country: "GB", verified_date: iso("2025-11-01") }],
  PriceAlert: [
    { id: "pa1", currency: "BTC", target_price: 75000, direction: "above", status: "active", created_date: iso("2026-05-20") },
    { id: "pa2", currency: "ETH", target_price: 3000,  direction: "below", status: "triggered", triggered_price: 2980, created_date: iso("2026-05-18") },
  ],
  PersonalWatchlist: [
    { id: "wl1", symbol: "BTC", name: "Bitcoin", note: "Core holding" },
    { id: "wl2", symbol: "SOL", name: "Solana", note: "Momentum" },
    { id: "wl3", symbol: "DOGE", name: "Dogecoin", note: "" },
  ],
  StakingPosition: [
    { id: "sp1", currency: "ETH", staked_amount: 1.5, apy: 4.2, rewards_claimed: 0.018, status: "active", staked_at: iso("2026-02-01"), validator_name: "Lido" },
    { id: "sp2", currency: "SOL", staked_amount: 10,  apy: 6.8, rewards_claimed: 0.34,  status: "active", staked_at: iso("2026-03-15"), validator_name: "Marinade" },
  ],
  SavingsGoal: [{ id: "sg1", name: "Holiday Fund", target_amount: 5000, current_amount: 2150, currency: "USDC", deadline: iso("2026-12-01") }],
  UserSession: [{ id: "us1", device: "Chrome · Windows", ip: "—", last_active: iso("2026-05-31"), current: true }],

  // ERC-20 allowances (Phase S2 — Token Approvals). Testnet only: every entry is
  // Sepolia USDC (the one verified-address token), so a revoke decodes/builds for
  // real and, on a native testnet build, would actually broadcast approve(.,0).
  // `allowance_raw` is in base units (USDC = 6 decimals). The UNLIMITED rows use
  // MaxUint256 (2^256-1) so calldata.js flags them exactly as the confirm screen
  // would. `trusted` only tunes the risk badge — it never relaxes any guard.
  TokenApproval: [
    { id: "ta1", network: "sepolia", token_symbol: "USDC", decimals: 6, token_contract: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", spender_name: "Uniswap V3 Router", spender_address: "0xe592427a0aece92de3edee1f18e0157c05861564", allowance_raw: "115792089237316195423570985008687907853269984665640564039457584007913129639935", trusted: true,  status: "active", last_used: iso("2026-05-20") },
    { id: "ta2", network: "sepolia", token_symbol: "USDC", decimals: 6, token_contract: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", spender_name: "Unknown Contract", spender_address: "0x3fc91a3afd70395cd496c647d5a6cc9d4b2b7fad", allowance_raw: "115792089237316195423570985008687907853269984665640564039457584007913129639935", trusted: false, status: "active", last_used: iso("2025-08-20") },
    { id: "ta3", network: "sepolia", token_symbol: "USDC", decimals: 6, token_contract: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", spender_name: "Aave V3 Pool",      spender_address: "0x87870bca3f3fd6335c3f4ce8392d69350b4fa4e2", allowance_raw: "1000000000", trusted: true,  status: "active", last_used: iso("2026-04-12") },
    { id: "ta4", network: "sepolia", token_symbol: "USDC", decimals: 6, token_contract: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", spender_name: "OpenSea Seaport",   spender_address: "0x00000000000000adc04c56bf30ac9d3c0aaf14dc", allowance_raw: "0", trusted: true, status: "revoked", last_used: iso("2026-03-01") },
  ],

  // ERC-20 token HOLDINGS (Phase S2 — Spam Token Filter). Testnet/demo display
  // data only — these are never sent or signed; `token_contract` is for display.
  // The first two are real, purchased, verified-listed tokens. The rest are the
  // scam-airdrop patterns the filter catches: a website-link name, "claim/reward"
  // lure wording, an emoji/homoglyph ticker, a Telegram link — all airdropped
  // unsolicited and worth $0. `acquired_via` + `verified` + `value_usd` drive
  // src/wallet-core/evm/spam.js classifyToken(). Hiding is display-only.
  WalletToken: [
    { id: "tok1", network: "sepolia", symbol: "USDC", name: "USD Coin",       token_contract: "0x1c7d4b196cb0c7b01d743fbc6116a902379c7238", balance: 1250,    value_usd: 1250.0, acquired_via: "purchase", verified: true },
    { id: "tok2", network: "sepolia", symbol: "WETH", name: "Wrapped Ether",  token_contract: "0xfff9976782d46cc05630d1f6ebab18b2324d6b14", balance: 0.42,    value_usd: 1344.0, acquired_via: "purchase", verified: true },
    { id: "tok3", network: "sepolia", symbol: "USDC", name: "USDC-Rewards.com", token_contract: "0xdeadbeef00000000000000000000000000000003", balance: 5000,  value_usd: 0.0, acquired_via: "airdrop", verified: false },
    { id: "tok4", network: "sepolia", symbol: "CLAIM", name: "Claim 5,000 USDT Reward", token_contract: "0xdeadbeef00000000000000000000000000000004", balance: 5000, value_usd: 0.0, acquired_via: "airdrop", verified: false },
    { id: "tok5", network: "sepolia", symbol: "🎁GIFT", name: "Free Gift Token", token_contract: "0xdeadbeef00000000000000000000000000000005", balance: 1000000, value_usd: 0.0, acquired_via: "airdrop", verified: false },
    { id: "tok6", network: "sepolia", symbol: "AIRDROP", name: "t.me/airdropclaim", token_contract: "0xdeadbeef00000000000000000000000000000006", balance: 250, value_usd: 0.0, acquired_via: "airdrop", verified: false },
  ],
};

// Per-session mutable copies so create/update/delete behave during the demo.
const store = {};
const tableFor = (name) => (store[name] ||= (SEEDS[name] ? SEEDS[name].map((r) => ({ ...r })) : []));
let idSeq = 1000;
const nextId = () => "demo-" + (++idSeq);
const ok = (v) => Promise.resolve(v);

const matches = (row, query) =>
  !query || Object.entries(query).every(([k, v]) => row[k] === v);

function makeEntity(name) {
  return {
    list: (_sort, _limit) => ok(tableFor(name).slice()),
    filter: (query) => ok(tableFor(name).filter((r) => matches(r, query))),
    get: (id) => ok(tableFor(name).find((r) => r.id === id) || null),
    create: (data) => {
      const row = { id: nextId(), created_date: iso(Date.now()), ...data };
      tableFor(name).unshift(row);
      return ok(row);
    },
    update: (id, data) => {
      const t = tableFor(name);
      const i = t.findIndex((r) => r.id === id);
      if (i >= 0) t[i] = { ...t[i], ...data };
      return ok(t[i] || { id, ...data });
    },
    delete: (id) => {
      const t = tableFor(name);
      const i = t.findIndex((r) => r.id === id);
      if (i >= 0) t.splice(i, 1);
      return ok({ success: true });
    },
    subscribe: () => () => {},
  };
}

const entities = new Proxy({}, {
  get: (cache, name) => (cache[name] ||= makeEntity(String(name))),
});

export const demoBase44 = {
  entities,
  asServiceRole: { entities },
  auth: {
    me: () => ok(DEMO_USER),
    updateMe: (data) => ok({ ...DEMO_USER, ...data }),
    logout: () => ok(undefined),
    setToken: () => {},
    loginViaEmailPassword: () => ok({ user: DEMO_USER }),
    loginWithProvider: () => ok({ user: DEMO_USER }),
    register: () => ok({ user: DEMO_USER }),
    verifyOtp: () => ok({ success: true }),
    resendOtp: () => ok({ success: true }),
    resetPassword: () => ok({ success: true }),
    resetPasswordRequest: () => ok({ success: true }),
    redirectToLogin: () => {},
  },
  functions: {
    invoke: () => ok({ data: {} }),
  },
  integrations: {
    Core: {
      InvokeLLM: () => ok({ response: "This is a demo response." }),
      SendEmail: () => ok({ success: true }),
      UploadFile: () => ok({ file_url: "" }),
    },
  },
};
