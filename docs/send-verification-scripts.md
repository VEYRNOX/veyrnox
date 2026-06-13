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

### #137 render verification — manual demo smoke (CLOSED)

The headless harness above proves `score()`'s behaviour on constructed input. The **render +
gate integration** through `SendCrypto.jsx`'s verify step was confirmed separately by a manual
demo smoke check, which closes the integration-path gap named in the section below:

- **what:** `RiskVerdictBanner` render + RISK gate, end-to-end, mobile DEMO (`/send?demo=1`, 375px).
- **inputs:** `DEMO_POISON_ADDRESS` (the S4 look-alike of a seeded counterparty) → RISK; a fresh,
  never-seen valid EVM recipient → INFO.
- **observed:** a SINGLE banner instance (no duplicate after #180); coral `#F06A5C`
  (`bg-risk/10` / `border-risk/40`, computed `rgb(240,106,92)`); the verdict sentence present;
  recipient + resembled address rendered in IBM Plex Mono, FULL/untruncated; the "Sign anyway"
  acknowledgement **hard-blocks** Confirm & Send (button disabled → enabled only on tick).
- **basis:** the #178 + #180 integration in demo — both now on `main` (#180 `f74c3ac`,
  #178 `dab1d7f`), so `main`'s demo verify-step is reachable and single-mounted. Date 2026-06-13;
  screenshot retained.
- **caveat (honest, per the verify-don't-assert + honesty-oracle discipline):** verified in
  **DEMO mode only**. Demo-verified ≠ release-verified. #137 is a real-path control (not
  demo-gated), so the `build:release` real-RPC verify-step render is *expected* identical — but it
  has **not** been eyeballed. This is left as a low-priority optional check; we do **not** claim
  `build:release` render-verified. This is also **not** a catalogue "verified" promotion: no
  on-chain txid is involved, so `docs/verified-evidence.json` is intentionally NOT touched (it
  stays txid-only, per its `_schema`).

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

## UI send path: the 2FA wall (finding from driving PR #123)

Driving PR #123's Send UI headlessly (PIN onboarding → import the funded seed → select SOL
→ recipient + amount → Continue → verify step) reaches the SOL-specific dispatch render
("Network fee set automatically for SOL (devnet)", amount via `toBaseUnits`) but **cannot
complete the broadcast** in a local/offline PIN-cohort build. The verify step gates
`sendTx.mutate()` (which runs #123's dispatch → `signAndBroadcastSol`) behind a **2FA
identity check** with two methods, and in this build neither is available:

- **Passkey** renders only if `selectedWallet.passkey_registered && window.PublicKeyCredential`
  — a PIN-cohort wallet has no passkey registered.
- **Email OTP** is disabled when `!EMAIL_AVAILABLE` — the local build ships no mail server.

Key point: **`VITE_DEV_UNGATE_SEND` flips the *capability* gate (`canSend`) but NOT the 2FA
*identity* gate.** So the dev ungate alone is insufficient to complete a UI send; a working
2FA method (registered passkey, or a mail/OTP stand-in) is also required. The underlying
broadcast is independently proven — `signAndBroadcastSol` produced a real devnet txid via
`scripts/sol-devnet-send.mjs` (the exact function the UI dispatch calls). What remains
UI-unverified in the offline build is only the verify-step→mutate glue (`toBaseUnits(amount,9)`,
`withSolPrivateKey`, `normalizeSendResult`), which is covered by `sendDispatch` unit tests.

To verify the full UI path end-to-end, run with a 2FA method available (register a passkey
on a device/authenticator that supports WebAuthn, or wire a local OTP stand-in). Do NOT mock
WebAuthn to look real — that violates the no-fake-security rule.

---

## Honest scope

Running these grows the verified-asset count (SOL, then BTC/ETH once funded). It does NOT
unblock mainnet — the audit (§24), the PRF probe, and the ship decision are unchanged by
any txid these produce. Legitimate work for honest asset coverage; not progress toward
launch.
