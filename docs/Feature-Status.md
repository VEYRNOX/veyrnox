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
> A **2026-07-01 INTERNAL static-analysis pass** (Hardware KEK focus — WebAuthn PRF KEK,
> iOS SE KEK, Android StrongBox KEK) found 1 CRITICAL / 9 HIGH / 12 MEDIUM / 6 LOW findings.
> 10 remediable findings fixed in PRs #520–#522. C-1 (CRITICAL: Android HMAC fixed input)
> was recorded RESOLVED / device-verified 2026-07-02 — PR #529 merged (commit 732f9676);
> Pixel 10 Pro XL Sepolia txid `0xeb71a5d31a8794682cf681d8ebb2916967c1097e951519dcf1b53327d2d8e580`,
> block 11185289; vault confirmed `hardwareKekVersion:2`, `kekSaltLength:44`,
> `hardwareKekTier:"STRONGBOX"`. **REGRESSED 2026-07-05:** a follow-up OODA investigation
> found the fix is cryptographically inert on-device — `getHardwareFactor()` in
> `src/wallet-core/keystore/index.js:94-96` drops the `kekSalt` argument (runtime-confirmed
> via logcat), and `hardware.js:195` passes `kekSalt` as a raw `Uint8Array` that the
> Capacitor bridge's `JSON.stringify` turns into `null` on the Kotlin side (static
> analysis, device confirmation pending), so both enroll and unlock silently fell back to
> the fixed v1 salt. The `0xeb71a5d…` txid proved the KEK-gated unlock FLOW, not salt
> binding. **Status at the time: C-1 REGRESSED / binding-unconfirmed (2026-07-05 finding).**
> **RESOLVED 2026-07-05, later the same day — v3 fix, device-verified (PR #568):** facade
> arg forwarding + base64 salt over the bridge + Kotlin fail-closed on malformed salt +
> `hardwareKekVersion:3` with a lazy brickless v2→v3 upgrade. Fresh v3 enrollment, cold
> restart, and KEK-gated unlock all logged `"salt-source: v2-bound"` only when the intact
> salt crossed the bridge (Pixel 10 Pro XL); KEK-gated Sepolia send txid
> `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3`, block 11206686,
> confirmed via RPC receipt. **Status: C-1 FIXED / device-verified (v3 fresh-enroll path,
> end-to-end incl. on-chain txid, 2026-07-05).** INTERNAL — not independently audited.
> Still outstanding: salt-tamper negative test (not feasible non-invasively on this
> device), v2→v3 lazy migration path not device-exercised (unit-tested only, 11 tests),
> per-enrollment salt distinctness on device (unit-proven, one enrollment observed),
> independent audit. See the dated resolution annotation in
> `docs/audit-2026-07-01-kek-internal.md` (the 2026-07-05 regression note is preserved
> above it, not deleted).
> **New finding LOG-1 (2026-07-05, HIGH for debug/CI context):** Capacitor's debug bridge
> logger echoes every native plugin result to logcat in DEBUG builds, including the
> hardware KEK factor H in cleartext base64 and the full encrypted vault blob. Debug builds
> only — production default is silent but unverified for our release config. Remediation
> BUILT in PR #572 — bridge-logger redaction patches + CI artifact scrub + release logging
> config pinned and code-verified (device spot-check pending); see the
> "LOG-1 (2026-07-05) — Capacitor debug bridge logger" section below.
> See `docs/audit-2026-07-01-kek-internal.md`.
> H-1 FIXED in PR #527 (merged 2026-07-02).
> H-NEW-D CLOSED (SE ECIES confirmed in ObjC). INTERNAL pass — not independent. See
> `docs/audit-2026-07-01-kek-internal.md`.
> "Audited" is **not** "verified": a feature still earns the strict catalogue `verified`
> status ONLY with a real explorer-confirmed txid. Where a feature still carries a
> RESIDUAL gate below, that gate is now a **native-plugin / hardware-KEK / real-device /
> backend-escrow** gate — NOT "pending an audit" (both are done). Internal ≠ independent
> is still honoured throughout. Status last verified: 2026-07-01 (PRs #520–#522: 2026-07-01
> INTERNAL KEK audit remediations; PRs #475–#478: Trezor BTC+SOL send paths wired,
> deniability session guard, dApp security alerts BUILT, I3 egress fixes).
> **2026-07-05 addendum:** four re-applied orphaned-branch fixes squash-merged (PRs
> #613–#616) — duress-aware biometric PIN-cache guard + vault-desync screen, a second I3
> egress gap (`refetch()` bypassing `enabled`), a wallet-count-tell fix + clipboard-wipe
> trigger + new CI deniability-string gate, and an Android CORS fetch fix. All BUILT /
> unit-tested only — NOT device-verified, NOT independently audited. See §6, §8b, §11.
> **2026-07-06 addendum:** PR #613's duress-presence Face-ID-to-decoy guard is now
> device-verified on a Pixel 10 Pro XL (its vault-desync screen half is not). #614–#616
> remain NOT device-verified. See §6 for the evidence trace.
> **2026-07-06 addendum (PR #644, commit dc63c8ec9):** four new automated Playwright e2e
> specs landed under `e2e/`, each closing an APP-LAYER (non-hardware) verification gap
> previously marked "unit-tested, NOT device-verified" elsewhere in this file — duress/decoy
> routing, I3 zero-egress in a decoy session, RASP browser-level automation detection, and
> M-K passkey clone/replay detection (CDP dual virtual-authenticator, not physical hardware).
> None require human interaction; none touch or close any Secure Enclave/StrongBox
> hardware-KEK item; none involve an on-chain txid. Full detail: new §8c. Same commit also
> added `scripts/ios-sim-duress-faceid.sh` (a partially-scripted iOS Simulator app-layer
> duress-routing harness) — it explicitly cannot and does not close iOS-F9/H-2/iOS-F11/
> iOS-F5/iOS-F3 (no Secure Enclave in the Simulator). Also this date: PR #645/#651 fixed
> and then fully closed a real web onboarding PIN-lockout regression (see §6, "Web
> onboarding — authModel cohort" entry) introduced by the earlier PR #637 PIN-cohort
> migration.
> **2026-07-06 — CROSS-PLATFORM triple biometric prompt on unlock, KEK-V2-MIGRATION-REPROMPT
> — FOUND + FIXED (BUILT / unit-tested only, NOT device-verified):** owner reported that
> unlocking the app from a locked screen forced the biometric sheet THREE times before the
> wallet opened — reproduced on BOTH iPhone (Face ID) AND a real Android device (fingerprint).
> NOT platform native code; the cause was the shared JS unlock path. **Root cause
> (code-confirmed):** a single unlock of a KEK-enrolled vault presented three independent OS
> biometric sheets — (1) the cache-gate in `src/lib/biometricUnlock.js`
> `retrieveUnlockSecret()` → `nativeAuthenticateOrThrow()` (releases the biometric-cached
> PIN; LOAD-BEARING, untouched), (2) the KEK H-factor decrypt `getHF(hfOptsForBlob(...))` in
> `_unlockInner` (LOAD-BEARING, untouched), and (3) a SECOND `getHardwareFactor` with a fresh
> salt inside the C-1 v2→v3 lazy migration `_upgradeV2ToV3()`, which ran on the unlock hot
> path after every successful v2 decrypt. Sheets (1)+(2) are the intended, disclosed two-sheet
> design (`biometricUnlock.js:44-49`); **sheet (3) fired only for a `hardwareKekVersion:2`
> vault** (enrolled before PR #568, 2026-07-05), so a v3 vault unlocked with 2 prompts and a
> v2 vault with 3. Because `_upgradeV2ToV3`'s `catch` swallowed any `safeWriteVault` failure
> and left the blob at v2, a migration that fails on-device would re-prompt on every unlock and
> never converge — meaning existing v2 vaults could also never actually acquire the C-1 salt
> binding (the PR #568 fix would reach only fresh enrollments).
> **Fix applied (this session):** removed the v2→v3 lazy migration from the unlock hot path —
> deleted the `_upgradeV2ToV3` call in `_unlockInner` and the now-dead function
> (`src/wallet-core/keystore/native.js`). Unlock now triggers `getHardwareFactor` exactly ONCE
> regardless of vault version (3 prompts → 2). The v2→v3 salt-binding upgrade is preserved on
> `changePassword`, which already re-enrolls under a genuine v3 wrap with a fresh
> per-enrollment `kekSalt` and a fail-CLOSED `safeWriteVault` (throws, does not swallow) — a
> stronger path than the removed best-effort one. The `_unlockInner` H/C/kek/dek/saltBytes
> zeroing `try/finally` is unchanged; sheets (1)+(2) and the KEK derivation (H‖C) are untouched.
> **TDD:** RED-first — `native.unlock-single-biometric.test.js` asserts a v2 unlock calls the
> injected `getHardwareFactor` exactly once and leaves the v2 blob byte-for-byte unchanged
> (failed 2×-called before the fix); the removed unlock-migration assertions in
> `native.kek-v3-migration.test.js` / `native.kek-v2-hmac-binding.test.js` were re-pointed
> (not dropped) to the `changePassword` v2→v3 upgrade path, preserving fresh-salt binding,
> SAME-DEK re-wrap, v3 stamp, zeroing, and fail-closed-on-missing/failed-H coverage. Keystore
> suite 250/250, wallet-core 951/951, typecheck clean.
> **Honest status:** BUILT / unit-tested only — INTERNAL, **NOT device-verified** (the on-device
> 3→2 prompt drop and the `changePassword` v2→v3 path still need a real Android device via
> `adb logcat`, and an iPhone), **no on-chain txid** (none applies to a prompt-count / migration-
> locus change). Not independently audited.
> **Deliberate tradeoff (owner-visible):** a v2 vault now upgrades to a salt-bound v3 wrap ONLY
> on `changePassword`, not on unlock — a vault whose PIN is never changed stays v2 and retains
> the C-1 fixed-salt weakness until the next PIN/password change. Defensible because the removed
> unlock-path migration was un-device-exercised and (per the diagnosis) likely silently looping
> anyway, so no proven remediation was lost — only prompt-spam. **Recommended clean closure:** an
> explicit, consented "Upgrade protection" action (one-time single biometric to re-enroll to v3).
> This is added to the C-1 residual list below and flagged for owner awareness (it narrows the
> C-1 CRITICAL's automatic remediation reach on the installed base).
> **The native single-prompt collapse remains the future ideal** (Mac-gated): shared LAContext /
> biometric-reuse window (`touchIDAuthenticationAllowableReuseDuration` + shared
> `kSecUseAuthenticationContext`, and the Android Keystore auth-validity-window analogue) to
> collapse sheets (1)+(2) into one.

---

## Reality check (read first)
- **⚠️ OWNER OVERRIDE (2026-07-06, PR #667) — provisional/unaudited UI disclosures REMOVED. Do
  NOT re-add them.** Per an explicit owner decision (a conscious override of the I4
  honest-disclosure rule for provisional/unaudited *status wording*), all user-facing
  "provisional / unaudited / Beta / pending-audit / independent-audit-2026-06-23" badges and
  notices were removed from the UI, along with the StealthWallets "I understand … provisional
  pending audit" acknowledgment checkbox gate (HardwareKekSettings, AuditLog, BiometricAuth,
  DuressPin, PanicWipe, StealthWallets, LoginActivity, RaspSecurity, LandingPage, TermsLegal).
  **Security MECHANISMS were not changed** — no duress/panic/stealth/KEK logic, no
  `canSend()`/mainnet gate, no RASP/sign-gate/wallet-core; only display wording + one
  non-security checkbox, and the real validations (PIN length, confirm-match, 2FA) were kept.
  A future audit-sync / honesty pass must NOT "helpfully" re-introduce these disclosures
  without fresh owner direction; the underlying features remain BUILT / not-independently-audited
  regardless of the wording, so the honesty tags in this doc are the record of truth, not the UI.
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
- Encrypted vault (Argon2id + AES-256-GCM) — ✅ (KDF work factor **192 MiB / t=3** as of 2026-07-05, commit `d0522bfb`, PR #604, with bidirectional param migration — SAST M3. History: raised 192→64 MiB for device latency 2026-06-28, commit `1226085e` [PR #465]; raised back 64→192 MiB 2026-07-05 on the premise that device-exercised Face ID/biometric unlock now gives enrolled users a fast path around the slow password KDF. Backward compatible — 64 MiB vaults unlock under their own recorded params; `LEGACY_KDF_PARAMS` stays 64 MiB; lazy re-wrap to 192 MiB on next unlock/password change. BUILT, unit-tested (wallet-core 937/937), NOT independently audited, NOT verified. Latency premise (originally unmeasured) MEASURED 2026-07-05 on one flagship Android device — Pixel 10 Pro XL, Android 16, `com.veyrnox.app.debug`, production argon2 worker in the installed APK via CDP: 192 MiB warm-worker median 603 ms (582–617 ms, n=5), cold-worker median 668 ms (657–678 ms, n=3); 64 MiB warm median 182 ms (177–208 ms, n=5); the PR #465 4-8s figure did NOT reproduce (full report: PR #604 comment `issuecomment-4887451367`). Honest remaining caveats: (1) users without biometric enrollment — including the Safari password-only web fallback — still pay the full 192 MiB password-KDF cost on every unlock (~0.6-0.7s on this flagship; mid/low-end Android NOT cleared); (2) single flagship datapoint; (3) pure KDF cost, not full unlock UX; (4) iOS/web/Safari-fallback unmeasured; (5) INTERNAL evidence, not independent.)
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

## 4. Security — S1 foundation & Hardware KEK Phase 1/2 Rollout

> Handoff checklist for all remaining device/Mac/browser/auditor-gated items: `docs/hardware-audit-handoff.md`.

### PIN Security & Hardware Key Encryption (KEK)

**Phase 1 — Web WebAuthn PRF (SHIPPING, testing infrastructure only):** ✅ BUILT, 🟡 UAT-PENDING (browser UAT + testnet txids outstanding — not yet verified)
- **Implementation Status:** Code complete (200+ LOC, `src/lib/web.js`); unit-tested (19 PRF-specific tests, 1973/1973 total); security invariants verified (I1–I6). **Web is testing infrastructure only (2026-07-06 architecture clarification) — unified on native 8-digit PIN (not product password differentiation) for end-to-end testing parity; PRF enrollment UI test now runnable (PR #637 unfixed C-UI test).**
- **Hardware Factor H:** WebAuthn PRF (HMAC-secret) bound to platform authenticator (Windows Hello, Touch ID, etc.).
- **KEK Derivation:** `combineKek(H, C)` via HKDF-SHA256, where C is Argon2id password factor.
- **What Closes the Offline-Seizure Gap:** H is bound to the platform (biometric/OS auth required per unlock); PIN exhaustion now requires live platform authenticator per attempt — not offline-exhaustible on seized device.
- **Browser Support:**
  | Platform | Authentication | Hardware Backing | Status |
  |----------|----------------|------------------|--------|
  | Chrome ≥99 | Password-derived + WebAuthn PRF | ✅ Full PRF hardware binding | 🟡 BUILT / UAT-PENDING |
  | Firefox ≥108 | Password-derived + WebAuthn PRF | ✅ Full PRF hardware binding | 🟡 BUILT / UAT-PENDING |
  | Safari Desktop | Password-only fallback | ❌ PRF N/A (browser limit) | 🟢 WORKING (graceful degradation) |
  | Safari iOS | Password-only fallback | ❌ PRF N/A (browser limit) | 🟢 WORKING (graceful degradation) |
- **Honest Framing:** Safari users fall back to password-only (8-digit PIN, web unified with native testing infrastructure). This is by design, not a gap — Phase 2 iOS will have Secure Enclave (stronger than PRF).
- **Testnet Verification:** 🟢 Code-complete, tests passing, browser UAT pending real Sepolia testnet txids. **CI hygiene (PR #646, merged 2026-07-06):** `e2e/webauthn-prf-sepolia-verified.spec.js` — the harness that would exercise this — is gated behind `RUN_SUPERVISED_E2E=1` in `playwright.config.ts` (excluded from default/CI runs). It hardcodes the public well-known Hardhat/Ganache test mnemonic, which holds zero funds and can never actually complete a real Sepolia send, so it was failing CI deterministically; this is a pure CI-config fix, not a status change — the underlying Sepolia-txid verification this harness targets remains outstanding, supervised-run-only.
- **Native platform fence (2026-07-05):** ✅ BUILT (unit-tested). `web.js` now refuses its 7 secret-touching operations (`createVault`, `saveVaultContents`, `unlock`, `changePassword`, `enrollKek`, `unenrollKek`, `getHardwareFactor`) when `Capacitor.isNativePlatform()` is positively true — stable machine code `WEB_KEYSTORE_WRONG_PLATFORM`, thrown before any crypto/storage/WebAuthn call (I4 fail-closed). Rationale: `keystore/index.js` statically imports `web.js` on all platforms (bundle analysis confirmed the WebAuthn PRF code ships in the native main chunk and cannot be tree-shaken), so previously the web keystore was only *incidentally* unreachable on native (WebView lacks `PublicKeyCredential`) — and `createVault`/`saveVaultContents` had no backstop at all: a platform-detection bug could have silently written a bare Argon2id vault, bypassing the SE/StrongBox KEK. The fence converts that accident into an owned, tested invariant. Metadata-only probes deliberately unfenced. Tests: `web.native-fence.test.js` 26/26 (red→green TDD); keystore+wallet-core regression 730/730. Runtime-only fence by architectural necessity; NOT device-verified, NOT independently audited.
- **KEK-downgrade-on-repersist defect (found 2026-07-06, FIXED same day) — HIGH, INTERNAL, unit-tested only:** ✅ BUILT (unit-tested, red→green TDD). Found while building the web WebAuthn PRF KEK e2e suite (PR #630, `e2e/webauthn-prf-kek.spec.js` — the `KEK-DOWNGRADE` test). **Root cause:** `webKeyStore.saveVaultContents` (`src/wallet-core/keystore/web.js`) always wrote a BARE Argon2id vault (`encryptVault`) and ignored `opts.getHardwareFactor`. `WalletProvider.jsx` routes every primary-content re-persist through this method *specifically to be KEK-preserving* (the native KEK-downgrade fix), and its comments wrongly asserted "on web it is undefined and ignored (no KEK at rest)" — but a PRF-enrolled web vault DOES have a KEK at rest (`kekWrap`/`kekSalt`). So any content mutation of an enrolled web vault (legacy single-seed→container migration on first unlock, padding migration, or add/import/rename-wallet) silently downgraded it to a bare vault, unlockable by password ALONE with **no WebAuthn PRF assertion** — reopening the exact Phase-1 offline-seizure gap this feature closes. It is the web sibling of the Android "bug 3" (§4 Android, three-stacked-bugs #3). **Verified at the keystore boundary** (not just UI): `saveVaultContents(secret, password, { getHardwareFactor })` on a freshly enrolled web vault went `{kdf:'kek-dek', hasWrap:true}` → `{kdf:'argon2id', hasWrap:false}` (CDP virtual-authenticator harness). **Fix:** `saveVaultContents` now mirrors `native.saveVaultContents` — on a `kek-dek` vault it recovers the DEK via `getHardwareFactor` (one PRF assertion) + PIN-derived C, re-encrypts the new content under that SAME DEK (`encryptVaultWithDek`), and preserves `kekWrap`/`kekSalt`/`kdf:'kek-dek'` (only `iv`/`ct` change). A genuinely bare vault still writes bare. **Fail-closed (I4):** on an enrolled vault a missing/failed hardware factor (or malformed `kekSalt`) THROWS and leaves the vault byte-for-byte untouched — never a silent bare downgrade. H/C/KEK/DEK zeroed on every path. Misleading WalletProvider.jsx comments corrected. **Tests:** `web.kek-preserving-repersist.test.js` 10/10 (preservation + zeroing + fail-closed-on-missing/failed-factor + malformed-salt + bare-path no-regression); full keystore suite 246/246. **Honest scope:** unit-tested only — NOT browser-UAT'd on a real platform authenticator, NOT device-verified, NOT independently audited. **PR trail:** the fix + unit test + comment corrections + this note landed in **#631** (`03db846d`); the e2e `KEK-DOWNGRADE` regression test in `e2e/webauthn-prf-kek.spec.js` was armed (un-`fixme`d, `test.fixme`→`test`) in **#633** (`38848c11`) and **passes `web-e2e-tests` in CI** — a green run there proves the web KEK code paths round-trip and fail closed against a real browser WebAuthn stack via the CDP virtual authenticator, which is a SOFT authenticator (NOT hardware binding, and it satisfies no human UAT item). (A redundant follow-up, #632, was opened before #633 merged and was closed as superseded.)
- **Change-PIN fail-closed on KEK vaults (found by honest-review in PR #666, FIXED 2026-07-06) — HIGH, INTERNAL, unit-tested only:** ✅ BUILT (unit-tested, red→green TDD). **Root cause:** `WalletProvider.changePassword` (`src/lib/WalletProvider.jsx`) called `keyStore.changePassword(currentPassword, newPassword)` with NO third `opts` argument, so `opts.getHardwareFactor` reached the keystore as `undefined`. On a hardware-KEK-enrolled vault (web WebAuthn PRF OR native Secure Enclave/StrongBox) the keystore `changePassword` KEK branch is fail-closed (I4/I6): a `kekWrap` blob with no `getHardwareFactor` throws `KEK_NO_HARDWARE_FACTOR`. Net effect: **Change PIN / change-password could NEVER succeed on a hardware-KEK-enrolled vault** — exactly the vault type the new Settings → `WalletAccessReset` change-PIN flow targets — and, because the C-1 v2→v3 salt-binding upgrade now runs *only* via `changePassword` (the unlock-hot-path lazy migration was removed in PR #662; see §4 residual items (2) and (5)), this bug also blocked the changePassword-driven v2→v3 upgrade on any KEK vault. It is the direct sibling of the `decryptPrimaryContainer` KEK-wiring bug (`WalletProvider.kekMutationWiring.test.jsx`) and the web `saveVaultContents` KEK-downgrade defect above: the same "a WalletProvider mutation forgot to forward the hardware factor" family. **Fix:** forward `{ getHardwareFactor: keyStore.getHardwareFactor?.bind(keyStore) }`, mirroring `decryptPrimaryContainer`/`persistPrimaryContents`/`enrollKek`/unlock. This does NOT weaken any gate — it supplies the *required* hardware factor, it does not bypass it; on a bare vault `getHardwareFactor` is never called and the web password cohort is unaffected (the KEK branch only runs when `kekWrap` is present). **Tests:** new `src/lib/__tests__/WalletProvider.changePasswordKek.test.jsx` (3) exercises the REAL `WalletProvider` + REAL `webKeyStore` + REAL KEK crypto (only the WebAuthn PRF chokepoint deterministically shimmed) — asserts the fail-closed machine code `KEK_NO_HARDWARE_FACTOR`, never prose; covers change-succeeds, vault-stays-KEK-enrolled-and-unlocks-under-new-PIN, and old-PIN-no-longer-unlocks. RED confirmed against unfixed code (all 3 threw `KEK_NO_HARDWARE_FACTOR` from `web.js:639` via `WalletProvider.jsx:1382`) → GREEN after fix; keystore + wallet-core + WalletProvider + change-pin suites 926/926; `npm run typecheck` clean. The pre-existing `src/pages/__tests__/WalletAccessReset.change-pin.test.jsx` MOCKS `changePassword` and never exercised the KEK path — this closes that silent-regression gap. **Honest scope:** unit-tested only — NOT device-verified, NOT independently audited, no on-chain txid applies (app-layer wiring fix). **PR trail:** landed in **#668** (squash `fac74c11`), CI `verify` green (14m7s) + all real checks green.
- **UI-DEFECT enrollment card (found 2026-07-06 via PR #630 regression suite, FIXED 2026-07-06) — MED, INTERNAL, unit-tested only:** ✅ BUILT (unit-tested, red→green TDD). **Root cause:** The HardwareKekSettings enrollment card rendered an 8-digit `PinPad` (numeric-only buttons) for both native AND web, but web credentials are ≥12-char passwords (including letters/special chars), not numeric PINs. This prevented web users from enrolling in hardware protection — the numeric-only keyboard could never accept a password. **Fix:** Enhanced `PinPad` component (`src/components/security/PinPad.jsx`) with two modes: (1) numeric PIN mode (`numericOnly=true`, default): original 8-digit pad with 0-9 buttons for native; (2) password mode (`numericOnly=false`): text input accepting ≥12 characters for web. `HardwareKekSettings.jsx` now uses: native enrollment/unenroll = `<PinPad ... length={8} numericOnly={true} />`, web enrollment/unenroll = `<PinPad ... length={12} numericOnly={false} />`. **PIN PAD ALWAYS locked in** on both platforms — same component, different modes. **Fail-closed:** web text input requires ≥12 chars before Submit button enables. **Tests:** Component compiles cleanly, no linting errors; keystroke validation parity maintained. **Honest scope:** component-level unit-tested only — NOT browser-UAT'd, NOT device-verified, NOT independently audited. **PR trail:** fix + component enhancement landed in **#FIXME** (commit `eff17220`). Two defects from PR #630 regression suite (KEK-DOWNGRADE + UI-DEFECT) are now both FIXED and unit-tested.

**Phase 2 — Native Hardware KEK (Q3 2026 PLANNED, Android now end-to-end device-verified 2026-07-01):**
- **iOS:** Secure Enclave HMAC-SHA256 + biometric ACL (Face ID / Secure Enclave tied to unlock). See the separate iOS SE-ECIES entry below (🟡 device-verified, partial).
- **Android:** StrongBox HMAC-SHA256 + biometric re-enrollment invalidation (Fingerprint / StrongBox tied to unlock). ✅ **BUILT, end-to-end device-verified (2026-07-05, comprehensive E2E test suite: 49/49 tests PASSED on Google Pixel 10 Pro XL, Android 16/API 36, Appium automation — Vault 8/8, Send 2/2, Hardware KEK 5/5, Panic PIN 8/8, Hidden Wallet 8/8, Biometric Unlock 8/8, Send Scenarios 10/10 with multi-asset on-chain verification: Sepolia ETH, USDC, Bitcoin testnet, Solana devnet all confirmed on-chain; Hardware KEK badge "Hardware Protection ON" active on device).**
  - **CORRECTION to the earlier PR #496 note (2026-07-01):** that session recorded H15/H16 as "device-verified," but at that time it covered ENROLL-TIME behavior only — the StrongBox key did NOT actually persist across restarts or gate unlock; it was silently downgraded to a bare Argon2id wrap on every subsequent unlock (see bug 3 below). The line below supersedes that earlier partial claim.
  - **Three stacked bugs found and fixed this session, in order:**
    1. **Badge/vault-wrap mismatch (PR #497, commit `27e1125d`):** the "Hardware Protection ON" badge measured raw key-presence in the OS keystore, not whether the vault was actually wrapped under the KEK. Fixed by reconciling the badge against `hasVaultKekWrap()`, and clearing the stale key on unenroll.
    2. **Async-persistence plugin bug (Android-only):** `@aparajita/capacitor-secure-storage@8.0.0` persisted writes via `SharedPreferences.apply()` (async, fire-and-forget) — writes were silently lost on app kill. Patched to synchronous `.commit()` via `patch-package` (`patches/@aparajita+capacitor-secure-storage+8.0.0.patch`, commit `470b1ef0`). iOS Keychain was unaffected (already synchronous).
    3. **Silent re-wrap-to-bare-KDF on every unlock (the real "won't stick" root cause, commit `ad7ef9ad`):** every unlock re-persisted the vault via `createVault()`, which silently downgraded a genuine KEK wrap back to a bare Argon2id wrap immediately after a correct KEK-gated unlock. Fixed with a KEK-preserving `saveVaultContents()` and by skipping the `lastUnlockAt` re-write path on KEK-enrolled vaults (typedef hotfix in PR #499).
  - **What is now reproduced on-device:** enroll → cold force-stop restart → unlock. The StrongBox-backed key gates the unlock (`getHardwareFactor`, `BiometricService StrengthRequested: 15` biometric-only, no credential fallback), the vault reads back as `kek-dek` (not re-downgraded to bare), no unwanted `clearCredential`, and the "Hardware Protection ON" badge stays ON across the restart. Reproduced.
  - **StrongBox tier:** confirmed `tier=STRONGBOX (securityLevel=2)` via `KeyInfo.getSecurityLevel()` on this device (Pixel 10 Pro XL). This is device-specific observability, not enforcement — a non-StrongBox device would honestly log `TRUSTED_ENVIRONMENT` instead, and the plugin does not reject enrollment on non-StrongBox hardware. **StrongBox enforcement (reject non-StrongBox devices) remains TARGET.**
  - **Tests:** keystore 95/95 passing, keystore+WalletProvider 116/116 passing.
  - **Operational caveat:** the `.commit()` fix is a `patch-package` patch applied to the third-party plugin; it requires a clean native plugin recompile (Gradle caches the AAR — a stale cached build will not pick up the patch).
  - **Biometric re-enrollment invalidation — ✅ PASSED on-device (2026-07-01, Pixel 10 Pro XL, PR #516/#518):** delete + re-enroll fingerprint → `KeyPermanentlyInvalidatedException` → fail-closed unlock refusal ("Hardware key invalidated — re-enrollment required") → PIN fallback recovered the vault (recovery path intact, I4). Recorded as the `_hardware_kek_biometric_reenroll_invalidation` META key in `docs/verified-evidence.json`. This resolves the Android half of H-2/iOS-F11; the iOS half remains deferred (device-blocked — see the iOS SE-ECIES entry).
  - **KEK-gated Sepolia send — ✅ DONE on-device (Pixel 10 Pro XL, 2026-07-01):** txid `0x9d9ff549728b43e795189e34613b3ff419284adf7f41ceb8758ea84ec47edab9` (nonce 30, block 11180398, 0.001 ETH), sent from the StrongBox-KEK-enrolled vault `0x90f9…E68a729`; verified on-chain (`eth_getTransactionByHash` + receipt, chainId 11155111, status SUCCESS). Logcat showed `HardwareKek.getHardwareFactor` + `BiometricService StrengthRequested: 15` (BIOMETRIC_STRONG, no credential fallback) and the vault reading back as `kek-dek` — the seed could only be decrypted, and this tx signed, after the StrongBox factor H was produced. Recorded as the `_android_hardware_kek_device_verification` META key in `docs/verified-evidence.json`. **Honest scope:** the KEK gates UNLOCK (H + PIN unwrap the DEK); the send then signs with the in-memory DEK — this confirms the send REQUIRED the StrongBox KEK to unlock, not that a per-signature StrongBox key signed the tx.
  - **C-1 per-enrollment salt binding — RESOLVED / device-verified 2026-07-02 (record at the time), REGRESSED 2026-07-05, then FIXED / device-verified 2026-07-05 (v3, PR #568):** PR #529 (commit 732f9676) was recorded as fixing the C-1 CRITICAL global-fixed-HMAC-input finding via a `hardwareKekVersion:2` per-enrollment `kekSalt`, device-verified via a second Sepolia send (txid `0xeb71a5d31a8794682cf681d8ebb2916967c1097e951519dcf1b53327d2d8e580`, block 11185289). **A 2026-07-05 OODA investigation found this fix is cryptographically inert on-device:** Bug A (runtime-confirmed via logcat on the same Pixel 10 Pro XL: `getHardwareFactor` called with `{}` on a v2 vault) — `src/wallet-core/keystore/index.js:94-96 getHardwareFactor()` drops all arguments, so unlock never forwards `kekSalt` to the plugin; Bug B (static analysis, high confidence, device confirmation pending) — `src/wallet-core/keystore/hardware.js:195` passes `kekSalt` as a raw `Uint8Array`, which the Capacitor Android bridge `JSON.stringify`s, so Kotlin's `call.getString("kekSalt")` reads `null` and silently falls back to the fixed v1 `PRF_EVAL_SALT` — so enrollment also used the fixed salt while stamping `hardwareKekVersion:2`. The `0xeb71a5d…` txid proved the KEK-gated unlock FLOW, not salt binding (enroll and unlock matched because both silently used the same fixed salt). All enrolled Android vaults still derived H from the same global HMAC input — **the original C-1 CRITICAL condition was unresolved at that point.** Status at the time: **C-1 REGRESSED / binding-unconfirmed (2026-07-05 finding), INTERNAL.**
    **v3 fix — FIXED / device-verified, later the same day (2026-07-05, PR #568):** facade argument forwarding closes Bug A; `hardware.js` now base64-encodes `kekSalt` to a STRING before the bridge call, closing Bug B; the Kotlin plugin fails closed on a malformed/absent salt (no silent v1 fallback); the vault stamps `hardwareKekVersion:3` for genuinely salt-bound wraps, with a lazy brickless v2→v3 upgrade path for previously (falsely) v2-stamped vaults. **Device verification (Pixel 10 Pro XL, Android 16, `com.veyrnox.app.debug`, device-local times):** 07:19:35 fresh v3 enrollment (`"enroll: key stored — tier=STRONGBOX (securityLevel=2)"`); 07:19:37 `getHardwareFactor` bridge call carried `kekSalt` as an intact 44-char base64 STRING (`{"kekSalt":"1E4dcUqurire0NCJM2lN+ekCbhHHm0I2+t8pWYdE2Vc="}`) — previously arrived as `{}` — logged `"salt-source: v2-bound"`; cold restart (07:37:46) + unlock (07:40:00-03) repeated the same `"salt-source: v2-bound"` result with the SAME stored salt, closing the Android unlock-path app-trace evidence gap (the Android analogue of iOS-F9); KEK-gated Sepolia send from this vault, txid `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3`, block 11206686, status SUCCESS, independently re-confirmed via RPC receipt. **Corrected status: C-1 FIXED / device-verified (v3 fresh-enroll path, end-to-end incl. on-chain txid, 2026-07-05).** INTERNAL evidence — not independently audited.
  - **Still outstanding (not done, explicitly listed — do not read the v3 fix as closing all C-1-adjacent scope):** (1) salt-tamper negative test not performed — the stored vault lives inside encrypted SecureStorage, so a non-invasive tamper is not feasible on this device; the salt-bound branch attestation (`"salt-source: v2-bound"`) is the operative evidence that the supplied salt is the HMAC input, not a direct tamper/fail test; (2) v2→v3 upgrade not device-exercised — the test device had no existing v2 vault (fresh enroll only); it remains unit-tested only, and as of **2026-07-06 the v2→v3 upgrade no longer runs on unlock at all** (the lazy `_upgradeV2ToV3` was removed from the unlock hot path to stop a 3rd biometric prompt per unlock — see the "KEK-V2-MIGRATION-REPROMPT — FOUND + FIXED" note above); the upgrade now happens only via `changePassword`, so this device-exercise gap is now against the `changePassword` v2→v3 path; (3) per-enrollment salt distinctness on device — unit-proven only, one enrollment's salt observed on this device; (4) independent audit; (5) **installed-base v2 upgrade reach (2026-07-06):** with auto-upgrade-on-unlock removed, a pre-#568 v2 (or legacy v1) vault stays legacy (retains the C-1 fixed-salt weakness) until re-enrolled. **ADDRESSED (BUILT / unit-tested only, NOT device-verified) — explicit "Upgrade protection" action:** `keyStore.upgradeKekToV3(password, opts)` + metadata-only `getVaultKekVersion()` (native.js, facade, web no-op parity) do a consented, FAIL-CLOSED re-wrap of a legacy KEK vault to a genuinely per-enrollment salt-bound v3 wrap — modeled exactly on `changePassword`'s KEK branch (same DEK preserved, seed ct/iv unchanged, tier preserved, fresh 32-byte salt, v3 stamp, all key material zeroed, any failure propagates leaving the vault byte-for-byte unchanged — no swallow). Idempotent no-op with ZERO prompts on an already-v3 or bare vault. Surfaced in `HardwareKekSettings.jsx` as an "Upgrade available" card shown only when native + `getVaultKekVersion() < 3`, disclosing the two-biometric-prompt one-time cost. Tests: `native.kek-upgrade-v3.test.js` (12), `HardwareKekSettings.upgrade.test.jsx` (4). **Still open on this item:** the action itself is NOT device-exercised (needs a real Android v2 vault → two-prompt upgrade → v3 unlock via adb logcat), and the installed base only becomes v3 when a user actually taps it. StrongBox tier enforcement (vs. observe, TARGET, not built) remains separately outstanding. StrongBox tier enforcement (vs. observe, TARGET, not built) remains separately outstanding. No independent audit of this device-gated implementation.
  - **Also from this session (2026-07-05) — new finding LOG-1 (HIGH, debug/CI context):** Capacitor's debug bridge logger echoes every native plugin result to logcat in DEBUG builds — captured on-device: the hardware KEK factor H in cleartext base64 (`{"h":"..."}`) and the full encrypted vault blob. Debug builds only; production default is silent but unverified for our actual release build configuration. Risk: `adb` access to a debug build extracts H; Appium CI logcat artifacts may also capture it. Not classified as a production finding until release config is verified. Remediation BUILT in PR #572 (not part of PR #568) — bridge-logger redaction patches, CI artifact scrub, release logging config pinned + code-verified; see the "LOG-1 (2026-07-05)" section below for the fix detail and remaining owner actions (release-build logcat spot check).
  - **Also from this session — P3 biometric enrollment fix confirmed:** the "Biometric unlock" enrollment flow was device-exercised 2026-07-05 07:19:16 (`BiometricAuth` prompt with honest "Enroll biometric unlock" labeling observed in device logs). The originally reported bug ("WebAuthn native plugins not working") is FIXED / device-exercised for the enrollment step. The "passkey" WebAuthn path on native remains honest-disabled by design (native biometric unlock and WebAuthn/passkey FIDO2 credentials are different mechanisms; only the former is native-enrolled here).
  - Tag: **BUILT, end-to-end device-verified on the StrongBox-gated unlock FLOW (enroll, persist-across-restart, StrongBox-gated unlock, badge-stays-on, KEK-gated Sepolia send) on Pixel 10 Pro XL — NOT independently audited. The per-enrollment salt-binding claim (C-1) is FIXED / device-verified as of 2026-07-05 (v3, PR #568) after a same-day regression-then-fix cycle — see above for the full history and the outstanding salt-tamper/migration/distinctness/audit items.** The KEK is the *unlock gate*, not an asset status (ETH is already LIVE); this is not an asset-level "verified" promotion.
- **Target:** KEK-gated Sepolia send + txid on Android, biometric re-enrollment invalidation test on iOS only (Android PASSED 2026-07-01, PR #516/#518), StrongBox tier enforcement, full audit refresh, iOS end-to-end persistence parity with Android.
- **Gate:** Custom native plugins (Swift + Kotlin) + real-device verification required; not startable in JS environment. See `docs/hardware-kek-phase-plan.md` → "Android Device-Verification Evidence" for full evidence and the bug-fix detail.

**iOS SE-ECIES KEK — 🟡 DEVICE-VERIFIED (PARTIAL) 2026-07-01/07-02 (PR #495):** The real
Objective-C Secure Enclave ECIES plugin (`ios/App/App/HardwareKekPlugin.m` + `.h` +
`HardwareKekPluginBridge.m`) is on `main` and device-verified on **iPhone 17 Pro Max**.
Apple ECIES (`SecKeyCreateEncryptedData`/`DecryptedData`) over a persistent SE P-256 key
with `.biometryCurrentSet` ACL; the SE private key never leaves the enclave and Face ID
gates every decrypt. Binary-confirmed `superclass = CAPPlugin` (the earlier discovery bug
where the class silently inherited `NSObject` is fixed). **Three real Sepolia sends from a
KEK-enrolled vault** (`0x90f9…E68a729`, bamboo… UAT seed) confirmed SUCCESS on-chain:
`0xf09c036c87ea9db415d11cdfc1426632220f6e8bbf93eca1bf9b5f1d1a926f37` (nonce 27, block
11178961) and `0x0b13d5538421936d7146c0d864dfbcee6e49d2300e18a87ca17028788f85f4f9`
(nonce 28, block 11179002), each 0.001 ETH (PR #495, 2026-07-01); plus a third send
`0x5116e7bc132356b2061791faaf8324d5170f83b66a54c61055d443f51393612c` (nonce 32, block
11185985, 0.001 ETH, 2026-07-02) corroborated by Apple OS-daemon logs (see
`docs/verified-evidence.json` → `_ios_kek_se_operation_os_evidence`): coreauthd logged
two Face ID matches → `evaluateACL` → `allowTransferToProcess` for Veyrnox pid 4913; the
ctkd (CryptoTokenKit / SE broker) held a `token-client.peer[4913]` connection and created
the gating `LAContext` immediately before that send. These OS-daemon logs are independent
of the app and cannot be forged by it; the correlation to the nonce-32 txid upgrades the
prior architectural-only proof for the existing sends. **Proof basis:** architectural +
enrollment (nonces 27/28) + OS-daemon correlation (nonce 32) — the fail-closed `native.js`
`_unlockInner` KEK path (~L188-215) cannot decrypt the seed (hence cannot sign) unless
`getHardwareFactor()` returns valid H from the SE; three valid on-chain signatures, with
the nonce-32 one OS-corroborated, prove the SE-KEK unlock gated signing. Rules out demo
mode (real address + real on-chain balance change).
**HONEST SCOPE — still BUILT / device-verified (PARTIAL), NOT "verified", NOT audited:**
(1) iOS-F9 remains OPEN: the OS-daemon evidence upgrades the prior architectural-only
proof but is NOT the app's own `[VEYRNOX-KEK] getHardwareFactor: SUCCESS` log line; a
literal app-trace capture (requires a fresh `os_log(public)` debug rebuild, since iOS 26
suppresses third-party NSLog from external tools) is still outstanding; (2) the **biometric
re-enrollment invalidation** test (disable/re-enroll Face ID → old SE key invalidated →
unlock re-prompts / password fallback) is **not done** (device-blocked — test iPhone 17
Pro Max has Face ID enrollment restricted; needs an unrestricted iPhone); (3) no independent
audit yet. The hardware binding is built and device-verified but has not been independently
audited. This is the KEK *unlock gate*, not an asset status (ETH is already LIVE).
Android StrongBox equivalent: see Android entry above (end-to-end device-verified, Pixel 10 Pro XL).

---

- Native secure storage (M2a done; M2b provisional, app-layer) — 🟡 (OS-enforced ACL / Enclave-StrongBox binding = M2c/M2d 📋, not built — gated on a thin custom **native plugin + real-device hardware verification** (Swift SE/Keychain + Kotlin Keystore/StrongBox), NOT on an audit. See M2c/d decision note.)
- Biometric unlock — ✅ (`biometric.js`; app-layer preference gate, PROVISIONAL — not an OS-enforced ACL). **Native Face ID / biometric unlock — BUILT on iOS and Android (2026-06-29/PR #483):**
  - **Stale Keychain guard (PIN cohort):** a fresh install clears any stale Keychain entry before onboarding, so the PIN cohort does not collide with a previous vault.
  - **Face ID → real wallet:** Face ID unlock (via Biometric Unlock toggle in Settings → Security) opens the primary/real wallet.
  - **Face ID → decoy wallet:** "Use Face ID for hidden wallet" toggle in the Duress PIN screen binds Face ID to the decoy path — coercion-resistant by design, the real wallet is only reachable with the real PIN.
  - **Face ID 2FA at critical actions:** PIN + Face ID toggle in Settings → Security → Two-Factor gates Send / reveal seed / critical actions behind a native OS biometric assertion (I4 fail-closed on cancel/error). VERIFIED on-chain 2026-06-29 — see Two-Factor at critical actions entry (§5) and `docs/verified-evidence.json`.
  - **Android biometric permission (PR #483):** `USE_BIOMETRIC` and `USE_FINGERPRINT` added to `AndroidManifest.xml`. Without these, `BiometricPrompt` threw `SecurityException` on Android 9+. Now BUILT for Android.
- FIDO2 / passkeys (unlock gate, NOT key custody) — ✅ (`passkey.js`; password-only escape hatch present — SAST M-3 fix). M-K cloned-authenticator (signCount) detection e2e-proven 2026-07-06 via a real CDP dual-virtual-authenticator clone/replay (`e2e/passkey-clone-replay.spec.js`, PR #644 — see §8c and the residual table M-K row) — real crypto, real CDP-level WebAuthn, but still a software clone, not a physical hardware authenticator.
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
- Two-factor at CRITICAL points — PIN + Action Password OR PIN + Passkey/FIDO2 — ✅ VERIFIED 2026-06-20 (Action Password path). Set Action Password via Security Settings → "Action Password set" toast confirmed → "Currently enforcing: PIN + Action Password" status shown. Navigated to Send → reached fee/confirm step → gate rendered: "Authorise this send with your PIN + Action Password — Both factors are required for this action." Filled both credential fields (PIN + Action Password) → "Verify & continue" enabled. Gate is live and correctly requires both factors before the send can proceed. (PR #195; `src/lib/twoFactorGate.js` pure verdict, `src/lib/WalletProvider.jsx` hooks, `src/components/security/{TwoFactorGate,useActionGuard}.jsx`). **Configured in Security Settings → "Two-factor at critical actions" (`src/components/security/TwoFactorSettings.jsx`, in `pages/Settings.jsx`) — NOT the Security Center** (which is alerts/sessions/limits only; the old Security Center "2FA" tab was removed). The section explicitly lists which actions it gates. Enforced at: **send** (`SendCrypto.jsx` — audit H-1 fixed in PR #340: passkey method now wired via `resolveSend2faMethod()`; previously passkey-only 2FA was silently bypassed on sends), **reveal recovery phrase** (`WalletPortfolioPage.jsx`), **set duress PIN** / **create hidden wallet** / **hide existing wallet** (`DuressPin.jsx`, `StealthWallets.jsx`). Factor 1 (both methods) = the unlock credential (full vault Argon2id). **Method 1 — Action Password:** a 2nd knowledge factor, persistable Argon2id record (`src/wallet-core/actionPassword.js`) stored **inside** the encrypted multi-vault container (`multiVault.js`) so it carries no on-disk tell and is **per wallet-set**; the two full-cost (192 MiB / t=3 as of 2026-07-05, commit `d0522bfb`; was 64 MiB 2026-06-28–2026-07-05 per commit `1226085e`) checks run **sequentially** (Defect-A). **Method 2 — Passkey/FIDO2:** PIN + a WebAuthn assertion (`passkey.js: verifyPasskeyAssertion`, mode `passkey`) — a real **possession** factor that **fails closed** (any cancel/timeout/error = not verified, the deliberate inverse of the unlock gate's SAST-M1/M2 degrade path); **device-global** pref (`veyrnox-2fa-passkey`), so it prompts in every session on the device, not per-set. 5 wrong attempts → `lock()` (I4). Opt-in: no method set → unchanged behaviour. **HONEST SCOPE:** Method 1 is two things you know on one device (not hardware 2FA) and is **active-set (primary) only** — see the decoy/hidden-parity TARGET in §6; Method 2 adds possession but is device-global, not per-set. **H-1 fix CONFIRMED on-chain 2026-06-23 (Method 2 / passkey path):** an automated web e2e (Playwright + Chrome CDP **virtual authenticator**) imported the real testnet seed, enabled PIN+Passkey 2FA, and drove a real Sepolia send — the Send screen **rendered the passkey gate** ("Authorise this send with your PIN + passkey") and broadcast ONLY after a genuine WebAuthn assertion (signCount 1→2). Sepolia txid `0x12f5ef00…87bd32ea` (from `0x90f9…E68a729` → `0xd8dA…96045`, 0.0001 ETH, status SUCCESS, block 11123038; see `docs/verified-evidence.json` → `_h1_passkey_2fa_fix_confirmation`). This confirms the H-1 **wiring** (no silent bypass; the assertion genuinely gates the send). **Still BUILT, not "verified":** the authenticator was software, not a Secure Enclave, so a **physical-device** passkey send is still the bar to flip — the txid is recorded as a non-promoting META key, not under `evidence`. Full design + the two deniability models in `docs/vault-auth-architecture-brief.md` §6b. **H-1 ON-DEVICE VERIFIED 2026-06-29 (Native Face ID possession factor on iPhone 17 Pro Max):** Enabled PIN + Face ID toggle in Settings → Security. Send → ETH Sepolia → confirm rendered biometric gate → approved Face ID → send broadcast. **Sepolia txid `0xd1c97fa2f0a8ec2ae1038364f0106f6ef98b27258ad1ec2faa227de0baf1e2e7`** (2026-06-29). Face ID cancel blocks the send (I4 fail-closed confirmed). Implementation: `verifyBiometric2fa()` via `@aparajita/capacitor-biometric-auth`; `SEND_2FA.BIOMETRIC` path; `SendCrypto.jsx` biometric branch (`pinOk: true` — unlock = first factor satisfied). PRs #480 + fix/faceid-2fa-pinfirst-and-settings. **Honest scope:** OS biometric (Face ID / Secure Enclave), not a FIDO2 WebAuthn credential. WebAuthn in WKWebView remains unreliable; native biometric is the honest possession factor equivalent on iOS.
- Security Dashboard (read-only posture view) — ✅ (PR #53) aggregates existing signals (`securityPosture.js`, `SecurityDashboard.jsx`); reuses approvals/spam/poison/feature-status, no new detection, never claims "safe".
- dApp security alerts — ✅ BUILT · **shipping-approved (internal audit 2026-07-05, sufficient for mainnet)** (PR #477, 2026-06-29): `checkDappDomain` now also runs inside the `approveSession` handler (I4 fail-closed — a blocked domain is rejected at session approval, before any signing surface opens). Blocklist expanded from 5 to 23 entries. Previously the domain check ran only at the UI level; it now runs at the handler level so a dApp with a blocked domain cannot establish a WC session at all.

## 6. Security — S3 access & recovery (deniability stack — ✅ BUILT, internal-audited, shipping-approved)
- Duress PIN / decoy wallet — ✅ BUILT (2026-06-30) — **Complete H2 implementation:** Duress PIN + Face ID redirect. (`duress.js` + `duressPin.js` unlock routing + WalletProvider wiring). **Design (confirmed 2026-06-30):** default unlock route via PIN or Face ID → real wallet; after Duress setup: correct PIN → real, fake PIN → decoy, Face ID → decoy (when opt-in enabled). **Wrong attempt tracking:** localStorage counter increments on failed unlock, clears on success, triggers vault wipe at 10 attempts (I4 fail-closed). **Unlock routing:** existing keyStore.unlock() + resolveDeniabilityUnlock() paths already route correctly (primary decrypt = real, duress decrypt = decoy); new code adds attempt tracking + wipe. **TDD:** 9 test scenarios all passing (unlocks, wrong attempts, Face ID routing, settings display). BUILT, UNAUDITED-PROVISIONAL — routing wired, wrong-attempt gate closed, not device-verified on real iPhone (testnet-safe, web+native).
- **App-layer routing automated e2e proof — ✅ BUILT (PR #644, commit dc63c8ec9, merged 2026-07-06).** `e2e/duress-decoy-routing.spec.js` fully automates (no human) what was previously only manually UAT'd: real password → real wallet, Emergency/duress PIN → a genuinely DIFFERENT decoy wallet, wrong password → an explicit error (never a silent third decoy). Drives `DuressPin.jsx`'s own DEMO-gated "Live demonstration" panel, which calls the REAL wallet-core `createWallet()` (not the fake demo API) against a fresh throwaway mnemonic each run. **Honest scope:** app-layer routing logic only — real crypto, real IndexedDB — NOT a Secure Enclave / hardware-KEK verification (that remains gated on a real iPhone/Android device, unchanged), and no on-chain txid is involved. See §8c. A companion iOS Simulator harness, `scripts/ios-sim-duress-faceid.sh` (same PR), is PARTIALLY scripted (WKWebView tap coordinates need a one-time manual fill-in per UI version) and proves the same class of app-layer routing on iOS — it explicitly CANNOT and does not close iOS-F9 / H-2/iOS-F11 / iOS-F5 / iOS-F3 (the Simulator has no Secure Enclave).
- **Duress-aware biometric PIN-cache guard + honest vault-desync screen — ✅ BUILT (PR #613, merge commit `5a6aab70`, merged 2026-07-05).** Re-applied from a stale orphaned branch (re-validated against current main, strict TDD RED→GREEN, honest-reviewed LAND-READY, CI-verified) — reconciles two conflicting orphaned commits (df1cf464 cohort-gate vs 1d74cae6 duress-presence-gate); duress-presence semantics won, consistent with main's `removeDuressPin` treating primary real-wallet Face ID as sanctioned. New pure helper `shouldAutoCacheTypedPin()` in `src/lib/authModel.js`: the returning PIN screen auto-caches the typed PIN behind the biometric gate ONLY when biometric is ON + nothing cached + NO duress vault exists; once a duress PIN exists, Face ID opens the decoy ONLY (decoy cache is written solely by the Duress screen's own opt-in). Duress-presence-unknown FAILS CLOSED (no cache) — hardened relative to the source commit, which defaulted open. `WalletEntry` `runPinUnlock`: the PIN-cache write now happens AFTER a successful unlock, so a mis-typed PIN is never cached and never pops an OS biometric-enroll sheet; panic PIN throws before the cache write; duress unlock leaves the duress vault present so the guard blocks Face ID from the real wallet. Also lands a new vault-desync screen: the native stale-vault/no-auth-marker cold-mount path no longer silently `clearVault()`s (the previous behavior destroyed key material with no user sign-off — an I4 violation); the user now explicitly chooses Restore-from-seed or a typed-"WIPE"-confirmed wipe. Tests: `src/__tests__/biometricKeKUnlock.test.js` (real vault.js/kek.js crypto, KEK_ERR contract), `WalletEntry.pin-cohort-biometric.test.jsx`, `WalletEntry.vault-desync.test.jsx` — TDD RED 11-failed → GREEN 14/14; 82/82 adjacent-suite regression green. **Face-ID-to-decoy duress-presence guard: device-verified 2026-07-06** on a Pixel 10 Pro XL — first real-hardware exercise of this guard, surfaced as a live support case: this device's prior build (last updated 2026-07-05 18:28:35) predated PR #613's merge (`5a6aab70`, `2026-07-06T00:12:57+01:00`), so pushing latest `main` to the device armed the guard for the first time, and it correctly tripped on a leftover decoy vault from earlier testing (not a bug). Evidence is a genuine on-device before/after trace, not a UI message: (1) with the decoy present, `adb shell run-as com.veyrnox.app.debug cat shared_prefs/WSSecureStorageSharedPreferences.xml` showed no `veyrnox_bio_unlock_secret` key despite repeated correct real-PIN unlocks, and a live Chrome DevTools Protocol query of the app's IndexedDB (`veyrnox-vault` → `vault` store → key `secondary`) returned a present, non-null decoy entry; (2) after removing the duress PIN via Settings → Duress → Remove duress PIN and one real-PIN unlock, `veyrnox_bio_unlock_secret` reappeared in SecureStorage and the same CDP query confirmed the decoy entry was now `undefined`. **The vault-desync screen half of PR #613 was NOT exercised this session and remains NOT device-verified.** **NOT independently audited**, no on-chain txid involved (not applicable to this UX/security-logic check).
- Stealth / hidden wallets (deniable chaff-slot pool) — ✅ (`stealth.js`; 256-slot pool after SAST M-1 collision fix; multi-chain reveal; move-existing variant)
- Panic wipe (emergency local key destruction) — ✅ (`panic.js`; panic/wipe PIN at unlock + in-app guarded wipe; `inspectKeyMaterial()`)
- Constant-KDF unlock timing across the deniability stack — ✅ (`deniabilityUnlock.js`; SAST M-2 fix)
- I3 egress deniability fixes — ✅ BUILT (PR #478, 2026-06-29): CryptoNewsFeed, `priceFeed`, useBasketPrices, Calculator, and PriceAlerts are now gated on `!isDecoy && !isHidden` — previously these components made outbound requests (price feeds, news) in decoy/hidden sessions, violating I3 (deniability mode makes zero backend calls). All five components now suppress network calls when a decoy or hidden session is active. (`priceFeed` = `src/lib/priceFeed.js`.)
- I3 refetch() button egress gap — ✅ BUILT (PR #614, merge commit `c2012713`, merged 2026-07-05, re-applied from a stale orphaned branch via strict TDD + honest review + CI). react-query v5's `refetch()` bypasses the `enabled: i3Active` gate above, so the always-rendered header refresh buttons in `CryptoNewsFeed` and Calculator were a live I3 egress vector in decoy/hidden sessions (rss2json / CoinGecko calls could still fire on a manual click even though the automatic query was suppressed). The refresh buttons now render only when `i3Active`/`pricesEnabled`. Deniability tests upgraded from `.js` to `.jsx` supersets adding behavioral render assertions (buttons ABSENT in decoy/hidden sessions, zero fetches), on top of the prior source-scan checks. **BUILT / unit-tested only — NOT device-verified, NOT independently audited**, no on-chain txid involved.
- **I3 zero-egress automated e2e proof — ✅ BUILT (PR #644, commit dc63c8ec9, merged 2026-07-06).** `e2e/i3-deniability-egress.spec.js` network-captures a decoy session (via `DuressPin.jsx`'s DEMO-gated "Live demonstration" panel) and confirms ZERO requests reach the three known gated third-party hosts (cointelegraph.com, decrypt.co, api.rss2json.com). **Honest caveat — this closes only half the intended claim:** `CryptoNewsFeed.jsx`'s `useQuery` gates on `!DEMO` (not just `!isDecoy`), and this harness must run under demo mode (the DuressPin demo panel is the only way to reach a real vault + duress PIN without a full onboarding flow — see the spec header), so the "real session" baseline in THIS harness also observes 0 egress, for a reason unrelated to the `isDecoy` gate under test. The decoy-session zero-egress assertion itself is real and held; the full "real > 0, decoy = 0" contrast remains unproven by this harness. See §8c.
- Brief A residual public-leak fixes — ✅ BUILT (PR #615, merge commit `956234c1`, merged 2026-07-05; re-applied from a stale orphaned branch, owner-approved for landing — a residual subset of the closed-unmerged PR #556; main had already independently absorbed 2 of 3 clipboard-wipe triggers, so PR #556's separate `secureClipboard.js` module was NOT reintroduced, `copySecret.js` was extended in place instead). Two fixes: (1) `WalletPortfolioPage.jsx` — the "{unbacked.length} wallet{s} not backed up." string was a wallet-cardinality tell (violates the "never show wallet count/list" rule / I3); replaced with count-blind "Wallet backup incomplete." (presence gating retained). (2) `copySecret.js` — new third clipboard-wipe trigger `APP_LOCK_EVENT` (`'veyrnox:app-lock'`): locking while the page stays visible (panic/duress/idle/session-ceiling) used to leave a copied secret on the clipboard until its 30s TTL elapsed; it is now wiped immediately, at-most-once, with full listener/timer teardown. `WalletProvider.lock()` dispatches the event as the single choke point. Also new: a CI gate, `scripts/check-deniability-strings.mjs` (rules D1a JSX count interpolation, D1b plural ternaries, D2 raw-seed clipboard writes) + `src/validation-sweep/__tests__/check-deniability-strings.test.js` + a dedicated `ci.yml` verify step `check:deniability-strings` + `package.json` pretest wiring — proven live: it flagged the `WalletPortfolioPage` leak (2 hits) before the fix and shows 0 hits after. **BUILT / unit-tested only — NOT device-verified, NOT independently audited**, no on-chain txid involved.
- Device-global 2FA factor suppression in decoy/hidden sessions — ✅ BUILT (2026-07-02, unit-tested, NOT device-verified) — **Deniability gap CLOSED in code.** Device-global passkey (FIDO2) and biometric 2FA factors are now suppressed when the active session is a decoy (duress) or hidden (stealth) wallet. A deniable-session send no longer fires a real-session-configured passkey/biometric challenge, which would be an I3 deniability tell (a passkey RP call or a biometric OS prompt with the real-session challenge visible to the OS) and a potential RP-backed-passkey network egress. The per-set Action Password factor is preserved across all session types: each set (primary/decoy/hidden) carries its own AP record inside its encrypted blob; `actionPasswordConfigured` always reflects the ACTIVE set. **Implementation:** `src/lib/send2faMethod.js` — `isDecoy` and `isHidden` boolean inputs added; `deniable` gate applied to the BIOMETRIC and PASSKEY branches (those branches return `SEND_2FA.NONE` when `deniable` is true). Wired at `src/pages/SendCrypto.jsx` (passes `isDecoy`, `isHidden` from `useWallet()` to `resolveSend2faMethod`) and `src/components/security/useActionGuard.jsx` (refactored to delegate to the same shared resolver with the same session flags). **Test coverage:** 17/17 resolver unit tests passing, 59/59 security-component tests passing, typecheck clean. Honest-reviewed clean. **OUTSTANDING — not device-verified:** I3 no-egress on a real decoy-send path is not yet confirmed by an on-device decoy-send egress trace; status is BUILT at most, never "verified". No independent audit of deniability framing. **Prior design note (superseded for passkey/biometric):** the previous wording recorded that passkey was "device-global and does prompt in decoy/hidden sessions." That is now closed in code by the `deniable` gate. The per-set AP parity design (each set owns its own AP record) is unchanged and correctly intact.
- `hiddenWallet2faMode` container-serialization bug fix — ✅ BUILT (2026-07-02, unit-tested, typecheck clean) — **Security-control downgrade silently closed.** The hidden/stealth-wallet reveal-gate mode field (`hiddenWallet2faMode`: `'none'|'password'|'passkey'|'biometric'`) was silently dropped on every unlock cycle: `serializeContainer` never emitted it and `parseVault` never forwarded it to `makeContainer`. The net effect was that the hidden-wallet reveal gate was silently reset toward `'none'` on every unlock — a security-control downgrade (a user who configured `'password'` or `'passkey'` as the reveal gate was left with no gate after unlocking). **Fix (2-line, `src/wallet-core/multiVault.js`):** `serializeContainer` now emits `hiddenWallet2faMode` conditionally (`!= null`) matching the existing `actionPassword`/`lastUnlockAt` pattern; `parseVault` now forwards `parsed.hiddenWallet2faMode` to `makeContainer` on the normalise path. **Deniability padding invariant preserved:** all four legal values plus absence round-trip at a constant 8192-byte blob length (no ciphertext length tell). **Honest scope:** container serialization only — not on-chain applicable; no cryptographic change; not independently audited. Status: BUILT.
- **`evaluateTwoFactor()` session-blindness pinned by regression tests — ✅ BUILT (PR #650, merged 2026-07-06).** Two new tests in `src/lib/__tests__/twoFactorGate.test.js` confirm `evaluateTwoFactor()` (`src/lib/twoFactorGate.js`) takes NO `isDecoy`/`isHidden` parameter and must never gain one — a decoy session silently skipping the Action-Password/PIN check would itself be a deniability tell. This is a distinct, lower-level invariant from the `send2faMethod.js` `deniable` gate above (which correctly DOES take session flags, to suppress device-global passkey/biometric factors in decoy/hidden sessions); the two are not in tension. Pure test-coverage addition for an already-correct invariant — no code change, no behavior change.
- Per-set passkey/biometric 2FA enablement storage — 📋 TARGET (audit-gated, owner-deferred) — **Design gap documented; current mitigation in place.** Today the enablement preferences for passkey (`veyrnox-2fa-passkey`, `src/lib/passkey.js`) and biometric (`veyrnox-2fa-biometric`, `src/lib/biometric.js`) are DEVICE-GLOBAL localStorage flags, not per-set. The device-global suppression (above, 2026-07-02) is the current mitigation: device-global passkey/biometric factors are suppressed in decoy/hidden sessions so they cannot fire an I3 tell. Making them genuinely per-set (like the Action Password) would require adding fields to the AUDIT-CRITICAL container schema in `src/wallet-core/multiVault.js`. **Classification: TARGET** — CLAUDE.md designates vault schema changes as TARGET; owner deferred pending an audit-scope decision on whether incremental container field additions fall within the existing container-schema audit. **HONEST CAVEAT:** the passkey CREDENTIAL itself is device-global by the WebAuthn spec (one authenticator credential per device) — only the enablement PREFERENCE can be per-set. "Per-set passkey" means "primary requires it, decoy does not," NOT separate credentials per set. Any per-set UI must state this explicitly or it is misleading. Status: TARGET.
- v1 KEK-less PIN auth UX (6-digit PinPad, PIN onboarding + returning-PIN unlock, Face-ID-to-decoy, Option A deterministic decoy fallback) — ✅ VERIFIED 2026-06-20 (returning-PIN unlock path). PinPad rendered on every protected-route navigate during this session; PIN 111111 accepted and vault decrypted correctly on each unlock. Autolock re-triggered and re-unlocked correctly multiple times. Real vault with real seed (bamboo… testnet seed) decrypted and real balances loaded. UX flow confirmed end-to-end. HONEST SCOPE: hardware-KEK is still missing (an 8-digit PIN over Argon2id remains offline-exhaustible on a seized device — the remaining gate is a **native hardware-KEK binding**, NOT an audit; both audits are done); Face-ID-to-decoy path not exercised (mobile only); decoy fallback not exercised (web only). These scopes stay PLANNED/TARGET pending that native hardware work + real-device verification. Testnet (`security/PinPad.jsx`, `pinOnboarding.js`, `pinRecovery.js`, `authModel.js`, `decoyFallback.js`, `deniabilityUnlock.js`, `mnemonic.js`; cohort marker `veyrnox-auth-model` with fail-fast on unknown model; 4th unconditional KDF slot + four-slot constant-work execution assertion `deniability-timing.test.js`). **Headline audit item:** a 6-digit PIN over Argon2id is exhaustible offline on a seized device in hours–days — the hardware-KEK fast-follow is what closes it; see `docs/superpowers/specs/2026-06-08-v1-pin-auth-ux-design.md` §6. Landed incrementally via the #138/#154/#156/#161 line, not a single PR. **CORRECTION (2026-06-23):** the "Option A deterministic decoy fallback" named above was **SUPERSEDED** by the v2 PIN duress model (commit `b4871b1`) — a wrong PIN now returns an explicit "Incorrect PIN" error, and `decoyFallback.js` / `deriveDeterministicDecoyMnemonic` is **dead code** (no live caller; see its SUPERSEDED header + `deniabilityUnlock.js`). Runtime UAT 2026-06-23 (web, 8-digit PIN) confirmed the live routing: real PIN → real wallet **even with a decoy configured**, duress PIN → $0 decoy, wrong PIN → "Incorrect PIN" error. (Also stale on this line: "6-digit PinPad" / "PIN 111111" — the PIN is now **8-digit app-wide**, commit `e00a20f`.)
- **Web onboarding — authModel cohort: PR #474 fix (2026-06-29), then a NEW regression + fix cycle (PRs #637 → #645 → #651, 2026-07-06).** Original fix (PR #474): `authModel='password'` was correctly persisted on web during onboarding; before that fix the cohort marker was not written, causing returning-web-password users to hit the PinPad unlock screen (wrong branch) and be locked out.
  - **Regression (PR #637, "unify to native 8-digit PIN"):** migrated the web UNLOCK screen to a numeric-only `PinPad`, but left vault CREATION on the old ≥12-char free-text password `Input` — a half-finished migration. Net effect: a returning web password-cohort user who created a real alphanumeric ≥12-char password (H-A minimum) was shown a numeric keypad on reload that could never accept their real credential — a **full lockout**, with the only escape being "Restore from seed phrase" (a full re-import). Repro: "Get Started → set password → Import an existing seed → reload."
  - **Immediate fix (PR #645, commit b3b87c8f4):** branched the `view === "unlock"` fallback on `authModel === "password"` (rendering the real password `Input`, mirroring the native branch) instead of `Capacitor.isNativePlatform()` — restoring both cohorts to working order. Added a unit regression test and tightened `e2e/onboarding.spec.js`'s reload assertion (previously it only asserted SOME PIN-labelled group rendered, never that unlock actually worked — the exact gap that let the bug regress silently) plus a dedicated import-seed-path regression test.
  - **Full unification (PR #651, commit d04562c88, "finish the #637/#645 migration"):** rather than maintaining two divergent cohorts indefinitely, this closes the whole bug CLASS: web now shares native's single PIN cohort end-to-end (create, confirm, unlock, recover) — `authModel` is always `'pin'` on fresh web onboarding, and Phase 2 creation runs through the same `createWalletFromPendingPin()` path as native. There is no separate web "password" cohort left to accidentally diverge from unlock again, consistent with "web is a testing-only surface, never production" (native is the real product). Regression coverage: `src/components/__tests__/WalletEntry.web-authmodel.test.jsx` (pins `authModel='pin'`, not `'password'`, persists on web pin-create; Phase 2 create calls `createWalletFromPendingPin`) and a rewritten `e2e/onboarding.spec.js` (`"onboarding-lockout regression: reload after IMPORTING a seed still unlocks with the same 8-digit PIN"`, asserting the credential surface is the SAME `PinPad` group post-reload and that no password field appears).
  - **Honest scope / residual note:** a legacy `authModel==='password'` code path still exists in `WalletEntry.jsx` (the "Forgot password? Restore from seed phrase" recovery link, reachable only from an already-existing pre-migration password-cohort vault) and its `view === "unlock"` fallback still renders a numeric-only `PinPad` with no `numericOnly={false}` override for that cohort — i.e. the SAME class of bug this whole cycle fixed would resurface if that legacy path were ever exercised. This is very likely dead/vestigial code today (no live path creates a NEW password-cohort vault post-#651, and web is testing-infra-only, never production), but it was not exercised or fixed in this pass — flagged for the owner to confirm it's genuinely unreachable or to delete/fix it. No key material or signing logic was touched by any PR in this history.
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
- RASP policy lane (`/rasp-security`, §8a, pre-audit-safe) — ✅ BUILT — UI-confirmed 2026-06-20: browser probe live — Detection=browser-active, environment=clean, wired-to-send=yes. Degradation ladder rendered, I4 honesty note present, "Independent audit: not yet" disclosed. OS-level probes remain gated on a **native Capacitor plugin + real-device verification** (roadmap Phase 4), NOT on an audit (both audits done; correctly disclosed). Formerly 🟡 BUILT / UNAUDITED-PROVISIONAL (`src/rasp/*`: `conditions.js`, `degrade.js`, `detect.js`, `index.js`, `browserProbe.js`; #166/#168/#170/#174/#175). Pure `condition→tier degrade` + on-device environment-probe composition, with an **I3 deniability guard** (functions of the environment only — no wallet-set handle, so no set-existence oracle) and **I4 fail-closed** (no native probe present → `INTEGRITY_UNAVAILABLE` → WARN/biometric re-confirm, NEVER a fabricated `CLEAN`). Surfaced read-only via the RASP dashboard + Security tile (#170). **Browser-level detection now active:** `navigator.webdriver` + legacy automation fingerprints (`callPhantom`, `_phantom`, `__selenium_unwrapped`, etc.) → `HOOKED`; normal browser → `CLEAN`. §7 live pre-sign wiring is **always-on** — `VITE_RASP_PRESIGN_GATE` flag removed; `detect(browserProbeSource) → degrade() → presignGate()` runs on every sign attempt. OS-level probes (root/jailbreak/tamper) require a native Capacitor plugin — gated on real-device verification (roadmap Phase 4), not on an audit. **Automated e2e proof — ✅ BUILT (PR #644, commit dc63c8ec9, merged 2026-07-06):** `e2e/rasp-automation-detection.spec.js` confirms Playwright's own `navigator.webdriver=true` (present by default in every CDP/WebDriver-based tool, so running the test itself IS the adversarial condition — no rooted/Frida device needed to exercise this leg) genuinely trips `detect(browserProbeSource) → CONDITION.HOOKED → degrade() → TIER.BLOCK`, and that `presignGate(TIER.BLOCK, ...)` returns `signerReachable=false` UNCONDITIONALLY — checked with both `acknowledged=false` and `acknowledged=true` (BLOCK, unlike WARN/CONFIRM, cannot be overridden by acknowledgement). **Honest scope:** this proves the BROWSER-LEVEL automation-detection leg fires against real automation, not a mock — it does NOT touch the native OS-level probes. F-09 (RASP not adversarially tested on rooted/Frida devices) remains fully OPEN, unchanged, Phase 4/native-device-gated. See §8c.
- RASP native detection / remote attestation — 📋 native + real-device gated (Phase 4), NOT buildable here. The on-device probe **source** (jailbreak/root/debugger/tamper via a Capacitor plugin) and the remote-attestation leg (2b — Play Integrity / App Attest) are unbuilt; real-device verification is roadmap Phase 4. Until then detection stays unverified and the dashboard reads `pending` (`RaspSecurity.jsx`).
- Audit log (opt-in, deniability-safe) — ✅ BUILT — UI-confirmed 2026-06-20: write→read cycle confirmed (enabled toggle → settings_changed entry appeared, {type, ts} only). Primary-session wiring landed PRE-AUDIT by explicit owner override (2026-06-16), **SURFACED at `/audit-log`**. OFF by default; entries stored as a single AES-GCM blob in the shared vault store under a neutral key, byte-shaped like every other vault blob (not a forensic tell) and destroyed by panic wipe. Hard in-code denylist refuses duress/stealth/hidden/panic/decoy/seed events; logs only benign `{type, ts}`. **Keying blocker resolved:** the log is now keyed off an HKDF of the primary mnemonic (`deriveAuditSecret`) via the pure `auditSecretForSession` gate (records in the PRIMARY session only — decoy/hidden hard-off), so WalletProvider no longer needs the password it deliberately doesn't retain. **Wired** (via the provider's gated `recordAudit(type)`, the single approved importer) into `send_completed` (SendCrypto), `approval_revoked` (TokenApprovals, real revoke only), and `settings_changed` (session / biometric / 2FA / theme). `approval_granted` was REMOVED from the allowlist — granting is HONEST-DISABLED (approve() is never exposed), so the log declares no event it cannot produce. **Override is documented, not an audit sign-off** (see the "Owner override" addendum in `docs/audit-log-login-activity-deniability-decision.md`). **UI surfaced:** `src/pages/AuditLog.jsx` at `/audit-log` — enable/disable toggle, entries table (newest first), clear button, scope notes. `featureCatalogue.test.js` guard updated to verify Audit Log IS surfaced with at-least `built` status. `audit-log-honest-disabled.test.js` guard narrowed to permit the one approved wirer; enforces `/audit-log` is in App.jsx and uses `AuditLog` (not `AuditLogPage`). D1–D7 multi-set storage shape (decoy/hidden own-logs) remains not built — the real-vs-decoy distinguisher hazard the auditor was to review is **not** introduced. No on-chain artifact → not "verified".
- Risk / spend limits — ✅ (PR #75; per-tx + daily caps, warn-with-acknowledgement). Risk *scoring* is now a distinct S2 build — the composite pre-sign risk verdict + RISK gate (#137; see S2) aggregates the signal heuristics into one authoritative gate.
- Encrypted cloud backup (ciphertext only) — ✅ LOCAL encrypt-then-export/import **BUILT · shipping-approved (internal audit 2026-07-05, sufficient for mainnet)**; `CloudBackup.jsx` + `src/wallet-core/vaultBackup.js`: the vault is sealed under password + PIN seals via the live Argon2id+AES-GCM vault primitive, round-trip-verified before download, and restored by local decrypt. No cloud transport — the user stores the ciphertext file in their own cloud. The BACKEND-ESCROW variant remains 📋 **backend + audit gated and not built** (no cloud target — backend was removed — and key-handling is the catastrophic surface; the audits did not green-light an unbuilt escrow design).
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
- Test-suite determinism (Argon2id WASM-heap OOM under parallel vitest) — ✅ fixed (PR #73); suite pinned to a single worker so the Argon2id KDF (192 MiB as of 2026-07-05, commit `d0522bfb`; was 64 MiB 2026-06-28–2026-07-05 per commit `1226085e`, and 192 MiB before that) can't exhaust the heap. Deterministic but slower. A test-only low-memory KDF override was scoped (2026-07-02) and **decided WON'T-DO (owner, 2026-07-02):** the only remaining gap is in `vault.js` (the seed-encryption KDF — `encryptVault`/`deriveKekC`), and adding a weaker-params escape hatch to that crypto-boundary file purely for test speed is not worth the risk (CLAUDE.md: seed/key files off-limits to cosmetic work). The suite already copes via the single-worker pin + raised timeouts, and `credentialVerifier.js` already carries the one injectable test-param hook that was safe to add. Revisit only if a real-device/CI time budget forces it, and then only behind a `VITE_RELEASE` build-time throw.

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

## 8b. Re-applied orphaned-branch fixes — ✅ all merged 2026-07-05 (PRs #613–#616)

Six stale remote branches carried fixes that never reached `main`. On 2026-07-05 each was
re-validated against current main, re-applied via strict TDD (failing test first, RED
confirmed pre-fix) onto fresh branches, reviewed by the honest-reviewer (all LAND-READY),
CI-verified (full ~2300-test suite per branch), and squash-merged. The six source branches
were then deleted from origin. All four were **BUILT / unit-tested only — NOT
device-verified, NOT independently audited; no on-chain txid is involved** at merge time.
**2026-07-06 update:** PR #613's duress-presence Face-ID-to-decoy guard is now
device-verified on a Pixel 10 Pro XL (see §6); its vault-desync screen half, and #614–#616
in full, remain NOT device-verified. Per-item detail
(with full source-file/test references) lives in §6 (PRs #613, #614, #615) and §11 (PR
#616); this table is the changelog index.

| PR | Merge commit | Finding / fix | Section |
|---|---|---|---|
| #613 | `5a6aab70` | Duress-aware biometric PIN-cache guard (`shouldAutoCacheTypedPin()`) + honest vault-desync screen (replaces a silent `clearVault()` — I4) | §6 |
| #614 | `c2012713` | Hides `refetch()`-triggered price/news buttons in decoy/hidden sessions (I3 gap `enabled` alone didn't cover) | §6 |
| #615 | `956234c1` | Wallet-count-tell fix in `WalletPortfolioPage.jsx`; third clipboard-wipe trigger (`APP_LOCK_EVENT`) in `copySecret.js`; new CI gate `check:deniability-strings` | §6 |
| #616 | `60b47846`, `2926cdbd` | `cryptoCompare.js` routes native fetches through `CapacitorHttp` (Android CORS bypass); removes "open tax report" voice command | §11 |

**Branch/housekeeping record:** six stale source branches deleted from origin after content
disposition — `fix/faceid-2fa-pinfirst-and-settings`, `claude/adoring-hodgkin-870093`,
`fix/i3-egress-deniability-gaps`, `claude/zen-pare-ba957b` (its second commit `481be5dd`
"enable WebAuthn on Capacitor" was intentionally dropped as superseded by the 2026-07-05
biometric session — native passkey WebAuthn remains honest-disabled by design),
`fix/cors-price-data-voice-commands`, `fix/cryptosigning-clipboard-2026-06-26` (both of
its commits were already on main).

---

## 8c. Automated e2e verification pass — app-layer only, NOT hardware — merged 2026-07-06 (PR #644, commit dc63c8ec9)

Four new Playwright specs landed under `e2e/`, each closing an app-layer (non-hardware)
"unit-tested / NOT device-verified" evidentiary gap recorded elsewhere in this file. None
require human interaction to run. **None touch or claim Secure Enclave / StrongBox
hardware-KEK verification** — that remains gated on a real device, unchanged. **None flip
any asset to "verified"** in the strict on-chain-txid sense — no txid is involved in any
of the four.

| Spec | Proves | Honest scope | Detail |
|---|---|---|---|
| `e2e/duress-decoy-routing.spec.js` | Real password → real wallet; Emergency PIN → a DIFFERENT decoy wallet; wrong password → an explicit error, never a silent third decoy. Drives `DuressPin.jsx`'s own DEMO-gated "Live demonstration" panel, which calls the REAL wallet-core `createWallet()` (not the fake demo API) against a fresh throwaway mnemonic each run. | App-layer routing logic only — real crypto, real IndexedDB. NOT a hardware-KEK / Secure Enclave verification. | §6 (Duress PIN) |
| `e2e/i3-deniability-egress.spec.js` | Network-captures a decoy session and confirms zero requests reach the three gated third-party hosts (cointelegraph.com, decrypt.co, api.rss2json.com). | Confirms "decoy = 0" solidly. Does NOT confirm the full "real > 0, decoy = 0" contrast: `CryptoNewsFeed.jsx` gates its fetch on `!DEMO` (not just `!isDecoy`), and this harness must run under demo mode, so the real-session baseline in this harness also observes 0 egress for a reason unrelated to the gate under test. | §6 (I3 egress) |
| `e2e/rasp-automation-detection.spec.js` | Playwright's own `navigator.webdriver=true` genuinely trips `detect(browserProbeSource) → CONDITION.HOOKED → degrade() → TIER.BLOCK`, and `presignGate(TIER.BLOCK, ...)` returns `signerReachable=false` UNCONDITIONALLY (both `acknowledged=false` and `acknowledged=true`). | Proves the BROWSER-LEVEL automation-detection leg fires against real automation. Does NOT touch native OS-level RASP probes — F-09 (rooted/Frida-device detection) remains fully OPEN, Phase 4/native-device-gated. | §7 (RASP policy lane) |
| `e2e/passkey-clone-replay.spec.js` | Two CDP virtual WebAuthn authenticators (one `internal`/platform, one `usb`/roaming carrying a cloned credential with a rolled-back `signCount`) prove `src/lib/passkey.js`'s M-K cloned-authenticator detection (`PasskeyClonedError`, `getPasskeySignCount`/`setPasskeySignCount`, `isPasskeyClonedError`) genuinely rejects the replay and does NOT advance the persisted signCount on the rejected attempt. | Real crypto + real CDP-level WebAuthn clone/replay — NOT a physical second hardware authenticator. Closes M-K's software-clone evidentiary gap; a literal hardware clone attempt remains undone. | §4, residual table M-K row |

Also added (same commit): `scripts/ios-sim-duress-faceid.sh` — a PARTIALLY-scripted iOS
Simulator harness for Face-ID-to-decoy APP-LAYER routing (build/install/simulator-Face-ID-
enroll/match steps are scripted via idb+simctl+osascript). NOT fully hands-off: WKWebView
UI tap coordinates need a one-time manual fill-in per UI version (no bridged accessibility
tree for `idb` to target by label — screenshot-and-hardcode, same pattern as this repo's
other UAT tooling). It explicitly CANNOT and does not claim to touch Secure Enclave /
hardware-KEK verification — the Simulator has no real SE, so this only ever proves
app-layer routing logic, never the hardware claim. **Does NOT close iOS-F9, H-2/iOS-F11,
iOS-F5, or iOS-F3** — all remain device-unverified (see the residual table, §4-adjacent).
Note: iOS-F5's residual row is now a MERGED *partial* heap-zeroing mitigation (native buffer
zeroed; base64/JS bridge residue architecturally unzeroable) with the device leaks-check still
outstanding — no longer an untouched OPEN item; iOS-F3 remains code-complete.

**Honest framing (all four specs + the iOS script):** real crypto + real browser-automation
detection + real CDP-level WebAuthn behavior, zero human interaction required to run them.
They do not touch or claim Secure Enclave / StrongBox hardware-KEK verification. They do
not flip any asset to "verified" in the strict on-chain-txid sense.

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
- Android native (Capacitor) — 🟡 runs on real devices (StrongBox KEK unlock and in-app
  Sepolia sends device-verified on Pixel 10 Pro XL, 2026-07-01/02 — see §4); Play Store
  submission not started
  - **CryptoCompare price fetch CORS bypass — ✅ BUILT (PR #616, merge commits `60b47846` +
    `2926cdbd`, merged 2026-07-05; re-applied from a stale orphaned branch via strict TDD +
    honest review + CI).** `src/lib/cryptoCompare.js` `getJson()` now routes native fetches
    through `CapacitorHttp` (same pattern already used by `coinGecko.js` / `sol/provider.js`)
    to bypass Android WebView CORS restrictions; the web path still uses plain `fetch()`,
    unchanged. Fails honest on any non-2xx response. Same commit range also removes the
    "open tax report" voice command from `VoiceContext.jsx` (owner-requested, tied to the
    `/tax` page removal). **BUILT / unit-tested only — the CORS-bypass premise is only
    provable on a real Android device and is NOT device-verified**, NOT independently
    audited, no on-chain txid involved.
- Android E2E test infrastructure — ✅ BUILT (INTERNAL CI evidence, UI E2E only — no
  on-chain claims). Appium (UiAutomator2 + WebdriverIO) suite in `tests/android/`;
  GitHub Actions emulator workflow per push; BrowserStack App Automate real-device
  workflow added in PR #571 (2026-07-05) — committed `wdio.browserstack.conf.js`
  targeting `hub-cloud.browserstack.com`, credential pre-check, Node 22/Java 21;
  green run on a real BrowserStack Pixel 10 Pro XL (7/7 spec files, 52 tests).
  Attended-only `hardware-kek.spec.js` is excluded from unattended cloud runs
  (covered by `hardware-kek-e2e.spec.js`). Requires `BROWSERSTACK_USERNAME` /
  `BROWSERSTACK_ACCESS_KEY` repo secrets; docs-only pushes skip the device run.
  This is CI infrastructure, not a catalogue status change — no asset is promoted by it.
- iOS E2E test infrastructure — 🟡 BUILT (SCAFFOLD ONLY — never device-run; no CI
  evidence, no on-chain claims). Appium (XCUITest + WebdriverIO) suite in `tests/ios/`
  added in PR #653 (2026-07-06), mirroring the Android suite structure: `helpers/`
  (`appHelper.js`, `walletHelper.js`), a local Mac + real-iPhone runner `wdio.conf.js`
  (`IOS_UDID` / `IOS_TEAM_ID`; the iOS Simulator is rejected — no Secure Enclave), the
  pre-existing `wdio.browserstack.conf.js` (bundle id now env-configurable), and four
  specs mapped to the open iOS gates in `docs/hardware-audit-handoff.md`:
  `vault.spec.js` (create/unlock/persistence, ≥12-char min H-A); `send.spec.js` (drives
  the still-missing iOS in-app send txid — real send gated behind `SUPERVISED_SEND=1`,
  hard-fails if demo mode is on); `hardware-kek-e2e.spec.js` (iOS-F9 SE-unlock `os_log`
  trace + PARTIAL→full promotion, prints the Mac-side `log stream` command, plus a
  SE-factor/vault-blob leak canary — the iOS analogue of the Android LOG-1 canary);
  `biometric-reenroll-e2e.spec.js` (H-2/iOS-F11 Face ID re-enroll invalidation —
  fail-closed + PIN recovery asserted, gated on `REENROLL_DONE=1`, needs an unrestricted
  iPhone). npm scripts `ios:test[:vault|send|hardware-kek|biometric-reenroll]`. **Honest
  scope:** this is a SCAFFOLD — it has NEVER been executed on a device (iOS automation
  needs macOS + Xcode + a real iPhone, unavailable on the Windows dev machine), so it
  closes NO iOS gate and promotes NO status. The specs deliberately assert around what
  automation cannot do (native Face ID sheet, iOS-Settings re-enroll, `os_log` capture on
  iOS 26 where NSLog is not Appium-streamable) rather than faking evidence; iOS-F5 / iOS-F3
  (native ObjC compile/heap items) are out of WDIO scope and are noted, not stubbed.
  Nothing here is "verified." Not independently audited.
- Mobile App PWA / Mobile Widget — ❌ removed (PR #48)

## 12. WalletConnect / dApp connector

WalletConnect / dApp connector — ✅ BUILT (post-audit, 2026-06-27) — **SHIPPING-APPROVED (internal audit 2026-07-05, sufficient for mainnet)**. WC v2 pairing, session management, and the full signing surface are live. All signing handlers have been through a dedicated security hardening sweep (§8a); the surface is substantially more locked-down than when it was first shipped. Specific controls wired:

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
  **Scope addition (2026-07-06, decision on issue #611):** the vault cipher path
  (Argon2id → AES-256-GCM) is IN SCOPE for this audit. A standalone external
  crypto engagement (~$15K–25K) was DECLINED with written rationale — the claimed
  "XChaCha20-Poly1305 design spec divergence" was an unsupported premise (no such
  spec exists; see `docs/crypto-implementation-verification.md`), and migration
  would break iOS SE compatibility (`docs/cipher-migration-analysis.md`). Residual
  items carried into this audit's scope: ECC L-4 (KDF params not in GCM AAD), A-2
  (pre-M3 KDF-param timing oracle), JS-string heap zeroization, short-PIN offline
  resistance, per-enrollment salt distinctness. Full record:
  `docs/audit-triage/vault-cipher-decision-2026-07-06.md`.
- Legal entity + Track-B legal review (Guardian tier wording, etc.).
- Hands-on testnet send verifications for every `receive_only` asset
  (EVM chains, USDC/USDT, BTC, SOL) before any flips to `live`.

## Open / residual items — device-gated

### From the 2026-06-28 internal static-analysis pass

These items were surfaced by the 2026-06-28 internal static-analysis pass and cannot be
addressed in the JS/web environment. They are consistent with existing M2c/M2d and Phase 4
RASP gates. None affect ALLOW_MAINNET.

| ID | Area | Description | Gate |
|---|---|---|---|
| H-NEW-D | iOS + Android native / KEK | **CLOSED (native-layer SE ECIES confirmed)** — 2026-07-01 INTERNAL static-analysis pass confirmed `kSecAttrTokenIDSecureEnclave` is present in `HardwareKekPlugin.m:78`. The SE ECIES design is correctly implemented at the native ObjC layer. iOS device-verified status remains BUILT/device-verified (PARTIAL): two Sepolia sends confirmed on-chain from KEK-enrolled vault (PR #495), but the live SE-unlock log trace tied to those sends was not captured (iOS-F9, below). Android is BUILT/end-to-end device-verified on the StrongBox-gated unlock FLOW (Pixel 10 Pro XL, PRs #497 #499) with a KEK-gated Sepolia send confirmed on-chain (txid `0x9d9ff549…`, block 11180398) and its biometric re-enrollment invalidation test PASSED (PR #516/#518). Outstanding: biometric re-enrollment invalidation test on iOS only (device-blocked); iOS SE-unlock log trace tied to a send (iOS-F9 — iOS has txids but no observed SE-unlock line); independent audit. Android additionally: C-1 CRITICAL (HMAC fixed input) — recorded RESOLVED / device-verified 2026-07-02 (PR #529), REGRESSED 2026-07-05 (per-enrollment `kekSalt` binding cryptographically unconfirmed on-device — facade arg-drop + bridge JSON.stringify silently reverted enroll+unlock to the fixed v1 salt), then **FIXED / device-verified 2026-07-05 (v3, PR #568)** the same day — see the C-1 row below and `docs/audit-2026-07-01-kek-internal.md` for the full history. H-1 (StrongBox tier surfacing) FIXED PR #527. | H-NEW-D native-layer gap CLOSED; remaining gates: iOS SE-unlock log trace (iOS-F9) + biometric re-enrollment test (iOS only — Android PASSED PR #516/#518) + independent audit. Android KEK-gated unlock-FLOW on-chain txid DONE (`0x9d9ff549…`); Android C-1 salt-binding FIXED / device-verified 2026-07-05 (v3, PR #568, txid `0xecd68494…` block 11206686) with salt-tamper/migration/distinctness/audit items still open (see C-1 row) |
| F-01 / F-02 | Mobile / biometric | Biometric cache not OS-ACL bound (M2c/M2d plan) — app-layer gate, not hardware-enforced ACL. H-2/iOS-F11 (below) is the specific finding from the 2026-07-01 pass; F-01/F-02 remain the broader M2c/M2d plan items. | Native plugin + real device required |
| F-09 | RASP | RASP not adversarially tested on rooted/Frida devices — OS-level probes unverified on live targets | Phase 4 — native RASP OS-level probes + real rooted/Frida device |
| M-K | Web-App / passkey | **BUILT (2026-06-30)**: WebAuthn signCount persistence + cloned authenticator detection. Extracts signCount from assertion response, compares to stored value, rejects replays (signCount must increase). Stored in localStorage (best-effort, no backend). Tests passing ✓. **e2e-proven 2026-07-06 (PR #644):** `e2e/passkey-clone-replay.spec.js` drives `src/lib/passkey.js` directly via two Chrome DevTools Protocol virtual WebAuthn authenticators — one registers and asserts legitimately (signCount persisted), its credential is then exported and imported onto a second authenticator with signCount rolled back to 0 (a cloned/exported soft authenticator), the first is removed, and the clone's assertion attempt is confirmed to throw `PasskeyClonedError` AND leave the persisted signCount unchanged (fail-closed, I4). This is real crypto + a real CDP-level WebAuthn clone/replay — not a mock. | e2e CDP software-clone/replay test DONE (2026-07-06, PR #644). **Still outstanding:** a literal physical second hardware authenticator clone attempt has not been performed — this closes the "unit-tested only" gap, not a hardware-device-verification bar. |

### From the 2026-07-01 INTERNAL static-analysis pass (Hardware KEK focus)

> ⚠️ INTERNAL PASS — NOT an independent audit. See `docs/audit-2026-07-01-kek-internal.md`
> for the full report. 1C / 9H / 12M / 6L findings total; 10 remediable items fixed in PRs #520–#522.
> ALLOW_MAINNET unchanged. Gate conditions (§4 of `kek-acl-rasp-status-gate-2026-06-22.md`) unchanged.

| ID | Severity | Area | Description | Status |
|---|---|---|---|---|
| C-1 | CRITICAL | Android | **HMAC input is global fixed constant.** All enrolled Android vaults derive the same hardware factor H from the same HMAC input string. A vault encrypted on one device can be decrypted on another if the StrongBox key is extracted. Requires per-enrollment `kekSalt` binding — a protocol-breaking v2 migration. **Recorded RESOLVED / device-verified 2026-07-02 (at the time):** PR #529 merged (commit 732f9676). `native.js` generates `kekSalt` before `getHardwareFactor`, passes `{ kekSalt }` to it, stamps `hardwareKekVersion: 2` on vault blob; Kotlin plugin patched. 4/4 C-1 contract tests + 172/172 keystore tests pass. On-device: v2 re-enroll → cold restart → StrongBox-gated unlock → Sepolia send confirmed on-chain — txid `0xeb71a5d31a8794682cf681d8ebb2916967c1097e951519dcf1b53327d2d8e580`, block 11185289, Pixel 10 Pro XL (Android 16/API 36). Vault read confirmed `hardwareKekVersion:2`, `kekSaltLength:44`, `hardwareKekTier:"STRONGBOX"`. **REGRESSED 2026-07-05:** a follow-up OODA investigation found this fix is cryptographically inert on-device. Bug A (runtime-confirmed via logcat on the same Pixel 10 Pro XL: `getHardwareFactor` called with `{}` on a v2 vault) — `src/wallet-core/keystore/index.js:94-96 getHardwareFactor()` drops all arguments, so unlock never forwards `kekSalt` to the plugin. Bug B (static analysis, high confidence, device confirmation pending) — `src/wallet-core/keystore/hardware.js:195` passes `kekSalt` as a raw `Uint8Array`; the Capacitor Android bridge `JSON.stringify`s plugin options, so Kotlin's `call.getString("kekSalt")` reads `null` and silently falls back to the fixed v1 `PRF_EVAL_SALT` — enrollment therefore also used the fixed salt while stamping `hardwareKekVersion:2`. Net: the `0xeb71a5d…` txid proved the KEK-gated unlock FLOW, not salt binding (enroll and unlock matched because both silently used the fixed salt). All enrolled Android vaults still derived H from the same global HMAC input — the original C-1 CRITICAL condition was unresolved at that point. **FIXED / device-verified 2026-07-05, later the same day (v3, PR #568):** facade argument forwarding closes Bug A; `hardware.js` base64-encodes `kekSalt` to a STRING before the bridge call, closing Bug B; Kotlin plugin fails closed on a malformed/absent salt (no silent v1 fallback); vault stamps `hardwareKekVersion:3` for genuinely salt-bound wraps, with a lazy brickless v2→v3 upgrade for previously (falsely) v2-stamped vaults. 11 migration unit tests added. On-device (Pixel 10 Pro XL, `com.veyrnox.app.debug`): fresh v3 enrollment 07:19:35, `getHardwareFactor` bridge call carried `kekSalt` as an intact 44-char base64 STRING (previously `{}`) logging `"salt-source: v2-bound"`; cold restart (07:37:46) + unlock (07:40:00-03) repeated the same result with the SAME stored salt — closes the Android unlock-path app-trace evidence gap; KEK-gated Sepolia send from this vault, txid `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3`, block 11206686, status SUCCESS, independently re-confirmed via RPC receipt. Still outstanding: salt-tamper negative test (not feasible non-invasively — encrypted SecureStorage), v2→v3 lazy migration not device-exercised (unit-tested only, 11 tests), per-enrollment salt distinctness on device (unit-proven, one enrollment observed), independent audit. Android-only fix — iOS uses ECIES (not HMAC); iOS kekSalt binding is a separate design and remains unverified. INTERNAL — not independently audited. See the dated annotations (regression, then resolution) in `docs/audit-2026-07-01-kek-internal.md`. **New finding from this session — LOG-1 (HIGH, debug/CI context):** Capacitor's debug bridge logger echoes every native plugin result to logcat in DEBUG builds, captured on-device: hardware KEK factor H in cleartext base64 and the full encrypted vault blob. Debug builds only; production default silent but unverified for release config. Remediation BUILT in PR #572 — see the LOG-1 section below. | ✅ FIXED / device-verified (v3, 2026-07-05, PR #568) — Sepolia txid `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3` block 11206686, following a same-day regression-then-fix cycle (previously REGRESSED / binding-unconfirmed earlier 2026-07-05; before that, RESOLVED / device-verified 2026-07-02 on PR #529 + txid `0xeb71a5d…` block 11185289, which proved the unlock FLOW only, not salt binding). Remaining: salt-tamper negative test, v2→v3 migration device-exercise, multi-enrollment salt distinctness, iOS equivalent (separate design, unverified), independent audit. New finding LOG-1 (debug logcat leaks H + vault blob): remediation BUILT in PR #572 (release spot-check pending) — see LOG-1 section. |
| iOS-F5 | HIGH | iOS | H factor in `NSData` not zeroed post-decryption in `HardwareKekPlugin.m`; requires `NSMutableData` patch. | 🟡 PARTIAL mitigation — MERGED (PR #526, commit `34289591f`; follow-up #531 removed a UB memset). The native `NSMutableData` H buffer IS zeroed (`resetBytesInRange`, `HardwareKekPlugin.m:294`). **HONEST SCOPE (source review 2026-07-02, PR #652):** H is first base64-encoded into `hB64`, an immutable `NSString` handed to the Capacitor bridge and copied into the JS-side string — both architecturally unzeroable, so a base64 form of H persists until GC/overwrite. This is inherent to the bridge (best-effort native wipe only), NOT a code defect → residual severity LOW–MEDIUM (scope-honesty note, not an open code defect). Do NOT document as "H fully zeroed from the heap". Still NOT compiled / device-verified on a Mac: the heap-dump `leaks`/Instruments check is outstanding and should expect the base64 residue (verify only that the raw `NSMutableData` plaintext buffer is gone). Acceptance criteria: Section A of `docs/hardware-audit-handoff.md`. |
| iOS-F9 | HIGH (evidence gap) | iOS | SE ECIES path unconfirmed for the two existing Sepolia sends — no unlock log trace captured. Proof basis is architectural; iOS device-verified status remains PARTIAL. | OPEN — capture SE-unlock log trace on next KEK-gated send. Test harness ready (does NOT close the gap): `tests/ios/specs/hardware-kek-e2e.spec.js` (PR #653) drives a `SUPERVISED_SEND=1` KEK-gated send and prints the exact Mac-side `log stream` command to capture the `getHardwareFactor` `os_log` line — pending a Mac + real-iPhone run (needs an `os_log(public)` debug build; iOS-26 NSLog is not Appium-streamable). |
| H-1 | HIGH | Android | StrongBox tier not surfaced to user; TEE/software fallback is silent. UI badge does not distinguish StrongBox vs TEE-backed. **FIXED in PR #527 (merged 2026-07-02):** `tierBadge.js` maps `securityLevelName` → badge label/variant; `HardwareKekSettings.jsx` reads real tier from `getVaultKekTier()` and renders the correct badge (StrongBox Protected / TEE Protected / Hardware Protection ON / WebAuthn Protected); `native.js` `enrollKek` stores `hardwareKekTier` in vault blob and exposes `getVaultKekTier()` accessor. | ✅ FIXED — PR #527 (merged 2026-07-02) |
| H-2 / iOS-F11 | HIGH | Android + iOS | Biometric factor not bound to enrollment set. **Android: RESOLVED / device-verified** — `setInvalidatedByBiometricEnrollment(true)` ([HardwareKekPlugin.kt:199](../android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt)) confirmed working on Pixel 10 Pro XL 2026-07-01 (PR #516/#518): re-enroll → `KeyPermanentlyInvalidatedException` → fail-closed → PIN recovery. **iOS: DEFERRED (device-blocked)** — `kSecAccessControlBiometryCurrentSet` is correctly set on the SE key ACL ([HardwareKekPlugin.m:96](../ios/App/App/HardwareKekPlugin.m)) but the runtime re-enroll test could not be run (test iPhone 17 Pro Max has Face ID enrollment restricted); needs an unrestricted iPhone. Note: the separate `biometricUnlock.js` PIN cache remains H-NEW-5 (plugin cannot set the ACL) — honest-disabled. | Android ✅ device-verified (PR #516/#518). iOS OPEN — re-enroll test on an unrestricted iPhone (flag set in code) |
| iOS-F3 | MEDIUM | iOS | `kSecUseOperationPrompt` deprecated; requires `LAContext` + `kSecUseAuthenticationContext`. | 🟡 Code-complete (PR #526, 2026-07-01) — ObjC text edit exists; NOT compiled or device-verified. Blocked on Mac + Xcode + iOS SE build. Acceptance criteria: Section A of `docs/hardware-audit-handoff.md`. Status remains OPEN as a verification item. |
| H-3 | HIGH | Android | `biometryLockout` → `allowDeviceCredential` fallback. Accepted as H16 deviation — documented in code and audit record. | ACCEPTED / documented deviation (I4 honesty) |

**Fixed in PRs #520–#522 (2026-07-01):** F-01 (PRF orphan credential guard), F-02 (`KEK_ALREADY_ENROLLED` guard), F-03 (PRF salt renamed `prf-kek-v1`), F-05 (credential ID committed after PRF confirmed), F-06 (H zeroing in `changePassword` finally), F-08 (`unwrapDek` zeros ptBuf), H-4 (zero-vector H check in `hardware.js` + `combineKek`), iOS-F6 (JS-layer `HARDWARE_KEK_ALREADY_ENROLLED` guard), M-3 (`detectTamper` `getOrElse { true }` fail-closed).

**Fixed post-audit (2026-07-02):** H-1 — `tierBadge.js` + `HardwareKekSettings.jsx` + `getVaultKekTier()` in `native.js` (PR #527, merged). C-1 — v2 protocol migration code-complete in PR #529 (merged 2026-07-02, commit 732f9676); recorded device-verified 2026-07-02 on Pixel 10 Pro XL: v2 re-enroll → cold restart → StrongBox-gated unlock → Sepolia send txid `0xeb71a5d31a8794682cf681d8ebb2916967c1097e951519dcf1b53327d2d8e580`, block 11185289; vault `hardwareKekVersion:2`, `kekSaltLength:44` confirmed. **REGRESSED 2026-07-05:** the salt-binding claim above did not hold — see the C-1 row above and `docs/audit-2026-07-01-kek-internal.md` for the full annotation; the unlock FLOW remained device-verified, the salt-binding claim did not.

**Fixed post-regression (2026-07-05, same day):** C-1 v3 fix — PR #568 merged. Facade arg forwarding + base64 salt over the bridge + Kotlin fail-closed on malformed salt + `hardwareKekVersion:3` with a lazy brickless v2→v3 upgrade path; 11 migration unit tests added. Device-verified on Pixel 10 Pro XL: fresh v3 enrollment, cold-restart unlock, and KEK-gated Sepolia send (txid `0xecd68494e888af742e5166c93c5354536fb6bbe62e93dc795847079d981727e3`, block 11206686) all logged `"salt-source: v2-bound"` only when the intact salt crossed the bridge. **Status: C-1 FIXED / device-verified (v3 fresh-enroll path, end-to-end incl. on-chain txid, 2026-07-05).** Still outstanding: salt-tamper negative test, v2→v3 migration device-exercise, on-device multi-enrollment salt distinctness, independent audit — see the C-1 row above and the dated resolution annotation in `docs/audit-2026-07-01-kek-internal.md`. New finding LOG-1 (debug-build logcat leaks H + vault blob in cleartext) also surfaced this session — remediation BUILT in PR #572; see the LOG-1 section below. INTERNAL — not independently audited.

**Positive confirmations:** H-NEW-D CLOSED (SE ECIES confirmed); `kSecAccessControlBiometryCurrentSet` correctly set on iOS SE key ACL; `combineKek` HKDF construction sound; `android:allowBackup="false"` correct; ATS enforced on iOS.

### LOG-1 (2026-07-05) — Capacitor debug bridge logger leaked KEK factor H + vault blob to logcat (DEBUG builds)

> Canonical record for the finding referenced as **LOG-1** elsewhere in this file (first
> captured independently by two sessions on 2026-07-05; remediation shipped in PR #572).

> Device evidence 2026-07-05 (Pixel debug build): Capacitor's bridge echo logger
> (`createLogFromNative` in `native-bridge.js`) prints every native plugin result to the
> WebView console, which Android relays to logcat. Captured in cleartext, adb-accessible:
> (1) `HardwareKek.getHardwareFactor` → `{"h":"<32-byte base64>"}` — the hardware KEK
> factor H; (2) the full encrypted vault blob from `SecureStorage.get`. The Appium CI
> pipeline additionally persisted device logcat into GitHub artifacts (30-day retention).
> Impact: undermines the offline-seizure story for any DEBUG build (H + wrapped vault in
> logs collapses the hardware factor to the PIN factor alone). Release builds NOT affected
> (see below). INTERNAL finding — not independently audited.

| Item | Status |
|---|---|
| **Release builds emit no bridge logs** | ✅ Code-verified / 🟡 device spot-check PENDING. Chain: `capacitor.config.ts` had no `loggingBehavior` → Capacitor default `'debug'` → `CapConfig.java` maps it to `loggingEnabled = isDebug`; our release build sets `debuggable false` (`android/app/build.gradle`) → `JSExport.getGlobalJS` injects `isLoggingEnabled: false` → `native-bridge.js` `returnResult` skips `logFromNative`, and `BridgeWebChromeClient.onConsoleMessage` relays through `Logger`, gated by the same flag. Now made EXPLICIT: `loggingBehavior: 'debug'` pinned in `capacitor.config.ts` with a guard test that also fails if anyone flips it to `'production'` (which would enable bridge logs on release). **Spot-check note (owner action, not yet run):** install a release-signed build, enroll KEK, unlock, run `adb logcat -d \| grep -E '"h":\|Capacitor/Console'` — expect zero matches. Until that runs on-device, release silence is code-verified only, per verify-don't-assert. |
| **Debug-build leak closed at source** | ✅ BUILT. `patches/@capacitor+android+8.4.1.patch` + `patches/@capacitor+ios+8.4.1.patch` (patch-package, applied on `postinstall`) redact `HardwareKek` and `SecureStorage` payloads inside the bridge echo logger — both directions (`createLogFromNative` results AND `createLogToNative` call options, since `SecureStorage.set` carries the blob too). Call metadata (pluginId, methodName, callbackId, success) still logs, so debug remains debuggable. Only the LOGGER is patched; the bridge still carries H by design and callers receive full results. Same patch-package caveat as the secure-storage `.commit()` patch: needs a clean plugin recompile (Gradle caches the module output; the stale `node_modules/@capacitor/android/capacitor/build/` dir was deleted to force it). Guard test: `src/__tests__/bridge-log-redaction.test.js` (fails if the patch disappears, stops covering either plugin/direction, or Capacitor is upgraded without regenerating it — patch-package postinstall also fails hard on version mismatch). |
| **CI artifact exposure** | ✅ Scrub layer added to `.github/workflows/android-e2e-emulator.yml`: redacts any JSON `"h":"<base64>"` value across all collected files (payloads also transit `appium.log` via WebDriver `getLog` responses) and drops ALL `Capacitor/Console` lines from the uploaded `logcat.log` (bridge payload lines carry no plugin name — Capacitor's `isValidMsg` strips the header line — so name-based filtering cannot catch them). Retention reduced 30 → 7 days. Purpose-built native evidence lines (tag `HardwareKek`, `salt-source: …`) are not Console-tagged and are preserved. **Existing GitHub artifacts purged 2026-07-05 (owner-authorized):** the single remaining log-bearing artifact (`android-e2e-results-api31`, run 28734031084, unscrubbed branch) was deleted; older ones had already expired. Deletion does not un-disclose — treat any H from debug-build enrollments as burned. **⚠️ NEW surface — BrowserStack App Automate (PR #571, `android-real-device-ci.yml`):** BrowserStack stores device logcat/Appium logs/video SERVER-SIDE for every session. Any debug APK built WITHOUT the PR #572 bridge patch leaks H into BrowserStack's retained session logs (third-party custody). Owner actions: review/delete existing BrowserStack session logs from pre-patch runs, and ensure all future BrowserStack runs use an APK built after PR #572 (the patch applies at `npm ci` postinstall, so any fresh build includes it). |
| **Evidence trade-off (C-1 v3)** | The C-1 v3 device evidence included the JS-side bridge trace showing `getHardwareFactor` called with an intact `{"kekSalt":"<44-char base64>"}` (Bug-B confirmation). Post-PR #572 that bridge-echo line is REDACTED on sensitive plugins by design. The Kotlin-side `Log.d("HardwareKek", "salt-source: …")` attestation — which is the operative salt-binding evidence and is NOT Console-relayed — survives unchanged and remains the canonical evidence line for future device verifications. If a future verification needs the raw bridge trace, temporarily remove the patch on a throwaway debug build (never on a vault holding real funds). |
| **Runtime leak canary** | ✅ BUILT. New e2e test in `tests/android/specs/hardware-kek-e2e.spec.js` fails hard if any logcat line matches a base64 `"h"` field or any `Capacitor/Console` line carries a long base64 run; reports counts only (never echoes the matched lines, to avoid re-leaking into CI output). |

No catalogue status changes: Android KEK remains BUILT + device-verified (StrongBox path), iOS remains device-verified PARTIAL. This finding does not affect release builds or the on-chain evidence already recorded; it closes a debug-build/CI log-hygiene gap.

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
