# BTC + SOL Send Dispatch Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Route the `btc` and `solana` asset families through `SendCrypto.jsx` to their existing wallet-core send functions, with precision-safe unit conversion and signing-level tests, so a dev-ungated testnet/devnet send produces a real txid.

**Architecture:** A new pure, framework-free module `src/lib/sendDispatch.js` holds the only new testable logic — `toBaseUnits` (decimal→integer base units, BigInt-only) and `normalizeSendResult` (per-family result shape → `{hash, explorerUrl}`). `SendCrypto.jsx` becomes thin glue that branches on `selectedAsset.family`, calls the matching `withBtcPrivateKey`/`withSolPrivateKey` accessor (already exposed by `WalletProvider`) + `signAndBroadcastBtc`/`signAndBroadcastSol` (already in wallet-core), and records the normalized result. No wallet-core module is modified.

**Tech Stack:** Vitest, React (no React Testing Library — pure logic is unit-tested, the React glue is gated by lint+build+full-suite and the manual checklist), `@solana/web3.js`, `@scure/base`, `@/` import alias.

**Spec:** `docs/superpowers/specs/2026-06-06-btc-sol-send-dispatch-design.md`

**Reference interfaces (already exist — do NOT modify):**
- `signAndBroadcastBtc({ networkKey, privateKey, publicKey, fromAddress, toAddress, amountSats })` → `{ txid, hex, explorerUrl, plan }` (`src/wallet-core/btc/send.js`).
- `signAndBroadcastSol({ networkKey, privateKey, fromAddress, toAddress, amountLamports })` → `{ signature, explorerUrl, plan, attempts }` (`src/wallet-core/sol/send.js`).
- `buildAndSignSol({ keypair, toPubkey, amountLamports, blockhash, priorityMicroLamports, computeUnitLimit })` → `{ rawTx, signature }` (`src/wallet-core/sol/send.js`).
- `withBtcPrivateKey(fn)` → `fn({ privateKey, publicKey, address })`; `withSolPrivateKey(fn)` → `fn({ privateKey, publicKey, address })` (`src/lib/WalletProvider.jsx`).

---

### Task 0: Setup — branch and commit the existing EVM batch

The working tree has a complete, uncommitted EVM multi-asset send batch. Commit it as the baseline so this slice builds on a clean tree.

**Files:** none created; commits existing changes.

- [ ] **Step 1: Create the feature branch (carrying the uncommitted changes)**

Run:
```bash
git checkout -b feat/btc-sol-send-dispatch
```
Expected: switched to a new branch; `git status` still shows the modified/untracked send files.

- [ ] **Step 2: Commit the EVM batch**

Run:
```bash
git add src/pages/SendCrypto.jsx src/lib/devSendOverride.js src/lib/__tests__/devSendOverride.test.js src/wallet-core/__tests__/evm-send-signing.test.js src/wallet-core/__tests__/evm-token-send-signing.test.js docs/multi-asset-send.verification-checklist.md
git commit -m "feat(send): multi-asset EVM send dispatch + dev-only testnet ungate + signing tests"
```
Expected: one commit; `git status` clean except for the (already-committed) spec/plan docs if not yet committed.

- [ ] **Step 3: Verify the baseline is green**

Run: `npm test`
Expected: PASS — the existing suite plus the EVM signing tests, 0 failures. (If anything fails here it is pre-existing and must be understood before continuing.)

---

### Task 1: `src/lib/sendDispatch.js` — pure units + result normalization (TDD)

**Files:**
- Create: `src/lib/__tests__/sendDispatch.test.js`
- Create: `src/lib/sendDispatch.js`

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/sendDispatch.test.js` with EXACTLY:

```js
// src/lib/__tests__/sendDispatch.test.js
//
// The only NEW logic the BTC/SOL send-dispatch slice introduces: converting a
// human-entered decimal amount to a chain's integer base unit WITHOUT floating-
// point error, and mapping each family's distinct send-result shape to one record
// shape. Both are pure — no React, no network.
import { describe, it, expect } from 'vitest';
import { toBaseUnits, normalizeSendResult } from '@/lib/sendDispatch';

describe('toBaseUnits — precision-safe decimal -> integer base units', () => {
  it('converts whole and fractional BTC (8 dp) to sats', () => {
    expect(toBaseUnits('1', 8)).toBe(100000000n);
    expect(toBaseUnits('0.0005', 8)).toBe(50000n);
    expect(toBaseUnits('0.00000001', 8)).toBe(1n); // 1 satoshi
  });

  it('converts SOL (9 dp) to lamports', () => {
    expect(toBaseUnits('1.5', 9)).toBe(1500000000n);
    expect(toBaseUnits('0.000000001', 9)).toBe(1n); // 1 lamport
  });

  it('normalizes trailing zeros and a bare leading dot', () => {
    expect(toBaseUnits('1.50', 8)).toBe(150000000n);
    expect(toBaseUnits('.5', 9)).toBe(500000000n);
  });

  it('throws on more fractional digits than the asset supports (no silent truncation)', () => {
    expect(() => toBaseUnits('0.000000001', 8)).toThrow(/decimal/i); // 9 dp into 8-dp BTC
  });

  it('throws on zero, negative, empty, and non-numeric input', () => {
    expect(() => toBaseUnits('0', 8)).toThrow();
    expect(() => toBaseUnits('-1', 8)).toThrow();
    expect(() => toBaseUnits('', 8)).toThrow();
    expect(() => toBaseUnits('abc', 8)).toThrow();
    expect(() => toBaseUnits('1.2.3', 8)).toThrow();
    expect(() => toBaseUnits('.', 8)).toThrow();
  });
});

describe('normalizeSendResult — one record shape across families', () => {
  it('maps EVM / ERC-20 hash', () => {
    expect(normalizeSendResult('evm', { hash: '0xabc', explorerUrl: 'u' })).toEqual({ hash: '0xabc', explorerUrl: 'u' });
    expect(normalizeSendResult('erc20', { hash: '0xdef', explorerUrl: 'u2' })).toEqual({ hash: '0xdef', explorerUrl: 'u2' });
  });

  it('maps BTC txid -> hash', () => {
    expect(normalizeSendResult('btc', { txid: 'deadbeef', explorerUrl: 'b' })).toEqual({ hash: 'deadbeef', explorerUrl: 'b' });
  });

  it('maps SOL signature -> hash', () => {
    expect(normalizeSendResult('solana', { signature: 'sig123', explorerUrl: 's' })).toEqual({ hash: 'sig123', explorerUrl: 's' });
  });

  it('throws on an unknown family (never records an undefined hash)', () => {
    expect(() => normalizeSendResult('dogecoin', { hash: 'x' })).toThrow();
  });
});
```

- [ ] **Step 2: Run it and confirm it FAILS**

Run: `npx vitest run src/lib/__tests__/sendDispatch.test.js`
Expected: FAIL — `Failed to resolve import "@/lib/sendDispatch"` (module doesn't exist yet).

- [ ] **Step 3: Create `src/lib/sendDispatch.js` with EXACTLY this content**

```js
// src/lib/sendDispatch.js
//
// Pure, framework-free helpers that let SendCrypto.jsx dispatch a send across the
// EVM / BTC / Solana families with one code path's worth of TESTABLE logic. No
// React, no network, no crypto — just (1) converting the human-entered decimal
// amount to a chain's integer base unit without floating-point error, and (2)
// normalizing each family's distinct send-result shape to one record shape.

/**
 * Convert a decimal amount STRING to integer base units (BTC->sats @8 decimals,
 * SOL->lamports @9) using BigInt only — never floating point, which loses
 * precision at 8-9 decimals. THROWS (never silently truncates) on a malformed,
 * non-positive, or over-precise amount.
 *
 * @param {string} amountStr human amount, e.g. "0.0005"
 * @param {number} decimals  base-unit decimals for the asset (BTC 8, SOL 9)
 * @returns {bigint} amount in integer base units
 */
export function toBaseUnits(amountStr, decimals) {
  const s = String(amountStr).trim();
  // Accept "123", "123.45", or ".45"; reject empty, signs, multiple dots, letters.
  if (!/^\d+(\.\d+)?$|^\.\d+$/.test(s)) {
    throw new Error(`Invalid amount: "${amountStr}"`);
  }
  const [whole = '', frac = ''] = s.split('.');
  if (frac.length > decimals) {
    throw new Error(`Amount "${amountStr}" has more than ${decimals} decimal places.`);
  }
  const units = BigInt((whole || '0') + frac.padEnd(decimals, '0'));
  if (units <= 0n) throw new Error(`Amount must be positive: "${amountStr}"`);
  return units;
}

/**
 * Normalize a family's send result to one shape: { hash, explorerUrl }. EVM/ERC-20
 * return `hash`; BTC returns `txid`; SOL returns `signature`. THROWS on an unknown
 * family so a new family can never silently record an undefined hash.
 *
 * @param {string} family one of 'evm' | 'erc20' | 'btc' | 'solana'
 * @param {object} raw    the family send function's return value
 * @returns {{ hash: string, explorerUrl: string }}
 */
export function normalizeSendResult(family, raw) {
  switch (family) {
    case 'evm':
    case 'erc20':
      return { hash: raw.hash, explorerUrl: raw.explorerUrl };
    case 'btc':
      return { hash: raw.txid, explorerUrl: raw.explorerUrl };
    case 'solana':
      return { hash: raw.signature, explorerUrl: raw.explorerUrl };
    default:
      throw new Error(`Unknown asset family for send result: ${family}`);
  }
}
```

- [ ] **Step 4: Run it and confirm it PASSES**

Run: `npx vitest run src/lib/__tests__/sendDispatch.test.js`
Expected: PASS — all tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/sendDispatch.js src/lib/__tests__/sendDispatch.test.js
git commit -m "feat(send): pure sendDispatch units + result normalization"
```

---

### Task 2: `buildAndSignSol` signing test (fills the SOL local-signing coverage gap)

`sol-send.test.js` covers only the rent *planner*. The local ed25519 signing
(`buildAndSignSol`) is untested. This test exercises EXISTING code, so it should
pass on first run; it does not change any source file.

**Files:**
- Create: `src/wallet-core/__tests__/sol-send-signing.test.js`

- [ ] **Step 1: Create `src/wallet-core/__tests__/sol-send-signing.test.js` with EXACTLY this content**

```js
// src/wallet-core/__tests__/sol-send-signing.test.js
//
// SOL local-signing verification (network-free). sol-send.test.js pins the rent
// PLANNER; this pins that buildAndSignSol actually signs a System transfer that
// commits to the right recipient and lamports, paid by the sender. The Solana
// analogue of evm-send-signing.test.js's "the signed bytes commit to the right
// recipient/value" property. A fixed blockhash is supplied so no RPC is needed.
import { describe, it, expect } from 'vitest';
import { Keypair, SystemProgram, Transaction } from '@solana/web3.js';
import { base58 } from '@scure/base';
import { buildAndSignSol } from '../sol/send.js';

// Deterministic fixtures — fixed 32-byte ed25519 seeds (no randomness, no network).
const sender = Keypair.fromSeed(new Uint8Array(32).fill(1));
const recipient = Keypair.fromSeed(new Uint8Array(32).fill(2)).publicKey;
// A recent blockhash is any base58-encoded 32-byte value for offline construction.
const BLOCKHASH = base58.encode(new Uint8Array(32).fill(3));

describe('buildAndSignSol — local ed25519 signing commits to the right transfer', () => {
  it('signs a System transfer to the correct recipient and lamports, paid by the sender', () => {
    const amountLamports = 123_456_789n;
    const { rawTx, signature } = buildAndSignSol({
      keypair: sender,
      toPubkey: recipient,
      amountLamports,
      blockhash: BLOCKHASH,
    });

    expect(signature).toBeTruthy(); // first signature == canonical tx id
    const tx = Transaction.from(rawTx);
    expect(tx.recentBlockhash).toBe(BLOCKHASH);
    expect(tx.feePayer.equals(sender.publicKey)).toBe(true);

    // Exactly one instruction — a base-fee-only System transfer (no priority ixns).
    expect(tx.instructions).toHaveLength(1);
    const ix = tx.instructions[0];
    expect(ix.programId.equals(SystemProgram.programId)).toBe(true);
    // System transfer layout: keys[0] = from (signer), keys[1] = to.
    expect(ix.keys[0].pubkey.equals(sender.publicKey)).toBe(true);
    expect(ix.keys[1].pubkey.equals(recipient)).toBe(true);

    // The transfer amount matches what we asked to send. Decode the System
    // transfer instruction data directly — @solana/web3.js v1.x dropped
    // SystemProgram.decodeTransfer. Layout: u32 LE instruction index (2 =
    // Transfer) followed by u64 LE lamports.
    const data = ix.data;
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    expect(dv.getUint32(0, true)).toBe(2);             // SystemInstruction::Transfer
    expect(dv.getBigUint64(4, true)).toBe(amountLamports);

    // The signature actually verifies against the sender's key (real ed25519).
    expect(tx.verifySignatures()).toBe(true);
  });

  it('attaches priority ComputeBudget instructions when a priority fee is set', () => {
    const { rawTx } = buildAndSignSol({
      keypair: sender,
      toPubkey: recipient,
      amountLamports: 1_000_000n,
      blockhash: BLOCKHASH,
      priorityMicroLamports: 1000,
      computeUnitLimit: 200000,
    });
    const tx = Transaction.from(rawTx);
    // 2 ComputeBudget ixns (unit limit + price) + 1 System transfer.
    expect(tx.instructions).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Run it and confirm it PASSES**

Run: `npx vitest run src/wallet-core/__tests__/sol-send-signing.test.js`
Expected: PASS — both tests green (exercises existing `buildAndSignSol`). The amount
assertion decodes the instruction data directly (`@solana/web3.js` v1.x has no
`SystemProgram.decodeTransfer`).

- [ ] **Step 3: Commit**

```bash
git add src/wallet-core/__tests__/sol-send-signing.test.js
git commit -m "test(sol): pin buildAndSignSol local-signing (recipient/lamports/feePayer)"
```

---

### Task 3: Wire BTC + SOL dispatch into `SendCrypto.jsx`

No unit test (the repo has no React Testing Library). Correctness rests on the
Task 1 pure tests, the existing wallet-core tests, and the lint+build+full-suite
gate below plus the manual testnet checklist. Apply each edit exactly.

**Files:**
- Modify: `src/pages/SendCrypto.jsx`

- [ ] **Step 1: Add imports** — after the existing `import { isDevSendUngated } ...` line, add three imports.

Old:
```js
import { isDevSendUngated } from "@/lib/devSendOverride";
```
New:
```js
import { isDevSendUngated } from "@/lib/devSendOverride";
import { signAndBroadcastBtc } from "@/wallet-core/btc/send";
import { signAndBroadcastSol } from "@/wallet-core/sol/send";
import { toBaseUnits, normalizeSendResult } from "@/lib/sendDispatch";
```

- [ ] **Step 2: Expose the BTC/SOL key accessors from the wallet context**

Old:
```js
  const { isUnlocked, accounts, withPrivateKey } = useWallet();
```
New:
```js
  const { isUnlocked, accounts, withPrivateKey, withBtcPrivateKey, withSolPrivateKey } = useWallet();
```

- [ ] **Step 3: Generalize family / network-key / native-symbol resolution**

Old:
```js
  // Phase C: the active chain follows the selected asset — each EVM asset carries
  // its own (testnet) network key (e.g. MATIC -> polygonAmoy). The native gas
  // symbol and chain name come from the network registry, NEVER hardcoded "ETH";
  // Arbitrum/Optimism resolve to ETH because that genuinely is their gas token.
  const networkKey = (isEvmFamily(selectedAsset) && selectedAsset?.chain) || "sepolia";
  const activeNetwork = getNetworkInfo(networkKey);
  const nativeSymbol = activeNetwork?.symbol || "ETH";
  const networkName = activeNetwork?.name || networkKey;
```
New:
```js
  // The active chain follows the selected asset. EVM assets carry their own
  // (testnet) network key (e.g. MATIC -> polygonAmoy); BTC carries 'testnet' and
  // SOL 'devnet'. Family drives both dispatch and which network registry applies.
  const family = selectedAsset?.family;
  const isBtc = family === "btc";
  const isSolana = family === "solana";
  const networkKey = selectedAsset?.chain || "sepolia";
  // The EVM network registry only describes EVM chains; for BTC/SOL there is no
  // EIP-1559 fee model and the native symbol is just the asset's own currency.
  const activeNetwork = (isEvmFamily(selectedAsset) || isErc20) ? getNetworkInfo(networkKey) : null;
  const nativeSymbol = activeNetwork?.symbol || selectedWallet?.currency || "ETH";
  const networkName = activeNetwork?.name || networkKey;
  // Whether we know a live balance for this asset (EVM/ERC-20 read it on-chain).
  // For BTC/SOL we don't read it this slice, so the UI max-check is skipped and
  // the send function enforces real funds (coin-selection / rent).
  const balanceKnown = isEvmFamily(selectedAsset) || isErc20;
```

- [ ] **Step 4: Gate the live-balance query to EVM families**

Old:
```js
    enabled: !!selectedWallet?.address && canReceive(selectedAsset),
```
New:
```js
    enabled: !!selectedWallet?.address && canReceive(selectedAsset) && (isEvmFamily(selectedAsset) || isErc20),
```

- [ ] **Step 5: Replace the EVM-only dispatch + recording block with the family dispatch**

Old (the block from the `// Map the selected wallet...` comment through the final `return` of the mutationFn):
```js
      // Map the selected wallet to its HD derivation index (public address match).
      const acct = accounts.find(a => a.address.toLowerCase() === selectedWallet.address.toLowerCase());
      if (!acct) throw new Error("Selected wallet is not in the unlocked HD set");

      // Unlimited approvals must be explicitly acknowledged before signing.
      if (blockedByApproval) {
        throw new Error("Confirm the unlimited-approval warning before signing.");
      }

      // Sign LOCALLY and broadcast. privateKey is transient and never persisted.
      // Branch on the asset family: ERC-20 tokens go through the token contract's
      // transfer; native EVM coins (ETH) use the native value transfer.
      // The user-selected EIP-1559 fee (slow/avg/fast or custom) flows straight
      // into the signing call. When null (estimate unavailable) the send path
      // falls back to ethers' auto-filled fee — never blocks the send.
      const fee = selectedFee?.fee || undefined;
      const tx = await withPrivateKey(acct.index, (privateKey) =>
        isErc20
          ? sendToken({
              networkKey: networkKey,
              privateKey,
              symbol: selectedAsset.symbol,
              to: toAddress,
              amount,
              fee,
            })
          : signAndBroadcast({
              networkKey: networkKey,
              privateKey,
              to: toAddress,
              amountEth: amount,
              fee,
            })
      );

      // Record the REAL chain hash as 'pending'. Do NOT write balances — the
      // chain is the source of truth and is read live elsewhere.
      await base44.entities.Transaction.create({
        wallet_id: walletId,
        type: "send",
        amount: parseFloat(amount),
        currency: selectedWallet.currency,
        to_address: toAddress,
        from_address: selectedWallet.address,
        status: "pending",        // becomes confirmed after tx.wait()
        tx_hash: tx.hash,          // REAL chain hash
        explorer_url: tx.explorerUrl,
        note,
      });

      // Confirm in the background, then refresh balance + history from chain.
      tx.wait(1).then(() => {
        queryClient.invalidateQueries({ queryKey: ["evm-balance", networkKey, selectedWallet.address] });
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      }).catch(() => {/* surface a "still pending / failed" state in UI */});

      return { hash: tx.hash, explorerUrl: tx.explorerUrl };
```
New:
```js
      // Unlimited approvals must be explicitly acknowledged before signing.
      if (blockedByApproval) {
        throw new Error("Confirm the unlimited-approval warning before signing.");
      }

      // Sign LOCALLY and broadcast. The signing key is transient and never
      // persisted. Branch on the asset family — each has its own derivation/
      // signing stack and send function; the human-entered `amount` is converted
      // to that chain's integer base unit (sats / lamports / wei) for signing.
      let raw;
      if (isBtc) {
        // BTC (BIP-84 P2WPKH). Auto fee-rate this slice (no fee UI). BTC -> sats.
        raw = await withBtcPrivateKey(({ privateKey, publicKey, address }) =>
          signAndBroadcastBtc({
            networkKey,
            privateKey,
            publicKey,
            fromAddress: address,
            toAddress,
            amountSats: toBaseUnits(amount, 8),
          })
        );
      } else if (isSolana) {
        // SOL (ed25519). Base fee only this slice (no priority UI). SOL -> lamports.
        raw = await withSolPrivateKey(({ privateKey, address }) =>
          signAndBroadcastSol({
            networkKey,
            privateKey,
            fromAddress: address,
            toAddress,
            amountLamports: toBaseUnits(amount, 9),
          })
        );
      } else {
        // EVM native + ERC-20. Map the wallet to its HD derivation index (public
        // address match). The user-selected EIP-1559 fee flows straight into the
        // signing call; null falls back to ethers' auto-fill (never blocks send).
        const acct = accounts.find(a => a.address.toLowerCase() === selectedWallet.address.toLowerCase());
        if (!acct) throw new Error("Selected wallet is not in the unlocked HD set");
        const fee = selectedFee?.fee || undefined;
        raw = await withPrivateKey(acct.index, (privateKey) =>
          isErc20
            ? sendToken({ networkKey, privateKey, symbol: selectedAsset.symbol, to: toAddress, amount, fee })
            : signAndBroadcast({ networkKey, privateKey, to: toAddress, amountEth: amount, fee })
        );
      }

      // Normalize each family's distinct result shape to one record shape.
      const { hash, explorerUrl } = normalizeSendResult(family, raw);

      // Record the REAL chain hash/signature as 'pending'. Do NOT write balances —
      // the chain is the source of truth and is read live elsewhere.
      await base44.entities.Transaction.create({
        wallet_id: walletId,
        type: "send",
        amount: parseFloat(amount),
        currency: selectedWallet.currency,
        to_address: toAddress,
        from_address: selectedWallet.address,
        status: "pending",
        tx_hash: hash,            // REAL chain txid / signature
        explorer_url: explorerUrl,
        note,
      });

      // Refresh views. Only the EVM result exposes tx.wait(1) for background
      // confirmation; BTC is broadcast and SOL confirms internally, so for those
      // we just invalidate the transaction list (status stays 'pending').
      if (typeof raw.wait === "function") {
        raw.wait(1).then(() => {
          queryClient.invalidateQueries({ queryKey: ["evm-balance", networkKey, selectedWallet.address] });
          queryClient.invalidateQueries({ queryKey: ["transactions"] });
        }).catch(() => {/* surface a "still pending / failed" state in UI */});
      } else {
        queryClient.invalidateQueries({ queryKey: ["transactions"] });
      }

      return { hash, explorerUrl };
```

- [ ] **Step 6: Skip the UI max-check when the balance is unknown (BTC/SOL)**

Old:
```js
            disabled={!walletId || !toAddress || !amount || parseFloat(amount) <= 0 || parseFloat(amount) > effectiveBalance || !addressFormatValid || !flowSendEnabled || (flowSendEnabled && !isUnlocked) || (limitEval.blocked && !limitAck)}
```
New:
```js
            disabled={!walletId || !toAddress || !amount || parseFloat(amount) <= 0 || (balanceKnown && parseFloat(amount) > effectiveBalance) || !addressFormatValid || !flowSendEnabled || (flowSendEnabled && !isUnlocked) || (limitEval.blocked && !limitAck)}
```

- [ ] **Step 7: Render the EVM FeeSelector for EVM only; show an auto-fee note for BTC/SOL**

Old:
```js
            {/* Per-chain fee control. The live send path is EVM (EIP-1559); the
                chosen tier/custom fee is passed into signAndBroadcast/sendToken. */}
            <FeeSelector
              chain="evm"
              networkKey={networkKey}
              symbol={nativeSymbol}
              decimals={activeNetwork?.decimals ?? 18}
              usdRate={USD_RATES[nativeSymbol] ?? USD_RATES[selectedWallet?.currency]}
              gasLimitHint={isErc20 ? 65000 : 21000}
              onChange={setSelectedFee}
            />
```
New:
```js
            {/* Per-chain fee control. The EVM send path is EIP-1559; the chosen
                tier/custom fee is passed into signAndBroadcast/sendToken. BTC/SOL
                use an automatic fee this slice (no selector). */}
            {!isBtc && !isSolana ? (
              <FeeSelector
                chain="evm"
                networkKey={networkKey}
                symbol={nativeSymbol}
                decimals={activeNetwork?.decimals ?? 18}
                usdRate={USD_RATES[nativeSymbol] ?? USD_RATES[selectedWallet?.currency]}
                gasLimitHint={isErc20 ? 65000 : 21000}
                onChange={setSelectedFee}
              />
            ) : (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Fuel className="h-3 w-3 shrink-0" /> Network fee is set automatically for {selectedWallet?.currency} ({networkName}) on this testnet.
              </p>
            )}
```

- [ ] **Step 8: Lint the changed file**

Run: `npx eslint src/pages/SendCrypto.jsx --quiet`
Expected: exit 0, no output. (If an unused import like `getNetworkInfo` is now flagged, that means a wiring mistake — re-check; do not blindly delete a still-used import.)

- [ ] **Step 9: Production build (module + import resolution)**

Run: `npm run build`
Expected: exit 0; `dist/` produced. Confirms the new `@/wallet-core/btc/send`, `@/wallet-core/sol/send`, and `@/lib/sendDispatch` imports resolve through the bundler.

- [ ] **Step 10: Full test suite (no regressions)**

Run: `npm test`
Expected: PASS — baseline count + the new `sendDispatch` and `sol-send-signing` tests, 0 failures.

- [ ] **Step 11: Commit**

```bash
git add src/pages/SendCrypto.jsx
git commit -m "feat(send): route BTC + SOL families through SendCrypto dispatch"
```

---

### Task 4: Update the verification checklist doc

Fold BTC/SOL into the verifiable table now that their dispatch is wired.

**Files:**
- Modify: `docs/multi-asset-send.verification-checklist.md`

- [ ] **Step 1: Add BTC and SOL rows to the per-asset table** — after the USDT row.

Old (the USDT table row):
```
| USDT | Sepolia (11155111) — Aave faucet stand-in | ETH (for gas) | [Aave faucet → mint test USDT](https://gho.aave.com/faucet/); Sepolia ETH for gas | `https://sepolia.etherscan.io/tx/<hash>` | `transfer()` to test-USDT `0xaA8E…33D0`; recipient USDT ↑ by amount; **6-dec** scaling (not 18) | _(pending)_ |
```
New:
```
| USDT | Sepolia (11155111) — Aave faucet stand-in | ETH (for gas) | [Aave faucet → mint test USDT](https://gho.aave.com/faucet/); Sepolia ETH for gas | `https://sepolia.etherscan.io/tx/<hash>` | `transfer()` to test-USDT `0xaA8E…33D0`; recipient USDT ↑ by amount; **6-dec** scaling (not 18) | _(pending)_ |
| BTC | Bitcoin testnet (BIP-84, `tb1…` P2WPKH) | BTC (sat/vB, auto fee-rate) | [mempool testnet faucet](https://mempool.space/testnet) / [bitcoinfaucet.uo1.net](https://bitcoinfaucet.uo1.net/) | `https://mempool.space/testnet/tx/<txid>` | P2WPKH send succeeds; sum(inputs)=outputs+fee; change returns to self; 8-dec (sats) scaling | _(pending)_ |
| SOL | Solana devnet | SOL (base fee, auto) | `solana airdrop 2 <addr> --url devnet` or [faucet.solana.com](https://faucet.solana.com/) | `https://explorer.solana.com/tx/<sig>?cluster=devnet` | System transfer succeeds; rent-exempt minimum respected; recipient SOL ↑; 9-dec (lamports) scaling | _(pending)_ |
```

- [ ] **Step 2: Replace the "NOT in this batch" section**

Old:
```
## NOT in this batch (handled separately — needs Section C dispatch wiring)
- **BTC** (Bitcoin testnet, BIP-84) and **SOL** (Solana devnet) — their send code exists and is unit-tested, but `SendCrypto.jsx` does not yet route the `btc`/`solana` families (it would fall through to the EVM path with `networkKey` defaulting to `sepolia`). Wiring + their signing tests are a separate step.
```
New:
```
## Now wired in this batch (BTC + SOL dispatch)
- **BTC** (Bitcoin testnet, BIP-84) and **SOL** (Solana devnet) are now routed by
  `SendCrypto.jsx` to `wallet-core/btc/send.js` / `wallet-core/sol/send.js` via the
  pure `lib/sendDispatch.js` (family dispatch + amount→sats/lamports conversion).
  They remain `receive_only` until a confirmed txid is pasted above — identical
  honest-tagging discipline as the EVM assets.

## Deferred (not in this batch)
- BTC fee-rate (sat/vB) selector and SOL priority-fee selector — sends use the
  auto-fetched fee rate / base fee.
- Live on-chain balance reads for BTC/SOL — the UI max-check is skipped for them;
  the send path enforces real funds (BTC coin-selection, SOL rent/balance).
```

- [ ] **Step 3: Add the new tests to the "Test coverage" list** — after the `evm-token-send-signing.test.js` bullet.

Old:
```
- `__tests__/evm-token-send-signing.test.js` — ERC-20 sends: signed bytes are `transfer()` to the correct token contract, 6-dec scaling, on-chain decimals cross-check aborts a mismatch before signing (USDC + USDT).
```
New:
```
- `__tests__/evm-token-send-signing.test.js` — ERC-20 sends: signed bytes are `transfer()` to the correct token contract, 6-dec scaling, on-chain decimals cross-check aborts a mismatch before signing (USDC + USDT).
- `lib/__tests__/sendDispatch.test.js` — the BTC/SOL dispatch units: `toBaseUnits` (BigInt-only decimal→sats/lamports; over-precision and non-positive amounts throw) and `normalizeSendResult` (per-family result shape).
- `__tests__/sol-send-signing.test.js` — SOL local signing: `buildAndSignSol` produces a System transfer to the correct recipient/lamports, fee payer = sender, signature verifies. (BTC's `buildAndSignTx` is already covered by `btc-coinselect.test.js`.)
```

- [ ] **Step 4: Commit**

```bash
git add docs/multi-asset-send.verification-checklist.md
git commit -m "docs(send): fold BTC + SOL into the multi-asset send verification checklist"
```

---

### Task 5: Final verification gate

**Files:** none (verification only).

- [ ] **Step 1: Lint all touched source files**

Run: `npx eslint src/lib/sendDispatch.js src/lib/__tests__/sendDispatch.test.js src/wallet-core/__tests__/sol-send-signing.test.js src/pages/SendCrypto.jsx --quiet`
Expected: exit 0, no output.

- [ ] **Step 2: Production build**

Run: `npm run build`
Expected: exit 0; `dist/` produced.

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: PASS — baseline count + the new `sendDispatch` (10 assertions across cases) and `sol-send-signing` (2) tests, 0 failures.

---

## Notes for the implementer

- Do NOT modify any `wallet-core` module — `signAndBroadcastBtc`, `signAndBroadcastSol`, `buildAndSignSol`, and both key accessors already exist and are reused verbatim. If a task seems to require changing one, stop and report.
- BTC and SOL stay `status: receive_only` in `src/wallet-core/assets.js`. This slice only makes the dev-ungated UI dispatch correctly; an asset flips to `live` ONLY after a real confirmed testnet/devnet txid (honest-tagging discipline; checklist §"After you confirm a txid").
- There is intentionally NO React component test (no React Testing Library in the repo). The new pure logic is fully unit-tested; the React glue is gated by lint + build + full suite + the manual checklist. This is stated, not a silent gap.
- Known limitation (disclosed in the spec): the sign-time spend-limit check converts via `USD_RATES`; if BTC/SOL are unpriced there it under-counts 1:1 against USD caps — acceptable on a dev-only testnet/devnet path.
