# Internal Security Audit — 2026-11-02
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-11-02
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `origin/main` @ `040e260dbe6de2a68dfcb09528dec62055b25562` (isolated worktree)
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

Baseline: `docs/audit-2026-10-12-weekly.md` (@ `4b98715a`). No weekly report exists for 10-19 or 10-26, so this pass spans three weeks.

### Deviations from the runbook
- Subagent types used: `Penetration Tester` (A, C), `Blockchain Security Auditor` (B), `Application Security Engineer` (D). All resolved.
- Agents did not run tests or any PoC (worktree has no `node_modules`). Agent C read `native.js`, `web.js`, `vault.js` by section (unlock, enroll, change-password, restore, fast-path, V3 reseal), not in full. Agent A did not read `ios/.../IntegrityGate.swift` and did not check the merged Android manifest. Agent B's "no diff" statement rests on the orchestrator's diff, not its own.
- Agent D cited the unlock path as `src/components/WalletEntry.jsx` (the runbook-era notes say `src/pages/`; the components path is the real one).

---

## Changes since last audit (2026-10-12 @ `4b98715a` → 2026-11-02 @ `040e260d`)

**Zero-delta on the audited surfaces.** `git diff 4b98715a..HEAD` over `src/rasp`, `src/sign-gate`, `src/wallet-core`, `WalletConnectProvider.jsx`, `components/walletconnect`, `WalletProvider.jsx`, `biometricUnlock.js`, `pinAttemptGuard.js`, `twoFactorGate.js`, `copySecret.js`, and the Android/iOS native plugin directories is empty. 24 commits landed in the window.

| Change | Surface | Agent D's I2/I3 read |
|---|---|---|
| #2946 immutable cache headers for `/assets/*`, NFT image lazy-load | `public/_headers`, NFT UI | CSP line byte-identical; no new egress origin. |
| VigilMotion.jsx / vigil-wings.css, paywall components | UI | Imports only react, framer-motion, local Vigil. No fetch/invoke/telemetry. |
| i18n extraction (`Settings.jsx` 44 in / 44 out) | UI | String moves only; M-6 line numbers unchanged. |
| dompurify 3.4.16 → 3.4.17, `.npmrc`, `.gitignore`, CI, docs, daily security-diff scans | Deps/docs | Not audited beyond the diff scan. |

Added-line grep for `fetch(`, `invoke(`, `XMLHttpRequest`, `sendBeacon`, `trackEvent`, `WebSocket`, `functions/v1`, `http(s)://` in non-test `src` returned nothing. No I2/I3 regression found.

---

## CRITICAL
None.

## HIGH

| ID | Area | Location | Finding | Fix |
|---|---|---|---|---|
| H-1 (carried) | WalletConnect | `wcTypedLevel.js:108-127`; `typed-data.js:12-16,34,56-67,121`; `WalletConnectProvider.jsx:476-481`; `RequestApprovalModal.jsx:233` | Typed-data classifier is a name allowlist (spender/operator/delegate). Unrecognised shapes score `LEVEL.OK` and sign. A chain-bound domain does not help (attacker sets the session chain). | Deny-by-shape classification. |
| N-B1 (carried) | WalletConnect | same | CoW `GPv2 Order`, `Withdraw {destination, amount}`, EIP-3009 `Transfer/ReceiveWithAuthorization`, Safe `SafeTx` have no spender/operator/delegate field → OK. The modal shows fields but the gate does not block. | As H-1. |
| H-2 (carried, now derived) | RASP | `useRaspArtifact.js:77,94-99,105-113,143-168`; callers `SecurityPosture.jsx:105` (via `WalletPortfolioPage.jsx:74,119`), `SecurityDashboard.jsx:107`, `RaspSecurity.jsx:92`, `PersonalBackup.jsx:548,813` | `deferAttestation` defaults false; only `SendCrypto.jsx:1297` defers. Attestation (Google/Apple) fires on every dashboard mount, foreground and 60 s heartbeat. Contradicts `attestation.js:26-29` ("pre-sign only"). Decoy makes none (`attestation.js:244-246`) → a network observer can distinguish real from decoy (I3 tell). | Default `deferAttestation` true, or pass `excludeAttestation` from display surfaces. |
| H-3 (carried) | Auth/KEK | `kekProfiles.js:96-101`; `native.js:789-795`; `web.js:538` | `usedFallback = !stamped && i > 0` is false when profile 0 matches, so an unstamped current-profile vault is never stamped. Correct PIN = 1 KDF; wrong PIN = 3 (96+192+64 MiB). Timing differential; not benchmarked. Pre-2026-09-21 KEK vaults only. | Stamp on any unstamped success. |
| H-4 (carried, now derived) | RASP | `attestation.js:244-246,185-187`; `degrade.js:133-139`; `SendCrypto.jsx:1297,1338` | Decoy resolves WARN (+biometric) where a clean real session is ALLOW: Send-friction tier tell. Native only; vanishes when real also lands on WARN. | Owner decision. |

## MEDIUM

| ID | Area | Location | Finding | Fix |
|---|---|---|---|---|
| N-C2 (carried; consider HIGH) | KEK | `native.js:625-660,1296-1397` (decode `:1378`); `AndroidBiometricCachePlugin.kt:546-575,382-428`; `fastpathUnlock.js:62-63` | Default-on silent fast-path stores the RAW DEK under a 30 s device-wide `BIOMETRIC_STRONG` window with no `CryptoObject`; unlock bypasses H, C, KEK and PIN. Opening the app within 30 s of a lockscreen biometric opens the real vault. Remaining gates: disclosure seen, no duress PIN, RASP ALLOW, no passkey. Stale "opt-in/OFF" text at `.kt:324`, `fastpathDekCache.js:30-33` (also cites alias `.v1`; live is `.v2`), `FastpathToggle.jsx:15`, `WalletEntry.jsx:865`, `Feature-Status.md:295`. | `CryptoObject` + timeout 0, or wrap DEK under H; fix text. |
| M-1 (carried) | RASP | `compose.js:64-75`; `presign.js:52-53`; `degrade.js:126-136,226` | `'sign'` in `blockedActions` read only by `TokenApprovals.jsx:154,165`. WC / CryptoSigning / KEK fast-path proceed only on ALLOW, but SendCrypto does not: a muted/throwing native probe → WARN → ack tap → biometric held in React state (`raspWarnBioOk`, `SendCrypto.jsx:1536-1544`) → send proceeds. | Enforce at chokepoints or drop from lattice. |
| N-A2 / N-A3 (carried) | RASP | `TokenApprovals.jsx:153-170`; `SendCrypto.jsx:1536-1544` | Revoke has no tier gate (ROOTED/ELEVATED/WARN pass with no ack/biometric). WARN biometric lives in SendCrypto UI, not the pure gate; a new `presignGate`-only caller gets just an ack tap. | Shared helper enforcing biometric; gate revoke. |
| N-A1 (carried; upgraded to probable) | RASP | `android/variables.gradle:4` (targetSdk 36); `RaspIntegrityPlugin.kt:419,753,635,726,214-,258,293` | No `<queries>`/`QUERY_ALL_PACKAGES` in source manifests, so `getPackageInfo` for Magisk/LSPosed throws NameNotFound → false ("clean"). `/data/adb/*` and socket probes likely SELinux-blocked (inference). Effective root signal is `checkDangerousProps` + test-keys; property-spoofing modules defeat both. Net: Magisk+Zygisk+DenyList/Shamiko likely reads clean → ALLOW; native `isBlockTier` (`:928`) covers hook/tamper/screen-capture, not root. Merged manifest not checked. Header discloses best-effort. | Check merged manifest; add `<queries>` or a behavioural probe. |
| M-2 (carried) | WalletConnect | `calldata.js:26-37,51-58` | Approval classifier misses `allow(address,bool)`, `approveDelegation`, `authorizeOperator`, `approveAndCall`, `increaseApproval`, ERC-6909 `setOperator`, Seaport `fulfill*`, Permit2 `lockdown`/`invalidateNonces`. | Fail closed on unknown selectors. |
| N-B3 (carried) | WalletConnect | `WalletConnectProvider.jsx:797-799,769-791` | `estimateGas` failure falls back to 1M cap and broadcasts; if `getFeeData` throws, fees are left unset and populated uncapped. Bounded by gas cap. | Refuse on estimate failure / no fee ceiling. |
| N-B5 (carried, inference) | WalletConnect | `WalletConnectProvider.jsx:415`; `RequestApprovalModal.jsx:195-205` | `personal_sign` content never scored; 32-byte hex (Safe/blind-sign) and SIWE domain mismatch not warned; not chain-bound. | Warn/block. |
| H-5 (carried; located, narrower) | WalletConnect | `WalletConnectProvider.jsx:415-427,481-493,575-587,1098-1100,1115-1118,1140-1143,1103,1122,1223`; `RequestApprovalModal.jsx:274-280` | Handlers `rejectRequest` (dApp told 4001) then throw; queue filter runs only on success, so the entry stays and the modal still offers Approve. If retried after the gate condition clears, `_handleSendTransaction` broadcasts (`~:802`) before `respondToRequest` (`:807`) fails on the already-answered id → on-chain tx the dApp believes refused. | Remove topic+id from queue on any thrown refusal. |
| M-3 (carried, latent; more sites) | KEK | `vault.js:676-709,323`; `native.js:1160-1167,1684,1787`; `web.js:792,936` | V3 reseal drops `kekKdf`; `{...blob,...sealed}` keeps a stale stamp. Five sites, not one. Would surface as `UNWRAP_FAILED` → counted wrong PIN → wipe. Latent while `AAD_V3_MIGRATION_ENABLED=false`. | Carry `kekKdf` at all sites + mutation-checked test before any flag flip. |
| M-4 (carried) | Auth | `WalletEntry.jsx:1085,1200-1206` | Wrong-PIN count persisted only after `unlock()` rejects; kill during the KDF leaves no increment (longest window for H-3 cohort). | Persist provisional increment first. |
| M-5 (carried) | Auth | `WalletEntry.jsx:1085-1089` | Any non-throwing unlock (duress/hidden) clears the wipe counter. Design tension. | Owner decision. |
| M-6 (carried) | Auth/I3 | `Settings.jsx:427` vs `:594` | Decoy Settings placeholder gating asymmetric. | Per 10-05. |
| M-7 (carried) | KEK/iOS | `SceneDelegate.swift:67-73` (`QA-INSTRUMENT-TEMP: remove before commit`) | NSLog of every `URLContext` URL incl. rejected; WC pairing secrets can reach the log. | Delete the block. |
| Android biometric-cache alias (carried) | KEK | `AndroidBiometricCachePlugin.kt:527-533,100-121,669-683`; `AndroidBiometricCacheConfig.kt:64`; `biometricUnlock.js:164` | Alias `requiresAuth=false`; invalidation probe treats `UserNotAuthenticatedException` as valid; `REQUIRES_USER_AUTH_LEGACY=true` is consumed only by a JVM test, so the tripwire pins a constant, not behaviour. PIN written here on every Android biometric enrol. Gates: JS prompt + RASP block tier. | Consume the constant or retire the slot. |
| L-4 (carried; priority raised) | KEK/Auth | `kekProfiles.js:102-105`; `WalletEntry.jsx:1183-1198` | Argon2id OOM on the 96/192 MiB profile rethrows uncoded and is counted as a wrong PIN toward the irreversible wipe: data-loss risk on low-RAM devices. | Add error code; wipe-exempt. |

## LOW

| ID | Area | Location | Finding |
|---|---|---|---|
| N-E1 (NEW) | RASP | `attestation.js:216-298`; `getFreshRaspArtifact.js:68-80`; `WalletConnectProvider.jsx:370-372` | The attestation session latch (keeps prior `attestationFailed`) is not consulted when the 1500 ms `withFailClosedTimeout` wrapper fires; stalling the bridge >1.5 s turns an INTEGRITY_FAIL BLOCK into WARN. Header comment listing "plugin timeout" as covered is wrong. Fix: apply latch after the wrapper. |
| N-E2 (NEW, inference) | RASP | `getFreshRaspArtifact.js` | 1500 ms attestation timeout vs real Play Integrity latency: a slow genuine token lands on WARN, breaking WC (rejects all WARN) and flattening the H-4 tell. Fail-closed; not measured. |
| N-B6 (carried) | WalletConnect | `WalletConnectProvider.jsx:912,937,986,989` | Pending queue evicts by `id` only (settle paths at `:1078,1103,1122,1218,1223` correctly use topic+id). A second dApp can drop another's pending request (griefing; no spoof). Key on `${topic}:${id}`. |
| N-B2 (carried) | WalletConnect | `RequestApprovalModal.jsx:89` | `BigInt(value)` unguarded; render throws on garbage value. Fails closed (ErrorBoundary); dApp can retrigger. |
| N-B4 (carried) | WalletConnect | `RequestApprovalModal.jsx:~248-262`; `WalletConnectProvider.jsx:1040-1044`; `session.js:~228-235` | Flagged dApp is banner-only at sign time; `verifyContext` and blocklist checked at session approval only; `checkDappDomain` gated on `advisorOnline`. |
| N-C3 (carried) | KEK | `HardwareKekPlugin.kt:256`; `AndroidBiometricCachePlugin.kt:572,625` | StrongBox fallback catches only `StrongBoxUnavailableException`; `ProviderException` OEMs fail enrol instead of TEE fallback. Fail-closed. |
| N-C4 (carried) | KEK | `kek.js:245-250` | `combineKek` uses Web Crypto HKDF; CLAUDE.md says @noble/@scure. I6 concat/domain correct. |
| N-C5 (carried) | KEK | `kek.js:96,342` | `unwrapDek` still accepts `WRAP_V1` without AAD; needs the KEK to forge. |
| L-5 (carried) | KEK | `kekProfiles.js:55` | Tampered `kekKdf` throws uncoded, counted as wrong PIN; needs local write access. |
| L-6 (carried, partial) | KEK | `HardwareKekPlugin.kt:127,280`; `.m:118,278` | iOS `enroll` gated; Android `enroll`, Android and iOS `clearCredential` not gated. |
| L-7 (carried) | KEK | `.m:210,459-479`; `.kt:642` | Plaintext H/DEK residue not zeroed (`hData`, decrypted `pt`, `secret.toByteArray`). |
| M-6 KEK (carried, disclosed) | KEK | `.m:473`; `.kt:420`; `AndroidBiometricCachePlugin.kt:409` | Base64/String copies of H and the raw DEK unzeroable (bridge-architectural). |
| iOS tamper no cert pin (carried, disclosed) | RASP | `RaspIntegrityPlugin.m:508-522,586-594`; `AppDelegate.swift:24` | `detectTamper` scans dyld for Substrate only; launch-time csops check not folded into `checkIntegrity.tampered`; valid-cert re-sign undetected. `IntegrityGate.swift` not read (drift risk). |
| Android tamper-cert residual | RASP | `RaspIntegrityPlugin.kt:851,1053`; `build.gradle:191` | Only `sigs.firstOrNull()` compared; FTL variant can ship a blank cert; repackager can patch the pinned constant. Play Integrity is the backstop and maps pin mismatch to WARN only (#2276). |
| Web fresh artifact never ALLOW (carried) | RASP | `getFreshRaspArtifact.js:92-100` | By construction; `CryptoSigning.jsx:62-64` can never sign on web. Fail-closed. |
| N-D1 (carried, INFO-level) | Auth | `pinAttemptGuard.js:105-140` | PIN counter in localStorage; session floor monotonic but lost on restart; `storageDegraded` surfaced. Fail-open refuted within a session. |
| N-D2 (carried) | Auth | `credentialVerifier.js:3-4,105-110` | Comment says "same cost as vault"; default is 96 MiB/t6, half the memory-hardness of 192 MiB/t3 legacy vaults. Session-local. |
| N-E3 / stale comments | docs | `degrade.js:126-132`; `RaspIntegrityPlugin.kt` header; `compose.js:12-18`; `presign.js` headers; `typed-data.js:18-22`; `fastpathDekCache.js` header | Overclaim relative to M-1 / N-A1; "wiring HELD/PROVISIONAL" false; typed-data coverage overstated. |

---

## Status vs prior audit (2026-10-12)

| Finding | Status |
|---|---|
| H-1, N-B1 WC typed-data fall-through | STILL PRESENT |
| H-2 attestation on dashboard | STILL PRESENT (now derived, callers listed) |
| H-3 profile-walk timing | STILL PRESENT |
| H-4 primary/decoy tier | STILL PRESENT (now derived) |
| N-C2 silent fast-path raw DEK | STILL PRESENT |
| M-1 `'sign'` unread | STILL PRESENT |
| M-2 approval calldata gaps | STILL PRESENT |
| M-3 v3 reseal drops `kekKdf` | STILL PRESENT (latent; 5 sites) |
| M-4 / M-5 / M-6 / M-7 | STILL PRESENT |
| N-B2..N-B6 | STILL PRESENT |
| H-5 refused WC request stays queued | LOCATED, STILL PRESENT (reclassified MEDIUM) |
| N-A1 | STILL PRESENT (upgraded to probable) |
| N-A2 / N-A3 | STILL PRESENT |
| L-4, L-5 (`kekProfiles.js`) | RE-READ, STILL PRESENT |
| L-6 | STILL PARTIAL |
| Android biometric-cache alias | STILL PRESENT |
| Carried LOWs (N-C3..N-C5, L-7, M-6 KEK, iOS tamper, web artifact, N-D1, N-D2, stale comments) | STILL PRESENT |
| Android tamper-cert placeholder | FIXED / PASS (unchanged) |
| Any FIXED this week | None |
| Any REGRESSED | None |
| NEW | N-E1, N-E2 (LOW) |

---

## INFO / PASS (read-confirmed, not device-verified)

**RASP**
- Chokepoint field reads correct: `WalletConnectProvider.jsx:400-421,1018-1027`, `SendCrypto.jsx:1304,1509`, `sendGate.js:184-185`, `CryptoSigning.jsx:62-64`, `native.js:645,1328` read `proceedAllowed`/`signerReachable`; `sensitiveGate` callers read `.blocked/.sentence`. Historic `gate.blocked` bug absent.
- Lattice fails closed: unknown tier → BLOCK (`compose.js:72-74`), unknown tx level → CONFIRM (`:92-93`), `degrade()` unknown → FAIL_CLOSED, `sensitiveGate(null)` blocks. `proceedAllowed` needs `signerReachable` + (ALLOW or ack).
- Probe errors/timeouts/bad shapes yield WARN or BLOCK, never ALLOW; `nativeProbe.js:131-165` latch re-asserts hooked/tampered/emulator through a mute. Native selection never falls back to browser CLEAN (`selectPresignProbeSource.js:50-62`).
- Early gates before WebView (`MainActivity.java:32`, `AppDelegate.swift:24`); Android canary on hooked primitives (`.kt:131-146`); `VITE_BYPASS_RASP` hard-fails in prod build (`useRaspArtifact.js:28`).
- Attestation I3: deniability/demo check first, before any bridge call (`attestation.js:244`).
- Android tamper-cert: release build fails on blank/malformed cert, rejects upload/debug certs (`build.gradle:369-378,518-527`); runtime fails closed (`.kt:824-860,1031-1060`).

**WalletConnect**
- `presignGateOrReject` runs before key access in all three signing handlers (`:415,481,575`) and session approval (`:1018`); `acknowledged` hard-coded false; refusals throw.
- v1/v3 typed data, `eth_sign`, `eth_signTransaction`, add/switch chain blocked (`router.js:46-53`); only v4 reaches the signer; `primaryType` reconciled (`typed-data.js:~94-104`).
- Chain binding at pre-modal and sign time; `domain.chainId` required and equal to the session chain; domainless Permit/Permit2 (incl. batch) refused. Signer address bound for all three methods. Step-up and `assertSessionLive` at each chokepoint.
- Gas capped 1M including omitted `gas`; dApp fees clamped; `resolveGasLimit` throws on garbage. Reown `verifyContext` scam/INVALID refuses session; local blocklist rechecked in `approveSession`. I3: no relay in decoy/hidden/demo, torn down on lock.

**Hardware KEK**
- `combineKek`: ordered H‖C, HKDF-SHA256, domain `veyrnox/kek/v1/combine(H||C)`, rejects bad lengths/all-zero, zeroes ikm/H/C/bits (`kek.js:238-284`); callers zero H, C, KEK, DEK, salt in `finally`; no XOR combine anywhere.
- Android: HMAC key with `setUserAuthenticationRequired(true)`, timeout 0, `AUTH_BIOMETRIC_STRONG` only with `CryptoObject` (`HardwareKekPlugin.kt:399`), no DEVICE_CREDENTIAL, `setInvalidatedByBiometricEnrollment(true)` (`:241`), `KeyPermanentlyInvalidatedException` coded; `hmacResult` zeroed (`:422-424`). Real tier read from `KeyInfo`; SOFTWARE/UNKNOWN/NO_KEY/PROBE_ERROR refused (`hardware.js:183-200`).
- iOS: `SecureEnclave` tier only after `SecKeyCreateRandomKey` with `kSecAttrTokenIDSecureEnclave` succeeds (else `SE_KEYGEN_FAILED`); no software fallback; `.biometryCurrentSet`, no passcode fallback; fresh prompt per call; enroll rollback; `EnclaveKeyService.swift` throws rather than downgrades. Both iOS H-path methods RASP-gated.
- Wipe-counter classification exempts invalidated/cancelled/no-factor (`hardware.js:213-226`). `KEK_C_PROFILES` append-only and frozen; stamp allowlist-matched. `getHardwareFactorWithLockoutFallback` is not a bypass.

**Auth gates**
- `captureVerifierSafe` never throws, null on failure; `verifyCredential` fails closed. `twoFactorGate.js` pure, fail-closed.
- Equalizer return discarded and wrapped in its own try/catch (cannot divert a confirmed unlock). Panic PIN throws a sentinel and never reaches `clearPinAttempts`. Convenience cache written only after successful unlock. Biometric-gate error short-circuits before the deniability path.
- `copySecret.js`: wipe on confirmed write only, `.catch`, `visibilitychange` early wipe, TTL fallback. `pinAttemptGuard`: monotonic session floor, `storageDegraded`.
- I3 review of the 24 intervening commits: no regression.

---

## Suggested fix order (owner; nothing here was changed)
1. H-2: defer/exclude attestation on display surfaces (also closes the real-vs-decoy network tell).
2. N-C2: decide on default-on silent fast-path (`CryptoObject`/H-wrap) and correct the stale "opt-in" text.
3. H-1 / N-B1: deny-by-shape typed-data classification; H-5 / N-B6 queue cleanup on refusal.
4. H-3 + M-4 together; L-4/L-5 error codes so Argon2 OOM cannot count toward the wipe.
5. M-1 / N-A3 shared biometric-enforcing helper; N-E1 latch after timeout wrapper; N-A1 merged-manifest check.
6. M-7 (delete NSLog block); N-B3 / M-2 fail-closed; M-3 before any `AAD_V3_MIGRATION_ENABLED` flip; L-6 RASP gates.
