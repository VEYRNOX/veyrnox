# Phase BTC — Verification (how to prove a real testnet send BY HAND)

> Same bar Phase A (ETH/Sepolia) cleared. BTC stays `receive_only` until the
> end-to-end testnet send below is done on-chain and reviewed; only then does it
> earn `live`. Mainnet stays gated (`ALLOW_BTC_MAINNET=false`) regardless.

## What is already verified (automated, in CI)

Run `npm test` (88 tests) and `npm run check:rng` (green). The BTC-specific gates:

- **Derivation matches an INDEPENDENT reference.** `btc-derivation.test.js`
  asserts the three authoritative **BIP-84 spec** mainnet vectors for the
  canonical `abandon … about` mnemonic
  (`bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu`, …) plus the testnet vector
  (`tb1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl`). Passing the spec vectors proves
  our HD path + bech32 P2WPKH encoding interoperate with every compliant wallet
  → funds are recoverable elsewhere.
- **Address format:** `tb1q…` on testnet/signet, `bc1q…` on mainnet (asserted).
- **Change-output correctness (the #1 risk):** `btc-coinselect.test.js` asserts,
  in exact satoshis, that `sum(inputs) === sum(outputs) + fee` for normal,
  dust-fold, multi-input, and sweep cases; that change returns to the
  wallet-controlled address; and that a tampered/burned plan is REJECTED. The
  offline build+sign pipeline test proves the planned fee survives into the
  signed bytes (`tx.fee === plan.feeSats`).
- **Fee** computed from vsize × sat/vB (asserted, sane testnet floor of 1 sat/vB).
- **Mainnet gated:** `btc-networks.test.js` (`getBtcNetwork('mainnet')` throws).

## What still needs HANDS-ON testnet verification

The only thing automation can't do is touch a live indexer + faucet. Do this once:

### 1. Derive your funding address
```bash
node scripts/btc-testnet-send.mjs derive "<your 12/24-word testnet mnemonic>"
```
Use a THROWAWAY mnemonic (testnet only). It prints your `tb1q…` address and path
`m/84'/1'/0'/0/0`. (No mnemonic arg → it uses the public `abandon … about` test
mnemonic, fine for a read-only derive but DO NOT fund a publicly-known seed.)

### 2. Fund it from a faucet
Send testnet BTC to that address from any Bitcoin **testnet3** faucet, e.g.:
- https://coinfaucet.eu/en/btc-testnet/
- https://bitcoinfaucet.uo1.net/
- (Signet alternative: https://signetfaucet.com/ — then use `--network signet`.)

Wait for ≥1 confirmation. Check it landed:
```bash
node scripts/btc-testnet-send.mjs balance "<mnemonic>"
```
This lists your UTXOs and confirmed balance straight from the Esplora indexer.

### 3. Dry-run the send (NO broadcast) — inspect the change output
```bash
node scripts/btc-testnet-send.mjs plan "<mnemonic>" <tb1...recipient> <amountSats>
```
It prints the full plan: inputs, **recipient + change outputs**, fee, vsize, and
asserts value conservation. CONFIRM the change output returns to YOUR address and
that inputs = outputs + fee. (Send to a second address you control, or back to a
faucet's return address.)

### 4. Broadcast the real transaction
```bash
node scripts/btc-testnet-send.mjs send "<mnemonic>" <tb1...recipient> <amountSats>
```
It builds → signs LOCALLY → broadcasts and prints the **txid + explorer URL**.

### 5. Confirm on a block explorer
Open the printed `https://mempool.space/testnet/tx/<txid>` and verify:
- the recipient received `<amountSats>`,
- a **change output** returned the remainder to your address (no funds burned),
- the fee matches the plan,
- the tx confirms.

That is the BTC equivalent of the Phase A Sepolia send. After it confirms and is
reviewed, flip `BTC` from `receive_only` → `live` in `src/wallet-core/assets.js`
(one line) — and ONLY then.

### Sweep (send-max) variant
```bash
node scripts/btc-testnet-send.mjs send "<mnemonic>" <recipient> max
```
Spends the whole balance minus fee, single output, no change.

## Notes / honest limitations
- **Change-to-self (v1):** change returns to your single receive address (not a
  separate change branch). Deliberate — keeps change spendable AND visible in the
  single-address balance view. Trade-off: address reuse (privacy). A change
  branch (`m/84'/1'/0'/1/x`) is derivable now for a future multi-address upgrade.
- **Indexer is untrusted:** it can hide UTXOs (you under-spend, safe) or refuse a
  broadcast (tx doesn't send). It cannot cause lost change — change is computed
  from the actual selected input values locally, not any indexer total.
- **testnet3 flakiness:** the public testnet can be congested; signet
  (`--network signet`) is a steadier alternative with the same address format.
