# LiveBalances / Deniability (I3) Audit — 2026-07-12

**Scope:** Live balance reads and their I3 (deniability = zero-egress) guarantees —
`sol/provider.js`, `sol/send.js`, `sol/hw-send.js`, `btc/provider.js`, `evm/provider.js`,
`portfolioBalances.js`, `hiddenBalance.js`, `decoyBalance.js`, `priceFeed.js`,
`LiveBalances.jsx`, `SendCrypto.jsx`, `WalletPortfolioPage.jsx`.

**Method:** Two independent passes were commissioned. The **honest-reviewer** pass
completed. The **Codex** pass FAILED to produce a report on both attempts — its CLI
lost the websocket to `chatgpt.com` mid-run (`No such host is known` → `stream
disconnected before completion`), a transient network outage, not a code/prompt issue.
To stand in for the missing second opinion, **each HIGH finding below was independently
re-verified against the source by direct code inspection** (file:line cited). This
remains an **INTERNAL** audit — two internal signals, NOT the outstanding independent
third-party audit.

---

## Findings (ranked)

| # | Severity | Status | Finding | Location |
|---|----------|--------|---------|----------|
| H1 | **HIGH** | CONFIRMED (reviewer + direct code re-verify) | **SOL balance primitive bypasses the I3 guard on the send path.** `getBalanceLamports` carries no `isDeniabilitySessionActive()` guard; only its display sibling `getBalanceSol` and `estimateSolSend` do. `sol/send.js` (`signAndBroadcastSol`) and `sol/hw-send.js` call the raw primitive directly. The only `isDecoy/isHidden` check near the Send handler (`SendCrypto.jsx:187`) guards ENS/SNS *name resolution* — **not** the signer. So a hidden/stealth wallet (which legitimately spans EVM+BTC+SOL) sending SOL fires live `getBalance` RPC to a third-party node **during an active deniability session** = real I3 egress. Asymmetric: the identical BTC send path fails closed (`getUtxos` is guarded), EVM works via `getProvider`. Three divergent, un-reconciled behaviours. | `sol/provider.js:112-124`; callers `sol/send.js:300,303,365,368`, `sol/hw-send.js:67,70`; gate gap `SendCrypto.jsx:187` vs send `:889` |
| H2 | **HIGH** | CONFIRMED (reviewer + direct code re-verify) | **`/live-balances` leaks the internal I3 guard string as a deniability tell.** The route (`App.jsx:214`) has no `isDecoy/isHidden` gate. In a decoy/hidden session, `getBalanceEth` throws the literal `"I3: no egress in deniability session"`, and `LiveBalances.jsx:86` renders `e?.message` verbatim in the error box — a plain-English tell that the current session is a decoy/hidden mode, defeating I3. | route `App.jsx:214`; `LiveBalances.jsx:86` |
| M1 | **LOW** (was flagged MEDIUM) | CONFIRMED, downgraded | `hiddenBalance.js:151` throws a **raw string** `'I3: no egress…'` rather than `new Error(...)`, inconsistent with every sibling guard (`decoyBalance.js`, `priceFeed.js`, all providers). The one caller (`StealthWallets.jsx:91`) reads `e?.message` → `undefined` → degrades to a generic fallback (harmless here, arguably *safer*), but any `instanceof Error`/telemetry path misclassifies it. Code-quality/consistency, not a break. | `hiddenBalance.js:151` |
| L1 | **LOW** (design-honesty) | PLAUSIBLE | `computePortfolio`/`usePortfolio` has **no I3 gate of its own** (`WalletPortfolioPage.jsx:535` calls it unconditionally). Its safety is *inherited* entirely from provider-layer guards — which H1 just proved are inconsistent. No portfolio-layer test asserts zero egress in a decoy/hidden session. Add an explicit `isDeniabilitySessionActive()` short-circuit as a second independent layer. | `portfolioBalances.js:15-20`; `WalletPortfolioPage.jsx:535` |

## Refuted / PASS (recon flags that did NOT hold)

- **Flag #3 — `refetchPrices` manual `refetch()` bypass (PR #614 class):** REFUTED. The Live/refresh button only mounts when `priceBasis === 'live'`, and `useLivePrices`'s `enabled` gate forces `priceBasis` to `'approx'` whenever `isDecoy/isHidden`. Button never renders in a deniability session; `fetchLivePricesUsd()` also self-guards. (`priceFeed.js:62-92`, `WalletPortfolioPage.jsx:740-753`)
- **Flag #5 — silent-zero-on-error:** REFUTED. `fetchAssetAmount`/`computePortfolio` implement the I4 indeterminate pattern (`null` on failure, never folded into `0`; `WalletPortfolioPage.jsx:733-738` renders `PARTIAL_TOTAL_NOTE`). Correct.

## Not verifiable by static analysis (flagged, not closed)

- Full runtime proof that `WalletProvider.unlock()` never derives/passes a **real**-wallet
  address into `wallets`/`walletAddresses` during a decoy/hidden render. The guarding
  comments and portfolio callback guards read correct, and provider-layer guards block
  egress by defense-in-depth — **except** the H1 SOL hole. A device/runtime trace is needed
  to fully close this.
- Whether `/live-balances` is reachable via the nav menu (not just the route table) in an
  active decoy/hidden session — route is ungated regardless (H2 stands via deep-link).

---

## Recommended fixes

1. **H1 (do first):** Guard `getBalanceLamports` itself (match BTC's `getUtxos` choke-point
   pattern) **or** gate the whole non-EVM decoy/hidden send capability at the
   `SendCrypto.jsx` handler with one documented decision (decoy/hidden = EVM-only, or
   all-chain fail-closed) — replacing the current three divergent behaviours. TDD-gated
   (wallet-core). Add a test asserting a hidden-session SOL send makes zero RPC calls.
2. **H2:** Catch the I3-specific error in `LiveBalances.jsx` and rewrap as a generic
   RPC-failure message before display (never surface internal guard strings); optionally
   hard-gate the route behind `!isDecoy && !isHidden`.
3. **M1:** `throw new Error('I3: no egress in deniability session')` in `hiddenBalance.js:151`.
4. **L1:** Add an explicit `isDeniabilitySessionActive()` short-circuit inside
   `computePortfolio`/`usePortfolio` as a second, independent layer + a portfolio-layer
   zero-egress test.

## Honesty note

This is an INTERNAL audit. The Codex second pass did not complete (network failure both
attempts); the HIGH findings were re-verified by direct code inspection in its place, but
that is not an independent third-party audit. Nothing here is "verified" in the on-chain
sense. The independent third-party audit remains outstanding.
