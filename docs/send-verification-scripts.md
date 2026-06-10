# Send-verification scripts — what exists, what each verifies, how to run

**Purpose:** map the verification harnesses that already live in `scripts/`, so nobody
rebuilds them. Each one drives the SAME `src/wallet-core` (and `src/risk`) modules the app
uses — no separate logic — so a green run exercises the production code path on a live
testnet/devnet RPC.

**The one rule (unchanged):** a printed txid is **BUILT/broadcast**, not *verified*. An
asset/signal is *verified* only after a human opens the explorer, confirms the txid, and
supplies it. Passing scripts, a green suite, or a clean run are NOT verification. Nothing
here flips an asset `status` to `live`.

**Tier:** testnet/devnet only. Every script below refuses non-testnet networks (gated in
`sol/networks.js`, `btc/networks.js`, `evm/networks.js`). Use a throwaway seed — never a
mainnet-funded one.

---

## The four scripts

| Script | Verifies | Real exports it drives |
|---|---|---|
| [`scripts/sol-devnet-send.mjs`](../scripts/sol-devnet-send.mjs) | SOL devnet send (airdrop → send → txid) | `deriveSolAccount`, `getConnection`/`requestAirdrop`, `signAndBroadcastSol`, `solExplorerUrl` (`src/wallet-core/sol/*`) |
| [`scripts/btc-testnet-send.mjs`](../scripts/btc-testnet-send.mjs) | BTC testnet send (fund → send → txid) | `deriveBtcAccount`, `getBalanceSats`, `signAndBroadcastBtc` (`src/wallet-core/btc/*`) |
| [`scripts/sepolia-send-proof.mjs`](../scripts/sepolia-send-proof.mjs) | ETH Sepolia send (fund → send → confirm) | `deriveEvmAccount`, `getBalanceEth`, `signAndBroadcast` (`src/wallet-core/derivation.js`, `evm/*`) |
| [`scripts/verify-risk/run.mjs`](../scripts/verify-risk/run.mjs) (+ `score-tx.mjs`, `cases.mjs`) | #137 risk gate — scorer behaviour | real `score(unsignedTx, state, chainData)` from `src/risk/index.js` → `requiresConfirmation` |

**Seed / bip39 (for reference):** `src/wallet-core/mnemonic.js` — `generateMnemonic(128)`,
`validateMnemonic` (`@scure/bip39` + english wordlist), as used by the app in
`src/lib/WalletProvider.jsx`. There is no separate seed wrapper to build.

---

## How to run each

Install deps first if `node_modules` is absent (fresh worktree): `npm install`.

### SOL — fully automatic (devnet airdrop, no human funding step)
```
node scripts/sol-devnet-send.mjs derive  "<mnemonic>"               # show address
node scripts/sol-devnet-send.mjs airdrop "<mnemonic>" 1             # devnet faucet
node scripts/sol-devnet-send.mjs send    "<mnemonic>" <toAddr> 0.001
```
Omit `<mnemonic>` to use the public BIP-39 test vector (fine on devnet). Prints a
devnet explorer URL on broadcast.

### BTC — semi-automatic (fund once at a testnet faucet, then send)
```
node scripts/btc-testnet-send.mjs derive  "<mnemonic>"             # address to fund
node scripts/btc-testnet-send.mjs balance "<mnemonic>"
node scripts/btc-testnet-send.mjs send    "<mnemonic>" <toAddr> <sats|max>
```

### ETH (Sepolia) — semi-automatic, env-driven (PowerShell)
```
$env:MNEMONIC   = "<testnet seed>"     # OR $env:PRIVATE_KEY = "0x..."
$env:TO_ADDRESS = "0x..."              # optional; defaults to self (round-trip)
$env:AMOUNT_ETH = "0.0001"
node scripts/sepolia-send-proof.mjs
```
With no funds it prints the address + faucet hints and exits (code 2).

### #137 risk gate — headless, no network
```
node scripts/verify-risk/run.mjs
```

---

## Correcting the record (prior `verify-send` wiring brief was wrong)

An earlier brief proposed building a new `verify-send.mjs` orchestrator. It was dropped —
it would duplicate the four scripts above. Two specific errors in it must not propagate:

**Error 1 — `buildRiskInputs` does not exist.** Repo-wide search returns zero matches. The
brief said "import the REAL `buildRiskInputs`"; there is no such export. The gate's real
entry point is:
```js
import { score } from 'src/risk/index.js';
// score(unsignedTx, activeSetLocalState, chainData)
//   -> { level, sentence, evidence, signalId, requiresConfirmation, signals }
```
There is no separate input-builder in front of it.

**Error 2 — two distinct gate paths; do not conflate them.** The standalone gate API is
`score()`. But on `main` today, `src/pages/SendCrypto.jsx` does NOT call
`score`/`buildRiskInputs` — its pre-sign flagging runs through `simulateEvmTransaction(...)`
and `screenRecipient` (from `@/wallet-core/evm/poison`). So:

- `scripts/verify-risk/run.mjs` exercises **`score()` directly** — the standalone composite scorer.
- That is **NOT** the same as exercising **SendCrypto's `simulate` / `screenRecipient`
  flow**, which is the path the Send screen actually runs.

The #137 harness verifies the scorer's behaviour on constructed input. It does not, by
itself, prove the SendCrypto integration path. Name that gap explicitly rather than
implying one covers the other.

**Forward note (PR #123).** The description above reflects `main` today, where BTC/SOL are
NOT wired into `SendCrypto.jsx` dispatch (they fell through to the EVM path with
`networkKey` defaulting to `sepolia`). The open PR #123 (`feat/btc-sol-send-dispatch`)
routes BTC/SOL through their own `signAndBroadcastBtc`/`signAndBroadcastSol`. Once it
merges, the Send screen dispatches those families too — re-check this section against the
updated `SendCrypto.jsx`. BTC/SOL still go `live` only on a confirmed testnet/devnet txid.

---

## Honest scope

Running these grows the verified-asset count (SOL, then BTC/ETH once funded). It does NOT
unblock mainnet — the audit (§24), the PRF probe, and the ship decision are unchanged by
any txid these produce. Legitimate work for honest asset coverage; not progress toward
launch.
