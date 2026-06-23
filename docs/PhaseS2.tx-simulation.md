# Phase S2 — Transaction Simulation (pre-sign preview)

> Status: ✅ built, wired into Send→verify. Testnet/devnet only; mainnet gated.
> Independent ECC audit COMPLETE 2026-06-23 (§24 satisfied; findings resolved in
> PR #340, merged 8f1dd95) — no longer pending audit, like the rest of the S2 stack.

## What it is

A pre-sign PREVIEW of what a transaction will actually DO, shown at the Send
flow's verify step **before** the user signs/broadcasts. The #1 fund-loss vector
is users signing draining transactions they didn't understand; this turns the
opaque "approve?" into a human-readable outcome plus a set of KNOWN risk flags.

It is a READ-only preview. It holds no keys, performs no signing, and does not
touch the signing path (`vault.js`, `vaultStore.js`, `signing.js`, `evm/send.js`,
`token-send.js`). Simulation needs only the sender **address**, never the key.

## Privacy / wedge — LOCAL-FIRST, no phone-home

There is **no new phone-home surface and no third-party scoring service**
(no Blockaid/Tenderly-style API). Everything runs against the EXISTING,
user-trusted / self-hostable RPC the wallet already uses.

| Chain | Data source | RPC methods used |
|---|---|---|
| EVM | existing `evm/provider.js` (`getProvider`) | `eth_call` (dry-run), `eth_getBalance`, `eth_getCode` |
| BTC | existing Esplora indexer (UTXOs/fee) via the coin-selection plan | (no new calls — decodes the plan `estimateBtcSend` already built) |
| SOL | existing `sol/provider.js` Connection | (no new calls — decodes the planned transfer + local rent pre-flight) |

The look-alike / poisoning screen reuses `evm/poison.js`, which compares only
against the user's OWN history (local). The UI footer states the data source and
that nothing was sent to a third party.

## Per-chain handling (honest coverage)

- **EVM** — REAL local simulation. `eth_call` dry-runs the tx against current
  state and reverts if it would fail (predicted-failure flag). Predicts balance
  changes ("you send X, recipient receives Y"), decodes the call (reuses
  `evm/calldata.js`), and reads `eth_getCode` to spot unverified contracts.
- **BTC** — no programmable execution to simulate, so we do NOT fake a
  "simulation". We decode the EXACT transaction the user will sign: inputs,
  outputs, change-to-self, and fee, derived locally from the coin-selection plan.
- **SOL** — decodes the System transfer instruction (from/to/amount, base +
  priority fee) and surfaces the result of the LOCAL rent-exemption /
  affordability pre-flight (`planSolTransfer`, which throws on dust-to-new-account
  and sender-stranding). Not a full program simulation.

## Risk patterns flagged (KNOWN patterns only)

- **Unlimited / MAX approval** (high) and exact-amount approval (medium)
- **Recipient on the local known-bad list** (high) — reuses `poison.js`
  `isLocallyFlagged` (burn/null sinks, known scam sinks)
- **Look-alike recipient / address poisoning** (high) — reuses `screenRecipient`
- **Unverified contract** (medium) — `eth_getCode` shows code and it's not in the
  wallet's verified token list (for approve, the spender is probed)
- **Predicted revert / FAIL** (high) — `eth_call` reverts
- **Unrecognised calldata** (high) — decoder can't identify the action
- **Large / entire-balance outflow** (medium/high) — drain-like amount vs balance

## WARN, never block; never "safe"

Findings are surfaced; the user still decides. The module **never** emits a
"safe" verdict — with no findings the UI shows: *"No KNOWN risk patterns
detected. This is not a guarantee of safety — absence of a detected issue does
not mean the transaction is safe."* Honest coverage is stated in-UI: this catches
KNOWN patterns and predicts outcomes via simulation; it is NOT equivalent to a
commercial telemetry feed and won't catch every novel threat.

## Code map

- `src/wallet-core/evm/simulate.js` — `assessEvmTransaction` (PURE risk/outcome
  core) + `simulateEvmTransaction` (networked `eth_call` dry-run).
- `src/wallet-core/btc/simulate.js` — `describeBtcPlan` (PURE plan decode).
- `src/wallet-core/sol/simulate.js` — `describeSolTransfer` (PURE transfer decode).
- `src/components/TransactionPreview.jsx` — presentational; renders a result.
- `src/components/TransactionSimulationDemo.jsx` — DEMO-only per-chain sample
  harness (real verify step is gated behind a live, unlocked ETH wallet).
- `src/pages/SendCrypto.jsx` — wires the live preview into the verify step
  (react-query) and the demo harness into the form step.
- Tests: `src/wallet-core/__tests__/simulate.test.js` (network-free; the
  networked `eth_call` path needs a live RPC and is not unit-tested, mirroring
  `erc20.test.js`).

## Verification (load the app, demo mode)

`/send?demo=1` → the "Transaction Simulation — demo preview" panel renders the
pre-sign preview for samples on every chain: clean ETH send (no known risks),
**unlimited approval** (high + unverified-contract), **known-bad recipient**
(high), **look-alike poisoning** (high), drain/entire-balance (high), Bitcoin
(decoded inputs/outputs/fee), Solana (decoded transfer + rent pre-flight). Each
shows the local-RPC / no-third-party disclosure and the not-a-guarantee-of-safety
line. In real use the same preview runs at the verify step against the live RPC
before the 2FA/confirm step.
