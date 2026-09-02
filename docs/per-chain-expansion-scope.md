# Per-chain asset expansion — scope (SafePal-style rows)

**Status:** SCOPE ONLY, NOT IMPLEMENTATION. Nothing in this doc has shipped.
**Owner decision needed** on every phased choice below before code lands.

## Goal

Home portfolio shows one row per **(token, chain)** pair, e.g. `ETH (Ethereum)`,
`ETH (Arbitrum)`, `ETH (Optimism)`, `USDC (Ethereum)`, `USDC (Polygon)`,
`USDC (Arbitrum)`, `USDC (Base)` — matching the SafePal layout the user asked
for.

## Non-goals

- Non-EVM chain expansion (Tron, Cosmos, Aptos, TON, etc.) — out of scope.
- New signing families. Everything in scope reuses existing EVM / BTC / SOL
  derivation.
- Any dropping of the "one address per chain family" invariant. EVM rows
  continue to share the m/44'/60'/0'/0/0 address across chains.

## Current identity model (verified against `main`)

Identity is **symbol-only** end to end. `getAsset(symbol)` in
[assets.js:131](src/wallet-core/assets.js#L131) returns a single row per ticker,
and every downstream consumer collapses on symbol:

| Layer | File | Symbol-only assumption |
|---|---|---|
| Asset registry | [assets.js:28-129](src/wallet-core/assets.js#L28) | `ASSETS` array keyed by unique `symbol` |
| Portfolio compute | [portfolioBalances.js:139-164](src/lib/portfolioBalances.js#L139) | `assetTotals[symbol]`, `byWallet[id].assets` |
| USD rate | [portfolioBalances.js:37-41](src/lib/portfolioBalances.js#L37) | `usdRate(symbol)` |
| Enabled list | [walletMeta.js:29,40-41,63-66](src/lib/walletMeta.js#L29) | `enabledAssets: string[]`, `Set` dedup |
| Row render | [WalletPortfolioPage.jsx:831-839](src/pages/WalletPortfolioPage.jsx#L831) | map over `w.enabledAssets` |
| Detail route | same | `/asset/:symbol` |
| Balance resolver | [balanceDisplay.js](src/lib/balanceDisplay.js) | `resolveAssetRow(assets, symbol)` |
| Price map | [coinGecko.js:15-30,37](src/lib/coinGecko.js#L15) | `TICKER_TO_CG`, `PORTFOLIO_TICKERS` de-duped by symbol |

**Already chain-aware** (least rework):
- Send flow: [SendCrypto.jsx:615-660,657-1041,1685-1787](src/pages/SendCrypto.jsx#L615)
  resolves `networkKey = selectedAsset.chain` and threads it through
  `getBalanceEth`, `getTokenBalance`, `buildTokenTransfer`, `getToken`.
- WalletConnect H-7 chain binding: [WalletConnectProvider.jsx:254-257,519-540,599-667,837-878,1014-1119](src/lib/WalletConnectProvider.jsx#L254)
  is CAIP-2 (`eip155:<chainId>`) throughout — never touches `asset.symbol`.

**Latent composite identity:** none. Grepped for `rowKey`/`assetKey`/composite
patterns; zero hits. This is a from-scratch identity change, not an unwiring
of dead code.

## Blocker: ERC-20 registry gap

[tokens.js:49-59](src/wallet-core/evm/tokens.js#L49) only knows USDC/USDT on
`sepolia` and `mainnet`. `getToken(networkKey, symbol)` throws on any other
chain. Every SafePal-style USDC/USDT row for Polygon / Arbitrum / Optimism /
Base / Avalanche / BNB is a from-scratch entry with a verified contract
address + on-chain testnet transfer.

Concrete gap (symbols × chains we'd need to add, at minimum for SafePal parity):

| symbol | mainnet chains needed | testnet chains needed |
|---|---|---|
| USDC | Ethereum ✓, Polygon, Arbitrum, Optimism, Base, Avalanche | Sepolia ✓, Polygon Amoy, Arbitrum Sepolia, OP Sepolia, Base Sepolia, Fuji |
| USDT | Ethereum ✓, Polygon, Arbitrum, Optimism, Avalanche, BNB | Sepolia ✓, Polygon Amoy, Arbitrum Sepolia, OP Sepolia, Fuji, BSC Testnet |
| ETH (native) | Ethereum ✓, Arbitrum ✓, Optimism ✓, Base | Sepolia ✓, Arbitrum Sepolia ✓, OP Sepolia ✓, Base Sepolia |

Base is not in [networks.js](src/wallet-core/evm/networks.js) today — adding
it is prerequisite to any Base row.

## Target identity model

Composite key `AssetId = { symbol, chain }` (string form `"{symbol}:{chain}"`,
e.g. `"USDC:polygon"`, `"ETH:arbitrum"`). Every layer above migrates from
symbol-only to composite. No layer keeps both.

## Storage migration (mandatory, blocks release)

`veyrnox-wallet-meta` stores `enabledAssets: string[]` of bare symbols
([walletMeta.js:29](src/lib/walletMeta.js#L29)). Every existing install has
these persisted. Options:

- **A. Expanding rewrite in `reconcileWalletMeta`** ([walletMeta.js:158-180](src/lib/walletMeta.js#L158)):
  read old symbol-only entries once, expand each to its default `(symbol, chain)`
  set (e.g. old `"USDC"` → `["USDC:mainnet"]` by default; user opts into more
  chains explicitly). Idempotent. Recommended.
- B. Wipe + force re-enable — breaks continuity.
- C. Dual-read (old + new keys) forever — perpetual complexity.

Existing `sanitizeAssets` (`Set` dedup, [walletMeta.js:63-66](src/lib/walletMeta.js#L63))
must switch from a symbol `Set` to a composite `Set` or duplicate rows collapse
silently.

## Blast radius (files by phase)

**Phase 0 — foundation** (no user-visible change):
- Introduce `AssetId` type + composite-key helpers (new file
  `src/wallet-core/assetId.js`).
- Expand `ASSETS` to allow multiple rows per symbol; `getAsset` becomes
  `getAsset(assetId)`; keep a symbol-only lookup for callers that legitimately
  don't care about chain (price feed, coin logo).
- Migrate storage in `reconcileWalletMeta`.
- All existing symbol-only callers migrated to composite. No new user-visible
  rows yet.

**Phase 1 — display expansion** (new rows appear):
- Add `USDC` and `USDT` `(symbol, chain)` rows in `ASSETS` for chains we can
  actually derive/balance/price. Each row requires a verified testnet contract
  in `tokens.js`.
- Add `ETH` rows for Arbitrum / Optimism (Base = separate item below).
- `WalletPortfolioPage.jsx` renders one row per composite; label = `symbol
  (chain)`.
- Price mapping (`TICKER_TO_CG`): no change required — same USD price shared
  across chains per symbol is correct behaviour (`ETH:arbitrum` and
  `ETH:mainnet` legitimately share one price).

**Phase 2 — Base network** (independent, may parallel Phase 1):
- Add Base mainnet + Base Sepolia to
  [networks.js](src/wallet-core/evm/networks.js).
- Verify native ETH balance read + testnet transfer on Base Sepolia (on-chain
  txid required per repo verification rule).
- Then Base rows for ETH + USDC in Phase 1.

**Phase 3 — send + WC** (verify, mostly no code):
- Send flow ([SendCrypto.jsx:615-660](src/pages/SendCrypto.jsx#L615)) already
  reads `asset.chain` — verify per new row via on-chain testnet transfer.
- WalletConnect chain binding is CAIP-2 already, no change.

**Phase 4 — cleanup**:
- Delete symbol-only shims from Phase 0 once no callers remain.
- Update `docs/Feature-Status.md`.

## Tests to update / write

Existing symbol-only assertions ([walletMeta.test.js:25,49](src/lib/__tests__/walletMeta.test.js#L25),
[assets.test.js](src/wallet-core/__tests__/assets.test.js), plus ten
`wallet-core/__tests__/*.test.js` files using bare `'ETH'`/`'USDC'`/`'MATIC'`
strings) must migrate to composite keys. Write new tests:

- Round-trip migration test for `reconcileWalletMeta` — old symbol-only meta
  → new composite meta → same set of enabled rows.
- Per new `(symbol, chain)` row: contract-address correctness test (checksummed
  address, right decimals).
- Regression test that `getAsset(assetId)` never returns a row where
  `assetId.chain !== row.chain` (identity integrity).

## Risks (I4 — do not ship rows we can't honour)

- **Fabricated rows.** Every added `(symbol, chain)` row must ship with:
  (a) a verified testnet contract in `tokens.js` for ERC-20 rows;
  (b) a real on-chain testnet transfer through the full UI send path;
  (c) a real balance read against a public RPC.
  Absent any of the three, the row is HONEST-DISABLED (`status: receive_only`
  or hidden) until it lands. Do NOT ship a row user can see but can't send
  from.
- **Storage migration reversibility.** `reconcileWalletMeta` runs before
  vault decrypt; a broken migration silently drops user rows. Ship migration
  behind a defensive read-through fallback for one release.
- **Telemetry field shape.** `receive_viewed` / `send_completed` events carry
  `asset symbol` per CLAUDE.md; those become ambiguous under multi-chain
  symbols. Add `chain` field alongside (backward compat: keep `symbol`, add
  optional `chain`). Do NOT drop `symbol`.
- **`/asset/:symbol` route.** Deep-linked and referenced by
  [WalletPortfolioPage.jsx:831](src/pages/WalletPortfolioPage.jsx#L831) and
  the send/receive wiring. Route becomes `/asset/:symbol/:chain` (or
  `/asset/:assetId`) — route migration + redirect from old form for one
  release.
- **Feature-flag phasing.** Phase 1 changes user-visible surface; gate behind
  a flag (`VITE_MULTI_CHAIN_ROWS`) so we can dark-launch to
  internal-testing without blocking a release cycle.
- **Independent audit gate.** Wallet-core identity change touches the same
  layer the outstanding third-party audit covers. Confirm with the auditor
  whether Phase 0 is in-scope for the audit already in flight or requires
  re-scoping.

## Estimate

Phase 0: ~2-3 days engineering + 1 day review. No user-visible change.
Phase 1 (USDC/USDT/ETH on already-supported chains): ~1 day per (symbol, chain)
row, dominated by testnet verification (funded faucet + on-chain txid capture).
~5-8 rows in first cut = 1-2 weeks.
Phase 2 (Base): ~2-3 days including RPC + explorer wiring + testnet transfer.
Phase 3/4: ~1-2 days.

**Not a one-PR change.** Estimate 6-8 PRs across 2-3 sprints.

## Open owner questions

1. Which chains to prioritise for USDC/USDT? SafePal ships Ethereum + Polygon
   + Arbitrum + Optimism + Base + BNB + Avalanche. Ship all in one wave, or
   phase by user demand?
2. Include Base? (Requires Phase 2 network work in addition to Phase 1.)
3. `/asset/:symbol` route — migrate URL shape now (breaks external deep links)
   or dual-route for a release?
4. Feature flag on/off default? Suggest OFF-by-default in first release, ON
   in the release after that if internal-testing metrics look clean.
