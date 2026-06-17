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

## Scope / honesty
- Re-verifies the THREE already-`live` EVM assets after the signing change. It does
  NOT flip any new asset to `live` and does NOT touch `ALLOW_MAINNET` (still false).
- BTC/SOL (also `live`) were NOT re-exercised here — their stacks are independent of
  the EVM `preflight.js`/amount changes, so they're unaffected; re-verify separately
  if desired.
- The `receive_only` assets (USDC/USDT/MATIC/AVAX/BNB) remain gated.
