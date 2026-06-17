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
> **PROVISIONAL pending that audit**. Status last verified: 2026-06-17.
>
> **2026-06-17 S1-S4 doc sync:** Documentation.jsx and featureCatalogue.js updated to
> reflect all live routes. 17 items flipped from "roadmap" to "available"/"built":
> Hardware Wallet, Additional Tokens, Additional Networks, Net-Worth Tracker, P&L
> Tracking, On-Chain Analytics, Fee Analytics, Portfolio Dashboard, Price Charts,
> Price Alerts, Watchlist, Notifications & Push, NFT Gallery, Multi-Chain NFT,
> Message Signing, Payment Links, Recurring Payments, Voice Commands.
> WalletRoadmap.md updated: S3 (hardware-wallet ✅, watch-wallets ✅); S4 (audit-log
> 🟡 built-not-surfaced, risk-scoring ✅, RASP 🟡 policy-built/detectors-gated).

---

## Reality check (read first)
- **Test suite:** 390 tests across 39 files, all green (`npm test`); `check:rng` green.
- **What actually SENDS on-chain today:** **ETH (Sepolia), USDC (Sepolia),
  USDT (Sepolia), MATIC (Polygon Amoy), ARB (Arbitrum Sepolia), OP (OP Sepolia),
  BTC (Bitcoin testnet), and SOL (Solana devnet)** are `live` — each send verified
  end-to-end through the full in-app UI path on-chain (covering every send family:
  EVM L1 native, ERC-20 contract-call, three EVM L2/sidechains, BTC UTXO, SOL
  ed25519). **The other two assets (AVAX, BNB) are `receive_only`** — see the table below.
  Receiving and balance reads work for all 10 assets; the send *code path* exists
  and is unit-tested for EVM/ERC-20/BTC/SOL, but is HARD-gated off until a real
  on-chain send is done by hand and reviewed.
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
| ETH | evm | Sepolia | ✅ | ✅ verified on-chain (full UI path, `0x2d4d5d…`) | ✅ **live** |
| USDC | erc20 | Sepolia | ✅ | ✅ verified on-chain (full UI path, `0x687d8c…`, block 11074999, 2026-06-16) | ✅ **live** |
| USDT | erc20 | Sepolia (Aave faucet stand-in) | ✅ | ✅ verified on-chain (full UI path, `0x3168e4…`, block 11075008, 2026-06-16) | ✅ **live** |
| MATIC | evm | Polygon Amoy | ✅ | ✅ verified on-chain (full UI path, `0x6a4ded…`, block 40274236, 2026-06-16) | ✅ **live** |
| ARB | evm | Arbitrum Sepolia | ✅ | ✅ verified on-chain (full UI path, `0x797928…`, 2026-06-14) | ✅ **live** |
| OP | evm | Optimism Sepolia | ✅ | ✅ verified on-chain (full UI path, `0xc3fd1e…`, 2026-06-14) | ✅ **live** |
| AVAX | evm | Avalanche Fuji | ✅ | gated, unverified | 🟡 receive_only |
| BNB | evm | BNB testnet | ✅ | gated, unverified | 🟡 receive_only |
| BTC | btc | Bitcoin testnet (BIP-84) | ✅ | ✅ verified on-chain (full UI path, `2da87a27…`, block 4990901) | ✅ **live** |
| SOL | solana | Solana devnet (ed25519) | ✅ | ✅ verified on-chain (full UI path, `5KGXAGTJ…`, finalized) | ✅ **live** |

> **Honest framing:** the EVM send path is verified end-to-end for ETH/ARB/OP
> (full UI path, on-chain). BTC and SOL send **modules** are also verified
> on-chain via their wallet-core broadcast paths (real testnet txids in
> `verified-evidence.json`, user-confirmed). The BTC/SOL Send **UI dispatch IS
> wired** — PR #123 (merged 2026-06-12) branches SendCrypto to
> `signAndBroadcastBtc`/`signAndBroadcastSol` with the correct testnet/devnet
> `networkKey` — so under the dev ungate they ARE app-sendable. They stay
> `receive_only` for one reason only: no real **UI-path** send has been verified
> on-chain yet (a module/script send is not the UI path). Every not-yet-live
> asset stays `receive_only` until a real UI-path send on THAT asset is verified
> on-chain — the exact bar ARB and OP cleared this round.

---

## 2. Wallet core — ✅ built
- HD wallet generate (BIP-39), import (seed / private key), multi-account derivation — ✅
- Encrypted vault (Argon2id + AES-256-GCM) — ✅ (KDF work factor raised to 192 MiB, with param migration — SAST M3)
- Backup / reveal seed — ✅
- Send native coin — ✅ for ETH (Sepolia), ARB (Arbitrum Sepolia), OP (OP Sepolia) — each full UI path verified on-chain (ETH `0x2d4d5d…` 2026-06-11; ARB `0x797928…`, OP `0xc3fd1e…` 2026-06-14); other natives 🟡 receive_only
- Receive (per-chain address + local QR) — ✅ (`receiveAddress.js`, `ReceiveCrypto.jsx`, `QRCodeDisplay.jsx`)
- View balances (from chain) — ✅
- Transaction history (read-only) — ✅ (`txHistory.js`: BTC/SOL via providers, EVM explorer-fallback, no indexer)
- Gas / fee control before signing — ✅ (per-chain `fees.js` for evm/btc/sol + `FeeSelector.jsx`; selected fee flows into signing)
- 10-asset standardization — ✅ (`assets.js` / `TOP_CRYPTOS`)

## 3. Chains & assets
- Ethereum (Sepolia) — ✅ live send — **full UI path verified on-chain** (step-up gate; txid `0x2d4d5d…`, 2026-06-11, user-confirmed)
- Arbitrum (Arbitrum Sepolia) — ✅ live send — **full UI path verified on-chain** (txid `0x797928…`, 2026-06-14; uncovered + fixed two real send bugs en route: ethers RPC batching → silent broadcast hang, and a hardcoded 21000 gasLimit rejected on L2 as "intrinsic gas too low")
- Optimism (OP Sepolia) — ✅ live send — **full UI path verified on-chain** (txid `0xc3fd1e…`, 2026-06-14; funded by bridging Sepolia ETH through the OptimismPortal)
- Polygon (Polygon Amoy) — ✅ live send — **full UI path verified on-chain** (native POL gas; txid `0x6a4ded…`, chainId 80002, block 40274236, 2026-06-16, 0.01 POL `0x90f9f1…E68a729` → `0xd8dA6BF2…aA96045`, status SUCCESS, gasUsed 21000). Mainnet stays gated.
- Avalanche / BNB (testnets) — 🟡 receive_only (address + balance ✅, send gated). PARKED: blocked solely on testnet faucet access (Fuji/BNB faucets gate on a coupon or a mainnet balance), NOT on code — the native-EVM send path is already verified live via MATIC/ARB/OP, so these add no new code-path coverage. The dev send-ungate already makes them sendable for verification the moment they're funded; flip to `live` only after a real on-chain UI-path txid per the verify-don't-assert rule.
- ERC-20 (USDC, USDT — Sepolia) — ✅ live send — **full UI path verified on-chain** (ERC-20 `transfer`, `sendToken`; USDC txid `0x687d8c…` block 11074999, USDT txid `0x3168e4…` block 11075008, both 2026-06-16, 1 token each from `0x90f9f1…E68a729` → `0xd8dA6BF2…aA96045`, status SUCCESS, decimals 6 re-checked on-chain). Mainnet stays gated.
- Bitcoin (BIP-84 testnet) — ✅ live send — **full UI path verified on-chain** (BIP-84 P2WPKH, `signAndBroadcastBtc`; txid `2da87a27…`, block 4990901, 2026-06-14, user-driven UI send). Mainnet stays gated.
- Solana (ed25519 devnet) — ✅ live send — **full UI path verified on-chain** (ed25519/SLIP-0010, `signAndBroadcastSol`; sig `5KGXAGTJ…`, FINALIZED, 2026-06-14, user-driven UI send). Mainnet stays gated.
- More EVM chains / more ERC-20 tokens — 💡
- Other stacks (XRP, ADA, TRON…) — 💡
- Cosmos / IBC, Sui — ❌ removed from the app (PR #48); `deriveCosmosAccount` stub left in `derivation.js` (throws, unwired)

## 4. Security — S1 foundation
- Native secure storage (M2a done; M2b provisional, app-layer) — 🟡 (PROVISIONAL; OS-enforced ACL / Enclave-StrongBox binding = M2c/M2d 📋, not built — native plugin, hardware + audit gated. See M2c/d decision note.)
- Biometric unlock — ✅ (`biometric.js`; app-layer preference gate, PROVISIONAL — not an OS-enforced ACL)
- FIDO2 / passkeys (unlock gate, NOT key custody) — ✅ (`passkey.js`; password-only escape hatch present — SAST M-3 fix)
- Session manager + auto-lock (idle / background) — ✅ (`session.js`)
- At-rest KDF work-factor raise + param migration — ✅ (SAST M3; PROVISIONAL — params need audit validation)
- Account access / change password + seed recovery — ✅ (PR #50; non-custodial `keyStore.changePassword` + `importWallet` seed recovery; honest "no custodial reset"). OS-enforced ACL hardening (M2c/M2d) remains 📋 audit-blocked, not built.

> **Decision note — M2c/d OS-enforced key binding:**
> Today (M2b, native.js): vault ciphertext is stored in the platform hardware-backed store (iOS Keychain / Android Keystore) with ThisDeviceOnly + passcode-gated accessibility; unlock is gated by an APP-LAYER biometric prompt (authenticate in JS, then read + decrypt the blob). Vault crypto is the unchanged Argon2id+AES-GCM format, byte-identical to web.
> Gap (M2c/d): the gate is app-layer, NOT an OS-enforced ACL bound to the stored item — kSecAttrAccessControl(biometryCurrentSet) on iOS / setUserAuthenticationRequired (+ setIsStrongBoxBacked where available) on Android. App-layer means in-context code that skips the JS check could read the blob; OS-ACL means the hardware itself refuses to release/decrypt without a fresh biometric and invalidates if the enrolled biometric set changes.
> Best-of-breed design: layer OS-ACL binding ON TOP OF the existing password-derived key as a stronger gate, never a replacement. The password path MUST remain the independent recovery route — if the OS-bound key were the only gate, a biometric reset or device migration would invalidate the ACL and permanently destroy the vault (fund loss). Mirrors the existing passkey/biometric escape-hatch rule: password is always THE secret, hardware is a layer. isSecureHardwareAvailable() must report OS-ACL availability truthfully per-device (StrongBox absent on most Android; SE only on real iPhones); the UI must never claim OS-enforced protection on a device that only has app-layer — degrade to the software vault and say so.
> Build constraint: requires a thin custom native plugin (current Capacitor plugins do not expose per-item biometric ACL binding) — Swift (iOS SE/Keychain) + Kotlin (Android Keystore/StrongBox). Not buildable or verifiable in the JS/web environment.
> Verification gates (what "verified" requires — none satisfiable in JS):
> 1. Build native app with the plugin; install on a REAL device with the hardware (physical iPhone w/ SE; Pixel 3+ / recent Samsung w/ StrongBox). Emulators/simulators have no secure hardware and cannot verify this.
> 2. Functional: enroll biometric, lock, confirm the OS blocks decrypt without a fresh biometric; confirm a biometric-set change invalidates per biometryCurrentSet.
> 3. Adversarial (the real test): attempt to read the stored item WITHOUT satisfying the biometric (e.g. a debug build skipping the JS gate) and confirm the OS still refuses. This distinguishes OS-ACL from app-layer; a JS test cannot exercise it.
> 4. Confirm the password fallback still recovers the vault after an ACL invalidation (no fund-loss footgun).
> 5. Independent audit sign-off (key-at-rest is core crypto; expands audit scope per native.js).
> JS-seam tests (interface contract, capability-gating fallback, no-plaintext-caching) are worth writing WHEN the plugin exists, with the native layer mocked — they verify the code's USE of the hardware, not the hardware guarantee itself.

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
- Composite pre-sign risk verdict + RISK gate — 🟡 BUILT / UNAUDITED-PROVISIONAL (#137; `src/risk/*` — `score()` aggregates the S1–S8 signal heuristics into one verdict, `buildRiskInputs`/`fromSendState` adapts send state to inputs, `RiskVerdictBanner` renders the one-sentence composite). Wired into Send→verify as the authoritative pre-sign gate: a coral **RISK** verdict requires an explicit "Sign anyway" acknowledgement (destructive-action gate); INFO is a non-blocking chip; INDETERMINATE escalates to CAUTION (fail-closed, I4). LOCAL-only; warns-not-blocks; never claims "safe". (#137 smoke check **CLOSED** — engine-verified via `scripts/verify-risk/run.mjs` AND render-verified end-to-end in mobile DEMO, 2026-06-13: `DEMO_POISON_ADDRESS` → a single coral **RISK** banner (#F06A5C) with the verdict sentence + IBM Plex Mono values, and the "Sign anyway" gate hard-blocks Confirm & Send until acknowledged; a fresh recipient → INFO chip. Evidence: `docs/send-verification-scripts.md` §"#137 render verification". HONEST CAVEAT: DEMO-mode only — the `build:release` real-RPC render is expected identical (#137 is real-path, not demo-gated) but not yet eyeballed, so this is NOT a `build:release` render claim. Tag stays BUILT / UNAUDITED-PROVISIONAL: no on-chain txid is involved, so this is not a catalogue "verified" promotion.)
- Send-time step-up re-auth — 🟡 BUILT / UNAUDITED-PROVISIONAL (#152; `src/lib/sendReauth.js` + `src/wallet-core/credentialVerifier.js`). Re-verifies the unlock credential before a send when the last auth falls outside a recent-auth window (`sendReauthRequired`, 2-min default). The verifier hashes under the **same `KDF_PARAMS` as the unlock KDF**, constant-time-compares, zeroizes the transient hash, and fails closed on malformed params (I4); capture degrades gracefully (`captureVerifierSafe`) and the attempt cap persists across Back.
- Two-factor at CRITICAL points — PIN + Action Password OR PIN + Passkey/FIDO2 — 🟡 BUILT / UNAUDITED-PROVISIONAL (PR #195; `src/lib/twoFactorGate.js` pure verdict, `src/lib/WalletProvider.jsx` hooks, `src/components/security/{TwoFactorGate,useActionGuard}.jsx`). **Configured in Security Settings → "Two-factor at critical actions" (`src/components/security/TwoFactorSettings.jsx`, in `pages/Settings.jsx`) — NOT the Security Center** (which is alerts/sessions/limits only; the old Security Center "2FA" tab was removed). The section explicitly lists which actions it gates. Enforced at: **send** (`SendCrypto.jsx`), **reveal recovery phrase** (`WalletPortfolioPage.jsx`), **set duress PIN** / **create hidden wallet** / **hide existing wallet** (`DuressPin.jsx`, `StealthWallets.jsx`). Factor 1 (both methods) = the unlock credential (full vault Argon2id). **Method 1 — Action Password:** a 2nd knowledge factor, persistable Argon2id record (`src/wallet-core/actionPassword.js`) stored **inside** the encrypted multi-vault container (`multiVault.js`) so it carries no on-disk tell and is **per wallet-set**; the two 192 MiB checks run **sequentially** (Defect-A). **Method 2 — Passkey/FIDO2:** PIN + a WebAuthn assertion (`passkey.js: verifyPasskeyAssertion`, mode `passkey`) — a real **possession** factor that **fails closed** (any cancel/timeout/error = not verified, the deliberate inverse of the unlock gate's SAST-M1/M2 degrade path); **device-global** pref (`veyrnox-2fa-passkey`), so it prompts in every session on the device, not per-set. 5 wrong attempts → `lock()` (I4). Opt-in: no method set → unchanged behaviour. **HONEST SCOPE:** Method 1 is two things you know on one device (not hardware 2FA) and is **active-set (primary) only** — see the decoy/hidden-parity TARGET in §6; Method 2 adds possession but is device-global, not per-set. Both: not on-chain verified — BUILT, not "verified". Full design + the two deniability models in `docs/vault-auth-architecture-brief.md` §6b.
- Security Dashboard (read-only posture view) — ✅ (PR #53) aggregates existing signals (`securityPosture.js`, `SecurityDashboard.jsx`); reuses approvals/spam/poison/feature-status, no new detection, never claims "safe".
- dApp security alerts — 📋 not built

## 6. Security — S3 access & recovery (deniability stack — PROVISIONAL, testnet/demo)
- Duress PIN / decoy wallet — ✅ (`duress.js`)
- Stealth / hidden wallets (deniable chaff-slot pool) — ✅ (`stealth.js`; 256-slot pool after SAST M-1 collision fix; multi-chain reveal; move-existing variant)
- Panic wipe (emergency local key destruction) — ✅ (`panic.js`; panic/wipe PIN at unlock + in-app guarded wipe; `inspectKeyMaterial()`)
- Constant-KDF unlock timing across the deniability stack — ✅ (`deniabilityUnlock.js`; SAST M-2 fix)
- Action Password 2FA parity in decoy/hidden sessions — 🎯 TARGET / audit-gated (§24). The Action Password second factor (§5) enforces on the **primary set only**. Decoy (`duress.js`) and hidden (`stealth.js`) slots encrypt a **bare mnemonic** as plaintext (not the multi-vault container), so they have no field to carry a per-set Action Password record. **Design constraint (why this is not a mechanical wire):** the stealth chaff pool sizes every fake blob to a *bare-mnemonic* ciphertext length (`makeChaff` → `ptLen = encode(mnemonic).length + 16`) so real hidden slots and chaff share one length distribution. Switching decoy/hidden plaintext to a container to fit a record would inflate real slots past the chaff length → a **real-vs-chaff size distinguisher**, i.e. the exact deniability tell the chaff pool exists to prevent (variable-length-if-present is worse). **Threat-model question (open):** a decoy is meant to be *frictionlessly operable under coercion* — forcing a second factor inside it may be undesirable, not just hard. Safe paths (all audit-gated): (a) constant-size padded container for **all** slots incl. chaff; or (b) a deliberate, documented "decoy/hidden carry no second factor by design" decision. Do **not** build blind. **Note — the Passkey method (§5, Method 2) is different:** it is device-global (stored outside any container), so it *does* prompt in decoy/hidden sessions — but that is the consistent-everywhere model, not the per-set model, and carries its own threat-model trade-off (a coerced decoy will demand the passkey too). It sidesteps the chaff-length constraint at the cost of not being per-set. Full design note + both deniability models in `docs/vault-auth-architecture-brief.md` §6b.
- v1 KEK-less PIN auth UX (6-digit PinPad, PIN onboarding + returning-PIN unlock, Face-ID-to-decoy, Option A deterministic decoy fallback) — 🟡 BUILT / UNAUDITED-PROVISIONAL, testnet (`security/PinPad.jsx`, `pinOnboarding.js`, `pinRecovery.js`, `authModel.js`, `decoyFallback.js`, `deniabilityUnlock.js`, `mnemonic.js`; cohort marker `veyrnox-auth-model` with fail-fast on unknown model; 4th unconditional KDF slot + four-slot constant-work execution assertion `deniability-timing.test.js`). **Headline audit item:** a 6-digit PIN over Argon2id is exhaustible offline on a seized device in hours–days — the hardware-KEK fast-follow is what closes it; see `docs/superpowers/specs/2026-06-08-v1-pin-auth-ux-design.md` §6. Landed incrementally via the #138/#154/#156/#161 line, not a single PR.
- Hardware wallet (Ledger / Trezor) — ✅ LIVE (`HardwareWalletPage.jsx`): Ledger WebHID connect (dynamic import, Chrome-only guard), `getAddress("44'/60'/0'/0/0")` via hw-app-eth → ETH address auto-fills watch import; Trezor Safe 5 compatibility table (Android full / iPhone watch-only) with honest iOS limitation note, platform-detected setup steps (Android/iOS/Desktop), manual address import; shared `base44.entities.Wallet.create({ is_watch_only: true })` form; honest scope note (in-app signing not yet wired for either device)
- Login activity (+ map) — ❌ original (backend/map) out of scope (needs a backend removed with base44; a location/access-history log conflicts with the deniability stack). **Best-of-breed successor BUILT: "last successful unlock" timestamp — 🟡 BUILT / UNAUDITED-PROVISIONAL.** Stored in-vault on the primary container (`lastUnlockAt` in `multiVault.js`, written at unlock via a best-effort re-encrypt), **primary-session only** (decoy/hidden never read or write it → no credential/hidden-set tell), destroyed by panic wipe for free, shown read-only on the Security Dashboard as a tamper signal (`formatUnlockTime`). No new blob, no new crypto. See `docs/superpowers/specs/2026-06-16-last-unlock-timestamp-design.md` and the S3 decision note below.
- Social recovery (guardian / SSS) — ❌ removed [audit-blocked-and-not-advertised] (never built; removed from UI/catalogue)
- Crypto Will / inheritance — 📋 not built, audit + legal gated (not a near-term build). See inheritance decision note.
- Multi-sig (personal + treasury) — ❌ removed [audit-blocked-and-not-advertised] (was UI shell `MultiSigWallets.jsx` w/ fake addresses; page/route/nav/catalogue deleted)

> **Decision note — Login activity re-scope (last-unlock timestamp):**
> Original spec (cross-device sign-in history + location/map) is out of scope: needs a backend (removed with base44), and a location/IP/device access log is a surveillance/forensic artifact that conflicts with S3 — it can reveal that a hidden wallet was opened or when a duress credential was used. A self-custody deniable wallet has no account to show sign-in history for.
> Best-of-breed successor — **BUILT (🟡 UNAUDITED-PROVISIONAL)**: a "last successful unlock" timestamp, stored IN-VAULT on the primary container (`lastUnlockAt`), shown to the owner as a tamper signal. **Scope as built is PRIMARY-SESSION ONLY** — decoy/hidden sessions never read or write it (they show "First open"). The original wording here ("decoy vault carries its own independent value") was reconsidered at build time: decoy/hidden are stored as bare mnemonics with no field to carry a per-set timestamp, so giving them an independent stored value would reopen the bare-mnemonic chaff-length distinguisher that blocks the Action-Password-2FA TARGET (audit-gated). Primary-only sidesteps it entirely and is consistent with the audit-log primary-only decision. Deniability-clean (no new blob → no count/size oracle; panic-wipe destroys it for free).
> Rejected: (B) plaintext failed-unlock counter — useful, but failed attempts occur BEFORE the vault is unlocked, so there is no key to encrypt under; forces an unencrypted on-disk artifact that display-suppression hides from a decoy session but not from forensic inspection, and panic-wipe must explicitly clear. Spends deniability for a failed-attempt count — bad trade for this product. (A) in-memory-only counter — deniability-clean but useless: does not survive app restart.
> Structural blocker (shared with audit-log wiring, PR #77): cannot securely record an event that happens before the vault is unlocked — no key to encrypt under at that moment. Option C sidesteps it by recording only on successful unlock; failed-attempt tracking hits this wall.
> Build note: Option C touches the unlock-success path in WalletProvider, must write/reset identically across primary/duress/hidden success (credential-blind), so deferred to a dedicated session.

> **Decision note — Crypto Will / inheritance (why it's deferred, not built):**
> Inheritance = letting a beneficiary recover the wallet's keys after the owner dies, without the owner handing over the seed while alive. On a no-backend, self-custody, deniable wallet, every viable design is currently blocked or problematic:
> 1. Shamir secret-sharing (split the seed into N shares): this is the SAME primitive as Social Recovery / guardians, which this project REMOVED as audit-blocked-and-not-advertised (see section 9 / the removed list). Re-introducing it reverses a deliberate, audit-flagged cut, adds seed-equivalent share-custody/collusion threat surface, and significantly expands audit scope. Blocked unless social recovery is first un-removed and audited.
> 2. Dead-man's-switch (release recovery material after no check-in for X): requires an external trigger — a server / time-oracle watching for the missed check-in. This wallet has NO backend (base44 removed) and is explicitly no-phone-home; a dead-man's-switch fundamentally requires the phone-home infrastructure the product was built to avoid, and a check-in schedule is itself a forensic signal that conflicts with the deniability stack. Blocked by the no-backend architecture.
> 3. Time-locked / on-chain recovery (smart-contract escrow + timelock): moves custody to a contract, which breaks the self-custody model, reintroduces smart-contract risk, needs mainnet + gas + its own audit, and drifts toward the regulated/custodial cluster the MVP deliberately excludes. Problematic on self-custody + scope grounds.
> Legal dimension (not just technical): inheritance is estate law — jurisdiction-specific and regulated, intersecting probate, tax, and fiduciary duty. A feature that transfers assets on death may constitute a will or create custodial/fiduciary obligations. Needs a LAWYER, not just an auditor; cannot ship on engineering judgment alone.
> What would have to be true before building: (a) independent security audit of the chosen recovery primitive; (b) legal review in target jurisdictions (estate/probate/fiduciary/regulatory); (c) for the Shamir path, social recovery first un-removed and audited (reversing a deliberate cut). Until all hold, spec-only.
> Build note: touches key material and recovery — the most catastrophic surface to get wrong. Defer to a dedicated, audited, legally-reviewed effort; never casual feature work.

## 7. Security — S4 hardening — 🟡 2 of 5 built; rest blocked / native / audit-gated
- RASP policy lane (§8a, pre-audit-safe) — 🟡 BUILT / UNAUDITED-PROVISIONAL (`src/rasp/*`: `conditions.js`, `degrade.js`, `detect.js`, `index.js`, `browserProbe.js`; #166/#168/#170/#174/#175). Pure `condition→tier degrade` + on-device environment-probe composition, with an **I3 deniability guard** (functions of the environment only — no wallet-set handle, so no set-existence oracle) and **I4 fail-closed** (no native probe present → `INTEGRITY_UNAVAILABLE` → WARN/biometric re-confirm, NEVER a fabricated `CLEAN`). Surfaced read-only via the RASP dashboard + Security tile (#170). **Browser-level detection now active:** `navigator.webdriver` + legacy automation fingerprints (`callPhantom`, `_phantom`, `__selenium_unwrapped`, etc.) → `HOOKED`; normal browser → `CLEAN`. §7 live pre-sign wiring is **always-on** — `VITE_RASP_PRESIGN_GATE` flag removed; `detect(browserProbeSource) → degrade() → presignGate()` runs on every sign attempt. OS-level probes (root/jailbreak/tamper) require a native Capacitor plugin — audit-gated pending real-device verification.
- RASP native detection / remote attestation — 📋 native + audit gated, NOT buildable here. The on-device probe **source** (jailbreak/root/debugger/tamper via a Capacitor plugin) and the remote-attestation leg (2b — Play Integrity / App Attest) are unbuilt; real-device verification is roadmap Phase 4. Until then detection stays unverified and the dashboard reads `pending` (`RaspSecurity.jsx`).
- Audit log (opt-in, deniability-safe) — 🟡 BUILT / UNAUDITED-PROVISIONAL, primary-session wiring landed PRE-AUDIT by explicit owner override (2026-06-16), **NOW SURFACED at `/audit-log`**. OFF by default; entries stored as a single AES-GCM blob in the shared vault store under a neutral key, byte-shaped like every other vault blob (not a forensic tell) and destroyed by panic wipe. Hard in-code denylist refuses duress/stealth/hidden/panic/decoy/seed events; logs only benign `{type, ts}`. **Keying blocker resolved:** the log is now keyed off an HKDF of the primary mnemonic (`deriveAuditSecret`) via the pure `auditSecretForSession` gate (records in the PRIMARY session only — decoy/hidden hard-off), so WalletProvider no longer needs the password it deliberately doesn't retain. **Wired** (via the provider's gated `recordAudit(type)`, the single approved importer) into `send_completed` (SendCrypto), `approval_revoked` (TokenApprovals, real revoke only), and `settings_changed` (session / biometric / 2FA / theme). `approval_granted` was REMOVED from the allowlist — granting is HONEST-DISABLED (approve() is never exposed), so the log declares no event it cannot produce. **Override is documented, not an audit sign-off** (see the "Owner override" addendum in `docs/audit-log-login-activity-deniability-decision.md`). **UI surfaced:** `src/pages/AuditLog.jsx` at `/audit-log` — enable/disable toggle, entries table (newest first), clear button, scope notes (UNAUDITED-PROVISIONAL tag). `featureCatalogue.test.js` guard updated to verify Audit Log IS surfaced with at-least `built` status. `audit-log-honest-disabled.test.js` guard narrowed to permit the one approved wirer; enforces `/audit-log` is in App.jsx and uses `AuditLog` (not `AuditLogPage`). D1–D7 multi-set storage shape (decoy/hidden own-logs) remains not built — the real-vs-decoy distinguisher hazard the auditor was to review is **not** introduced. No on-chain artifact → not "verified".
- Risk / spend limits — ✅ (PR #75; per-tx + daily caps, warn-with-acknowledgement). Risk *scoring* is now a distinct S2 build — the composite pre-sign risk verdict + RISK gate (#137; see S2) aggregates the signal heuristics into one authoritative gate.
- Encrypted cloud backup (ciphertext only) — 📋 UI shell only (`CloudBackup.jsx`)
- No-telemetry / fully-local mode, privacy routing (Tor / RPC) — 💡

> **Decision note — S4 completion status (what's left, and why none is a near-term build):**
> S4 cannot be "finished" in the JS/web environment — the remaining items are each blocked on something structural:
> - Risk / spend limits — ✅ DONE (#75). The built S4 item.
> - Audit log — 🟡 keying blocker RESOLVED + primary-session wiring landed PRE-AUDIT (owner override, 2026-06-16). The #77 finding (recordAuditEvent encrypted under the vault password, which WalletProvider doesn't retain) is fixed by re-keying off an HKDF of the primary mnemonic via the pure `auditSecretForSession` gate (primary-session only; decoy/hidden hard-off). Wired through the provider's `recordAudit(type)` into send/revoke/settings. **UI now surfaced at `/audit-log`** (toggle, entries table, clear). D1–D7 multi-set storage shape (decoy/hidden own-logs) remains not built. See the "Owner override" addendum in `docs/audit-log-login-activity-deniability-decision.md`.
> - RASP — 🟡 the pre-audit-safe **policy lane** is BUILT (§8a — #166/#168/#170/#174/#175): condition→tier degrade + honest on-device probe composition + I3 guard, surfaced read-only. **Browser-level detection now always-on** (`browserProbeSource` wired into `detect()` in SendCrypto; `VITE_RASP_PRESIGN_GATE` flag removed — no env-flag required). But the **native probe source** (jailbreak/root/debugger/tamper) + remote attestation (2b) remain 📋 native, not buildable here — iOS/Android platform code, unverifiable without real devices, audit-relevant (same class as M2c/d); real-device verification is roadmap Phase 4. The policy lane is the scaffolding; the native detector that makes it enforce is the unbuilt part.
> - Encrypted cloud backup — 📋 backend + audit gated. Ciphertext-only escrow of vault material needs a cloud target (backend was removed) and is key-handling — the catastrophic surface. Needs a backend decision + audit before any build.
> - No-telemetry / privacy routing — 💡 largely already true: the wallet is no-phone-home by design (base44 removed; remote screening is a disclosed opt-in). "Completing" it is mostly documenting/enforcing the existing posture; Tor/RPC routing is a separate idea-stage item.
> Bottom line: the buildable-in-JS S4 work is done. Audit log is wired and surfaced. The remainder is a native-dev session with real devices (RASP OS-level probes), or backend+audit decisions (cloud backup) — none startable as casual feature work here.

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
- Price charts / portfolio / analytics / tax / signing / savings — 💡 (UI present in places, not core-wired)
- Crypto Net Worth (`/net-worth`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted honest-disabled → live
  (verdict flip in `featureClassification.js`, the `/fee-analytics` precedent): real on-chain holdings via
  `usePortfolio` (total + allocation donut + per-asset rows), USD shown live (opt-in feed) or
  disclosed-approximate. **CRYPTO-ONLY** — the manual real-world assets were dropped (they lived in a global,
  non-vault-scoped table a decoy session would expose — an I3 leak); a per-vault manual-assets store is a
  deferred follow-on. See `docs/superpowers/specs/2026-06-17-networth-crypto-promotion-design.md`.
- Live market prices (opt-in) — 🟡 BUILT / UNAUDITED-PROVISIONAL. `lib/priceFeed.js`: OFF by default
  (I2 — no price egress until the user enables it in Settings), holdings-agnostic request (fixed full
  supported-symbol list, never holdings/balances/addresses), injected through `portfolioBalances` so the
  Dashboard portfolio total shows a live USD figure ("Live · HH:MM" + refresh) when on, or the
  disclosed-approximate `USD_RATES` reference rate when off/unavailable (I4 — never stale-as-live). Wired
  into the Dashboard total only; NetWorth promotion (honest-disabled → live) is a separate follow-on. See
  `docs/superpowers/specs/2026-06-16-live-price-helper-design.md`.
- Watchlist (`/watchlist` + dashboard `WatchlistWidget`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted
  honest-disabled → live (verdict flip in `featureClassification.js`, the `/net-worth` / `/fee-analytics`
  precedent). Wired off the fabricated `MOCK_PRICES` (static prices + synthesized ±4% high/low) onto the real
  opt-in feeds: `useLivePrices` (spot) + `useBasketPrices` (real 24h change + real 24h high/low, page only).
  Holdings-blind, OFF by default (I2 — no egress until the Settings live-prices opt-in; `useBasketPrices` now
  takes an `enabled` gate, scoped to the Watchlist — TokenList unchanged). Off/unavailable shows an honest
  disabled state, never a fabricated or stale figure (I4); Buy/Sell-target badges evaluate only against a live
  price. Persistence (`PersonalWatchlist`, on-device) was already real. Off-state + fail-honest verified
  in-browser; live-data render is unit-tested (`parseBasket`) but not yet eyeballed on a real network. No
  on-chain artifact → not a catalogue "verified" promotion. See
  `docs/superpowers/specs/2026-06-17-watchlist-real-prices-design.md`.
- Calculator (`/calculator`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `leaks`-disabled → live. The
  unconditional CryptoCompare `pricemulti` fetch (10 cryptos × 8 fiats) is now gated behind
  `isLivePricesEnabled()` — `enabled: liveOn` in the `useQuery`, no network call until the user opts in via
  Settings → Live Prices (I2 fixed). When off: the converter UI renders with null rates and an "Enable live
  prices" prompt (I4 — no fabricated or stale rate). Symbol list is fixed and holdings-agnostic. Off-state
  verified in-browser; live-data render UNAUDITED-PROVISIONAL (external network blocked in preview sandbox).
- Price Alerts (`/alerts`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `leaks`-disabled → live. The
  unconditional CryptoCompare fetch and 60s auto-eval poll are now gated behind `isLivePricesEnabled()` —
  `enabled:liveOn` in the `useQuery`; "Check Now" disabled when off (I2 fixed). When off: ticker shows "—",
  alert-distance info hidden, off-state banner shown (I4). Alert CRUD + triggered/dismissed state machine work
  regardless of opt-in state. On-device persistence via `base44.entities.PriceAlert`. Off-state verified
  in-browser; live-data render UNAUDITED-PROVISIONAL.
- P&L Tracking (`/pl`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled → live. The
  hardcoded stale `CURRENT_PRICES` object (BTC: 68000, ETH: 3200, …) is gone. Unrealised P&L on open
  positions and the "Close Position" exit price now come from `useLivePrices()` gated behind
  `isLivePricesEnabled()` (I2). When off or a symbol is absent from the feed: unrealised P&L shows "—",
  the "Close Position" button is disabled with a tooltip, the summary card shows no fabricated figure (I4).
  Closed-trade P&L is computed from the user-supplied or live exit price at the moment of closing and
  persisted in the record — those figures remain accurate regardless of later price moves. Exit price is now
  required for manually-added closed trades (no silent stale-price fill). Trade records persist via
  `base44.entities.PLRecord` (on-device). Off-state verified in-browser; live-data render UNAUDITED-PROVISIONAL.
- Portfolio Snapshots (`/snapshots`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled → live. The
  hardcoded stale `USD_RATES` used to compute `total_usd` at snapshot-capture time is gone. New snapshots compute
  their USD value from `useLivePrices()` gated behind `isLivePricesEnabled()` (I2); the Save Snapshot button is
  disabled (with tooltip) when off — no snapshot can be captured with fabricated values (I4). The "Current Value"
  preview card shows "—" when off. Existing stored snapshots are displayed as-is (their persisted `total_usd` is
  historical fact, not recomputable). Chart and delta comparison read persisted values — unaffected. Records persist
  via `base44.entities.PortfolioSnapshot` and `base44.entities.Wallet` (on-device). Verified in-browser; live-data
  render UNAUDITED-PROVISIONAL.
- Budget Limits (`/budget`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled → live. The
  hardcoded stale `USD_RATES` object used to convert native transaction amounts to USD is gone. "Total Spent
  This Month" and per-budget spend now come from `useLivePrices()` gated behind `isLivePricesEnabled()` (I2).
  When off: all spend totals show "—", progress bars show empty, alert/over indicators are suppressed, and a
  banner directs the user to Settings → Live Prices (I4). Budget limits themselves (`limit_usd`) are
  user-entered constants — unaffected. Records persist via `base44.entities.BudgetLimit` and
  `base44.entities.Transaction` (on-device). Live-data render UNAUDITED-PROVISIONAL.
- Smart Alerts (`/smart-alerts`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `server`-disabled → live. CRUD
  (create/toggle/delete/list) works fully on-device via `base44.entities.SmartAlert` — no fake data, no server
  dependency for the configuration flow. Condition evaluation (auto-firing based on portfolio events) is not
  wired; a persistent banner in the UI directs users to Price Alerts for live price triggers (honest scope, I4).
  `notify_email` and `notify_push` flags are stored for when a delivery backend is added. Verified in-browser.
- Analytics (`/analytics`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled → live. Removed
  `USD_RATES`. Total value, Net PnL, allocation pie, portfolio growth chart, and monthly activity bar all use
  `useLivePrices()` gated by `isLivePricesEnabled()` (I2). When off: summary cards show "—", all charts
  replaced with a single "enable live prices" prompt (I4). Off-state verified in-browser.
- NFT Portfolio (`/nft`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled → live. Removed
  `const ETH_PRICE = 3200`. USD sub-label on the portfolio value card now uses `prices?.ETH` from
  `useLivePrices()` gated by `isLivePricesEnabled()`; shows "≈ —" when off (I4). ETH-denominated values and
  CRUD are unaffected. Off-state banner added. Verified in-browser.
- Transaction Analytics (`/onchain`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled →
  live. Retitled from "On-Chain Analytics" to "Transaction Analytics". Honest scope note added: data comes from
  recorded app transactions, not live blockchain nodes. No USD_RATES — all values in native units. CRUD and
  address lookup work fully on-device. Verified in-browser.
- Anomaly Detection (`/anomaly-detection`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled
  → live. Removed fake 2.2s AI scan delay; removed "AI"/"machine learning" branding (replaced with "Pattern
  Scanner" / "Statistical analysis"). USD large-transfer detection now uses `useLivePrices()` gated by
  `isLivePricesEnabled()`; velocity and unusual-hour checks run regardless. Off-state banner explains partial
  detection. Verified in-browser.
- Fraud Detection (`/fraud`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled → live.
  Earlier AI/detection theatre (2 s fake scan, hardcoded "enforced" rule list) had already been removed by
  prior developer; the page is an honest security-awareness surface that directs users to the real on-device
  tools (Pre-Sign Scanner, Address Screening, Trust Score). No external calls, no invented threat data. Zero
  code changes needed — classification flip only.
- Recurring Payments (`/recurring`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled →
  live. CRUD (create/edit/toggle/delete recurring schedules) works fully on-device via
  `base44.entities.RecurringPayment`. Page permanently warns "schedules & reminders only"; the execute path
  calls `promptSignInSend()` which redirects to `/send` for manual user signing — no autonomous transfer is
  attempted. The gap between the original "Automate regular crypto transfers" framing and actual capability
  is closed by the honest scope banner. Zero code changes needed — classification flip only.
- Watch-only Wallets (`/watch-wallets`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled →
  live. `MOCK` fallback array (Vitalik.eth / Whale #1 hardcoded) removed — empty state now shows an honest
  "No watched wallets" prompt. `USD_RATES` removed; USD value per address uses `useLivePrices()` gated by
  `isLivePricesEnabled()` (I2). When off: USD shows "—" (I4). Off-state banner added. Note: balance field
  reflects user-entered values — no live on-chain balance fetch (presented honestly). CRUD persists via
  `base44.entities.Wallet` (is_watch_only: true) on-device.
- Crypto News (`/news-sentiment`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled →
  live. `MOCK_NEWS` (hardcoded headlines attributed to Bloomberg/Reuters/CoinDesk) and LLM/AI wiring
  removed entirely. Real articles fetched from CryptoCompare `/data/v2/news/` (live feed), gated on
  `isLivePricesEnabled()` (I2). Asset filter (All/BTC/ETH/SOL/…) maps to CryptoCompare `categories`
  parameter. Sentiment scoring removed — scores required an LLM not present in this build; page is now
  an honest news reader, not an AI sentiment analyser (title updated to "Crypto News"). Off-state:
  honest disabled prompt (I4). staleTime 5min. Live-data render UNAUDITED-PROVISIONAL.
- Correlation Matrix (`/correlation`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled →
  live. Static `CORRELATIONS` object (hardcoded coefficients e.g. BTC↔ETH = 0.82) removed. Pearson
  correlation now computed live from 30-day daily closes (`histoday`, limit=29) fetched from CryptoCompare
  for all 7 assets in a single `Promise.all`, gated on `isLivePricesEnabled()` (I2). Near-zero variance
  series (stablecoins USDC/USDT) correctly returns 0 rather than NaN. Wallet list still used to scope
  shown assets. Off-state: honest disabled prompt (I4). staleTime 10min. Live-data render
  UNAUDITED-PROVISIONAL.
- Asset Correlation Timeline (`/correlation-timeline`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted
  `unverified`-disabled → live. Hardcoded `PRICE_SERIES` and fabricated `EVENTS` (Fed Rate Cut, SEC
  Approval, Exchange Hack, etc.) removed. Real 30-day `histoday` closes for BTC, ETH, SOL from
  CryptoCompare in a single `Promise.all`, normalised to index 100 at day 0, gated on
  `isLivePricesEnabled()` (I2). Off-state: honest disabled prompt (I4). staleTime 10min. Live-data
  render UNAUDITED-PROVISIONAL.
- Seed Phrase Backup (`/wallet-seed-qr`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled → live.
  Manual textarea removed. Mnemonic now sourced from `revealWalletMnemonic(walletId)` via `WalletProvider`
  context (reads the in-memory vault container — never base44, never network). Wallet selector uses
  context `wallets[]` (public metadata only, no seeds). QR generated locally via `qrcode` `toDataURL`
  (raw BIP-39, universally importable by any BIP-39 wallet; never transmitted off-device). Explicit
  confirmation gate before reveal. Eye-toggle on word grid. `confirmWalletBackup()` marks the wallet as
  backed up in localStorage. Print opens a local window with word grid + QR (no external call). Clear
  button zeros revealed state.
- Solana Dashboard (`/solana`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled → live.
  Hardcoded fake wallet (fixed address, balance, SPL list, `Math.random()` 24h changes) removed in prior
  session; placeholder promoted to real implementation. Derives ed25519 Solana account on unlock via
  `deriveSol()` (SLIP-0010 m/44'/501'/0'/0', `@/lib/WalletProvider`). Balance fetched from real Solana
  JSON-RPC via `getBalanceSol(networkKey, address)` (`wallet-core/sol/provider.js`, `@solana/web3.js`).
  Network selector: devnet + testnet (mainnet gated: `ALLOW_SOL_MAINNET = false`). Devnet faucet link
  shown when on devnet. USD value gated on `isLivePricesEnabled()` (I2); shows "—" when off (I4). Send
  button navigates to `/send` (SOL send already wired there). Receive navigates to `/receive`. SPL tokens
  honestly noted as not wired (requires on-chain indexer). Balance auto-refreshes every 60 s; manual
  refresh button provided. Explorer link via `solExplorerUrl(networkKey, 'address', address)`.
  UNAUDITED-PROVISIONAL (external RPC not reachable in preview sandbox).
- Price Charts (`/price-charts`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled → live.
  `generateOHLCV()` (Math.random candles) removed. Real OHLCV data fetched from CryptoCompare
  `histominute` / `histohour` / `histoday` endpoints, selected by period (1H/4H → histominute, 1D/1W →
  histohour, 1M → histoday). Fully gated on `isLivePricesEnabled()` (I2) — `enabled: liveOn` in
  `useQuery`, no network call when off. When off: honest "Enable live prices" prompt replaces the chart
  (I4). Spot price header uses `useLivePrices()`. Period-change percentage computed from first/last candle
  close. CandlestickBar and CustomTooltip chart infrastructure retained unchanged. staleTime 60s.
  Live-data render UNAUDITED-PROVISIONAL (external network not reachable in preview sandbox).
- Transaction Receipts (`/receipt`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled →
  live. `USD_RATES` removed; the "USD Value" line on printed receipts now uses `useLivePrices()` gated by
  `isLivePricesEnabled()` (I2). When off or symbol absent: USD Value shows "—" — never a stale dollar
  figure on a document (I4). Off-state banner added. All other receipt fields (ID, date, type, amount,
  fee, status, address) come from real local `Transaction` records and are unaffected by the opt-in state.
- Advanced Analytics (`/advanced-analytics`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled →
  live. `USD_RATES` removed; `totalUSD` and all derived metrics (portfolioVol, portfolioSharpe,
  diversificationScore, stableRatio) now use `useLivePrices()` gated on `isLivePricesEnabled()` (I2).
  Hardcoded `MONTHLY_PERFORMANCE` array (6-month fake returns labeled "Your Portfolio") removed; Activity
  tab now shows monthly received/sent in USD computed from real `Transaction` records via
  `base44.entities.Transaction`. `VOLATILITY`/`SHARPE` kept as industry reference estimates (REF_VOL /
  REF_SHARPE), clearly labeled in the UI with an "industry reference estimates" disclaimer. Duplicate
  static Correlation tab dropped (real Pearson available at `/correlation`). Off-state: top banner +
  "—" for all USD metrics. UNAUDITED-PROVISIONAL.
- Portfolio Rewind (`/portfolio-rewind`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled →
  live. `PRICE_HISTORY` multipliers and `USD_RATES` removed. Real `histoday` closes (limit=730) fetched from
  CryptoCompare for user-held assets via `Promise.all`, gated on `isLivePricesEnabled()` (I2). Portfolio value
  per day = Σ(balance × historical close). Current value uses `useLivePrices()`. Chart thinned to ~30 points
  per period. Honest disclaimer shown: "assumes you held the same assets throughout." Off-state: disabled
  prompt (I4). staleTime 30min. Off-state verified in-browser. UNAUDITED-PROVISIONAL.
- Custom Index Builder (`/index-builder`) — 🟡 BUILT / UNAUDITED-PROVISIONAL. Promoted `unverified`-disabled →
  live. Hardcoded `PERF` object (e.g. BTC: 8.2, ETH: 12.4, SOL: 23.1 — fake weighted return %) removed.
  No fabricated performance figure shown. CRUD (create/edit/delete indexes) and pie chart unchanged — all
  driven by real local records via `base44.entities.CustomIndex`. Component list now shows live spot prices
  from `useLivePrices()` per asset when `isLivePricesEnabled()` is on; "—" equivalent (spot hidden) when
  off. UNAUDITED-PROVISIONAL.

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

---

## PROVISIONAL / UNVERIFIED — NOT BUILT (do not treat as status)

> ⚠️ This section is a PLANNING DRAFT, separate from the verified status above. Everything
> here is a classifier ESTIMATE or roadmap intent, NOT confirmed built. Do NOT sell, market,
> or report these as available. Items graduate INTO the verified status above ONLY after a
> per-page code read confirms them real. Source: docs/Master-feature-matrix.md (draft).

### Not-built feature shells (salvage candidates — estimated, unverified)
Snapshots, price/smart alerts, tax report, invoice generator, news sentiment, price charts,
analytics/benchmark/correlation, NFT/token enrichment & discovery,
(ERC-20 discovery graduated to live: manual token tracker, curated 12-token quick-add, WalletToken IndexedDB, spam detection, I2-gated USD.)

payment links, fraud detection. State: shell/fake, unwired.
(Net worth, fee analytics, watchlist, calculator, P&L, spending patterns, address book
graduated to verified status above.)
Disposition: wire per docs/Salvage-roadmap.md; the ⚠ address-leaking ones (analytics, NFT/
token, ERC-20) become opt-in + privacy-disclosed per docs/Backend-security-architecture.md.

### Blocked (not cut, cannot complete yet)
Solana / multi-asset send (gated on per-asset verification). AI advisor/assistant (disabled
#89; not tier-eligible until rebuilt on-device or stripped — never raw wallet data).

### Cut (removed on principle — security + positioning §4)
Leaderboard, public profiles (targeting/identity exposure). Shared portfolio → keep only as
signed local export. Referral tracker → only if fully serverless.
