# Veyrnox — Feature Status (verified against code on `main`)

> The single AT-A-GLANCE status of what is genuinely built, what is half-built,
> and what is only specced. Verified against the actual code on `main`
> (not against aspiration). When this and another doc disagree, this wins —
> then fix the other doc.
>
> Markers: ✅ built & merged · 🟡 built-but-gated / partial · 📋 specced, not built
> · 💡 parking-lot idea · ❌ removed / out of scope
>
> Standing rules (unchanged, still true): **testnet/devnet only; mainnet gated**
> until an independent audit clears; every security/crypto feature is
> **PROVISIONAL pending that audit**. Status last verified: 2026-06-03.

---

## Reality check (read first)
- **Test suite:** 390 tests across 39 files, all green (`npm test`); `check:rng` green.
- **What actually SENDS on-chain today:** **only ETH on Sepolia** is `live`
  (send verified end-to-end). **Every other asset is `receive_only`** — see the
  table below. Receiving and balance reads work for all 10 assets; the send
  *code path* exists and is unit-tested for EVM/ERC-20/BTC/SOL, but is HARD-gated
  off until a real on-chain send is done by hand and reviewed.
- **Security depth is the real progress.** The S1/S2/S3 security stack is the
  bulk of what's built — but all of it is PROVISIONAL until the independent
  audit, and the deniability features (duress/stealth/panic) are testnet/demo.
- **Integrity gap CLOSED:** the autonomous/auto-debit value-movement gap is fixed
  on `main` (PR #47 merged). `Rebalance` + `Rebalance History` are removed; the
  `Recurring Payments` auto-debit path is gutted (now schedule/reminder only — it
  hands off to /send for user signing). See bottom section.

---

## 1. Assets & send-gating (the 10 standardized assets)

Source of truth: `src/wallet-core/assets.js`. `canSend()` is a HARD gate — only
`live` assets may send. Receive + balance read work for everything below.

| Asset | Family | Network | Receive + balance | Send | Status |
|---|---|---|---|---|---|
| ETH | evm | Sepolia | ✅ | ✅ verified on-chain | ✅ **live** |
| USDC | erc20 | Sepolia | ✅ | gated, unverified | 🟡 receive_only |
| USDT | erc20 | Sepolia (Aave faucet stand-in) | ✅ | gated, unverified | 🟡 receive_only |
| MATIC | evm | Polygon Amoy | ✅ | gated, unverified | 🟡 receive_only |
| ARB | evm | Arbitrum Sepolia | ✅ | gated, unverified | 🟡 receive_only |
| OP | evm | Optimism Sepolia | ✅ | gated, unverified | 🟡 receive_only |
| AVAX | evm | Avalanche Fuji | ✅ | gated, unverified | 🟡 receive_only |
| BNB | evm | BNB testnet | ✅ | gated, unverified | 🟡 receive_only |
| BTC | btc | Bitcoin testnet (BIP-84) | ✅ | built+tested, gated | 🟡 receive_only |
| SOL | solana | Solana devnet (ed25519) | ✅ | built+tested, gated | 🟡 receive_only |

> **Honest framing:** the EVM send path is exercised by ETH/Sepolia (so the
> shared code works), but each *other* asset/chain stays `receive_only` until a
> real testnet send on THAT asset is verified on-chain and reviewed. BTC and SOL
> have a full build+sign+broadcast path with tests, but no hands-on testnet
> broadcast has been signed off yet (see `docs/PhaseBTC.verification.md`).

---

## 2. Wallet core — ✅ built
- HD wallet generate (BIP-39), import (seed / private key), multi-account derivation — ✅
- Encrypted vault (Argon2id + AES-256-GCM) — ✅ (KDF work factor raised to 192 MiB, with param migration — SAST M3)
- Backup / reveal seed — ✅
- Send native coin — ✅ for ETH only (verified Sepolia); all other assets 🟡 receive_only
- Receive (per-chain address + local QR) — ✅ (`receiveAddress.js`, `ReceiveCrypto.jsx`, `QRCodeDisplay.jsx`)
- View balances (from chain) — ✅
- Transaction history (read-only) — ✅ (`txHistory.js`: BTC/SOL via providers, EVM explorer-fallback, no indexer)
- Gas / fee control before signing — ✅ (per-chain `fees.js` for evm/btc/sol + `FeeSelector.jsx`; selected fee flows into signing)
- 10-asset standardization — ✅ (`assets.js` / `TOP_CRYPTOS`)

## 3. Chains & assets
- Ethereum (Sepolia) — ✅ live send
- Polygon / Arbitrum / Optimism / Avalanche / BNB (testnets) — 🟡 receive_only (address + balance ✅, send gated)
- ERC-20 (USDC, USDT — Sepolia) — 🟡 receive_only (address + balance ✅, send gated)
- Bitcoin (BIP-84 testnet) — 🟡 receive_only (derive/balance/receive ✅; send built+tested, on-chain unverified)
- Solana (ed25519 devnet) — 🟡 receive_only (derive/balance/receive ✅; send built+tested, on-chain unverified)
- More EVM chains / more ERC-20 tokens — 💡
- Other stacks (XRP, ADA, TRON…) — 💡
- Cosmos / IBC, Sui — ❌ removed from the app (PR #48); `deriveCosmosAccount` stub left in `derivation.js` (throws, unwired)

## 4. Security — S1 foundation
- Native secure storage (M2a done; M2b provisional, app-layer) — 🟡 (PROVISIONAL; OS-enforced ACL / Enclave-StrongBox key-wrap = M2c/M2d 📋, not built)
- Biometric unlock — ✅ (`biometric.js`; app-layer preference gate, PROVISIONAL — not an OS-enforced ACL)
- FIDO2 / passkeys (unlock gate, NOT key custody) — ✅ (`passkey.js`; password-only escape hatch present — SAST M-3 fix)
- Session manager + auto-lock (idle / background) — ✅ (`session.js`)
- At-rest KDF work-factor raise + param migration — ✅ (SAST M3; PROVISIONAL — params need audit validation)
- Account access / change password + seed recovery — ✅ (PR #50; non-custodial `keyStore.changePassword` + `importWallet` seed recovery; honest "no custodial reset"). OS-enforced ACL hardening (M2c/M2d) remains 📋 audit-blocked, not built.

## 5. Security — S2 transaction safety
- Token approvals: view + REVOKE ERC-20 allowances — ✅ (`evm/approvals.js`)
- Address-poisoning / look-alike warnings — ✅ (`evm/poison.js`, wired into send, informs-not-blocks)
- Spam-token filter — ✅ (`evm/spam.js`)
- Calldata decode / approval (unlimited-allowance) warning — ✅ (`evm/calldata.js`)
- Per-chain recipient address validation — ✅ (`lib/addressValidation.js`; wired into Address Book save + send)
- Suspicious-address screening (local, pluggable providers) — ✅ (PR #70) on-device blocklist via `evm/suspicious.js`, wired into the send risk assessment, warns-not-blocks, never claims "safe". Scam/drainer categories ship empty pending a maintained feed (no fabricated entries).
- OFAC sanctioned-address screening — ✅ (PR #71) second local provider over a bundled, dated OFAC SDN snapshot (`data/ofac-sanctioned.json`, refreshable via `scripts/refresh-ofac-blocklist.mjs`); family-aware routing screens EVM + BTC at runtime. Sanctions-only, dated, SOL not covered, delisting-aware (Tornado Cash excluded post-2025 delisting). Warns-not-blocks; shipping gated on legal review (sanctions data in a financial product).
- Transaction simulation (drainer defense) — ✅ LOCAL-first pre-sign preview wired into Send→verify (`evm/simulate.js` real `eth_call` dry-run + risk flags; `btc/simulate.js` + `sol/simulate.js` honest decode; `TransactionPreview.jsx`). No third-party scoring service. Warns-not-blocks; never claims "safe". The old `WhatIfSimulator`/`SecurityScanner` UI shells remain 📋 separate stubs.
- Anomaly / fraud detection — ✅ (PR #54) LOCAL history-aware heuristics (`anomaly.js`) folded into the tx-simulation preview: amount-vs-history, new-recipient-large, approve-then-transfer; no phone-home, never claims "safe".
- Security Dashboard (read-only posture view) — ✅ (PR #53) aggregates existing signals (`securityPosture.js`, `SecurityDashboard.jsx`); reuses approvals/spam/poison/feature-status, no new detection, never claims "safe".
- dApp security alerts — 📋 not built

## 6. Security — S3 access & recovery (deniability stack — PROVISIONAL, testnet/demo)
- Duress PIN / decoy wallet — ✅ (`duress.js`)
- Stealth / hidden wallets (deniable chaff-slot pool) — ✅ (`stealth.js`; 256-slot pool after SAST M-1 collision fix; multi-chain reveal; move-existing variant)
- Panic wipe (emergency local key destruction) — ✅ (`panic.js`; panic PIN at unlock + in-app guarded wipe; `inspectKeyMaterial()`)
- Constant-KDF unlock timing across the deniability stack — ✅ (`deniabilityUnlock.js`; SAST M-2 fix)
- Hardware wallet (Ledger / Trezor) — 📋 UI shell only (`HardwareWalletPage.jsx`, simulated connect; no HID/WebUSB)
- Login activity (+ map) — ❌ re-scoped / out of scope (needs a backend removed with base44; a location/access-history log conflicts with the deniability stack). Best-of-breed successor specced below: "last successful unlock" timestamp. See S3 decision note.
- Social recovery (guardian / SSS) — ❌ removed [audit-blocked-and-not-advertised] (never built; removed from UI/catalogue)
- Crypto Will / inheritance — 📋 not built (roadmap; secret-sharing + dead-man's-switch design; audit + lawyer; defer)
- Multi-sig (personal + treasury) — ❌ removed [audit-blocked-and-not-advertised] (was UI shell `MultiSigWallets.jsx` w/ fake addresses; page/route/nav/catalogue deleted)

> **Decision note — Login activity re-scope (last-unlock timestamp):**
> Original spec (cross-device sign-in history + location/map) is out of scope: needs a backend (removed with base44), and a location/IP/device access log is a surveillance/forensic artifact that conflicts with S3 — it can reveal that a hidden wallet was opened or when a duress credential was used. A self-custody deniable wallet has no account to show sign-in history for.
> Best-of-breed successor (specced, NOT built): a "last successful unlock" timestamp, stored IN-VAULT (decoy vault carries its own independent value, cannot reveal the primary's), shown to the owner as a tamper signal. Deniability-clean.
> Rejected: (B) plaintext failed-unlock counter — useful, but failed attempts occur BEFORE the vault is unlocked, so there is no key to encrypt under; forces an unencrypted on-disk artifact that display-suppression hides from a decoy session but not from forensic inspection, and panic-wipe must explicitly clear. Spends deniability for a failed-attempt count — bad trade for this product. (A) in-memory-only counter — deniability-clean but useless: does not survive app restart.
> Structural blocker (shared with audit-log wiring, PR #77): cannot securely record an event that happens before the vault is unlocked — no key to encrypt under at that moment. Option C sidesteps it by recording only on successful unlock; failed-attempt tracking hits this wall.
> Build note: Option C touches the unlock-success path in WalletProvider, must write/reset identically across primary/duress/hidden success (credential-blind), so deferred to a dedicated session.

## 7. Security — S4 hardening — 🟡 first item built
- RASP — 📋 UI shell only (`RASPSecurity.jsx`)
- Audit log (opt-in, deniability-safe) — ✅ (PR #72) OFF by default; entries stored as a single AES-GCM blob in the shared vault store under a neutral key, byte-shaped like every other vault blob (not a forensic tell) and destroyed by panic wipe. Hard in-code denylist refuses duress/stealth/hidden/panic/decoy/seed events; logs only benign `{type, ts}`. Primitive built + tested; not yet wired into call sites.
- Risk limits / scoring — 📋 not built
- Encrypted cloud backup (ciphertext only) — 📋 UI shell only (`CloudBackup.jsx`)
- No-telemetry / fully-local mode, privacy routing (Tor / RPC) — 💡

## 8. SAST / validation hardening — ✅ merged
- SAST M-1 (stealth slot-collision fund loss) — ✅ fixed (PR #33)
- SAST M-2 (deniability unlock timing oracle) — ✅ fixed (PR #34/#35/#36)
- SAST M-3 (at-rest KDF work factor) + passkey lockout escape hatch — ✅ fixed (PR #35/#40)
- Validation / fund-correctness / render-safety sweep — ✅ doc + per-chain address-validation fix (PR #41/#42)
- SAST S1/passkey findings — documented (review-only), see `docs/SAST_S1_FINDINGS.md`
- Test-suite determinism (Argon2id WASM-heap OOM under parallel vitest) — ✅ fixed (PR #73); suite pinned to a single worker so the 192 MiB KDF can't exhaust the heap. Deterministic but slower; a test-only low-memory KDF override is the noted future fix.

## 9. AI (advisory only) — 💡 none built
- Plain-language tx explanation, scam/phishing explanation, educational assistant, portfolio Q&A — 💡
- AI portfolio advisor — 💡 advisory-only allowed; auto-executing ❌ out of scope

## 10. Niceties / analytics / utilities — 💡 mostly parking-lot
- Help menu (top-bar Documentation entry) — ✅ (`HelpMenu.jsx`, PR #48)
- Address book — ✅ (with per-chain validation on save)
- ENS / SNS **resolution** in Send — ✅ (resolve-only); ENS **registration** — ❌ removed (PR #48)
- Price charts / watchlist / portfolio / net-worth / analytics / tax / signing / savings — 💡 (UI present in places, not core-wired)

## 11. Platform / app shell
- Desktop web app — ✅
- Demo mode (browse without backend) — ✅
- iOS native (Capacitor) — 🟡 runs on simulator; submission gated on Apple org acct
- Android native (Capacitor) — 🟡 scaffolded
- Mobile App PWA / Mobile Widget — ❌ removed (PR #48)

## 12. High-risk / deferred
- WalletConnect / dApp connector / Web3 browser — 📋 POST-AUDIT only; Web Bridge page ❌ removed (PR #48)

---

## ✅ Integrity gap CLOSED (PR #47 merged)
The autonomous-value-movement gap that previously breached the non-custodial model
is now fixed on `main`:
- **Rebalance** + **Rebalance History** — ❌ removed [breaks-self-custody]. No
  `Rebalancing.jsx`, no `/rebalance` route.
- **Recurring auto-debit** — ❌ removed [breaks-self-custody]; the `runNow` debit
  path is gutted. **Recurring Payments** now only schedules reminders and hands off
  to /send for user signing (`runNow → navigate("/send")`) — advisory/schedule-only.
- **AIRebalancer** (`/ai-rebalancer`) — remains but is ADVISORY-ONLY (LLM
  recommendations, never moves funds); allowed, not a violation.

The companion rule is recorded in `docs/Security.roadmap.md` (no feature may move
value / mutate balances without a user signature through wallet-core signing).

---

## ❌ Removed / out-of-scope (consolidated record)
> Every removed feature with its one-line reason. Reason tags: [off-wedge] = trimmed
> as not core to the wedge · [breaks-self-custody] = would move value without a user
> signature · [audit-blocked-and-not-advertised] = cryptographically sensitive, never
> shipped, no longer advertised · [out-of-scope-regulated] = custodial/regulated,
> never in scope.

- ❌ Social Recovery (guardian / Shamir SSS) — [audit-blocked-and-not-advertised] never built; removed from UI/catalogue.
- ❌ Multi-Sig wallets (personal + treasury) — [audit-blocked-and-not-advertised] UI shell w/ fake addresses only; page/route/nav/catalogue removed.
- ❌ Rebalance + Rebalance History — [breaks-self-custody] autonomous value movement; removed (PR #47).
- ❌ Recurring auto-debit — [breaks-self-custody] auto-debit path gutted (PR #47); Recurring Payments is now schedule/reminder only, hands off to Send for user signing.
- ❌ Sui — [off-wedge] chain trim (PR #48).
- ❌ Cosmos / IBC — [off-wedge] chain trim (PR #48); derive stub left unwired in wallet-core.
- ❌ Web Bridge — [off-wedge] dApp/swap gateway (PR #48).
- ❌ ENS Registration — [off-wedge] registration removed (PR #48); ENS/SNS resolution kept as ✅.
- ❌ Mobile App PWA — [off-wedge] (PR #48); native Capacitor shell remains.
- ❌ Mobile Widget — [off-wedge] (PR #48).
- ❌ Custodial / regulated cluster — [out-of-scope-regulated] never in scope: swaps/DEX, limit/OCO/TWAP/trailing/grid orders, trading bots/AI trading bots, perps/options/tokenized stocks, social/copy trading, DCA, staking-as-a-service, DeFi yield/farming, lending/borrowing, fiat on/off-ramp, bank links, CEX deposit/exchange connections, KYC/VASP/DID/trust-score/geo-blocking/compliance, institutional custody, enterprise/super-admin/telemetry/white-label/DAO governance+treasury/payroll/webhook builder/feature flags/perf monitoring/fee-wallet/automation rules, crypto subscriptions, smart-contract deploy, NFT minting/fractionalization, encrypted messaging.

---

## Pending (non-code, gating mainnet)
- Independent security audit (S1–S4 + crypto stacks) — see `docs/Audit.scope.md`.
- Legal entity + Track-B legal review (Guardian tier wording, etc.).
- Hands-on testnet send verifications for every `receive_only` asset
  (EVM chains, USDC/USDT, BTC, SOL) before any flips to `live`.

## Related docs
- `docs/WalletRoadmap.md` — build order + statuses
- `docs/WalletFeatures.spec.md` — canonical scope + full-site split
- `docs/Security.roadmap.md` — S1–S4 detail + deniability stack write-ups
- `docs/Tiers.pricing.md` — pricing model (hypothesis, not validated)
- `docs/PhaseBTC.verification.md` — the hands-on BTC send sign-off procedure
