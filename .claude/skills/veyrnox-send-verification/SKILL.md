---
name: veyrnox-send-verification
description: >
  Use when verifying that a Veyrnox wallet asset can actually send on-chain, when
  flipping an asset from receive_only to live, or when updating multi-asset send
  status. Enforces the project's "verify, don't assert" discipline: an asset is only
  "verified" after a real testnet transaction confirms on a block explorer — never
  from passing tests, code review, or a demo-mode send. Triggers on: "verify send",
  "multi-asset send", "mark asset live", "flip to live", "send verification",
  "receive_only", faucet/testnet send work.
---

# Veyrnox send verification

## The one rule that overrides everything

**An asset is "verified" ONLY when a real on-chain transaction confirms on a block
explorer and the user supplies the txid.** Passing unit tests, clean code review, a
green test suite, or a successful-looking send in demo mode are NOT verification. Never
flip an asset's `status` to `live` and never write "verified" in `Feature-Status.md`
without a real explorer-confirmed txid in hand from the user.

This rule exists because the real-wallet send path was once fully non-functional while
every test was green and the feature was marked "complete" — the gap between asserted
and verified is exactly what this skill guards.

## Demo-mode trap (check this FIRST)

Before any send verification, confirm the app is NOT in demo mode. Demo mode produces
fake balances and fake sends that never touch a chain.

- Demo is ON if any of: `?demo=1` in the URL, `VITE_DEMO_MODE=1`, native dev, OR a
  persisted `veyrnox-demo=1` in localStorage (this persists silently across reloads
  after a single `?demo=1` visit — the usual culprit).
- Tells you're in demo: a round seeded balance (e.g. "Main ETH — 2.4831 ETH"), a
  "Transaction Simulation — no live RPC in demo" box, pre-seeded wallets you didn't create.
- Clear it: visit `/?demo=0` once (removes the localStorage key), then reload the clean
  URL. Verify: a freshly created real wallet shows **0.0 on-chain** and no demo box.

## Real-mode preconditions

1. Demo OFF (above).
2. Dev ungate for receive_only assets: set `VITE_DEV_UNGATE_SEND=1` via a `.env.local`
   file (git-ignored) — NOT an inline shell var (fails on Windows/PowerShell). Restart
   `npm run dev`. This flips the gate decision only; it NEVER changes asset `status` and
   is provably dead-code-eliminated from production builds.
3. A real HD wallet created/unlocked with a throwaway testnet seed (never a seed holding
   real funds). The "From Wallet" picker must auto-select when only one wallet exists.
4. The DEV UNGATE banner only shows on a `receive_only` asset (ARB/OP/MATIC/AVAX/BNB/
   USDC/USDT) — never on ETH (already live). Its absence on ETH is expected, not a bug.

## Verification loop (per asset)

1. Confirm real mode + ungate active.
2. Get testnet funds from a faucet to the wallet's receive address (same address for all
   EVM chains). Faucets often require a small mainnet balance as anti-abuse — if refused,
   switch faucet or bridge, don't treat as a bug.
3. Send a small amount through the app UI (not a side script — test the real path).
4. Confirm on the chain's block explorer; capture the txid.
5. ONLY THEN: flip that one asset to `live` in `assets.js` and record the real txid + date
   in `Feature-Status.md`.

## Known per-chain gotchas

- **BNB testnet**: enforces a minimum gas price (supports EIP-1559/type-2 since Hertz,
  baseFee=0). The "Slow" fee tier can underprice and get rejected — use Standard+.
- **USDT**: no official Tether Sepolia; uses an Aave faucet stand-in — verify decimals(6)
  and address pinning against on-chain `decimals()`.
- **BTC / SOL**: distinct crypto paths AND historically not wired into the Send UI dispatch
  (fell through to the EVM path, defaulting networkKey to sepolia). Confirm dispatch wiring
  before attempting their verification.

## Status tagging discipline

Every asset/control is one of: **BUILT** (in code, testnet/provisional), **TARGET**
(designed, audit-gated, not confirmed in shipped code), **PLANNED** (roadmap),
**HONEST-DISABLED** (present but switched off on principle). Code-complete + tests green
= BUILT at most, never "verified". Mainnet and all seed-touching/hardening work stays
audit-gated per the master security architecture §24.
