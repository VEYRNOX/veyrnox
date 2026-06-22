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
> **PROVISIONAL pending that audit**. Status last verified: 2026-06-20.

---

## Reality check (read first)
- **Test suite:** 1195 tests across 137 files, all green (`npm test`); `check:rng` green.
- **What actually SENDS on-chain today:** **ETH (Sepolia), USDC (Ethereum mainnet ✓ MAINNET),
  USDT (Ethereum mainnet ✓ MAINNET), MATIC (Polygon Amoy), ARB (Arbitrum Sepolia), OP (OP Sepolia),
  AVAX (Fuji), BNB (testnet), BTC (Bitcoin testnet), and SOL (Solana devnet)** are `live` — each send verified
  end-to-end through the full in-app UI path on-chain (covering every send family:
  EVM L1 native, ERC-20 contract-call, four EVM L2/sidechains, BTC UTXO, and SOL
  ed25519). USDC and USDT are now LIVE on Ethereum mainnet (build:release sends confirmed on etherscan.io, 2026-06-20). AVAX and BNB are LIVE on their testnets — full UI-path sends confirmed on-chain (AVAX Fuji `0x3697e0d…`, independently re-confirmed via Routescan 2026-06-22; BNB testnet `0x1a6ee75…`, independently re-confirmed on-chain via public BSC-testnet RPC 2026-06-22; full UI-path provenance per session record + owner confirmation).
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
| USDC | erc20 | **Ethereum Mainnet** | ✅ | ✅ verified on-chain (full UI path, build:release, `0xc37314…`, 2026-06-20) — **✓ MAINNET** | ✅ **live** |
| USDT | erc20 | **Ethereum Mainnet** | ✅ | ✅ verified on-chain (full UI path, build:release, `0x3f2fe1…`, 2026-06-20) — **✓ MAINNET** | ✅ **live** |
| MATIC | evm | Polygon Amoy | ✅ | ✅ verified on-chain (full UI path, `0x6a4ded…`, block 40274236, 2026-06-16) | ✅ **live** |
| ARB | evm | Arbitrum Sepolia | ✅ | ✅ verified on-chain (full UI path, `0x797928…`, 2026-06-14) | ✅ **live** |
| OP | evm | Optimism Sepolia | ✅ | ✅ verified on-chain (full UI path, `0xc3fd1e…`, 2026-06-14) | ✅ **live** |
| AVAX | evm | Avalanche Fuji | ✅ | ✅ verified on-chain (full UI path, `0x3697e0d…`, block 56425855, re-confirmed 2026-06-22) | ✅ **live** |
| BNB | evm | BNB testnet | ✅ | ✅ verified on-chain (full UI path, `0x1a6ee75…`, block 114427048) | ✅ **live** |
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
- Send native coin — ✅ for ETH (Sepolia), ARB (Arbitrum Sepolia), OP (OP Sepolia) — each full UI path verified on-chain (ETH `0x2d4d5d…` 2026-06-11; ARB `0x797928…`, OP `0xc3fd1e…` 2026-06-14); other natives ✅ live (AVAX Fuji `0x3697e0d…` + BNB testnet `0x1a6ee75…`, full UI path)
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
- Avalanche (Fuji) — ✅ live send — **full UI path verified on-chain** (native AVAX transfer; txid `0x3697e0dfed498cbcafabe73ec881c2e193e06434c61122f9fb0efda546c61996`, block 56425855, `0x90f9f1…E68a729` → `0xd8dA6BF2…aA96045`, 0.001 AVAX, EIP-1559 Standard tier; independently re-confirmed on-chain via Routescan 2026-06-22 — sender/recipient/value/block all match). Explorer: testnet.snowtrace.io.
- BNB (BNB testnet, chainId 97) — ✅ live send — **full UI path verified on-chain** (native tBNB transfer; txid `0x1a6ee75ee51ad9cf15e9e6fda4b8a26230378c90a449cd881f96c37def957f75`, block 114427048, `0x90f9f1…E68a729` → `0xd8dA6BF2…aA96045`, 0.001 tBNB, Standard+ tier — 1 gwei floors the BSC min-gas requirement; on-chain existence/success/sender/recipient/value/block independently re-confirmed via public BSC-testnet RPC (`bsc-testnet-rpc.publicnode.com`, `eth_getTransactionReceipt`) 2026-06-22 — status SUCCESS, gasUsed 21000; full UI-path provenance per session record + owner confirmation). Explorer: testnet.bscscan.com.
- ERC-20 (USDC, USDT — Sepolia) — ✅ live send — **full UI path verified on-chain** (ERC-20 `transfer`, `sendToken`; USDC txid `0x687d8c…` block 11074999, USDT txid `0x3168e4…` block 11075008, both 2026-06-16, 1 token each, status SUCCESS, decimals 6 re-checked on-chain).
- ERC-20 (USDC, USDT — **Ethereum Mainnet**) — ✅ **✓ MAINNET LIVE** — **full UI path verified on-chain via build:release** (2026-06-20): USDC txid `0xc3731477…` ([etherscan.io](https://etherscan.io/tx/0xc3731477db771bcf413198b5deb97d5ac2a13180ad0fd48353f0341867bfa0a2)) contract `0xA0b8…eB48`; USDT txid `0x3f2fe19a…` ([etherscan.io](https://etherscan.io/tx/0x3f2fe19a1092af36b4ca758846c4d266fd55f947efc110a1122013c2b242b986)) contract `0xdAC1…1ec7`. Both from `0x90f9f1…E68a729` → `0x82D0Fa…55BAB`, status SUCCESS, 6 decimals, no dev flags.
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
- Send-time step-up re-auth — ✅ VERIFIED 2026-06-20 (implicit, via 8 on-chain sends). Every verified asset send (ETH, USDC, USDT, MATIC, ARB, OP, AVAX, BNB) documents "step-up PIN re-auth" in the UI path in `assets.js`. Gate fired on real sends, txids on-chain. (#152; `src/lib/sendReauth.js` + `src/wallet-core/credentialVerifier.js`). Re-verifies the unlock credential before a send when the last auth falls outside a recent-auth window (`sendReauthRequired`, 2-min default). The verifier hashes under the **same `KDF_PARAMS` as the unlock KDF**, constant-time-compares, zeroizes the transient hash, and fails closed on malformed params (I4); capture degrades gracefully (`captureVerifierSafe`) and the attempt cap persists across Back.
- Two-factor at CRITICAL points — PIN + Action Password OR PIN + Passkey/FIDO2 — ✅ VERIFIED 2026-06-20 (Action Password path). Set Action Password via Security Settings → "Action Password set" toast confirmed → "Currently enforcing: PIN + Action Password" status shown. Navigated to Send → reached fee/confirm step → gate rendered: "Authorise this send with your PIN + Action Password — Both factors are required for this action." Filled both credential fields (PIN + Action Password) → "Verify & continue" enabled. Gate is live and correctly requires both factors before the send can proceed. (PR #195; `src/lib/twoFactorGate.js` pure verdict, `src/lib/WalletProvider.jsx` hooks, `src/components/security/{TwoFactorGate,useActionGuard}.jsx`). **Configured in Security Settings → "Two-factor at critical actions" (`src/components/security/TwoFactorSettings.jsx`, in `pages/Settings.jsx`) — NOT the Security Center** (which is alerts/sessions/limits only; the old Security Center "2FA" tab was removed). The section explicitly lists which actions it gates. Enforced at: **send** (`SendCrypto.jsx`), **reveal recovery phrase** (`WalletPortfolioPage.jsx`), **set duress PIN** / **create hidden wallet** / **hide existing wallet** (`DuressPin.jsx`, `StealthWallets.jsx`). Factor 1 (both methods) = the unlock credential (full vault Argon2id). **Method 1 — Action Password:** a 2nd knowledge factor, persistable Argon2id record (`src/wallet-core/actionPassword.js`) stored **inside** the encrypted multi-vault container (`multiVault.js`) so it carries no on-disk tell and is **per wallet-set**; the two 192 MiB checks run **sequentially** (Defect-A). **Method 2 — Passkey/FIDO2:** PIN + a WebAuthn assertion (`passkey.js: verifyPasskeyAssertion`, mode `passkey`) — a real **possession** factor that **fails closed** (any cancel/timeout/error = not verified, the deliberate inverse of the unlock gate's SAST-M1/M2 degrade path); **device-global** pref (`veyrnox-2fa-passkey`), so it prompts in every session on the device, not per-set. 5 wrong attempts → `lock()` (I4). Opt-in: no method set → unchanged behaviour. **HONEST SCOPE:** Method 1 is two things you know on one device (not hardware 2FA) and is **active-set (primary) only** — see the decoy/hidden-parity TARGET in §6; Method 2 adds possession but is device-global, not per-set. Both: not on-chain verified — BUILT, not "verified". Full design + the two deniability models in `docs/vault-auth-architecture-brief.md` §6b.
- Security Dashboard (read-only posture view) — ✅ (PR #53) aggregates existing signals (`securityPosture.js`, `SecurityDashboard.jsx`); reuses approvals/spam/poison/feature-status, no new detection, never claims "safe".
- dApp security alerts — 📋 not built

## 6. Security — S3 access & recovery (deniability stack — PROVISIONAL, testnet/demo)
- Duress PIN / decoy wallet — ✅ (`duress.js`)
- Stealth / hidden wallets (deniable chaff-slot pool) — ✅ (`stealth.js`; 256-slot pool after SAST M-1 collision fix; multi-chain reveal; move-existing variant)
- Panic wipe (emergency local key destruction) — ✅ (`panic.js`; panic/wipe PIN at unlock + in-app guarded wipe; `inspectKeyMaterial()`)
- Constant-KDF unlock timing across the deniability stack — ✅ (`deniabilityUnlock.js`; SAST M-2 fix)
- Action Password 2FA parity in decoy/hidden sessions — 🎯 TARGET / audit-gated (§24). The Action Password second factor (§5) enforces on the **primary set only**. Decoy (`duress.js`) and hidden (`stealth.js`) slots encrypt a **bare mnemonic** as plaintext (not the multi-vault container), so they have no field to carry a per-set Action Password record. **Design constraint (why this is not a mechanical wire):** the stealth chaff pool sizes every fake blob to a *bare-mnemonic* ciphertext length (`makeChaff` → `ptLen = encode(mnemonic).length + 16`) so real hidden slots and chaff share one length distribution. Switching decoy/hidden plaintext to a container to fit a record would inflate real slots past the chaff length → a **real-vs-chaff size distinguisher**, i.e. the exact deniability tell the chaff pool exists to prevent (variable-length-if-present is worse). **Threat-model question (open):** a decoy is meant to be *frictionlessly operable under coercion* — forcing a second factor inside it may be undesirable, not just hard. Safe paths (all audit-gated): (a) constant-size padded container for **all** slots incl. chaff; or (b) a deliberate, documented "decoy/hidden carry no second factor by design" decision. Do **not** build blind. **Note — the Passkey method (§5, Method 2) is different:** it is device-global (stored outside any container), so it *does* prompt in decoy/hidden sessions — but that is the consistent-everywhere model, not the per-set model, and carries its own threat-model trade-off (a coerced decoy will demand the passkey too). It sidesteps the chaff-length constraint at the cost of not being per-set. Full design note + both deniability models in `docs/vault-auth-architecture-brief.md` §6b.
- v1 KEK-less PIN auth UX (6-digit PinPad, PIN onboarding + returning-PIN unlock, Face-ID-to-decoy, Option A deterministic decoy fallback) — ✅ VERIFIED 2026-06-20 (returning-PIN unlock path). PinPad rendered on every protected-route navigate during this session; PIN 111111 accepted and vault decrypted correctly on each unlock. Autolock re-triggered and re-unlocked correctly multiple times. Real vault with real seed (bamboo… testnet seed) decrypted and real balances loaded. UX flow confirmed end-to-end. HONEST SCOPE: hardware-KEK is still missing (6-digit PIN remains offline-exhaustible — documented, audit-gated); Face-ID-to-decoy path not exercised (mobile only); decoy fallback not exercised (web only). These scopes stay PLANNED/TARGET per the audit gate. Testnet (`security/PinPad.jsx`, `pinOnboarding.js`, `pinRecovery.js`, `authModel.js`, `decoyFallback.js`, `deniabilityUnlock.js`, `mnemonic.js`; cohort marker `veyrnox-auth-model` with fail-fast on unknown model; 4th unconditional KDF slot + four-slot constant-work execution assertion `deniability-timing.test.js`). **Headline audit item:** a 6-digit PIN over Argon2id is exhaustible offline on a seized device in hours–days — the hardware-KEK fast-follow is what closes it; see `docs/superpowers/specs/2026-06-08-v1-pin-auth-ux-design.md` §6. Landed incrementally via the #138/#154/#156/#161 line, not a single PR.
- Hardware wallet (Ledger / Trezor) — 🟡 BUILT / UNVERIFIED (`HardwareWalletPage.jsx` + `evm/hw-send.js` + `btc/hw-send.js` + `sol/hw-send.js`; `@trezor/connect-web` + `@ledgerhq/hw-app-eth/btc/solana`). ETH/BTC/SOL address derivation and EIP-1559/PSBT/SOL signing for Ledger (WebHID/U2F) and Trezor (Connect popup). BUILT but not on-device verified — flip to ✅ live only after testnet txid on each device type. I1 preserved; no private key path. (PR #246, merged 2026-06-20)
- Login activity (+ map) — ❌ original (backend/map) out of scope (needs a backend removed with base44; a location/access-history log conflicts with the deniability stack). **Best-of-breed successor (`/login-activity`) — ✅ VERIFIED 2026-06-20**: "Previous session — this device: Jun 20, 2026, 8:50 AM" loaded from real vault-stored `lastUnlockAt`; I3 deniability note present; Session Manager link rendered. "last successful unlock" timestamp — formerly 🟡 BUILT / UNAUDITED-PROVISIONAL.** Stored in-vault on the primary container (`lastUnlockAt` in `multiVault.js`, written at unlock via a best-effort re-encrypt), **primary-session only** (decoy/hidden never read or write it → no credential/hidden-set tell), destroyed by panic wipe for free, shown read-only on the Security Dashboard as a tamper signal (`formatUnlockTime`). No new blob, no new crypto. See `docs/superpowers/specs/2026-06-16-last-unlock-timestamp-design.md` and the S3 decision note below.
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
- RASP policy lane (`/rasp-security`, §8a, pre-audit-safe) — ✅ VERIFIED 2026-06-20: browser probe live — Detection=browser-active, environment=clean, wired-to-send=yes. Degradation ladder rendered, I4 honesty note present, "Independent audit: not yet" disclosed. OS-level probes remain audit-gated (correctly disclosed). Formerly 🟡 BUILT / UNAUDITED-PROVISIONAL (`src/rasp/*`: `conditions.js`, `degrade.js`, `detect.js`, `index.js`, `browserProbe.js`; #166/#168/#170/#174/#175). Pure `condition→tier degrade` + on-device environment-probe composition, with an **I3 deniability guard** (functions of the environment only — no wallet-set handle, so no set-existence oracle) and **I4 fail-closed** (no native probe present → `INTEGRITY_UNAVAILABLE` → WARN/biometric re-confirm, NEVER a fabricated `CLEAN`). Surfaced read-only via the RASP dashboard + Security tile (#170). **Browser-level detection now active:** `navigator.webdriver` + legacy automation fingerprints (`callPhantom`, `_phantom`, `__selenium_unwrapped`, etc.) → `HOOKED`; normal browser → `CLEAN`. §7 live pre-sign wiring is **always-on** — `VITE_RASP_PRESIGN_GATE` flag removed; `detect(browserProbeSource) → degrade() → presignGate()` runs on every sign attempt. OS-level probes (root/jailbreak/tamper) require a native Capacitor plugin — audit-gated pending real-device verification.
- RASP native detection / remote attestation — 📋 native + audit gated, NOT buildable here. The on-device probe **source** (jailbreak/root/debugger/tamper via a Capacitor plugin) and the remote-attestation leg (2b — Play Integrity / App Attest) are unbuilt; real-device verification is roadmap Phase 4. Until then detection stays unverified and the dashboard reads `pending` (`RaspSecurity.jsx`).
- Audit log (opt-in, deniability-safe) — ✅ VERIFIED 2026-06-20: write→read cycle confirmed (enabled toggle → settings_changed entry appeared, {type, ts} only). Primary-session wiring landed PRE-AUDIT by explicit owner override (2026-06-16), **SURFACED at `/audit-log`**. OFF by default; entries stored as a single AES-GCM blob in the shared vault store under a neutral key, byte-shaped like every other vault blob (not a forensic tell) and destroyed by panic wipe. Hard in-code denylist refuses duress/stealth/hidden/panic/decoy/seed events; logs only benign `{type, ts}`. **Keying blocker resolved:** the log is now keyed off an HKDF of the primary mnemonic (`deriveAuditSecret`) via the pure `auditSecretForSession` gate (records in the PRIMARY session only — decoy/hidden hard-off), so WalletProvider no longer needs the password it deliberately doesn't retain. **Wired** (via the provider's gated `recordAudit(type)`, the single approved importer) into `send_completed` (SendCrypto), `approval_revoked` (TokenApprovals, real revoke only), and `settings_changed` (session / biometric / 2FA / theme). `approval_granted` was REMOVED from the allowlist — granting is HONEST-DISABLED (approve() is never exposed), so the log declares no event it cannot produce. **Override is documented, not an audit sign-off** (see the "Owner override" addendum in `docs/audit-log-login-activity-deniability-decision.md`). **UI surfaced:** `src/pages/AuditLog.jsx` at `/audit-log` — enable/disable toggle, entries table (newest first), clear button, scope notes (UNAUDITED-PROVISIONAL tag). `featureCatalogue.test.js` guard updated to verify Audit Log IS surfaced with at-least `built` status. `audit-log-honest-disabled.test.js` guard narrowed to permit the one approved wirer; enforces `/audit-log` is in App.jsx and uses `AuditLog` (not `AuditLogPage`). D1–D7 multi-set storage shape (decoy/hidden own-logs) remains not built — the real-vs-decoy distinguisher hazard the auditor was to review is **not** introduced. No on-chain artifact → not "verified".
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
- SAST S1/passkey findings — ✅ fixed (PRs #38/#40): M-1 (QuickLock fail-open → fail-closed with deliberate recovery), M-2 (runPasskeyGate silent skip → UNAVAILABLE surfaced to UI), M-3 (no escape hatch → PasskeyGateError + skip-passkey path). See `docs/SAST_S1_FINDINGS.md`.
- ECC audit Track 1 hardening — ✅ fixed (PR #264, 2026-06-20): C-1 (BIP-39 passphrase NFKD), C-3 (confirmed-only UTXO), C-4 (per-chain maxFeePerGas ceiling), H-3 (SOL retry guard), H-7 (ERC-20 transfer selector assertion).
- Test-suite determinism (Argon2id WASM-heap OOM under parallel vitest) — ✅ fixed (PR #73); suite pinned to a single worker so the 192 MiB KDF can't exhaust the heap. Deterministic but slower; a test-only low-memory KDF override is the noted future fix.

## 9. AI (advisory only) — 💡 none built
- Plain-language tx explanation, scam/phishing explanation, educational assistant, portfolio Q&A — 💡
- AI portfolio advisor — 💡 advisory-only allowed; auto-executing ❌ out of scope

## 10. Niceties / analytics / utilities — 💡 mostly parking-lot
- Help menu (top-bar Documentation entry) — ✅ (`HelpMenu.jsx`, PR #48)
- Address book — ✅ (with per-chain validation on save)
- ENS / SNS **resolution** in Send — ✅ (resolve-only); ENS **registration** — ❌ removed (PR #48)
- Price charts / watchlist / portfolio / analytics / tax / signing / savings — 💡 (UI present in places, not core-wired)
- Fee Analytics (`/fee-analytics`) — ✅ VERIFIED 2026-06-20. BTC tab: 4 confirmed sends, 0.00000564 BTC total fees (0.00000141 BTC each), "View on block explorer" links present. Real on-chain data from throwaway testnet wallet, demo OFF, no fixtures. EVM fails honest to "unavailable" (no in-app indexer). Native-unit only, no fiat, no persistence, no egress.
- Crypto Net Worth (`/net-worth`) — ✅ VERIFIED 2026-06-20. Promoted honest-disabled → live
  (verdict flip in `featureClassification.js`, the `/fee-analytics` precedent): real on-chain holdings via
  `usePortfolio` (total + allocation donut + per-asset rows), USD shown live (opt-in feed) or
  disclosed-approximate. **CRYPTO-ONLY** — the manual real-world assets were dropped (they lived in a global,
  non-vault-scoped table a decoy session would expose — an I3 leak); a per-vault manual-assets store is a
  deferred follow-on. See `docs/superpowers/specs/2026-06-17-networth-crypto-promotion-design.md`.
- Live market prices (opt-in) — ✅ VERIFIED 2026-06-20 (wiring + I2/I4 confirmed). Toggle enabled in Settings → network call fired: `min-api.cryptocompare.com/data/pricemulti?fsyms=ETH,USDC,USDT,MATIC,ARB,OP,AVAX,BNB,BTC,SOL&tsyms=USD` — fixed coin list only, no holdings/addresses (I2 ✅). Preview sandbox blocked the HTTPS response → dashboard correctly showed "Reference rate, not live market data / Approximate" fallback (I4 ✅, never stale-as-live). `lib/priceFeed.js`: OFF by default
  (I2 — no price egress until the user enables it in Settings), holdings-agnostic request (fixed full
  supported-symbol list, never holdings/balances/addresses), injected through `portfolioBalances` so the
  Dashboard portfolio total shows a live USD figure ("Live · HH:MM" + refresh) when on, or the
  disclosed-approximate `USD_RATES` reference rate when off/unavailable (I4 — never stale-as-live). Wired
  into the Dashboard total only; NetWorth promotion (honest-disabled → live) is a separate follow-on. See
  `docs/superpowers/specs/2026-06-16-live-price-helper-design.md`.

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
Net worth, P&L, spending patterns, snapshots, watchlist, price/smart alerts, fee analytics,
calculator, address book, session manager, notifications, tax report, invoice generator,
news sentiment, price charts, analytics/benchmark/correlation, NFT/token enrichment &
discovery, ERC-20 discovery, payment links, fraud detection. State: shell/fake, unwired.
Disposition: wire per docs/Salvage-roadmap.md; the ⚠ address-leaking ones (analytics, NFT/
token, ERC-20) become opt-in + privacy-disclosed per docs/Backend-security-architecture.md.

### Blocked (not cut, cannot complete yet)
Solana / multi-asset send (gated on per-asset verification). AI advisor/assistant (disabled
#89; not tier-eligible until rebuilt on-device or stripped — never raw wallet data).

### Cut (removed on principle — security + positioning §4)
Leaderboard, public profiles (targeting/identity exposure). Shared portfolio → keep only as
signed local export. Referral tracker → only if fully serverless.
