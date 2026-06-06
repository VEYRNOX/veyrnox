# BTC + SOL send dispatch wiring

**Date:** 2026-06-06
**Branch:** `feat/btc-sol-send-dispatch` (off the current send-work branch; the
uncommitted EVM multi-asset batch is committed first so this slice starts clean)
**Status:** Approved design — ready for implementation plan

## Problem

`src/pages/SendCrypto.jsx` only dispatches EVM sends. Its signing mutation
branches `isErc20 ? sendToken(...) : signAndBroadcast(...)` — both EVM paths —
and several setup values silently assume EVM:

- **Network key** (`SendCrypto.jsx:169`): `(isEvmFamily(selectedAsset) &&
  selectedAsset?.chain) || "sepolia"`. A `btc`/`solana` asset falls through to
  `"sepolia"`.
- **Live-balance query** (`SendCrypto.jsx:178`): for any non-ERC20 asset it calls
  `getBalanceEth(networkKey, address)`. For a BTC/SOL address + non-EVM network
  key this misfires.
- **Result recording** (the `sendTx` mutation): uses `tx.hash`, `tx.explorerUrl`,
  and `tx.wait(1)` — shapes only the EVM send returns.

So a BTC or SOL asset cannot be sent through the UI even under the dev ungate,
even though the wallet-core send stack for both already exists and is reused
verbatim. This is the work the multi-asset verification checklist calls out as
*"NOT in this batch — needs Section C dispatch wiring."*

The wallet-core layer is **already complete**:

- `src/wallet-core/btc/send.js` — `signAndBroadcastBtc({ networkKey, privateKey,
  publicKey, fromAddress, toAddress, amountSats })` → `{ txid, hex, explorerUrl,
  plan }`, with a fee/change-conservation backstop.
- `src/wallet-core/sol/send.js` — `signAndBroadcastSol({ networkKey, privateKey,
  fromAddress, toAddress, amountLamports })` → `{ signature, explorerUrl, plan,
  attempts }`, with rent-safety and blockhash-expiry retry.
- `WalletProvider` already exposes the transient key accessors:
  - `withBtcPrivateKey(fn)` → `fn({ privateKey, publicKey, address })` (BIP-84).
  - `withSolPrivateKey(fn)` → `fn({ privateKey, publicKey, address })` (ed25519
    32-byte seed).
- `isValidAddressForCurrency` already validates BTC (format regex) and SOL
  (base58 → ed25519 key).

Only the **glue** is missing: a family dispatch branch, a precision-safe
decimal→base-unit conversion (sats / lamports), the correct per-family network
key, and per-family result normalization.

## Goal

Route the `btc` and `solana` families through `SendCrypto.jsx` to their existing
wallet-core send functions, with precision-safe unit conversion and signing
tests, so a **dev-ungated testnet/devnet** send produces a real txid. No asset
status changes; no new fee UI.

## Non-goals (explicitly out of scope for this slice)

- No BTC fee-rate selector and no SOL priority-fee selector — sends use the
  auto-fetched fee rate (BTC) / base fee (SOL). The existing EIP-1559
  `FeeSelector` is rendered for EVM only.
- No live on-chain balance read for BTC/SOL — the max-check falls back to the DB
  balance; the wallet-core send functions enforce the real balance / coin-
  selection / rent constraints internally and throw actionable errors.
- No status flips. BTC and SOL stay `receive_only` in `assets.js`. An asset moves
  to `live` only after a confirmed testnet/devnet txid (per the checklist).
- No change to any wallet-core send/derivation module — they are reused verbatim.

## Architecture

A small, framework-free dispatch/units module holds all the new testable logic;
`SendCrypto.jsx` stays thin glue. This matches the repo's established pattern
(pure, unit-tested helpers because there is no React Testing Library).

### Component 1 — `src/lib/sendDispatch.js` (new, pure)

```
toBaseUnits(amountStr, decimals) -> bigint
```
String-based decimal→integer conversion, **no floating point**. Splits on the
decimal point, right-pads the fractional part to `decimals`, and assembles a
`BigInt`. Examples: `toBaseUnits("0.0001", 8) === 10000n`;
`toBaseUnits("1.5", 9) === 1_500_000_000n`. Throws (never silently truncates) on:
empty/non-numeric input, a negative amount, or more fractional digits than
`decimals` (e.g. `toBaseUnits("0.000000001", 8)` throws — 9 dp into an 8-dp
asset). A zero amount throws (the form already blocks it, but the helper is
defensive).

```
normalizeSendResult(family, raw) -> { hash, explorerUrl }
```
Maps each family's distinct result shape to one record shape:
- `evm` / `erc20`: `{ hash: raw.hash, explorerUrl: raw.explorerUrl }`
- `btc`: `{ hash: raw.txid, explorerUrl: raw.explorerUrl }`
- `solana`: `{ hash: raw.signature, explorerUrl: raw.explorerUrl }`

Both functions are pure and have no React / network dependency.

### Component 2 — `src/pages/SendCrypto.jsx` (thin glue)

1. **Context:** also destructure `btcAccount, solAccount, withBtcPrivateKey,
   withSolPrivateKey` from `useWallet()`.
2. **Network key:** generalize to `selectedAsset?.chain || "sepolia"` so BTC
   resolves to `testnet` and SOL to `devnet`. Keep the EVM `getNetworkInfo`
   lookup gated to EVM families; for BTC/SOL derive `nativeSymbol` from the
   currency (BTC/SOL) instead of the `"ETH"` fallback, and `networkName` from the
   asset.
3. **Live-balance query:** gate `enabled` with `(isEvmFamily(selectedAsset) ||
   isErc20)` so `getBalanceEth` never fires for a BTC/SOL address. With the query
   disabled, `liveBalance` stays `undefined` and `effectiveBalance` falls back to
   `selectedWallet.balance` (the DB value).
4. **Dispatch** in the `sendTx` mutation, branching on `selectedAsset.family`
   (the hard `canSend()`-or-`devUngated` gate above it is unchanged):
   - `btc`:
     ```js
     raw = await withBtcPrivateKey(({ privateKey, publicKey, address }) =>
       signAndBroadcastBtc({ networkKey, privateKey, publicKey,
         fromAddress: address, toAddress, amountSats: toBaseUnits(amount, 8) }));
     ```
   - `solana`:
     ```js
     raw = await withSolPrivateKey(({ privateKey, address }) =>
       signAndBroadcastSol({ networkKey, privateKey, fromAddress: address,
         toAddress, amountLamports: toBaseUnits(amount, 9) }));
     ```
   - otherwise: the existing EVM `withPrivateKey(...)` path, unchanged.
5. **Result recording:** `const { hash, explorerUrl } = normalizeSendResult(
   selectedAsset.family, raw)`; record the `Transaction` with `tx_hash: hash`,
   `explorer_url: explorerUrl`. Call `raw.wait(1)` **only** on the EVM path
   (BTC/SOL results have no `.wait`; SOL confirms internally, BTC is broadcast) —
   on the non-EVM path just invalidate the balance/transaction queries.
6. **FeeSelector:** render for EVM families only; for BTC/SOL show a short
   "network fee set automatically (testnet)" note. Simulation/preview and
   token-calldata decoding are already EVM-gated — no change.

### Data flow (BTC example)

```
user amount "0.0005" (BTC, form)
  -> toBaseUnits("0.0005", 8) = 50000n sats
  -> withBtcPrivateKey -> { privateKey, publicKey, address }
  -> signAndBroadcastBtc({ networkKey:"testnet", ..., amountSats:50000n })
       (coin-select + build + sign + fee/change backstop + broadcast)
  -> { txid, explorerUrl, ... }
  -> normalizeSendResult("btc", raw) = { hash: txid, explorerUrl }
  -> Transaction.create({ tx_hash: hash, explorer_url, status:"pending", ... })
  -> invalidate queries (no tx.wait)
```

## Error handling

- `toBaseUnits` throws on malformed / over-precise / non-positive input **before**
  any key is touched; the mutation's existing `onError` toasts the message.
- The wallet-core send functions already throw actionable errors (insufficient
  funds, BTC change/fee mismatch, SOL rent-exemption / blockhash expiry, wrong
  chain when gated, "provided key does not control the from address"). These
  surface through the same `onError` path — no new handling needed.

## Testing

- `src/lib/__tests__/sendDispatch.test.js` — `toBaseUnits` (8- and 9-dp happy
  paths, trailing-zero normalization, over-precision throws, zero / negative /
  empty / non-numeric throw); `normalizeSendResult` for each family.
- `src/wallet-core/__tests__/btc-send-signing.test.js` — **fills the current gap**
  (there is no BTC send-level test today): `buildAndSignTx` produces a finalized
  P2WPKH transaction committing to the correct recipient and amount; the
  fee/change conservation backstop holds (a mismatched plan fee is rejected); and
  the key-controls-`fromAddress` guard fires. Mirrors `evm-send-signing.test.js`.
- SOL signing: `sol-send.test.js` already covers the rent planner; add a focused
  assertion on `buildAndSignSol` (System transfer to the correct recipient pubkey
  and lamports; fee payer = sender) if not already present.
- **Honest coverage statement:** there is no `SendCrypto` React component test
  (the repo has no React Testing Library). The new React glue is covered by the
  pure `sendDispatch` tests plus the manual testnet verification checklist —
  stated, not silently skipped.
- Verification gate: `eslint` on changed files, `npm run build`, full `npm test`
  green (previous count + the new tests).

## Documentation

Update `docs/multi-asset-send.verification-checklist.md`: move BTC (testnet,
BIP-84) and SOL (devnet) out of the "NOT in this batch" section into the
per-asset verification table, since their dispatch is now wired.

## Known limitation (disclosed, not hidden)

The sign-time spend-limit check converts the amount to USD via `USD_RATES`. If
BTC/SOL lack a rate there, `txLimits.toUsd` under-counts the send 1:1 against the
USD cap. This is acceptable on a dev-only testnet/devnet path (no real value) and
is flagged here rather than masked; pricing those assets for the cap check is a
separate concern tracked with the broader USD-rate work.
