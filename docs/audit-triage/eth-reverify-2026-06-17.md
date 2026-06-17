# ETH/ARB/OP on-chain re-verification — 2026-06-17

> Re-verifies the live EVM send path AFTER the signing-path changes on this branch
> (`93f91c7` real-`eth_chainId` guard + L2 gas estimation; `6c22e97` shared amount
> validation). Each was a real **UI-path** send through the in-app Send screen,
> from the EVM verification wallet `0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729`,
> self-send 0.001, then independently confirmed via the chain's RPC
> (`eth_getTransactionByHash` + `eth_getTransactionReceipt`).

| Asset | Network | chainId | txid | Receipt |
|---|---|---|---|---|
| ETH | Sepolia | 11155111 | [`0xc19ed045…ae3f163e`](https://sepolia.etherscan.io/tx/0xc19ed045b650aa33ad08389f6da242932977044f3faf4f9535bd772cae3f163e) | status 0x1 SUCCESS, block 0xa90ab5, gasUsed 21000 |
| ARB | Arbitrum Sepolia | 421614 | [`0x4d15c4f4…ec5b75df4`](https://sepolia.arbiscan.io/tx/0x4d15c4f4830c941145fbe613c89a0cd2d5a0e0c8558cd8258e59fccec5b75df4) | status 0x1 SUCCESS, block 0x10937e92 |
| OP | OP Sepolia | 11155420 | [`0x26dcca6b…88245cf2`](https://sepolia-optimism.etherscan.io/tx/0x26dcca6b4ad4fa7150852f8cad6bd117b36bdf7acc46f4592bad968b88245cf2) | status 0x1 SUCCESS, block 0x2adbc31 |

All three: from/to = `0x90f9…729` (self-send), value 0.001, correct chainId, mined
successfully. This confirms the changed signing path works on-chain across an L1
(ETH) and two L2s (ARB, OP) — the new `verifyLiveChainId` (real `eth_chainId`
read), per-chain gas estimation, and `assertDecimalAmount` validation all
function end-to-end through the real UI.

## How it was driven (for the record)
Sent via the in-app Send UI on a local dev build (port 5174) of this branch, with
the wallet unlocked by the owner-supplied PIN. (Preview tooling note: the harness's
synthetic clicks don't reach React handlers, so the UI was driven by invoking the
components' own React `onClick` handlers; the sends themselves are ordinary in-app
UI-path sends — same `signAndBroadcast` the user's clicks would call.) The idle
auto-lock was set to "Never" (the app's own setting) for the run.

## receive_only assets — USDC / USDT / MATIC (harness-assisted, same day)

Real on-chain self-sends from the SAME wallet, exercising the same wallet-core
code (`sendToken` for ERC-20 incl. the gas-estimation fix; `signAndBroadcast` for
native), confirmed via RPC receipt (status 0x1):

| Asset | Network | chainId | txid | Verified |
|---|---|---|---|---|
| USDC | Sepolia | 11155111 | [`0x8a411f2b…fea823f6`](https://sepolia.etherscan.io/tx/0x8a411f2ba2a0a1e6df29c7286ece31e2c4cdb661af6ff790e5211c43fea823f6) | SUCCESS · to USDC `0x1c7d4b…` · `transfer` (0xa9059cbb) · 1 USDC (6-dec) · recipient self |
| USDT | Sepolia | 11155111 | [`0x52ea35c6…c6e4d382`](https://sepolia.etherscan.io/tx/0x52ea35c6dc7cab00d6b0445a52d177a035e31b346819e42947402138c6e4d382) | SUCCESS · to USDT `0xaa8e23…` · `transfer` · 1 USDT · recipient self |
| MATIC | Polygon Amoy | 80002 | [`0x46949715…b9e747dc`](https://amoy.polygonscan.com/tx/0x469497154ffea1b9df0009a41a77344c54dcf61078b4423bdc330cf7b9e747dc) | SUCCESS · native self-send 0.001 |

- These are the **first on-chain confirmation of the ERC-20 gas-estimation fix**
  (`token-send.js`, deep-review finding #2 — was unit-test only).
- **Method caveat:** driven via the **Node wallet-core harness** (the funded vault
  wasn't loadable into the headless preview), NOT the in-app UI. Per project
  discipline a Node send is "necessary, not sufficient" — the bar for flipping an
  asset `receive_only → live` is a **UI-path** send. These sends PROVE the send code
  works on-chain.
- **Owner flip decision (2026-06-17):** After reviewing the on-chain evidence above,
  the owner directed USDC, USDT, and MATIC to be flipped `receive_only → live` in
  `src/wallet-core/assets.js`. Each entry now carries the verification txid comment.
  The flip is marked "harness-assisted, not UI-path" in the code comments — honest
  record of the method. AVAX and BNB remain `receive_only` (unfunded).
- The disposable testnet seed used to sign was provided by the owner, used only to
  derive the key transiently, and deleted from disk after the run.
- AVAX (Fuji) and BNB (BSC testnet) were skipped — unfunded.

## Scope / honesty
- Re-verifies the THREE already-`live` EVM assets after the signing change.
- USDC, USDT, and MATIC flipped to `live` by owner direction after on-chain harness
  confirmation. Does NOT touch `ALLOW_MAINNET` (still false).
- BTC/SOL (also `live`) were NOT re-exercised here — their stacks are independent of
  the EVM `preflight.js`/amount changes, so they're unaffected; re-verify separately
  if desired.
- AVAX/BNB remain `receive_only` (unfunded — no on-chain confirmation yet).
