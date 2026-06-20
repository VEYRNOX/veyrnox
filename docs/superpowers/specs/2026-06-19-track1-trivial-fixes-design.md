# Track 1 — Trivial Safe Fixes Design

**Date:** 2026-06-19
**Status:** Approved
**Audit refs:** C-1, C-3, C-4, H-3, H-7
**Scope:** Five independent one-file corrections with no cross-system interaction. No new abstractions, no API changes, no UI changes.

---

## Overview

Five audit findings that each require ≤5 lines of code in a single file. They are grouped into one PR because they share no dependencies and can all be reviewed, tested, and merged together safely.

---

## C-1 · BIP-39 passphrase normalisation (`mnemonic.js`)

### Problem
`mnemonicToSeed(mnemonic, passphrase)` normalises the mnemonic with NFKD but passes the passphrase raw to `mnemonicToSeedSync()`. BIP-39 §5 requires NFKD normalisation on both. A passphrase containing composed Unicode (e.g. `é` as U+00E9 vs `e` + U+0301) produces a different 64-byte seed on different devices, making the wallet irrecoverable cross-platform without error.

### Fix
Apply the existing `normalize()` helper (already defined as NFKD in the file) to the passphrase argument:

```js
// src/wallet-core/mnemonic.js
return mnemonicToSeedSync(normalize(mnemonic), normalize(passphrase));
```

### Compatibility
- Users with ASCII-only passphrases: no change (NFKD is identity on ASCII).
- Users with already-decomposed Unicode passphrases: no change (NFKD is idempotent).
- Users with composed Unicode passphrases on a non-normalising input: this fix makes their passphrase consistent across devices. They were already broken cross-device before the fix.

### Test
Add a unit test in `src/wallet-core/__tests__/vectors.test.js`:
- Input: valid mnemonic + passphrase `"café"` (composed é).
- Assert seed equals seed derived with passphrase `"café"` (decomposed é).
- Both must produce the same 64-byte hex output.

---

## C-3 · Confirmed-only UTXO filtering (`btc/send.js`)

### Problem
`getUtxos()` returns all UTXOs including unconfirmed ones. The `confirmed` boolean field on each UTXO object is never consulted by coin selection or `sendMax`. Spending an unconfirmed UTXO from an RBF-enabled sender can invalidate the wallet's transaction after broadcast.

### Fix
Filter UTXOs immediately after fetching, before passing to `selectCoins()`, in both `estimateBtcSend` and `signAndBroadcastBtc`:

```js
// src/wallet-core/btc/send.js
const allUtxos = await getUtxos(networkKey, fromAddress);
const utxos = allUtxos.filter(u => u.confirmed);
if (utxos.length === 0) {
  throw new Error('No confirmed UTXOs available. Unconfirmed balance is pending.');
}
```

`coinselect.js` stays pure (no change). `sendMax` inherits the filter because it consumes the same `utxos` variable.

### Test
Add a case in `src/wallet-core/__tests__/btc-coinselect.test.js`:
- UTXO pool: 2 confirmed + 1 unconfirmed.
- Assert plan uses only the 2 confirmed inputs.
- Assert that an all-unconfirmed pool throws with the "pending" message.

---

## C-4 · Per-chain `maxFeePerGas` ceiling (`evm/fees.js`)

### Problem
`buildEvmTiers()` computes `maxFeePerGas = baseFee × 2 + tip` using values from the RPC with no upper bound. A malicious or MITM'd RPC returning an inflated `baseFeePerGas` causes the signed transaction's gas ceiling to exceed the user's entire balance.

### Fix

#### Constants
Add a `MAX_BASE_FEE_GWEI` map keyed by `networkKey`. The cap is on `baseFeePerGas` (the on-chain source of truth), not on the derived `maxFeePerGas`:

```js
// src/wallet-core/evm/fees.js
const MAX_BASE_FEE_GWEI = {
  mainnet:          1_000n,
  polygon:            200n,
  arbitrum:           200n,
  optimism:           200n,
  avalanche:          200n,
  bnb:                200n,
  sepolia:          5_000n,
  polygonAmoy:      5_000n,
  arbitrumSepolia:  5_000n,
  optimismSepolia:  5_000n,
  avalancheFuji:    5_000n,
  bnbTestnet:       5_000n,
};
```

#### Guard in `buildEvmTiers`
`buildEvmTiers` currently receives `{ baseFeePerGasWei, suggestedTipWei, gasLimit }`. Add `networkKey` to its parameter object and insert the guard before any arithmetic:

```js
export function buildEvmTiers({ baseFeePerGasWei, suggestedTipWei, gasLimit, networkKey }) {
  const base = BigInt(baseFeePerGasWei);
  const capGwei = MAX_BASE_FEE_GWEI[networkKey];
  if (capGwei !== undefined) {
    const capWei = parseUnits(capGwei.toString(), 'gwei');
    if (base > capWei) {
      throw new Error(
        `RPC returned implausible base fee (${formatUnits(base, 'gwei')} gwei). ` +
        `Maximum accepted for ${networkKey} is ${capGwei} gwei. ` +
        `Check your RPC provider.`
      );
    }
  }
  // ... rest of existing logic unchanged
}
```

Add `formatUnits` to the existing `ethers` import line (`import { parseUnits, formatUnits } from 'ethers'`).

Update the one call site in `estimateEvmFeeTiers` to pass `networkKey` through:

```js
tiers: buildEvmTiers({ baseFeePerGasWei, suggestedTipWei, gasLimit: est, networkKey }),
```

#### Guard in `buildCustomFee`
The custom-fee path also accepts `maxBaseFeeGwei` from user input. Cap it the same way:

```js
export function buildCustomFee({ maxBaseFeeGwei, priorityGwei, gasLimit, networkKey }) {
  const capGwei = MAX_BASE_FEE_GWEI[networkKey];
  if (capGwei !== undefined && BigInt(Math.round(Number(maxBaseFeeGwei) || 0)) > capGwei) {
    throw new Error(`Custom max base fee exceeds the ${networkKey} ceiling of ${capGwei} gwei.`);
  }
  // ... rest unchanged
}
```

### Test
New test file `src/wallet-core/__tests__/evm-fees.test.js` (or extend existing):
- `buildEvmTiers` with `networkKey: 'mainnet'` and `baseFeePerGasWei` = 2000 gwei → throws.
- `buildEvmTiers` with `networkKey: 'mainnet'` and `baseFeePerGasWei` = 900 gwei → returns tiers.
- `buildEvmTiers` with `networkKey: 'sepolia'` and `baseFeePerGasWei` = 3000 gwei → returns tiers.
- `buildEvmTiers` with unknown `networkKey` → no cap applied, returns tiers (defensive: unknown chains not blocked).

---

## H-3 · Guard `getSignatureLanding` exception (`sol/send.js`)

### Problem
In the blockhash-expiry retry loop, `getSignatureLanding()` is awaited without a surrounding try/catch. `getSignatureLanding` has an internal catch for RPC errors, but a synchronous exception from `getConnection()` or an uncaught rejection bypasses it, propagating out of the loop as the loop's last error. The caller receives an ambiguous error; the tx may have landed.

### Fix
Wrap the call:

```js
// src/wallet-core/sol/send.js — inside the retry loop, replacing the bare await
let landing;
try {
  landing = await getSignatureLanding(networkKey, signature);
} catch {
  throw new Error(
    'Could not confirm whether the transaction landed before its blockhash ' +
    'expired — check the explorer for this signature before resending. ' +
    `Original error: ${msg.trim()}`
  );
}
```

The three-way branch on `landing.landed` (true / null / false) is unchanged.

### Test
Extend `src/wallet-core/__tests__/sol-send-signing.test.js`:
- Mock `getSignatureLanding` to throw synchronously.
- Assert the retry loop throws the "check the explorer" message rather than the mock error.

---

## H-7 · Assert ERC-20 transfer selector (`evm/token-send.js`)

### Problem
`erc20Interface.encodeFunctionData('transfer', [to, value])` must produce `0xa9059cbb` as the leading 4 bytes. No assertion exists. A malicious token registry entry pointing to a contract with a different `transfer()` signature would produce a different selector and a silently misdirected signed transaction.

### Fix
Assert immediately after encoding:

```js
// src/wallet-core/evm/token-send.js
const data = erc20Interface.encodeFunctionData('transfer', [to, value]);
const TRANSFER_SELECTOR = '0xa9059cbb';
if (!data.startsWith(TRANSFER_SELECTOR)) {
  throw new Error(
    `Token transfer calldata has unexpected selector ${data.slice(0, 10)} — ` +
    `expected ${TRANSFER_SELECTOR}. Refusing to sign.`
  );
}
```

### Test
Extend token-send tests:
- Mock `encodeFunctionData` to return `'0xdeadbeef...'`.
- Assert the selector check throws before any signing or broadcasting.

---

## Files changed

| File | Change |
|---|---|
| `src/wallet-core/mnemonic.js` | +1 line (normalize passphrase) |
| `src/wallet-core/btc/send.js` | +4 lines (confirmed filter + error) |
| `src/wallet-core/evm/fees.js` | +20 lines (MAX_BASE_FEE_GWEI constant + guards in buildEvmTiers + buildCustomFee, networkKey threaded through) |
| `src/wallet-core/sol/send.js` | +6 lines (try/catch around getSignatureLanding) |
| `src/wallet-core/evm/token-send.js` | +5 lines (selector assertion) |
| `src/wallet-core/__tests__/vectors.test.js` | +1 test case |
| `src/wallet-core/__tests__/btc-coinselect.test.js` | +2 test cases |
| `src/wallet-core/__tests__/evm-fees.test.js` | +4 test cases (new or extended file) |
| `src/wallet-core/__tests__/sol-send-signing.test.js` | +1 test case |
| `src/wallet-core/__tests__/evm-token-send.test.js` | +1 test case |

No UI changes. No new dependencies. No schema changes.

---

## Out of scope

- Custom fee override above the ceiling (future "advanced fee" UI, not needed now).
- Unconfirmed UTXO opt-in (no use case identified; can be added later with a flag).
- Spend-unconfirmed-change (same address, same wallet) — a known acceptable pattern, separate decision.
