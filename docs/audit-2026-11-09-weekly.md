# Internal Security Audit — 2026-11-09
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-11-09
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `origin/main` @ `a09abed2b1fe5e89d33c2eb631d865e8a871ed88` (isolated worktree, branch `security-audit/2026-11-09`)
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

Deviations: none. All four `subagent_type` names resolved. Prior report: `docs/audit-2026-11-02-weekly.md` (@ `040e260d`).

---

## Changes since last audit (040e260d..a09abed2)

- No diff in `src/rasp/*`, `RaspIntegrityPlugin.kt/.m`, `src/wallet-core/keystore/*`, `android/app/src/main`, `ios/App`, `biometricUnlock.js`, `pinAttemptGuard.js`, `twoFactorGate.js`, `credentialVerifier.js`, `copySecret.js`. KEK and RASP file:line cites from 2026-11-02 still hold.
- `WalletProvider.jsx`: 4-line change (`lock()` calls `invalidatePendingWork()`), benign.
- New sign-gate modules: `presignGateOrReject.js` (#2942, revoke path) and `presignOrReject.js` (#2931, speed-up/cancel).
- `WalletConnectProvider.jsx` +25 lines: receive-only ERC-20 gate `WC_TOKEN_NOT_LIVE` (:619-632). `tokens.js` adds LINK/UNI/SHIB/LEO (#2945).
- New features reviewed: custom ERC-20 tokens (#2930), speed-up/cancel pending EVM tx (#2931), receive-only hardening (#2943, #2945), token-approval revoke gate (#2942).
- Owner decision honoured: WalletConnect contract calls via unregistered routers stay allowed (2026-11-01); not flagged.

## CRITICAL / HIGH / MEDIUM / LOW findings

### CRITICAL
None.

### HIGH

**H-1 (carried N-C2) — Silent biometric fast-path stores the raw DEK under a 30 s device-wide auth window** [Surface C]
- `native.js:625-662` (`populateFastpathBestEffort`), `native.js:1296-1400` (`unlockBiometricOnly`), `AndroidBiometricCachePlugin.kt:566` (`setUserAuthenticationParameters(30, AUTH_BIOMETRIC_STRONG)`, no `CryptoObject`), `.kt:382-428` (`getFastpathDek`).
- Unlock decrypts the vault with the cached DEK without `combineKek`/H/C/PIN, contradicting I6 (KEK = HKDF(H‖C)). Native `getFastpathDek` checks only RASP block tier; enabled/disclosure/duress gates live in JS only, so any JS in the WebView can call the plugin. Any strong-biometric event on the device within 30 s (including a lockscreen unlock) satisfies the key.
- The code comment at `.kt:320-326` records the residual as accepted for "opt-in OFF"; the feature is now default-on (`fastpathUnlock.js:75-77`), so the accepted-risk record is stale.
- Refutations discarded: disclosure card is consent not control; Keystore key does require auth but 30 s window is device-wide; RASP ALLOW is only a tamper check; duress only blocks if a duress PIN exists.
- Fix: per-use `CryptoObject` with timeout 0 (upgrade path noted at `.kt:331-336`) or wrap DEK under H; enforce enabled/disclosure/duress natively; correct stale text.

**H-2 (carried H-1/N-B1) — WalletConnect EIP-712 shape check fails open** [Surface B]
- `wcTypedLevel.js:108-127` returns `LEVEL.OK` when nothing flagged; `typed-data.js:38-64` (`AUTHORISING_FIELD_NAMES` = spender/operator/delegate only); `typed-data.js:161`; `RequestApprovalModal.jsx:235`.
- Pure-function check on synthetic payloads: `TransferWithAuthorization{from,to,value}` (EIP-3009), `Withdraw{destination,amount}`, CoW-style `Order{receiver,sellToken,sellAmount}`, `Delegation{delegatee}` all return `detectAssetAuthorising === false`; only `Permit{owner,spender}` is caught. A hostile dApp with a session can obtain a token-moving signature with no ack gate (LEVEL.OK).
- Refutations discarded: nested-struct walk still keys on the same three names; primaryType reconciliation does not help on well-formed payloads; chain binding is attacker-controlled via session; presignGate only blocks non-OK levels.
- Fix: deny-by-shape — require explicit CAUTION or refuse typed data whose primary type is not on a vetted allowlist or that carries unclassifiable address+uint fields.

### MEDIUM

- **M-1 (carried, narrowed) — SendCrypto ignores `'sign'` in `blockedActions`** [A]. `degrade.js:226` appends `'sign'` for INTEGRITY_UNAVAILABLE on native; enforced by `presignGateOrReject.js:54` (revoke), and WC/replacement/CryptoSigning accept only clean ALLOW, but `SendCrypto.jsx:1297,1509` use `presignGate` + React-state `raspWarnBioOk` (:1272, :1539) and never read `blockedActions`. A muted/throwing probe or unavailable attestation (sideload, offline, decoy) reaches WARN, then ack + biometric lets a send proceed. Fix: route SendCrypto through the shared helper or enforce `'sign'` in `sendGate.js`.
- **M-2 (NEW N-F1) — Native hard-signal latch bypassed by stall** [A]. `getFreshRaspArtifact.js:90` wraps `nativeProbeSource()` in a 1500 ms fail-closed timeout (:68); the latch (`nativeProbe.js:131`) runs inside the source, so on timeout it is skipped and BLOCK falls to INTEGRITY_UNAVAILABLE (WARN). Same shape at `WalletConnectProvider.jsx:373`. Contradicts the documented latch guarantee. Combined with M-1, a hooked runtime can degrade BLOCK to a sendable WARN. Fix: read the latch after the wrapper.
- **M-3 (carried N-A1, inference) — Magisk/Zygisk likely reads clean** [A]. No `<queries>`/`QUERY_ALL_PACKAGES` in the main manifest and targetSdk 36, so `getPackageInfo` for Magisk/LSPosed package names throws and `checkSuspiciousPackages` (`.kt:753`) returns false; `/data/adb` and abstract-socket probes (`.kt:258`) likely SELinux-denied; `checkDangerousProps`/test-keys are defeated by Shamiko/PlayIntegrityFix. Library-merged manifests not checked.
- **M-4 (carried) — Android biometric-cache legacy alias** [C]. `AndroidBiometricCachePlugin.kt:527-533` creates the alias with `requiresAuth=false`; `.kt:676-677` treats `UserNotAuthenticatedException` as valid; `AndroidBiometricCacheConfig.kt:64` `REQUIRES_USER_AUTH_LEGACY=true` is not consumed by Kotlin.
- **M-5 (carried M-3, latent) — v3 reseal drops `kekKdf`** [C, D]. `native.js:1160-1167,1684,1787`, `web.js:792,936`. `AAD_V3_MIGRATION_ENABLED` is false. Carry `kekKdf` at all reseal sites with a mutation-checked test before any flag flip.
- **M-6 (carried H-3 / M-4 / L-4 / L-5 cluster) — PIN-attempt accounting** [C, D].
  - Profile walk never stamped when profile 0 matches (`kekProfiles.js:96-101`, `native.js:789`): correct PIN = 1 KDF, wrong = up to 3 (timing oracle on KEK vaults).
  - Counter persisted only after `unlock()` rejects (`WalletEntry.jsx:1200-1206`).
  - Argon2id OOM is uncoded and counts as a wrong PIN toward the irreversible wipe at 10 (`kekProfiles.js:102-105`; `WalletEntry.jsx:1200`). Tampered `kekKdf` likewise (`kekProfiles.js:50-56`).
- **M-7 (carried H-5, reclassified MEDIUM) — WC refused request stays queued with Approve enabled** [B]. Every handler calls `rejectRequest` then throws (`WalletConnectProvider.jsx:419,475,556`, new site :625); queue filter runs only on success (:1103,:1128,:1147,:1243). A retry after the gate condition clears broadcasts (:828) before `respondToRequest` (:831) fails — on-chain tx the dApp believes was refused. User tapped Approve, so bounded. Fix: dequeue on any thrown refusal.
- **M-8 (carried N-B3, widened) — WC gas/fee fallback holes** [B]. `:824,:828` `estimateGas().catch(() => WC_GAS_CAP)` broadcasts at 1M cap; `:727-775`: unparseable `maxFeePerGas` yields null and no fee fields set, so ethers fills from RPC uncapped (I5: RPC untrusted); `getFeeData` throw also leaves fees unset. Fix: refuse when no ceiling derivable.
- **M-9 (carried M-2) — `calldata.js` approval-selector classifier gaps** [B]. Unchanged; not re-read. Fail closed on unknown selectors.
- **M-10 (carried N-B5, inference) — `personal_sign` never scored** [B]. 32-byte hex / SIWE mismatch unwarned.
- **M-11 (carried M-7) — iOS `SceneDelegate.swift` NSLog of every URLContext URL** [C]. `QA-INSTRUMENT-TEMP: remove before commit` markers at lines 67, 73; WalletConnect pairing secrets can reach the device log.

### LOW

- **L-1 (carried H-2) — attestation probed on dashboard mounts** [A]: `useRaspArtifact.js:104` defaults `deferAttestation=false`.
- **L-2 (carried H-4) — decoy WARN vs real ALLOW tell** [A].
- **L-3 (NEW N-F2) — three divergent `presignGateOrReject` implementations** (`WalletConnectProvider.jsx:362`, `sign-gate/presignGateOrReject.js`, `sign-gate/presignOrReject.js`); all read `proceedAllowed` correctly today. `sendRevoke` (`approvals.js`) does not run the gate itself, so a future caller bypasses RASP [D]. Consolidate and enforce at the signing function.
- **L-4 (carried L-6) — `enroll`/`clearCredential` not RASP-gated** [C]: Android `enroll` (`HardwareKekPlugin.kt:126-138`) and both `clearCredential` (`.kt:279`, `.m:278`); iOS `enroll` is gated (`.m:118`).
- **L-5 (carried L-7 / M-6 KEK) — plaintext H/DEK residue** [C]: `.m:210`, `.m:473`, `.kt:642,409,420,663`, `AndroidBiometricCachePlugin.kt:409`. Disclosed, unzeroable String/base64 copies.
- **L-6 (carried N-C3/N-C4/N-C5)** [C]: StrongBox fallback catches only `StrongBoxUnavailableException` (availability only); `combineKek` uses Web Crypto HKDF (`kek.js:245-250`; concat and domain string correct); `unwrapDek` accepts `WRAP_V1` without AAD (`kek.js:342`).
- **L-7 (NEW N-F1-D) — leftover verifier-capture KDF may overlap next unlock** [D]. `WalletProvider.jsx:1928` `void captureVerifierSafe(password)`; backoff starts only at 3 misses, so an immediate retype could OOM on low-RAM devices and hit the uncoded OOM path (M-6). Unconfirmed on device.
- **L-8 (NEW N-F3) — custom-token symbol is contract-controlled, no "unverified" cue** [D]. `CustomTokensPanel.jsx:63-79`. Markup/bidi stripped; a token can still call itself "USDC". Display-only.
- **L-9 (NEW) — expired WC requests may never dequeue** [B, inference]. `session.js:121` maps `session_request_expire`; handler (:1016-1018) filters by `data.topic`, which the SDK payload may lack. Verify against `@reown/walletkit` types (no node_modules in worktree).
- **L-10 (carried N-B6/N-B2/N-B4)** [B]: pending queue evicts by `id` only (:937,:962,:1011,:1014); unguarded `BigInt(reqParams[0].value)` in `RequestApprovalModal.jsx:89` throws on render (fails closed); flagged-dApp check only at session approval (`session.js:225`), persisted sessions not rechecked.
- **L-11 (NEW, honesty) — iOS "SecureEnclave" label** [C]: H is random bytes generated in app memory (`HardwareKekPlugin.m:204-210`) and ECIES-wrapped by the SE key; plaintext H is in the process heap on each unlock. Label accurate for the wrap key; suggest "SE-wrapped factor".
- **L-12 (carried N-D2 / N-E1 / N-E2 / tamper residuals)**: `credentialVerifier.js:3-5` says "SAME cost as the vault" but vault KDF is 96 MiB/t=6 vs legacy 192 MiB/t=3; attestation latch not consulted on 1500 ms wrapper timeout; 1500 ms attestation timeout may push genuine tokens to WARN; Android compares only `sigs.firstOrNull()` (`.kt:851,1053`); Play Integrity pin mismatch maps to WARN; iOS `detectTamper` has no cert pin (disclosed).
- **L-13 (carried) — stale comments / text**: `AndroidBiometricCachePlugin.kt:324`, `fastpathDekCache.js:5,30-33` (cites alias `.v1`, live is `.v2`), `Feature-Status.md:301` ("opt-in / OFF by default"); `presign.js:3`, `compose.js:3,15` ("PROVISIONAL/HELD"); `degrade.js:34,126-136` overclaim `'sign'` block.
- **INFO**: `veyrnox-custom-tokens` plaintext in localStorage, in `METADATA_RESIDUE_KEYS`; web PRF factor uses fixed eval salt (`web.js:121,249,479`), low-confidence; `deriveFastpathKek`/`wrapForFastpath`/`unwrapFromFastpath` are dead code with an overclaiming header; WC_TOKEN_NOT_LIVE matches only the verified TOKENS registry, so custom ERC-20s are not blocked (consistent with owner decision).

## Status vs prior audit (2026-11-02)

| Prior finding | Status |
|---|---|
| N-C2 raw-DEK fast path, 30 s window | STILL PRESENT (HIGH) |
| H-1 / N-B1 typed-data fall-through | STILL PRESENT (HIGH) |
| M-2 calldata selector gaps | STILL PRESENT |
| N-B3 estimateGas / uncapped fee | STILL PRESENT (widened) |
| N-B5 personal_sign unscored | STILL PRESENT |
| H-5 refused request stays queued | STILL PRESENT (new instance at :625) |
| N-B6, N-B2, N-B4 | STILL PRESENT |
| RASP M-1 `'sign'` unread | STILL PRESENT, narrowed to SendCrypto |
| N-A2 revoke has no tier gate | **FIXED** (#2942) |
| N-A3 WARN biometric only in SendCrypto UI | PARTIALLY FIXED (shared helper; SendCrypto still React state) |
| N-A1 Magisk/Zygisk exposure | STILL PRESENT (probable) |
| N-E1 / N-E2 attestation latch/timeout | STILL PRESENT (N-E1 now shares root cause with M-2) |
| RASP H-2, H-4 | STILL PRESENT |
| Android tamper-cert placeholder | PASS (unchanged; CI secret value not visible) |
| iOS tamper no cert pin | STILL PRESENT (disclosed) |
| Android biometric-cache alias | STILL PRESENT |
| M-3 v3 reseal drops `kekKdf` | STILL PRESENT (latent) |
| H-3 profile walk unstamped | STILL PRESENT |
| M-4 counter persisted after reject | STILL PRESENT |
| M-5 non-throwing duress clears counter | STILL PRESENT (design) |
| M-6 decoy Settings gating | Not re-read this pass; carried |
| L-4 Argon2 OOM counted as wrong PIN | STILL PRESENT |
| L-5 tampered `kekKdf` uncoded | STILL PRESENT |
| L-6 enroll/clearCredential gating | STILL PARTIAL |
| L-7 residue zeroing | STILL PRESENT |
| M-7 SceneDelegate NSLog | STILL PRESENT |
| iOS cache not enrollment-invalidated | STILL PRESENT (disclosed TARGET) |
| N-D1 PIN counter in localStorage | STILL PRESENT (disclosed, INFO) |
| N-D2 verifier cost comment | STILL PRESENT |
| REGRESSED | None |

## INFO / PASS

Read-confirmed, not device-verified.

- **Gate logic:** `presign.js`/`compose.js` fail closed (unknown RASP tier = BLOCK, unknown tx level = CONFIRM, `proceedAllowed` never overrides BLOCK); every call site reads `proceedAllowed`/`rejectCode` (the historic `gate.blocked` bug is not present); probe error/timeout never yields ALLOW (worst case BLOCK→WARN, see M-2); `VITE_BYPASS_RASP` throws at module load in PROD.
- **I3:** attestation, WC relay, custom tokens, replacement and token-send check deniability/demo before any bridge/network call.
- **New code reviewed clean:** `presignOrReject.js` (ALLOW-only), `presignGateOrReject.js` (missing `blockedActions` or `requiresBiometric` blocks), speed-up/cancel (#2931: step-up → fresh RASP → egress check → key; original tx rebuilt and sender-recovered; fee floor/ceiling), custom tokens (#2930: session re-asserted around every RPC step, decimals-mismatch guard), receive-only gates (#2943/#2945).
- **WalletConnect:** presignGate in all three signing handlers and session approval; v1/v3 typed data and `eth_sign` blocked; `domain.chainId` required and bound to the live session chain; topic-to-session binding; foreign signer address rejected; gas clamp at 1M; pairing URI double validation; WC_TWO_FACTOR_REQUIRED; spend-cap fails closed; WC_TOKEN_NOT_LIVE fails closed on absent `assetId`.
- **KEK:** `combineKek` is ordered H‖C with domain `veyrnox/kek/v1/combine(H||C)`, not XOR, with H/C/KEK/DEK zeroed in `finally`; Android H key is HMAC-SHA256, `setInvalidatedByBiometricEnrollment(true)`, per-use `CryptoObject`, no DEVICE_CREDENTIAL; real tier read from `KeyInfo` and unaccepted tiers refused at enroll; iOS P-256 Secure Enclave key with `BiometryCurrentSet`, `ThisDeviceOnly`, reuse duration 0; `allowBackup=false`.
- **Auth:** timing equalizer holds across 96/t6 vs 192/t3 (no oracle beyond H-3); `captureVerifierSafe` OOM fails closed; `twoFactorGate` pure and I3-parity; `copySecret` wipe commits only on confirmed write and honours visibilitychange; panic PIN never reaches `clearPinAttempts`; infra errors exempt from the wipe counter except the uncoded cases in M-6.

## Priority order suggested by the agents

1. H-1 (raw-DEK fast path) — accepted-risk record is stale either way.
2. H-2 (typed-data deny-by-shape).
3. M-1 + M-2 together (SendCrypto on shared helper; latch after timeout wrapper).
4. M-6 error codes (OOM / tampered `kekKdf` wipe-exempt), then M-7/M-8, then M-11 (delete NSLog block).
