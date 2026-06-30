# Veyrnox — Feature Status (verified against code on `main`)

> The single AT-A-GLANCE status of what is genuinely built, what is half-built,
> and what is only specced. Verified against the actual code on `main`
> (not against aspiration). When this and another doc disagree, this wins —
> then fix the other doc.
>
> Markers: ✅ built & merged · 🟡 built-but-gated / partial · 📋 specced, not built
> · 💡 parking-lot idea · ❌ removed / out of scope
>
> **What a dated `✅ VERIFIED 2026-06-20` on a line means:** that line's status was
> *re-checked on that date* — a manual UAT / UI-render walk-through, or (where txids
> are cited, e.g. send / fee-analytics lines) a real on-chain send. It is **NOT** the
> strict on-chain "verified" bar. Per the standing rule, a feature is "verified" in
> the strict sense — and earns a catalogue `verified` status — ONLY with a real
> explorer-confirmed txid; `resolveStatus()` keeps the machine-readable status at
> `built` for anything not in `docs/verified-evidence.json`. So read a **non-txid**
> `✅ VERIFIED` line as **BUILT / UAT-confirmed, not audited** (several such lines
> already say so inline: "BUILT, not 'verified'").
>
> Standing rules: **testnet/devnet only** for sends until each asset clears a real
> on-chain UI-path txid; mainnet flags were unlocked 2026-06-17 by the internal audit
> (the hard gate) with owner sign-off. **Both audits are now COMPLETE:** the internal
> audit (the mainnet gate) on 2026-06-17, and the independent ECC third-party audit on
> 2026-06-23 (satisfies §24; 1 CRITICAL + 2 HIGH + 4 MEDIUM + 1 LOW all resolved in
> PR #340, merged 8f1dd95 — see `docs/audit-triage/ecc-independent-audit-2026-06-23.md`).
> A **2026-06-28 internal static-analysis pass** (specialist agents: wallet-core/crypto,
> web-app/auth, mobile/native) found 0 CRITICAL, 4 HIGH (3 fixed pre/during audit, 1
> open/device-gated), 11 MEDIUM (9 fixed, 2 open/native), 8 LOW. Fixes landed in PRs
> #433 (pre-audit), #440–#443. ALLOW_MAINNET unchanged. INTERNAL pass only — not
> independent, not ECC. See `docs/audit-2026-06-28-internal-static-analysis.md`.
> "Audited" is **not** "verified": a feature still earns the strict catalogue `verified`
> status ONLY with a real explorer-confirmed txid. Where a feature still carries a
> RESIDUAL gate below, that gate is now a **native-plugin / hardware-KEK / real-device /
> backend-escrow** gate — NOT "pending an audit" (both are done). Internal ≠ independent
> is still honoured throughout. Status last verified: 2026-06-29 (PRs #475–#478: Trezor BTC+SOL
> send paths wired, deniability session guard, dApp security alerts BUILT, I3 egress fixes).

---

## Reality check (read first)
- **Test suite:** 220 test files, all green (`npm test`); `check:rng` green. (PR #340 added `send2faMethod.test.js` + typed-data + notifier tests, 2026-06-23; §8a security hardening PRs added webVaultEntropy, kek, WalletConnectProvider, CryptoSigning, mainnetGate tests; count confirmed green 2026-06-27.)
- **What actually SENDS on-chain today:** **ETH (Sepolia), USDC (Ethereum mainnet ✓ MAINNET),
  USDT (Ethereum mainnet ✓ MAINNET), MATIC (Polygon Amoy), ARB (Arbitrum Sepolia), OP (OP Sepolia),
  AVAX (Fuji), BNB (testnet), BTC (Bitcoin testnet), and SOL (Solana devnet)** are `live` — each send verified
  end-to-end through the full in-app UI path on-chain (covering every send family:
  EVM L1 native, ERC-20 contract-call, four EVM L2/sidechains, BTC UTXO, and SOL
  ed25519). USDC and USDT are LIVE on Ethereum mainnet (build:release sends, both re-confirmed via RPC 2026-06-22): USDC `0xc37314…` and USDT `0xf06a0b…` (to Tether's USDT contract, status SUCCESS, block 25360159). NOTE: PR #280 first recorded a wrong USDT txid (`0x3f2fe1…`, actually a USDC-contract tx); corrected to the real USDT send 2026-06-22. AVAX and BNB are LIVE on their testnets — full UI-path sends confirmed on-chain (AVAX Fuji `0x3697e0d…`, independently re-confirmed via Routescan 2026-06-22; BNB testnet `0x1a6ee75…`, independently re-confirmed on-chain via public BSC-testnet RPC 2026-06-22; full UI-path provenance per session record + owner confirmation).
  Receiving and balance reads work for all 10 assets; the send *code path* exists
  and is unit-tested for EVM/ERC-20/BTC/SOL, but is HARD-gated off until a real
  on-chain send is done by hand and reviewed.
- **Security depth is the real progress.** The S1/S2/S3 security stack is the
  bulk of what's built. Both audits are now COMPLETE — the internal audit
  (2026-06-17, the mainnet gate) and the independent ECC third-party audit
  (2026-06-23, findings resolved in PR #340). What remains for individual
  features is no longer "the audit" but concrete RESIDUAL gates — native plugin /
  hardware-KEK / real-device verification / backend escrow — called out per line
  below; the deniability features (duress/stealth/panic) are still testnet/demo.
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
| USDT | erc20 | **Ethereum Mainnet** | ✅ | ✅ verified on-chain (full UI path, build:release, `0xf06a0b…`, to Tether USDT contract, block 25360159, re-confirmed via RPC 2026-06-22) — **✓ MAINNET** (corrects wrong txid `0x3f2fe1…` from PR #280) | ✅ **live** |
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
- Encrypted vault (Argon2id + AES-256-GCM) — ✅ (KDF work factor 64 MiB / t=3, with bidirectional param migration — SAST M3; reduced from 192 MiB for device latency, commit 1226085e — security trade-off deliberate, not yet independently re-audited)
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
- ERC-20 **USDC — Ethereum Mainnet** — ✅ **✓ MAINNET LIVE** — **full UI path verified on-chain via build:release** (2026-06-20; re-confirmed via RPC `eth_getTransactionReceipt` 2026-06-22, chainId 1, status SUCCESS): USDC txid `0xc3731477…` ([etherscan.io](https://etherscan.io/tx/0xc3731477db771bcf413198b5deb97d5ac2a13180ad0fd48353f0341867bfa0a2)) → contract `0xA0b86991…eB48` (official Circle USDC), from `0x90f9f1…E68a729` → `0x82D0Fa…55BAB`, 1 USDC, 6 decimals, no dev flags.
- ERC-20 **USDT — Ethereum Mainnet** — ✅ **✓ MAINNET LIVE** — **full UI path verified on-chain via build:release** (re-confirmed via RPC `eth_getTransactionByHash`/`Receipt` 2026-06-22, chainId 1, status SUCCESS): USDT txid `0xf06a0ba7…` ([etherscan.io](https://etherscan.io/tx/0xf06a0ba731d1b8bf4d3f859a5904830b2f064725ba837c8c7332e5264f0b5b08)) → contract `0xdAC17F95…831ec7` (official Tether), from `0x90f9f1…E68a729` → `0x82D0Fa…55BAB`, 1 USDT, 6 decimals, block 25360159. CORRECTION: PR #280 recorded the wrong txid (`0x3f2fe19a…`, which is a USDC-contract tx); fixed 2026-06-22.
- Bitcoin (BIP-84 testnet) — ✅ live send — **full UI path verified on-chain** (BIP-84 P2WPKH, `signAndBroadcastBtc`; txid `2da87a27…`, block 4990901, 2026-06-14, user-driven UI send). Mainnet stays gated.
- Solana (ed25519 devnet) — ✅ live send — **full UI path verified on-chain** (ed25519/SLIP-0010, `signAndBroadcastSol`; sig `5KGXAGTJ…`, FINALIZED, 2026-06-14, user-driven UI send). Mainnet stays gated.
- More EVM chains / more ERC-20 tokens — 💡
- Other stacks (XRP, ADA, TRON…) — 💡
- Cosmos / IBC, Sui — ❌ removed from the app (PR #48); `deriveCosmosAccount` stub left in `derivation.js` (throws, unwired)

## 4. Security — S1 foundation
- Native secure storage (M2a done; M2b provisional, app-layer) — 🟡 (OS-enforced ACL / Enclave-StrongBox binding = M2c/M2d 📋, not built — gated on a thin custom **native plugin + real-device hardware verification** (Swift SE/Keychain + Kotlin Keystore/StrongBox), NOT on an audit. See M2c/d decision note.)
- Biometric unlock — ✅ (`biometric.js`; app-layer preference gate, PROVISIONAL — not an OS-enforced ACL). **Native Face ID / biometric unlock — BUILT on iOS and Android (2026-06-29/PR #483):**
  - **Stale Keychain guard (PIN cohort):** a fresh install clears any stale Keychain entry before onboarding, so the PIN cohort does not collide with a previous vault.
  - **Face ID → real wallet:** Face ID unlock (via Biometric Unlock toggle in Settings → Security) opens the primary/real wallet.
  - **Face ID → decoy wallet:** "Use Face ID for hidden wallet" toggle in the Duress PIN screen binds Face ID to the decoy path — coercion-resistant by design, the real wallet is only reachable with the real PIN.
  - **Face ID 2FA at critical actions:** PIN + Face ID toggle in Settings → Security → Two-Factor gates Send / reveal seed / critical actions behind a native OS biometric assertion (I4 fail-closed on cancel/error). VERIFIED on-chain 2026-06-29 — see Two-Factor at critical actions entry (§5) and `docs/verified-evidence.json`.
  - **Android biometric permission (PR #483):** `USE_BIOMETRIC` and `USE_FINGERPRINT` added to `AndroidManifest.xml`. Without these, `BiometricPrompt` threw `SecurityException` on Android 9+. Now BUILT for Android.
- FIDO2 / passkeys (unlock gate, NOT key custody) — ✅ (`passkey.js`; password-only escape hatch present — SAST M-3 fix)
- Session manager + auto-lock (idle / background) — ✅ (`session.js`)
- At-rest KDF work-factor raise + param migration — ✅ (SAST M3; KDF params reviewed under both audits — internal 2026-06-17 + independent ECC 2026-06-23, see `docs/audit-triage/a2-deniability-kdf-param-timing-2026-06-23.md`)
- Account access / change password + seed recovery — ✅ (PR #50; non-custodial `keyStore.changePassword` + `importWallet` seed recovery; honest "no custodial reset"). OS-enforced ACL hardening (M2c/M2d) remains 📋 not built — gated on the native plugin + real-device hardware, not on an audit (both audits complete).

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
- OFAC sanctioned-address screening — ✅ (PR #71) one static, citable sanctioned address (`0x098B716B…` Ronin/Lazarus) hardcoded in `suspicious.js`, wired into the pre-sign simulation (`simulate.js:198`). Warns-not-blocks, on-device, no network call. The bulk SDN snapshot (`data/ofac-sanctioned.json`), the refresh script (`scripts/refresh-ofac-blocklist.mjs`), and the BTC screening path were removed from the build — only the single illustrative EVM entry remains. A live, regularly-updated sanctions feed (full SDN mirror + BTC + SOL) is the roadmap upgrade; shipping gated on legal review.
- Transaction simulation (drainer defense) — ✅ LOCAL-first pre-sign preview wired into Send→verify (`evm/simulate.js` real `eth_call` dry-run + risk flags; `btc/simulate.js` + `sol/simulate.js` honest decode; `TransactionPreview.jsx`). No third-party scoring service. Warns-not-blocks; never claims "safe". The old `WhatIfSimulator`/`SecurityScanner` UI shells remain 📋 separate stubs.
- Anomaly / fraud detection — ✅ (PR #54) LOCAL history-aware heuristics (`anomaly.js`) folded into the tx-simulation preview: amount-vs-history, new-recipient-large, approve-then-transfer; no phone-home, never claims "safe".
- Composite pre-sign risk verdict + RISK gate — 🟡 BUILT (both audits complete; #137; `src/risk/*` — `score()` aggregates the S1–S8 signal heuristics into one verdict, `buildRiskInputs`/`fromSendState` adapts send state to inputs, `RiskVerdictBanner` renders the one-sentence composite). Wired into Send→verify as the authoritative pre-sign gate: a coral **RISK** verdict requires an explicit "Sign anyway" acknowledgement (destructive-action gate); INFO is a non-blocking chip; INDETERMINATE escalates to CAUTION (fail-closed, I4). LOCAL-only; warns-not-blocks; never claims "safe". (#137 smoke check **CLOSED** — engine-verified via `scripts/verify-risk/run.mjs` AND render-verified end-to-end in mobile DEMO, 2026-06-13: `DEMO_POISON_ADDRESS` → a single coral **RISK** banner (#F06A5C) with the verdict sentence + IBM Plex Mono values, and the "Sign anyway" gate hard-blocks Confirm & Send until acknowledged; a fresh recipient → INFO chip. Evidence: `docs/send-verification-scripts.md` §"#137 render verification". HONEST CAVEAT: DEMO-mode only — the `build:release` real-RPC render is expected identical (#137 is real-path, not demo-gated) but not yet eyeballed, so this is NOT a `build:release` render claim. Tag stays BUILT, not "verified": no on-chain txid is involved, so this is not a catalogue "verified" promotion — audited (both passes) is not the same as the strict txid bar.)
- Send-time step-up re-auth — ✅ VERIFIED 2026-06-20 (implicit, via 8 on-chain sends). Every verified asset send (ETH, USDC, USDT, MATIC, ARB, OP, AVAX, BNB) documents "step-up PIN re-auth" in the UI path in `assets.js`. Gate fired on real sends, txids on-chain. (#152; `src/lib/sendReauth.js` + `src/wallet-core/credentialVerifier.js`). Re-verifies the unlock credential before a send when the last auth falls outside a recent-auth window (`sendReauthRequired`, 2-min default). The verifier hashes under the **same `KDF_PARAMS` as the unlock KDF**, constant-time-compares, zeroizes the transient hash, and fails closed on malformed params (I4); capture degrades gracefully (`captureVerifierSafe`) and the attempt cap persists across Back.
- Two-factor at CRITICAL points — PIN + Action Password OR PIN + Passkey/FIDO2 — ✅ VERIFIED 2026-06-20 (Action Password path). Set Action Password via Security Settings → "Action Password set" toast confirmed → "Currently enforcing: PIN + Action Password" status shown. Navigated to Send → reached fee/confirm step → gate rendered: "Authorise this send with your PIN + Action Password — Both factors are required for this action." Filled both credential fields (PIN + Action Password) → "Verify & continue" enabled. Gate is live and correctly requires both factors before the send can proceed. (PR #195; `src/lib/twoFactorGate.js` pure verdict, `src/lib/WalletProvider.jsx` hooks, `src/components/security/{TwoFactorGate,useActionGuard}.jsx`). **Configured in Security Settings → "Two-factor at critical actions" (`src/components/security/TwoFactorSettings.jsx`, in `pages/Settings.jsx`) — NOT the Security Center** (which is alerts/sessions/limits only; the old Security Center "2FA" tab was removed). The section explicitly lists which actions it gates. Enforced at: **send** (`SendCrypto.jsx` — audit H-1 fixed in PR #340: passkey method now wired via `resolveSend2faMethod()`; previously passkey-only 2FA was silently bypassed on sends), **reveal recovery phrase** (`WalletPortfolioPage.jsx`), **set duress PIN** / **create hidden wallet** / **hide existing wallet** (`DuressPin.jsx`, `StealthWallets.jsx`). Factor 1 (both methods) = the unlock credential (full vault Argon2id). **Method 1 — Action Password:** a 2nd knowledge factor, persistable Argon2id record (`src/wallet-core/actionPassword.js`) stored **inside** the encrypted multi-vault container (`multiVault.js`) so it carries no on-disk tell and is **per wallet-set**; the two full-cost (64 MiB / t=3, reduced from 192 MiB — commit 1226085e) checks run **sequentially** (Defect-A). **Method 2 — Passkey/FIDO2:** PIN + a WebAuthn assertion (`passkey.js: verifyPasskeyAssertion`, mode `passkey`) — a real **possession** factor that **fails closed** (any cancel/timeout/error = not verified, the deliberate inverse of the unlock gate's SAST-M1/M2 degrade path); **device-global** pref (`veyrnox-2fa-passkey`), so it prompts in every session on the device, not per-set. 5 wrong attempts → `lock()` (I4). Opt-in: no method set → unchanged behaviour. **HONEST SCOPE:** Method 1 is two things you know on one device (not hardware 2FA) and is **active-set (primary) only** — see the decoy/hidden-parity TARGET in §6; Method 2 adds possession but is device-global, not per-set. **H-1 fix CONFIRMED on-chain 2026-06-23 (Method 2 / passkey path):** an automated web e2e (Playwright + Chrome CDP **virtual authenticator**) imported the real testnet seed, enabled PIN+Passkey 2FA, and drove a real Sepolia send — the Send screen **rendered the passkey gate** ("Authorise this send with your PIN + passkey") and broadcast ONLY after a genuine WebAuthn assertion (signCount 1→2). Sepolia txid `0x12f5ef00…87bd32ea` (from `0x90f9…E68a729` → `0xd8dA…96045`, 0.0001 ETH, status SUCCESS, block 11123038; see `docs/verified-evidence.json` → `_h1_passkey_2fa_fix_confirmation`). This confirms the H-1 **wiring** (no silent bypass; the assertion genuinely gates the send). **Still BUILT, not "verified":** the authenticator was software, not a Secure Enclave, so a **physical-device** passkey send is still the bar to flip — the txid is recorded as a non-promoting META key, not under `evidence`. Full design + the two deniability models in `docs/vault-auth-architecture-brief.md` §6b. **H-1 ON-DEVICE VERIFIED 2026-06-29 (Native Face ID possession factor on iPhone 17 Pro Max):** Enabled PIN + Face ID toggle in Settings → Security. Send → ETH Sepolia → confirm rendered biometric gate → approved Face ID → send broadcast. **Sepolia txid `0xd1c97fa2f0a8ec2ae1038364f0106f6ef98b27258ad1ec2faa227de0baf1e2e7`** (2026-06-29). Face ID cancel blocks the send (I4 fail-closed confirmed). Implementation: `verifyBiometric2fa()` via `@aparajita/capacitor-biometric-auth`; `SEND_2FA.BIOMETRIC` path; `SendCrypto.jsx` biometric branch (`pinOk: true` — unlock = first factor satisfied). PRs #480 + fix/faceid-2fa-pinfirst-and-settings. **Honest scope:** OS biometric (Face ID / Secure Enclave), not a FIDO2 WebAuthn credential. WebAuthn in WKWebView remains unreliable; native biometric is the honest possession factor equivalent on iOS.
- Security Dashboard (read-only posture view) — ✅ (PR #53) aggregates existing signals (`securityPosture.js`, `SecurityDashboard.jsx`); reuses approvals/spam/poison/feature-status, no new detection, never claims "safe".
- dApp security alerts — ✅ BUILT (PR #477, 2026-06-29): `checkDappDomain` now also runs inside the `approveSession` handler (I4 fail-closed — a blocked domain is rejected at session approval, before any signing surface opens). Blocklist expanded from 5 to 23 entries. Previously the domain check ran only at the UI level; it now runs at the handler level so a dApp with a blocked domain cannot establish a WC session at all.

## 6. Security — S3 access & recovery (deniability stack — PROVISIONAL, testnet/demo)
- Duress PIN / decoy wallet — ✅ BUILT (2026-06-30) — **Complete H2 implementation:** Duress PIN + Face ID redirect. (`duress.js` + `duressPin.js` unlock routing + WalletProvider wiring). **Design (confirmed 2026-06-30):** default unlock route via PIN or Face ID → real wallet; after Duress setup: correct PIN → real, fake PIN → decoy, Face ID → decoy (when opt-in enabled). **Wrong attempt tracking:** localStorage counter increments on failed unlock, clears on success, triggers vault wipe at 10 attempts (I4 fail-closed). **Unlock routing:** existing keyStore.unlock() + resolveDeniabilityUnlock() paths already route correctly (primary decrypt = real, duress decrypt = decoy); new code adds attempt tracking + wipe. **TDD:** 9 test scenarios all passing (unlocks, wrong attempts, Face ID routing, settings display). BUILT, UNAUDITED-PROVISIONAL — routing wired, wrong-attempt gate closed, not device-verified on real iPhone (testnet-safe, web+native).
- Stealth / hidden wallets (deniable chaff-slot pool) — ✅ (`stealth.js`; 256-slot pool after SAST M-1 collision fix; multi-chain reveal; move-existing variant)
- Panic wipe (emergency local key destruction) — ✅ (`panic.js`; panic/wipe PIN at unlock + in-app guarded wipe; `inspectKeyMaterial()`)
- Constant-KDF unlock timing across the deniability stack — ✅ (`deniabilityUnlock.js`; SAST M-2 fix)
- I3 egress deniability fixes — ✅ BUILT (PR #478, 2026-06-29): CryptoNewsFeed, `priceFeed`, useBasketPrices, Calculator, and PriceAlerts are now gated on `!isDecoy && !isHidden` — previously these components made outbound requests (price feeds, news) in decoy/hidden sessions, violating I3 (deniability mode makes zero backend calls). All five components now suppress network calls when a decoy or hidden session is active. (`priceFeed` = `src/lib/priceFeed.js`.)
- Action Password 2FA parity in decoy/hidden sessions — 🟢 HONEST-DISABLED BY DESIGN (2026-06-30) — **Decision: Option B (Decoy WITHOUT second factor).** The Action Password second factor (§5) enforces on the **primary set only**; decoy/hidden wallets carry **PIN only** by deliberate design. **Rationale:** frictionless under coercion (decoy's core value is plausible deniability + usability when threatened). A coercer who has your PIN already has access to the decoy; adding a second factor doesn't prevent that and adds friction to the legitimate use case (escape route). **H2 storage groundwork (from 2026-06-30) remains intact** but is intentionally not used for decoy/hidden 2FA: decoy (`duress.js`) and hidden (`stealth.js`) slots wrap the seed in a **FIXED-LENGTH multi-seed container** (`makeContainer`/`serializeContainer`), chaff-length parity is resolved (`makeChaff` sizing), and `setDuressVault` / `stealth.setHiddenActionPasswordRecord` are available for future use if design changes. **What's not built:** UI collection in DuressPin/StealthWallets, enforcement wiring in twoFactorGate.js. **Verification task (30 min, next session):** confirm existing code (twoFactorGate.js, DuressPin.jsx, StealthWallets.jsx) does NOT prompt for 2FA in decoy/hidden sessions. Add comments documenting the deliberate PIN-only design. **Note — Passkey method (§5, Method 2) is device-global:** it *does* prompt in decoy/hidden sessions (different model, stored outside container, not per-set). Full design note in `docs/vault-auth-architecture-brief.md` §6b.
- v1 KEK-less PIN auth UX (6-digit PinPad, PIN onboarding + returning-PIN unlock, Face-ID-to-decoy, Option A deterministic decoy fallback) — ✅ VERIFIED 2026-06-20 (returning-PIN unlock path). PinPad rendered on every protected-route navigate during this session; PIN 111111 accepted and vault decrypted correctly on each unlock. Autolock re-triggered and re-unlocked correctly multiple times. Real vault with real seed (bamboo… testnet seed) decrypted and real balances loaded. UX flow confirmed end-to-end. HONEST SCOPE: hardware-KEK is still missing (an 8-digit PIN over Argon2id remains offline-exhaustible on a seized device — the remaining gate is a **native hardware-KEK binding**, NOT an audit; both audits are done); Face-ID-to-decoy path not exercised (mobile only); decoy fallback not exercised (web only). These scopes stay PLANNED/TARGET pending that native hardware work + real-device verification. Testnet (`security/PinPad.jsx`, `pinOnboarding.js`, `pinRecovery.js`, `authModel.js`, `decoyFallback.js`, `deniabilityUnlock.js`, `mnemonic.js`; cohort marker `veyrnox-auth-model` with fail-fast on unknown model; 4th unconditional KDF slot + four-slot constant-work execution assertion `deniability-timing.test.js`). **Headline audit item:** a 6-digit PIN over Argon2id is exhaustible offline on a seized device in hours–days — the hardware-KEK fast-follow is what closes it; see `docs/superpowers/specs/2026-06-08-v1-pin-auth-ux-design.md` §6. Landed incrementally via the #138/#154/#156/#161 line, not a single PR. **CORRECTION (2026-06-23):** the "Option A deterministic decoy fallback" named above was **SUPERSEDED** by the v2 PIN duress model (commit `b4871b1`) — a wrong PIN now returns an explicit "Incorrect PIN" error, and `decoyFallback.js` / `deriveDeterministicDecoyMnemonic` is **dead code** (no live caller; see its SUPERSEDED header + `deniabilityUnlock.js`). Runtime UAT 2026-06-23 (web, 8-digit PIN) confirmed the live routing: real PIN → real wallet **even with a decoy configured**, duress PIN → $0 decoy, wrong PIN → "Incorrect PIN" error. (Also stale on this line: "6-digit PinPad" / "PIN 111111" — the PIN is now **8-digit app-wide**, commit `e00a20f`.)
- Web onboarding — authModel cohort fix — ✅ BUILT (PR #474, 2026-06-29): `authModel='password'` is now correctly persisted on web during onboarding. Before this fix the cohort marker was not written, causing returning-web-password users to hit the PinPad unlock screen (wrong branch) and be locked out. Fix is in `authModel.js`; no key material or signing logic changed.
- Hardware wallet (Trezor) — ✅ BUILT (`HardwareWalletPage.jsx` + `evm/hw-send.js` + `btc/hw-send.js` + `sol/hw-send.js`; `@trezor/connect-web`). ETH/BTC/SOL address derivation and EIP-1559/PSBT/SOL signing for Trezor (Connect popup, WebUSB, Chrome/Edge desktop). **PR #475 (2026-06-29):** `trezorSignBtcTx` and `trezorSignSolTx` are now wired in SendCrypto — BTC+SOL Trezor send paths were honest-stubbed before; they are now BUILT (not device-verified). `broadcastBtcTx`, `buildUnsignedSolTx`, and `attachSolSignature` added. **PR #476 (2026-06-29):** `wallet-core/deniabilitySession.js` created — real decoy/hidden sessions now block all Trezor calls before any connect.trezor.io egress (previously only the demo flag was checked; I3 compliant). `HardwareWalletContext` deleted — TrezorContext is now the sole hardware wallet context. I1 preserved; private key never leaves the hardware device. Ledger removed (WebHID surface no longer wired). ERC-20 hardware signing and multi-account paths not yet wired. iOS WKWebView fails soft to "not available" card. BUILT, not device-verified — no physical-device txid.
- Login activity (+ map) — ❌ original (backend/map) out of scope (needs a backend removed with base44; a location/access-history log conflicts with the deniability stack). **Best-of-breed successor (`/login-activity`) — ✅ BUILT — UI-confirmed 2026-06-20**: "Previous session — this device: Jun 20, 2026, 8:50 AM" loaded from real vault-stored `lastUnlockAt`; I3 deniability note present; Session Manager link rendered. "last successful unlock" timestamp — BUILT (both audits complete).** Stored in-vault on the primary container (`lastUnlockAt` in `multiVault.js`, written at unlock via a best-effort re-encrypt), **primary-session only** (decoy/hidden never read or write it → no credential/hidden-set tell), destroyed by panic wipe for free, shown read-only on the Security Dashboard as a tamper signal (`formatUnlockTime`). No new blob, no new crypto. See `docs/superpowers/specs/2026-06-16-last-unlock-timestamp-design.md` and the S3 decision note below.
- Multi-sig (personal + treasury) — ❌ removed [audit-blocked-and-not-advertised] (was UI shell `MultiSigWallets.jsx` w/ fake addresses; page/route/nav/catalogue deleted)

> **Decision note — Login activity re-scope (last-unlock timestamp):**
> Original spec (cross-device sign-in history + location/map) is out of scope: needs a backend (removed with base44), and a location/IP/device access log is a surveillance/forensic artifact that conflicts with S3 — it can reveal that a hidden wallet was opened or when a duress credential was used. A self-custody deniable wallet has no account to show sign-in history for.
> Best-of-breed successor — **BUILT (🟡, both audits complete)**: a "last successful unlock" timestamp, stored IN-VAULT on the primary container (`lastUnlockAt`), shown to the owner as a tamper signal. **Scope as built is PRIMARY-SESSION ONLY** — decoy/hidden sessions never read or write it (they show "First open"). The original wording here ("decoy vault carries its own independent value") was reconsidered at build time: decoy/hidden are stored as bare mnemonics with no field to carry a per-set timestamp, so giving them an independent stored value would reopen the bare-mnemonic chaff-length distinguisher behind the Action-Password-2FA TARGET (now a design decision, audits done). Primary-only sidesteps it entirely and is consistent with the audit-log primary-only decision. Deniability-clean (no new blob → no count/size oracle; panic-wipe destroys it for free).
> Rejected: (B) plaintext failed-unlock counter — useful, but failed attempts occur BEFORE the vault is unlocked, so there is no key to encrypt under; forces an unencrypted on-disk artifact that display-suppression hides from a decoy session but not from forensic inspection, and panic-wipe must explicitly clear. Spends deniability for a failed-attempt count — bad trade for this product. (A) in-memory-only counter — deniability-clean but useless: does not survive app restart.
> Structural blocker (shared with audit-log wiring, PR #77): cannot securely record an event that happens before the vault is unlocked — no key to encrypt under at that moment. Option C sidesteps it by recording only on successful unlock; failed-attempt tracking hits this wall.
> Build note: Option C touches the unlock-success path in WalletProvider, must write/reset identically across primary/duress/hidden success (credential-blind), so deferred to a dedicated session.

## 7. Security — S4 hardening — 🟡 3 of 5 built (incl. local cloud-backup export/import); rest gated on native + real-device work / a backend-escrow decision (both audits complete)
- RASP policy lane (`/rasp-security`, §8a, pre-audit-safe) — ✅ BUILT — UI-confirmed 2026-06-20: browser probe live — Detection=browser-active, environment=clean, wired-to-send=yes. Degradation ladder rendered, I4 honesty note present, "Independent audit: not yet" disclosed. OS-level probes remain gated on a **native Capacitor plugin + real-device verification** (roadmap Phase 4), NOT on an audit (both audits done; correctly disclosed). Formerly 🟡 BUILT / UNAUDITED-PROVISIONAL (`src/rasp/*`: `conditions.js`, `degrade.js`, `detect.js`, `index.js`, `browserProbe.js`; #166/#168/#170/#174/#175). Pure `condition→tier degrade` + on-device environment-probe composition, with an **I3 deniability guard** (functions of the environment only — no wallet-set handle, so no set-existence oracle) and **I4 fail-closed** (no native probe present → `INTEGRITY_UNAVAILABLE` → WARN/biometric re-confirm, NEVER a fabricated `CLEAN`). Surfaced read-only via the RASP dashboard + Security tile (#170). **Browser-level detection now active:** `navigator.webdriver` + legacy automation fingerprints (`callPhantom`, `_phantom`, `__selenium_unwrapped`, etc.) → `HOOKED`; normal browser → `CLEAN`. §7 live pre-sign wiring is **always-on** — `VITE_RASP_PRESIGN_GATE` flag removed; `detect(browserProbeSource) → degrade() → presignGate()` runs on every sign attempt. OS-level probes (root/jailbreak/tamper) require a native Capacitor plugin — gated on real-device verification (roadmap Phase 4), not on an audit.
- RASP native detection / remote attestation — 📋 native + real-device gated (Phase 4), NOT buildable here. The on-device probe **source** (jailbreak/root/debugger/tamper via a Capacitor plugin) and the remote-attestation leg (2b — Play Integrity / App Attest) are unbuilt; real-device verification is roadmap Phase 4. Until then detection stays unverified and the dashboard reads `pending` (`RaspSecurity.jsx`).
- Audit log (opt-in, deniability-safe) — ✅ BUILT — UI-confirmed 2026-06-20: write→read cycle confirmed (enabled toggle → settings_changed entry appeared, {type, ts} only). Primary-session wiring landed PRE-AUDIT by explicit owner override (2026-06-16), **SURFACED at `/audit-log`**. OFF by default; entries stored as a single AES-GCM blob in the shared vault store under a neutral key, byte-shaped like every other vault blob (not a forensic tell) and destroyed by panic wipe. Hard in-code denylist refuses duress/stealth/hidden/panic/decoy/seed events; logs only benign `{type, ts}`. **Keying blocker resolved:** the log is now keyed off an HKDF of the primary mnemonic (`deriveAuditSecret`) via the pure `auditSecretForSession` gate (records in the PRIMARY session only — decoy/hidden hard-off), so WalletProvider no longer needs the password it deliberately doesn't retain. **Wired** (via the provider's gated `recordAudit(type)`, the single approved importer) into `send_completed` (SendCrypto), `approval_revoked` (TokenApprovals, real revoke only), and `settings_changed` (session / biometric / 2FA / theme). `approval_granted` was REMOVED from the allowlist — granting is HONEST-DISABLED (approve() is never exposed), so the log declares no event it cannot produce. **Override is documented, not an audit sign-off** (see the "Owner override" addendum in `docs/audit-log-login-activity-deniability-decision.md`). **UI surfaced:** `src/pages/AuditLog.jsx` at `/audit-log` — enable/disable toggle, entries table (newest first), clear button, scope notes. `featureCatalogue.test.js` guard updated to verify Audit Log IS surfaced with at-least `built` status. `audit-log-honest-disabled.test.js` guard narrowed to permit the one approved wirer; enforces `/audit-log` is in App.jsx and uses `AuditLog` (not `AuditLogPage`). D1–D7 multi-set storage shape (decoy/hidden own-logs) remains not built — the real-vs-decoy distinguisher hazard the auditor was to review is **not** introduced. No on-chain artifact → not "verified".
- Risk / spend limits — ✅ (PR #75; per-tx + daily caps, warn-with-acknowledgement). Risk *scoring* is now a distinct S2 build — the composite pre-sign risk verdict + RISK gate (#137; see S2) aggregates the signal heuristics into one authoritative gate.
- Encrypted cloud backup (ciphertext only) — 🟡 LOCAL encrypt-then-export/import BUILT (both audits complete; `CloudBackup.jsx` + `src/wallet-core/vaultBackup.js`): the vault is sealed under password + PIN seals via the live Argon2id+AES-GCM vault primitive, round-trip-verified before download, and restored by local decrypt. No cloud transport — the user stores the ciphertext file in their own cloud. The BACKEND-ESCROW variant remains 📋 **backend + audit gated and not built** (no cloud target — backend was removed — and key-handling is the catastrophic surface; the audits did not green-light an unbuilt escrow design).
- No-telemetry / fully-local mode, privacy routing (Tor / RPC) — 💡

> **Decision note — S4 completion status (what's left, and why none is a near-term build):**
> S4 cannot be "finished" in the JS/web environment — the remaining items are each blocked on something structural:
> - Risk / spend limits — ✅ DONE (#75). The built S4 item.
> - Audit log — 🟡 keying blocker RESOLVED + primary-session wiring landed PRE-AUDIT (owner override, 2026-06-16). The #77 finding (recordAuditEvent encrypted under the vault password, which WalletProvider doesn't retain) is fixed by re-keying off an HKDF of the primary mnemonic via the pure `auditSecretForSession` gate (primary-session only; decoy/hidden hard-off). Wired through the provider's `recordAudit(type)` into send/revoke/settings. **UI now surfaced at `/audit-log`** (toggle, entries table, clear). D1–D7 multi-set storage shape (decoy/hidden own-logs) remains not built. See the "Owner override" addendum in `docs/audit-log-login-activity-deniability-decision.md`.
> - RASP — 🟡 the pre-audit-safe **policy lane** is BUILT (§8a — #166/#168/#170/#174/#175): condition→tier degrade + honest on-device probe composition + I3 guard, surfaced read-only. **Browser-level detection now always-on** (`browserProbeSource` wired into `detect()` in SendCrypto; `VITE_RASP_PRESIGN_GATE` flag removed — no env-flag required). But the **native probe source** (jailbreak/root/debugger/tamper) + remote attestation (2b) remain 📋 native, not buildable here — iOS/Android platform code, unverifiable without real devices (same class as M2c/d); the remaining gate is real-device verification (roadmap Phase 4), not an audit (both audits complete). The policy lane is the scaffolding; the native detector that makes it enforce is the unbuilt part.
> - Encrypted cloud backup — 🟡 the LOCAL encrypt-then-export/import path is BUILT (`vaultBackup.js`; both audits complete): the user downloads a ciphertext-only file and restores it by local decrypt. The BACKEND-ESCROW variant (server-side ciphertext target) stays 📋 backend + audit gated and NOT built — it needs a cloud target (backend was removed) and is key-handling, the catastrophic surface. Needs a backend decision + a fresh audit of that specific design before any build.
> - No-telemetry / privacy routing — 💡 largely already true: the wallet is no-phone-home by design (base44 removed; remote screening is a disclosed opt-in). "Completing" it is mostly documenting/enforcing the existing posture; Tor/RPC routing is a separate idea-stage item.
> Bottom line: the buildable-in-JS S4 work is done. Audit log is wired and surfaced. The remainder is a native-dev session with real devices (RASP OS-level probes), or backend+audit decisions (cloud backup) — none startable as casual feature work here.

## 8. SAST / validation hardening — ✅ merged
- SAST M-1 (stealth slot-collision fund loss) — ✅ fixed (PR #33)
- SAST M-2 (deniability unlock timing oracle) — ✅ fixed (PR #34/#35/#36)
- SAST M-3 (at-rest KDF work factor) + passkey lockout escape hatch — ✅ fixed (PR #35/#40)
- Validation / fund-correctness / render-safety sweep — ✅ doc + per-chain address-validation fix (PR #41/#42)
- SAST S1/passkey findings — ✅ fixed (PRs #38/#40): M-1 (QuickLock fail-open → fail-closed with deliberate recovery), M-2 (runPasskeyGate silent skip → UNAVAILABLE surfaced to UI), M-3 (no escape hatch → PasskeyGateError + skip-passkey path). See `docs/SAST_S1_FINDINGS.md`.
- ECC audit Track 1 hardening — ✅ fixed (PR #264, 2026-06-20): C-1 (BIP-39 passphrase NFKD), C-3 (confirmed-only UTXO), C-4 (per-chain maxFeePerGas ceiling), H-3 (SOL retry guard), H-7 (ERC-20 transfer selector assertion).
- ECC audit Track 2 — independent third-party audit — ✅ fixed (PR #340, 2026-06-23): C-1 (evidence schema testnet/mainnet), H-1 (passkey 2FA bypass on Send — `send2faMethod.js` + TDD), H-2 (VERIFIED labels without txids), M-3 (dormant FraudAlert/RASPEvent/SmartAlert renderer), M-4 (stale RASP "NOT WIRED" comments), M-5 (duplicate receive emitter), M-6 (demo-mode RPC leak), L-1 (PIN floor 4→6 in vaultBackup.js). Full findings: `docs/audit-triage/ecc-independent-audit-2026-06-23.md`.
- Test-suite determinism (Argon2id WASM-heap OOM under parallel vitest) — ✅ fixed (PR #73); suite pinned to a single worker so the Argon2id KDF (now 64 MiB, formerly 192 MiB) can't exhaust the heap. Deterministic but slower; a test-only low-memory KDF override is the noted future fix.

## 8a. Post-audit security hardening — ✅ all merged 2026-06-27 (PRs #392-#429)

A dedicated security hardening sweep after both audits closed, driven by an independent ECC re-review of previously unvalidated audit doc claims (`docs/audit-2026-06-27-unvalidated-claims.md`, PR #423). All PRs merged to `main` by 2026-06-27; test suite green at 220 files.

| ID | Finding | Control | PR | Status |
|---|---|---|---|---|
| H-NEW-1 | APK tamper / certificate pinning | `RaspIntegrityPlugin.kt` reads `BuildConfig.RELEASE_CERT_SHA256` (injected by CI via `-PRELEASE_CERT_SHA256`); blank cert → honest block (I4). `ci/android-release-job` builds signed release APK on every main push. | #421 | ✅ BUILT |
| H-NEW-3 | Clipboard wipe (CopySecret) | `copySecret()` overwrites the clipboard with `'•'.repeat(24)` after the TTL; a zero-length wipe was a no-op on many platforms. | #392+ | ✅ BUILT |
| H-NEW-4 | KEK + DEK zeroing after use | `web.js` `unlock()`, `enrollKek()`, `changePassword()` wrap the full KEK/DEK lifetime in `try/finally`; both keys are zeroed on every path — including when `unwrapDek`/`wrapDek` throws. Defense-in-depth over `combineKek`'s own in-place zeroing. | #418 | ✅ BUILT |
| H-NEW-5 | Biometric cache invalidation gap | `@aparajita/capacitor-secure-storage` does NOT call `setInvalidatedByBiometricEnrollment(true)`; a new biometric enrol therefore does not invalidate the cached PIN. Honestly documented; a drop-in replacement plugin with proper ACL is the TARGET fix (requires real-device verification — cannot test in JS). Biometric step-up 2FA wired regardless. | #420 | ✅ HONEST-DISABLED / doc gap recorded |
| H-NEW-6 | KEK H2 copy zeroed | `web.js changePassword()` held an `H2 = H.slice()` copy across both `combineKek` calls. Both `H2` and `newC` are now zeroed in `finally` (defense-in-depth, I4). | #418 | ✅ BUILT |
| C3 | WC signing handlers — no RASP gate | `handlePersonalSign` / `handleSignTypedData` / `handleSendTransaction` called `withPrivateKey` with no `presignGate()` check. Gate now runs before any key operation; blocked → `rejectRequest`, return (I4). | #427 | ✅ BUILT |
| H7 | EIP-712 domain.chainId vs session chain | `eth_signTypedData_v4` now validates `domain.chainId` against the WC session's CAIP-2 chain; mismatch → `rejectRequest(CHAINID_MISMATCH)` + throw. No-chainId domain signs through (EIP-712 backwards-compat). | #427 | ✅ BUILT |
| H8 | personal_sign address binding | Resolves EIP-1474 vs MetaMask-legacy param order; rejects if neither param is the connected wallet's own address (`PERSONAL_SIGN_ADDRESS_MISMATCH`) before the key is touched. | #427 | ✅ BUILT |
| M9 | WC 1M gas cap | `handleSendTransaction` caps gas at 1,000,000 regardless of dApp-supplied value; estimates gas via `provider.estimateGas` when dApp omits `gas`, then clamps the estimate too. | #427 | ✅ BUILT |
| M11 | WC session expiry not enforced | `assertSessionLive` now runs before any WC signing handler — expired or absent session → `rejectRequest` + throw; key is never touched (I4). | #427 | ✅ BUILT |
| H13 | CopySeed / CopySecret — seed copy guard | `makeCopy` abstraction added in `HDWalletManager.jsx`; bare `navigator.clipboard.writeText` calls on sensitive values eliminated; structural test guards the pattern. | #410+ | ✅ BUILT |
| H14/H15/H16 | KEK honest naming | `isKekEnrolled`, `biometricUnlockUsesKek`, `hasHardwareFactor` renamed to remove misleading "hardware" from purely software-layer controls; `isSecureHardwareAvailable()` is the honest gate that returns `true` only when OS-enforced ACL is actually present. | #414 | ✅ BUILT |
| H-A | Web vault password entropy | `validateWebVaultPassword()` enforces a 12-character minimum at `createVault` on web mainnet builds (`ALLOW_MAINNET = true`). A short password is `WEB_VAULT_PASSWORD_TOO_SHORT` — rejected before any ciphertext is written (I4 fail-closed). Web-only: native vaults have a hardware KEK factor and this restriction is deliberately NOT applied there. UI disclosure banner added (`WalletEntry.jsx`, web-only). | #424 | ✅ BUILT |
| H-B | CryptoSigning ephemeral key warning | Persistent amber `role="alert"` banner on the CryptoSigning page: keys displayed there are temporary (derived on-the-fly, never persisted); funds sent to a displayed address are unrecoverable without first exporting the key. | #425 | ✅ BUILT |
| H-C | Mainnet gate consolidation | `SendCrypto.jsx` read `import.meta.env.VITE_ALLOW_MAINNET === 'true'` (a runtime env var, bypassable). Now imports the compile-time constant `ALLOW_MAINNET` from `networks.js` directly; `vite.config.js` dead-code-eliminates the gated path in production. | #426 | ✅ BUILT |
| — | Android release APK CI | `.github/workflows/ci.yml` `android-release` job: runs on every `main` push after `verify` passes; `npx cap sync android` + `./gradlew assembleRelease -PRELEASE_CERT_SHA256` (secret-injected). Signed APK uploaded as a 30-day artifact. | #421 | ✅ BUILT |
| — | Independent audit of unvalidated claims | `docs/audit-2026-06-27-unvalidated-claims.md`: 3 HIGH + 5 MEDIUM findings from static analysis of previously-unvalidated audit doc claims. H-A / H-B / H-C are the code fixes; remaining M-class items are documentation gaps (no code change required). | #423 | ✅ BUILT (doc) |

> **Honest framing:** "BUILT" here means the code fix is on `main` and tests are green. These are security hardening PRs, not features with on-chain verification — no txid is claimed. Controls involving hardware (H-NEW-5 biometric ACL, H-NEW-1 APK cert pin on real devices) remain **BUILT / real-device-unverified** — they require a physical device or signed APK install to exercise the OS-enforced path. The JS/web test suite verifies the code structure and branching, not the hardware guarantee.

---

## 9. AI (advisory only) — 💡 none built
- Plain-language tx explanation, scam/phishing explanation, educational assistant, portfolio Q&A — 💡
- AI portfolio advisor — 💡 advisory-only allowed; auto-executing ❌ out of scope

## 10. Niceties / analytics / utilities — 💡 mostly parking-lot
- Help menu (top-bar Documentation entry) — ✅ (`HelpMenu.jsx`, PR #48)
- Address book — ✅ (with per-chain validation on save)
- ENS / SNS **resolution** in Send — ✅ (resolve-only); ENS **registration** — ❌ removed (PR #48)
- Price charts / watchlist / portfolio / analytics / tax / signing / savings — 💡 (UI present in places, not core-wired)
- Fee Analytics (`/fee-analytics`) — ✅ BUILT — UI-confirmed 2026-06-20. BTC tab: 4 confirmed sends, 0.00000564 BTC total fees (0.00000141 BTC each), "View on block explorer" links present. Real on-chain data from throwaway testnet wallet, demo OFF, no fixtures. EVM fails honest to "unavailable" (no in-app indexer). Native-unit only, no fiat, no persistence, no egress.
- Crypto Net Worth (`/net-worth`) — ✅ BUILT — UI-confirmed 2026-06-20. Promoted honest-disabled → live
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

## 12. WalletConnect / dApp connector

WalletConnect / dApp connector — ✅ BUILT (post-audit, 2026-06-27). WC v2 pairing, session management, and the full signing surface are live. All signing handlers have been through a dedicated security hardening sweep (§8a); the surface is substantially more locked-down than when it was first shipped. Specific controls wired:

- **C3 RASP pre-sign gate** — every `handlePersonalSign` / `handleSignTypedData` / `handleSendTransaction` runs `presignGate()` (RASP tier check) BEFORE touching `withPrivateKey`; a blocked gate calls `rejectRequest` and returns — never signs (I4 fail-closed).
- **H7 EIP-712 domain chain binding** — `eth_signTypedData_v4` checks `domain.chainId` against the WalletConnect session's CAIP-2 chain; an explicit mismatch throws `CHAINID_MISMATCH` and rejects. A domain with no `chainId` signs through (backwards-compatible per EIP-712 §2.1).
- **H8 personal_sign address binding** — params `[message, address]` (EIP-1474) vs `[address, message]` (MetaMask-legacy) are resolved correctly; if neither param is the connected wallet's address the request is rejected (`PERSONAL_SIGN_ADDRESS_MISMATCH`) before the key is touched (I4).
- **M9 gas cap** — `handleSendTransaction` caps gas at 1,000,000 unconditionally. If the dApp omits `gas`, the cap is applied to the provider estimate; if present it is clamped to the cap. A dApp cannot bypass by omitting gas.
- **M11 session expiry** — `assertSessionLive` runs before any key operation on every signing handler. An expired or absent session calls `rejectRequest` then throws; the key is never touched (I4).
- **Popular dApps grid** — curated shortcut grid on the dApp Connector page (feat PR, 2026-06-27).
- **H-C mainnet gate consolidation** — `SendCrypto.jsx` no longer reads `VITE_ALLOW_MAINNET` from env; it imports the compile-time `ALLOW_MAINNET` constant from `networks.js` directly, eliminating a runtime environment bypass vector (PR #426).
- **H-NEW-B step-up re-auth at signing chokepoint** (PR #443, 2026-06-28 internal pass) — `handlePersonalSign`, `handleSignTypedData`, `handleSendTransaction` now invoke the step-up gate at the function boundary, not just in the UI modal.
- **H-NEW-C personal_sign display/sign parity** (PR #443, 2026-06-28 internal pass) — MetaMask-legacy param order `[message, address]` consistent between display and signing paths; no display/sign divergence.

Web Bridge page ❌ removed (PR #48 — the swap/relay gateway, not the WC pairing surface).

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

- ❌ **Social Recovery** (guardian / Shamir SSS / multi-party approval) — [audit-blocked-and-not-advertised] never built; audit-flagged and removed from roadmap 2026-06. No code exists.
- ❌ **Crypto Will / Inheritance** — [audit-blocked-and-not-advertised] never built; removed from roadmap 2026-06. No code exists.
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

## Open / residual items — device-gated (from 2026-06-28 internal static-analysis pass)

These items were surfaced by the 2026-06-28 internal static-analysis pass and cannot be
addressed in the JS/web environment. They are consistent with existing M2c/M2d and Phase 4
RASP gates. None affect ALLOW_MAINNET.

| ID | Area | Description | Gate |
|---|---|---|---|
| H-NEW-D | iOS native / KEK | **BUILT-CODE-COMPLETE (2026-06-30)**: SE P-256 ECIES KEK implementation complete (HardwareKekPlugin.swift). Non-extractable SE key, biometric ACL, fail-closed. **UNAUDITED-PROVISIONAL + NON-FUNCTIONAL**: Capacitor inline-plugin registration blocker — JS-side registerPlugin() cannot discover the plugin at runtime despite compilation success. The plugin code is written and compiles; it cannot be called from the app until Capacitor's SPM package conversion resolves the discovery mechanism. See `docs/Feature-Status.md §8a` + memory `h-new-d-ios-se-implementation.md`. | Capacitor SPM package conversion (or accept blocker as permanently documented) |
| F-01 / F-02 | Mobile / biometric | Biometric cache not OS-ACL bound (M2c/M2d plan) — app-layer gate, not hardware-enforced ACL | Native plugin + real device required; would hit same Capacitor blocker as H-NEW-D |
| F-09 | RASP | RASP not adversarially tested on rooted/Frida devices — OS-level probes unverified on live targets | Phase 4 — native RASP OS-level probes + real rooted/Frida device |
| M-K | Web-App / passkey | **BUILT (2026-06-30)**: WebAuthn signCount persistence + cloned authenticator detection. Extracts signCount from assertion response, compares to stored value, rejects replays (signCount must increase). Stored in localStorage (best-effort, no backend). Tests passing ✓. Ready for device verification with real clone attempt. | Device verification with cloned soft authenticator test |

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
