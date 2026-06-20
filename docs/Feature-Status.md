# Veyrnox — Feature Status (verified against code on `main`)

> The single AT-A-GLANCE status of what is genuinely built, what is half-built,
> and what is only specced. Verified against the actual code on `main`
> (not against aspiration). When this and another doc disagree, this wins —
> then fix the other doc.
>
> Markers: ✅ built & merged · 🟡 built-but-gated / partial · 📋 specced, not built
> · 💡 parking-lot idea · ❌ removed / out of scope
>
> Standing rules (unchanged, still true): **testnet/devnet only; mainnet unlocked
> 2026-06-17** (ALLOW_MAINNET = ALLOW_BTC_MAINNET = ALLOW_SOL_MAINNET = true,
> owner sign-off after internal audit, 0 crit/high/med findings). No asset is
> wired to a mainnet chain yet — each needs a verified mainnet UI-path send.
> Status last verified: 2026-06-20.

---

## Reality check (read first)
- **Test suite:** 390+ tests across 39+ files, all green (`npm test`); `check:rng` green.
- **Internal audit:** COMPLETE 2026-06-17. 0 critical / 0 high / 0 medium findings.
  Documented in `docs/audit-triage/internal-audit-2026-06-17.md`. Owner sign-off
  recorded. All 7 security vulnerabilities (VULN-1–7) closed. An independent
  third-party audit is still RECOMMENDED for the strongest assurance but was not
  required under the owner's gate policy.
- **Mainnet gate:** ALLOW_MAINNET = true since 2026-06-17. No asset is wired to
  mainnet yet — each asset needs a verified mainnet UI-path send before its
  `networkKey` is changed in `assets.js`.
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
  bulk of what's built — all security features are UNAUDITED-PROVISIONAL pending
  an independent third-party audit (the internal audit passed but does not replace
  independent review for the strongest assurance). Deniability features
  (duress/stealth/panic) are testnet/demo.
- **VULN-1–7 closed (2026-06-20):** biometric KDF-bypass disclosure (VULN-1),
  app-layer gate disclosure (VULN-2), hardware wallet BTC path/currency/coin
  env-gated for mainnet (VULN-3), stealth storage isolation disclosure (VULN-4),
  clipboard 30s auto-wipe for seed phrase copies (VULN-5), backup PIN floor raised
  to 6 digits + offline-attack warning (VULN-6), Trezor manifest fixed (VULN-7).
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
- Biometric unlock — ✅ (`biometric.js`; app-layer preference gate, PROVISIONAL — not an OS-enforced ACL; biometric KDF-bypass disclosure added, VULN-1 closed)
- FIDO2 / passkeys (unlock gate, NOT key custody) — ✅ (`passkey.js`; password-only escape hatch present — SAST M-3 fix)
- Session manager + auto-lock (idle / background) — ✅ (`session.js`)
- At-rest KDF work-factor raise + param migration — ✅ (SAST M3; PROVISIONAL — params need independent audit validation)
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
- Composite pre-sign risk verdict + RISK gate — ✅ BUILT (#137; `src/risk/*` — `score()` aggregates the S1–S8 signal heuristics into one verdict, `buildRiskInputs`/`fromSendState` adapts send state to inputs, `RiskVerdictBanner` renders the one-sentence composite). Wired into Send→verify as the authoritative pre-sign gate: a coral **RISK** verdict requires an explicit "Sign anyway" acknowledgement (destructive-action gate); INFO is a non-blocking chip; INDETERMINATE escalates to CAUTION (fail-closed, I4). LOCAL-only; warns-not-blocks; never claims "safe".
- Send-time step-up re-auth — ✅ **VERIFIED 2026-06-20** (8 on-chain sends confirmed across ETH/ARB/OP/MATIC/USDC/USDT/BTC/SOL; `src/lib/sendReauth.js` + `src/wallet-core/credentialVerifier.js`). Re-verifies the unlock credential before a send when the last auth falls outside a recent-auth window (`sendReauthRequired`, 2-min default). The verifier hashes under the **same `KDF_PARAMS` as the unlock KDF**, constant-time-compares, zeroizes the transient hash, and fails closed on malformed params (I4); capture degrades gracefully (`captureVerifierSafe`) and the attempt cap persists across Back.
- Two-factor gate — ✅ **VERIFIED 2026-06-20** (PR #195; `src/lib/twoFactorGate.js` pure verdict, `src/lib/WalletProvider.jsx` hooks, `src/components/security/{TwoFactorGate,useActionGuard}.jsx`). **Configured in Security Settings → "Two-factor at critical actions" (`src/components/security/TwoFactorSettings.jsx`, in `pages/Settings.jsx`) — NOT the Security Center** (which is alerts/sessions/limits only; the old Security Center "2FA" tab was removed). The section explicitly lists which actions it gates. Enforced at: **send** (`SendCrypto.jsx`), **reveal recovery phrase** (`WalletPortfolioPage.jsx`), **set duress PIN** / **create hidden wallet** / **hide existing wallet** (`DuressPin.jsx`, `StealthWallets.jsx`). Factor 1 (both methods) = the unlock credential (full vault Argon2id). **Method 1 — Action Password:** a 2nd knowledge factor, persistable Argon2id record (`src/wallet-core/actionPassword.js`) stored **inside** the encrypted multi-vault container (`multiVault.js`) so it carries no on-disk tell and is **per wallet-set**; the two 192 MiB checks run **sequentially** (Defect-A). **Method 2 — Passkey/FIDO2:** PIN + a WebAuthn assertion (`passkey.js: verifyPasskeyAssertion`, mode `passkey`) — a real **possession** factor that **fails closed** (any cancel/timeout/error = not verified, the deliberate inverse of the unlock gate's SAST-M1/M2 degrade path); **device-global** pref (`veyrnox-2fa-passkey`), so it prompts in every session on the device, not per-set. 5 wrong attempts → `lock()` (I4). Opt-in: no method set → unchanged behaviour. **HONEST SCOPE:** Method 1 is two things you know on one device (not hardware 2FA) and is **active-set (primary) only** — see the decoy/hidden-parity TARGET in §6; Method 2 adds possession but is device-global, not per-set.
- Security Dashboard (read-only posture view) — ✅ (PR #53) aggregates existing signals (`securityPosture.js`, `SecurityDashboard.jsx`); reuses approvals/spam/poison/feature-status, no new detection, never claims "safe".
- dApp security alerts — 📋 not built

## 6. Security — S3 access & recovery (deniability stack — PROVISIONAL, testnet/demo)
- Duress PIN / decoy wallet — ✅ (`duress.js`)
- Stealth / hidden wallets (deniable chaff-slot pool) — ✅ (`stealth.js`; 256-slot pool after SAST M-1 collision fix; multi-chain reveal; move-existing variant; stealth storage isolation disclosure added, VULN-4 closed)
- Panic wipe (emergency local key destruction) — ✅ (`panic.js`; panic/wipe PIN at unlock + in-app guarded wipe; `inspectKeyMaterial()`)
- Constant-KDF unlock timing across the deniability stack — ✅ (`deniabilityUnlock.js`; SAST M-2 fix)
- Action Password 2FA parity in decoy/hidden sessions — 🎯 TARGET / audit-gated (§24). The Action Password second factor (§5) enforces on the **primary set only**. Decoy (`duress.js`) and hidden (`stealth.js`) slots encrypt a **bare mnemonic** as plaintext (not the multi-vault container), so they have no field to carry a per-set Action Password record. **Design constraint (why this is not a mechanical wire):** the stealth chaff pool sizes every fake blob to a *bare-mnemonic* ciphertext length (`makeChaff` → `ptLen = encode(mnemonic).length + 16`) so real hidden slots and chaff share one length distribution. Switching decoy/hidden plaintext to a container to fit a record would inflate real slots past the chaff length → a **real-vs-chaff size distinguisher**, i.e. the exact deniability tell the chaff pool exists to prevent (variable-length-if-present is worse). **Threat-model question (open):** a decoy is meant to be *frictionlessly operable under coercion* — forcing a second factor inside it may be undesirable, not just hard. Safe paths (all audit-gated): (a) constant-size padded container for **all** slots incl. chaff; or (b) a deliberate, documented "decoy/hidden carry no second factor by design" decision. Do **not** build blind.
- v1 KEK-less PIN auth UX (6-digit PinPad, PIN onboarding + returning-PIN unlock, Face-ID-to-decoy, Option A deterministic decoy fallback) — 🟡 BUILT / UNAUDITED-PROVISIONAL, testnet (`security/PinPad.jsx`, `pinOnboarding.js`, `pinRecovery.js`, `authModel.js`, `decoyFallback.js`, `deniabilityUnlock.js`, `mnemonic.js`; cohort marker `veyrnox-auth-model` with fail-fast on unknown model; 4th unconditional KDF slot + four-slot constant-work execution assertion `deniability-timing.test.js`). **Headline audit item:** a 6-digit PIN over Argon2id is exhaustible offline on a seized device in hours–days — the hardware-KEK fast-follow is what closes it; see `docs/superpowers/specs/2026-06-08-v1-pin-auth-ux-design.md` §6. Landed incrementally via the #138/#154/#156/#161 line, not a single PR.
- Hardware wallet (Ledger / Trezor) — 🟡 **BUILT** — Ledger WebHID address derivation LIVE; Trezor setup guide added; app-layer gate disclosure added (VULN-2 closed); BTC path/currency/coin env-gated for mainnet (VULN-3 closed); Trezor manifest fixed (VULN-7 closed). TX signing bridge to /send is **coming soon** — not yet wired. BTC/SOL hardware signing not wired. (`HardwareWalletPage.jsx`)
- Login activity (last successful unlock timestamp) — ✅ **VERIFIED 2026-06-20** (vault `lastUnlockAt` timestamp confirmed active; primary-session only — decoy/hidden never read or write it → no credential/hidden-set tell; destroyed by panic wipe; shown on Security Dashboard). Original backend/map scope out of scope (needs a backend removed with base44; conflicts with deniability stack).
- Social recovery (guardian / SSS) — ❌ removed [audit-blocked-and-not-advertised] (never built; removed from UI/catalogue)
- Crypto Will / inheritance — 📋 not built, audit + legal gated (not a near-term build). See inheritance decision note.
- Multi-sig (personal + treasury) — ❌ removed [audit-blocked-and-not-advertised] (was UI shell `MultiSigWallets.jsx` w/ fake addresses; page/route/nav/catalogue deleted)

> **Decision note — Login activity re-scope (last-unlock timestamp):**
> Original spec (cross-device sign-in history + location/map) is out of scope: needs a backend (removed with base44), and a location/IP/device access log is a surveillance/forensic artifact that conflicts with S3 — it can reveal that a hidden wallet was opened or when a duress credential was used. A self-custody deniable wallet has no account to show sign-in history for.
> Best-of-breed successor — **BUILT + VERIFIED 2026-06-20**: a "last successful unlock" timestamp, stored IN-VAULT on the primary container (`lastUnlockAt`), shown to the owner as a tamper signal. **Scope as built is PRIMARY-SESSION ONLY** — decoy/hidden sessions never read or write it (they show "First open"). The original wording here ("decoy vault carries its own independent value") was reconsidered at build time: decoy/hidden are stored as bare mnemonics with no field to carry a per-set timestamp, so giving them an independent stored value would reopen the bare-mnemonic chaff-length distinguisher that blocks the Action-Password-2FA TARGET (audit-gated). Primary-only sidesteps it entirely and is consistent with the audit-log primary-only decision. Deniability-clean (no new blob → no count/size oracle; panic-wipe destroys it for free).

> **Decision note — Crypto Will / inheritance (why it's deferred, not built):**
> Inheritance = letting a beneficiary recover the wallet's keys after the owner dies, without the owner handing over the seed while alive. On a no-backend, self-custody, deniable wallet, every viable design is currently blocked or problematic:
> 1. Shamir secret-sharing (split the seed into N shares): this is the SAME primitive as Social Recovery / guardians, which this project REMOVED as audit-blocked-and-not-advertised (see section 9 / the removed list). Re-introducing it reverses a deliberate, audit-flagged cut, adds seed-equivalent share-custody/collusion threat surface, and significantly expands audit scope. Blocked unless social recovery is first un-removed and audited.
> 2. Dead-man's-switch (release recovery material after no check-in for X): requires an external trigger — a server / time-oracle watching for the missed check-in. This wallet has NO backend (base44 removed) and is explicitly no-phone-home; a dead-man's-switch fundamentally requires the phone-home infrastructure the product was built to avoid, and a check-in schedule is itself a forensic signal that conflicts with the deniability stack. Blocked by the no-backend architecture.
> 3. Time-locked / on-chain recovery (smart-contract escrow + timelock): moves custody to a contract, which breaks the self-custody model, reintroduces smart-contract risk, needs mainnet + gas + its own audit, and drifts toward the regulated/custodial cluster the MVP deliberately excludes. Problematic on self-custody + scope grounds.
> Legal dimension (not just technical): inheritance is estate law — jurisdiction-specific and regulated, intersecting probate, tax, and fiduciary duty. A feature that transfers assets on death may constitute a will or create custodial/fiduciary obligations. Needs a LAWYER, not just an auditor; cannot ship on engineering judgment alone.
> What would have to be true before building: (a) independent security audit of the chosen recovery primitive; (b) legal review in target jurisdictions (estate/probate/fiduciary/regulatory); (c) for the Shamir path, social recovery first un-removed and audited (reversing a deliberate cut). Until all hold, spec-only.

## 7. Security — S4 hardening — 🟡 3 of 5 built; rest blocked / native / audit-gated
- RASP policy lane (§8a, pre-audit-safe) — 🟡 **BUILT / VERIFIED 2026-06-20 (browser-level)** (`src/rasp/*`: `conditions.js`, `degrade.js`, `detect.js`, `index.js`, `browserProbe.js`; #166/#168/#170/#174/#175). Pure `condition→tier degrade` + on-device environment-probe composition, with an **I3 deniability guard** and **I4 fail-closed**. **Browser-level detection VERIFIED active 2026-06-20:** `navigator.webdriver` + legacy automation fingerprints → `HOOKED`; normal browser → `CLEAN`. §7 live pre-sign wiring is **always-on** — `VITE_RASP_PRESIGN_GATE` flag removed; `detect(browserProbeSource) → degrade() → presignGate()` runs on every sign attempt. Surfaced read-only via the RASP dashboard + Security tile. OS-level probes (root/jailbreak/tamper) require a native Capacitor plugin — audit-gated pending real-device verification.
- RASP native detection / remote attestation — 📋 native + audit gated, NOT buildable here. The on-device probe **source** (jailbreak/root/debugger/tamper via a Capacitor plugin) and the remote-attestation leg (2b — Play Integrity / App Attest) are unbuilt; real-device verification is roadmap Phase 4.
- Audit log (opt-in, deniability-safe) — ✅ **BUILT / VERIFIED 2026-06-20, surfaced at `/audit-log`**. OFF by default; entries stored as a single AES-GCM blob in the shared vault store under a neutral key, byte-shaped like every other vault blob and destroyed by panic wipe. Hard in-code denylist refuses duress/stealth/hidden/panic/decoy/seed events; logs only benign `{type, ts}`. **Keying blocker resolved:** the log is now keyed off an HKDF of the primary mnemonic (`deriveAuditSecret`) via the pure `auditSecretForSession` gate (records in the PRIMARY session only — decoy/hidden hard-off). **Wired** into `send_completed`, `approval_revoked`, and `settings_changed`. **UI surfaced:** `src/pages/AuditLog.jsx` at `/audit-log` — enable/disable toggle, entries table (newest first), clear button, scope notes.
- Risk / spend limits — ✅ (PR #75; per-tx + daily caps, warn-with-acknowledgement). Risk *scoring* is now a distinct S2 build — the composite pre-sign risk verdict + RISK gate (#137; see S2) aggregates the signal heuristics into one authoritative gate.
- Encrypted cloud backup (Argon2id + AES-GCM self-custodial) — ✅ **BUILT** — fully implemented Argon2id+AES-GCM self-custodial export/restore with restore verification (`CloudBackup.jsx`). Not a UI shell. PIN floor raised to ≥6 digits (VULN-6 closed). Not a UI shell — export and restore are both functional. Not "verified" in the on-chain sense; needs independent audit sign-off.
- No-telemetry / fully-local mode, privacy routing (Tor / RPC) — 💡

> **Decision note — S4 completion status (what's left, and why none is a near-term build):**
> S4 cannot be "finished" in the JS/web environment — the remaining items are each blocked on something structural:
> - Risk / spend limits — ✅ DONE (#75). The built S4 item.
> - Audit log — ✅ keying blocker RESOLVED + primary-session wiring VERIFIED 2026-06-20. See the "Owner override" addendum in `docs/audit-log-login-activity-deniability-decision.md`.
> - RASP — 🟡 the pre-audit-safe **policy lane** is BUILT; browser-level detection VERIFIED 2026-06-20. But the **native probe source** (jailbreak/root/debugger/tamper) + remote attestation (2b) remain 📋 native, not buildable here.
> - Encrypted cloud backup — ✅ BUILT. Argon2id+AES-GCM self-custodial export/restore functional; PIN floor ≥6 digits; restore verification wired. Needs independent audit sign-off for the strongest assurance.
> - No-telemetry / privacy routing — 💡 largely already true by design; Tor/RPC routing is a separate idea-stage item.

## 8. SAST / validation hardening — ✅ merged
- SAST M-1 (stealth slot-collision fund loss) — ✅ fixed (PR #33)
- SAST M-2 (deniability unlock timing oracle) — ✅ fixed (PR #34/#35/#36)
- SAST M-3 (at-rest KDF work factor) + passkey lockout escape hatch — ✅ fixed (PR #35/#40)
- Validation / fund-correctness / render-safety sweep — ✅ doc + per-chain address-validation fix (PR #41/#42)
- SAST S1/passkey findings — documented (review-only), see `docs/SAST_S1_FINDINGS.md`
- Test-suite determinism (Argon2id WASM-heap OOM under parallel vitest) — ✅ fixed (PR #73); suite pinned to a single worker so the 192 MiB KDF can't exhaust the heap.
- VULN-1–7 (independent audit prep) — ✅ all 7 closed 2026-06-20. See Reality check above.

## 9. AI (advisory only) — 💡 none built
- Plain-language tx explanation, scam/phishing explanation, educational assistant, portfolio Q&A — 💡
- AI portfolio advisor — 💡 advisory-only allowed; auto-executing ❌ out of scope

## 10. Niceties / analytics / utilities
- Help menu (top-bar Documentation entry) — ✅ (`HelpMenu.jsx`, PR #48)
- Address book — ✅ (with per-chain validation on save)
- ENS / SNS **resolution** in Send — ✅ (resolve-only); ENS **registration** — ❌ removed (PR #48)
- Live market prices (CryptoCompare, opt-in) — ✅ **VERIFIED 2026-06-20** (`lib/priceFeed.js`: OFF by default per I2; holdings-agnostic request; injected through `portfolioBalances`; Dashboard shows live USD figure "Live · HH:MM" + refresh when enabled, or disclosed-approximate `USD_RATES` reference rate when off/unavailable per I4)
- Crypto Net Worth (`/net-worth`) — ✅ LIVE. Real on-chain holdings via `usePortfolio` (total + allocation donut + per-asset rows), USD shown live (opt-in feed) or disclosed-approximate. **CRYPTO-ONLY** — manual real-world assets dropped (global table would leak across decoy sessions — I3). See `docs/superpowers/specs/2026-06-17-networth-crypto-promotion-design.md`.
- Analytics / advanced-analytics / benchmark / portfolio-rewind / P&L / risk / correlation / index-builder / snapshots / on-chain analytics — ✅ LIVE
- Spending patterns / fee analytics — ✅ **VERIFIED 2026-06-20** (real on-chain BTC fee history confirmed)
- Calculator — ✅ LIVE
- Watchlist — ✅ LIVE
- Savings / budget — ✅ LIVE
- Invoices — ✅ LIVE
- Tax report — ✅ LIVE
- News sentiment — ✅ LIVE
- Notifications / push notifications — ✅ LIVE
- Dashboard widgets — ✅ LIVE
- Payment links — ✅ LIVE
- Receipt — ✅ LIVE
- Recurring (schedule/reminder only; hands off to /send) — ✅ LIVE (auto-debit path gutted per PR #47)
- Price charts — ✅ LIVE
- Alerts (price / smart) — ✅ LIVE
- Watch wallets — ✅ LIVE
- Connect (WalletConnect stub) — see §12
- NFT / NFT multichain — ✅ LIVE
- Voice commands — ✅ LIVE
- Referrals (`/referrals`) — ✅ **BUILT 2026-06-20** (recently added)
- WalletConnect / dApp connector: 💡 ROADMAP — UI route/stub exists; full WalletConnect integration is post-audit (see §12)
- Web3 browser — 💡 ROADMAP
- EVM tx history indexer — 💡 ROADMAP (current tx history uses explorer fallback, no indexer)
- Live threat-intel feed — 💡 ROADMAP (suspicious-address categories ship empty pending a maintained feed)
- Split bill — 💡 ROADMAP

## 11. Platform / app shell
- Desktop web app — ✅
- Demo mode (browse without backend) — ✅
- iOS native (Capacitor) — 🟡 Capacitor wired; needs Mac build env (not possible on Windows)
- Android native (Capacitor) — 🟡 Capacitor wired; not yet built/released
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
- Independent security audit (S1–S4 + crypto stacks) — RECOMMENDED; see `docs/Audit.scope.md`. Internal audit complete (2026-06-17, 0 crit/high/med). Third-party audit not yet engaged.
- Legal entity + Track-B legal review (Guardian tier wording, OFAC shipping legal sign-off, etc.).
- Mainnet sends — ALLOW_MAINNET=true (2026-06-17); no asset is wired to mainnet yet. Each asset needs a verified mainnet UI-path send before its `networkKey` is updated in `assets.js`.
- AVAX/BNB testnet sends — blocked by faucet access; flip to `live` once real on-chain UI-path txid exists.

## Related docs
- `docs/WalletRoadmap.md` — build order + statuses
- `docs/WalletFeatures.spec.md` — canonical scope + full-site split
- `docs/Security.roadmap.md` — S1–S4 detail + deniability stack write-ups
- `docs/Tiers.pricing.md` — pricing model (hypothesis, not validated)
- `docs/PhaseBTC.verification.md` — the hands-on BTC send sign-off procedure
- `docs/audit-triage/internal-audit-2026-06-17.md` — internal audit report (0 crit/high/med)
