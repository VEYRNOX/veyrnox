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
  ],
  Transaction: [
    { id: "t1", type: "receive", currency: "ETH",  amount: 0.5,   status: "confirmed", created_date: iso("2026-05-30T10:00:00"), address: addr("0x"), to_address: addr("0x"), hash: addr("0x"), fee: 0.0012 },
    { id: "t2", type: "send",    currency: "USDC", amount: 200,   status: "confirmed", created_date: iso("2026-05-29T14:30:00"), address: addr("0x"), to_address: addr("0x"), hash: addr("0x"), fee: 0.21 },
    { id: "t3", type: "receive", currency: "BTC",  amount: 0.012, status: "pending",   created_date: iso("2026-05-29T09:15:00"), address: addr("bc1q"), to_address: addr("bc1q"), hash: addr("0x"), fee: 0.00003 },
    { id: "t4", type: "send",    currency: "SOL",  amount: 3.2,   status: "confirmed", created_date: iso("2026-05-28T18:45:00"), address: addr("So1"), to_address: addr("So1"), hash: addr("0x"), fee: 0.00005 },
    { id: "t5", type: "receive", currency: "BNB",  amount: 1.5,   status: "failed",    created_date: iso("2026-05-27T11:20:00"), address: addr("0x"), to_address: addr("0x"), hash: addr("0x"), fee: 0.0008 },
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
