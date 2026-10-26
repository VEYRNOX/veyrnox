# Internal Security Audit — 2026-10-26
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-10-26
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `origin/main` @ `88cbe054f5cd3d40b080c8fbe86d36ae5ec33b96` (isolated worktree, branch `security-audit/2026-10-26`)
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

### Deviations from the runbook
- Agent types used as the runbook specifies (`Penetration Tester`, `Blockchain Security Auditor`, `Application Security Engineer`); all resolved.
- Agents did not mutation-test or execute anything; every verdict is from reading code.
- Coverage gaps (Agent A): `PlayIntegrityPlugin.kt` / `AppAttestPlugin.m` verdict parsing, merged Android manifest, samsung/huawei/fdroid flavour signing certs, and an exhaustive seed-surface page enumeration were not checked.

---

## Changes since last audit (2026-10-12 → 2026-10-26)

`git log --since` over every audited file shows **no security-relevant change** to RASP (`src/rasp`, `src/sign-gate`, `RaspIntegrityPlugin.*`), Hardware KEK (`android/…/java`, `ios/App`, `src/wallet-core/keystore`, `vault.js`) or WalletConnect. The only commit touching an audited file is `d9f5a675` (Settings i18n, #2891). Other recent commits are UI (#2902 Vigil animation), CI (#2903 appium pin) and docs. Consequently every carried finding is unchanged, and **none regressed and none was fixed**. New items below are first-time discoveries in unchanged code, not new regressions.

---

## CRITICAL
None.

## HIGH

| ID | Area | Location | Finding | Fix |
|---|---|---|---|---|
| H-1 (carried) | WalletConnect | `typed-data.js:34,55-65`; `wcTypedLevel.js:119-127`; `WalletConnectProvider.jsx:386,397-398` | Typed-data classifier is a name allowlist (spender/operator/delegate). Anything else scores `LEVEL.OK` and signs after a bare modal. | Deny-by-shape: non-OK unless it matches a small non-asset allowlist, or flag any struct with an address plus a uint amount. |
| N-B1 (carried) | WalletConnect | same | EIP-3009 `Transfer/ReceiveWithAuthorization`, CoW `GPv2 Order`, `UsdSend`/`Withdraw`, Safe `SafeTx`, non-Seaport NFT orders have no spender/operator/delegate field → score OK. Chain-bound domain does not help. | As H-1. |
| H-2 (carried) | RASP | `useRaspArtifact.js:130-142,179-200` | Attestation fires on dashboard mount, foreground and 60 s heartbeat unless caller passes `deferAttestation`/`excludeAttestation`. | Per 10-05 report. |
| H-3 (carried) | Auth/KEK | `kekProfiles.js:101`; `native.js:789`; `web.js:538` | `usedFallback: !stamped && i > 0` is false for an unstamped vault matching the current profile, so it is never stamped. Correct PIN = 1 KDF, wrong PIN = 3; `WalletProvider.jsx:1825` equalizer cannot cover it. Real wallet vs decoy distinguishable by stopwatch for that cohort (deniability, not funds). Not benchmarked. | `usedFallback: !stamped` (stamp on any unstamped success; `kekKdf` is outside the AAD). Add a test asserting equal KDF ledgers for real/duress/miss on an unstamped current-profile blob. |
| H-4 (carried) | RASP | `attestation.js:246-250` | Decoy resolves WARN where a clean primary is ALLOW (tier tell). | Owner decision. |

## MEDIUM

| ID | Area | Location | Finding | Fix |
|---|---|---|---|---|
| N-1 (NEW) | RASP | `nativeProbe.js:81,131-163`; `getFreshRaspArtifact.js:61-73,90`; `WalletConnectProvider.jsx:108,368`; `getFreshLocalRaspArtifact.js:80` | Hard-signal session latch (hooked/tampered/emulator) is applied only to values `nativeProbeSource()` returns. Every sign-time caller wraps it in a timeout that substitutes bare `{available:false}`, skipping the latch. An already-detected instrumented runtime can stall the bridge >1.5 s and get WARN instead of BLOCK. Header claim that the latch covers timeouts is false. | Shared `latchedUnavailable()` helper in `nativeProbe.js`; all three timeout wrappers return it. Test: stall the probe after a hooked verdict. |
| N-2 (NEW; same root as M-1) | RASP | `degrade.js:127-135,226`; `SendCrypto.jsx:1530-1545` | Native INTEGRITY_UNAVAILABLE lands on WARN; Send proceeds with ack + biometric. `degrade.js` comment says signing is blocked. WC and CryptoSigning reject non-ALLOW; Revoke blocks via `'sign'`; **Send is the open path.** A Frida runtime that makes `checkIntegrity` throw reaches it. | Map native INTEGRITY_UNAVAILABLE to BLOCK in `compose.js`/`presign.js`, or enforce `blockedActions.includes('sign')` inside `presignGate`. If WARN is intended, fix the comment. |
| N-3 (NEW) | RASP | `RestoreFromShares.jsx:282`; `WalletProvider.jsx:2760-2800` | Seed import via Shamir shares has no RASP gate. `WalletEntry` and `RestoreFromFile` gate `'import'`. | `freshSensitiveGate('import')` before submit, ideally inside `restoreFromRecoveryBundles`. |
| N-4 (NEW, MEDIUM-LOW) | RASP | `WalletAccessReset.jsx:238,265` | `importWallet(recPhrase)` ungated; equivalent `WalletEntry.finishPinRecover` (`:1414`) is gated. | As N-3. |
| H-5 (carried; located this run) + N-B2 | WalletConnect | `WalletConnectProvider.jsx:~395-562,~1100-1195`; `RequestApprovalModal.jsx:89`; `WalletConnect.jsx:188-190` | Handler refusals reject on the wire then throw before the queue filter, so the entry stays and `pendingRequests[0]` re-pops. `handleRejectRequest` skips the filter if the wire call throws. Chained with unguarded `BigInt(value)` in the modal body, a hostile dApp can cause a persistent crash/re-pop loop (ErrorBoundary containment not checked). | Remove queue entry in `finally` whenever a reject was sent; make reject remove regardless of wire failure; try/catch value formatting; validate `value`/`data` pre-modal. |
| N-B7 (NEW, conditional) | WalletConnect | `session.js:114`; `WalletConnectProvider.jsx:~960-962` | `session_request_expire` mapped to `session_expire`, filtered by `topic`; SDK payload is believed to be `{id}` only (not verified in node_modules). Expired requests then stay signable; tx is broadcast, response fails, dApp never gets the hash. | Evict by `{id}`; check `getPendingSessionRequests()` before signing; respond after broadcast and surface the hash. |
| N-B8 (NEW) | WalletConnect | `fee.js:resolveMaxPriorityFeePerGas`; `fees.js:24` | Tip clamped only to capped maxFee (1000 gwei), not `MAX_TIP_GWEI` (500, defined but unused here). dApp-supplied 1000/1000 gwei with 1M gas can burn ~1 ETH on a `value:0` call. Modal shows the ceiling but it is display-only; fees are outside spend limits. | Clamp tip to `MAX_TIP_WEI`/live multiple; ack or refuse above a balance/spend-limit threshold. |
| M-1 (carried) | RASP | `compose.js:64-75`; `presign.js:44-53`; `sensitiveGate.js:44`; `TokenApprovals.jsx:154,165` | `'sign'` in `blockedActions` read only by TokenApprovals. See N-2. | See N-2. |
| M-2 (carried) | WalletConnect | `src/risk/calldata.js:19-24,51-57` | Misses `allow`, `approveDelegation`, `authorizeOperator`, `approveAndCall`, `increaseApproval`, Safe `execTransaction`, Permit2 `transferFrom`, Seaport fulfill. | Fail closed on unknown selectors (value 0, non-empty data, contract recipient). |
| N-B3 (carried) | WalletConnect | `WalletConnectProvider.jsx:777-799` | `estimateGas` failure falls back to 1M cap and broadcasts; fees uncapped if `getFeeData` throws. | Refuse on estimate failure / no fee ceiling. |
| N-C2 (carried) | KEK | `native.js:617,639,1307`; `AndroidBiometricCachePlugin.kt:558-566`; `fastpathUnlock.js:62-63` | Fast-path stores RAW DEK under a 30 s device-wide `BIOMETRIC_STRONG` window with no `CryptoObject`, bypassing H, C and the KEK. `isFastpathEnabled()` is `value !== OFF` (default-on); `native.js:617` comment still says opt-in. | `CryptoObject` with timeout 0, or wrap DEK under H; fix comments. Owner decision whether accepted. |
| M-3 (carried) | KEK | `vault.js:~700`; `native.js:1160-1167` | `encryptVaultWithDekV3` return omits `kekKdf`; `{...blob,...sealed}` keeps the stale stamp. Next unlock uses only the stamped profile, so a PIN change can lock a vault. Live for any existing v:3 blob; flag `AAD_V3_MIGRATION_ENABLED=false` (`vault.js:323`) limits new v3 writes. | Carry `kekKdf` through before any flag flip. |
| M-4 (carried) | Auth | `WalletEntry.jsx:1085,1200-1205` | Wrong-PIN count persisted only after `unlock()` rejects; a kill during the KDF chain leaves no increment. Automatable; longest window for the H-3 cohort. | Persist provisional increment before `unlock()`; roll back on infra/gate error. |
| M-5 (carried) | Auth | `WalletEntry.jsx:1085-1089` | Duress/hidden unlock clears the wipe counter, letting a duress-PIN holder reset it. Design tension. | Owner decision (e.g. partial reset). |
| M-6 (carried) | Auth/I3 | `Settings.jsx:427-436` vs `:594` | Decoy Settings placeholder gating asymmetric. No exploitable tell beyond 10-05. | Per 10-05. |
| M-7 (carried) | KEK/iOS | `SceneDelegate.swift:67-73` | `QA-INSTRUMENT-TEMP` NSLog of every `URLContext` URL, incl. rejected; WC pairing symKey can reach the device log. | Delete the block. |
| Android biometric-cache alias (carried) | KEK | `AndroidBiometricCachePlugin.kt:527-533` | Alias `requiresAuth=false`; no cryptographic biometric bind on this legacy slot. | Auth-bind the alias. |
| N-A2/N-A3 (carried, partially fixed) | RASP | `TokenApprovals.jsx:153-172`; `SendCrypto.jsx:1530-1545` | Revoke now gated, blocks only on BLOCK tiers/INTEGRITY_UNAVAILABLE-native; WARN device revokes with no ack/biometric. WARN biometric lives in SendCrypto UI, not `presignGate`. | Shared helper enforcing biometric in the gate. |

## LOW

| ID | Area | Location | Finding |
|---|---|---|---|
| N-5 (NEW, availability) | RASP | `RaspIntegrityPlugin.kt:915,931`; `MainActivity.java:32`; `.m:~595-600` | Android `earlyCheck`/`isBlockTier` includes screen-capture; any presentation display (DisplayPort, Miracast, cast) or iOS AirPlay mirroring blocks launch/unlock and Keystore reads. JS tier for the same signal is only WARN. Conflicts with documented design and coercion-resistance availability. |
| N-6 (NEW) | RASP | `getFreshRaspArtifact.js:107-110` | Total failure returns `{tier:BLOCK, sentence:null}` without `blockedActions`/`requiresBiometric`; fails closed today but would throw in `sensitiveGate`. Use `degrade(undefined)`. |
| N-B6 (carried) | WalletConnect | `WalletConnectProvider.jsx:~899-943` | Pending queue filtered by `id` only; second dApp can evict another's request. Key on `${topic}:${id}`. |
| N-B5 (carried) | WalletConnect | `:414` | `personal_sign` content never scored; no SIWE domain check or 32-byte hash warning. |
| N-B4 (carried) | WalletConnect | `RequestApprovalModal.jsx:~263-276`; `session.js:~223-233` | Flagged-dApp banner shown only when `advisorOnline`; Approve not disabled; `verifyContext` checked only at session approval. Local known-bad domains hard-blocked for all tiers (good). |
| N-B9 (NEW) | WalletConnect | `WalletConnectProvider.jsx:~947` | Unrecognised methods queued with no wire reject. |
| N-B10 (NEW, INFO/LOW) | WalletConnect | `:~713` | `value`/`data` unvalidated before key-use gate; fails closed. |
| copySecret early wipe (NEW) | Auth | `copySecret.js:155-166` | blur/hidden wipe can overwrite the clipboard with 24 "•" before the user pastes, if the write succeeds while backgrounded. Capacitor behaviour unknown. Compare clipboard before wiping, or defer to the 30 s timer. |
| N-D2 (carried) | Auth | `credentialVerifier.js:3-4,86,102-108` | Header claims "same cost as vault"; defaults to 96 MiB/t6 vs 192 MiB/t3 legacy. Session-local, marginal. |
| N-D1 (carried, INFO) | Auth | `pinAttemptGuard.js:105-140` | Counter in localStorage; disclosed; `storageDegraded` surfaced. |
| N-C3 (carried) | KEK | `HardwareKekPlugin.kt:256`; `AndroidBiometricCachePlugin.kt:572,625` | StrongBox fallback catches only `StrongBoxUnavailableException`; `ProviderException` aborts enroll. Fail-closed. |
| N-C4 (carried) | KEK | `kek.js:245-259` | `combineKek` uses Web Crypto HKDF; CLAUDE.md says @noble/@scure only. I6 order/domain/zeroing correct. |
| N-C5 (carried) | KEK | `kek.js:342` | `unwrapDek` accepts `WRAP_V1` without AAD; forging needs the KEK. |
| L-6 KEK (carried, partial) | KEK | `HardwareKekPlugin.kt:126-138,279-291`; `.m:118,~278-293` | iOS `enroll` gated; Android `enroll` and `clearCredential` (both) ungated. |
| L-7 / M-6 KEK (carried) | KEK | `HardwareKekPlugin.m:210,479`; `AndroidBiometricCachePlugin.kt:~642` | Plaintext H/DEK write-side residue; base64 H copy unzeroable (disclosed bridge limit). |
| iOS tamper no cert pin (carried, disclosed) | RASP | `RaspIntegrityPlugin.m:~495-506` | Re-sign with any valid developer cert is undetected. |
| Web fresh artifact never ALLOW (carried) | RASP | `getFreshRaspArtifact.js:90-100` | By construction; `CryptoSigning` can never sign on web. Availability only. |
| N-A1 (carried, now confirmed) | RASP | `RaspIntegrityPlugin.kt:419-433,753-770,~706-728`; `android/variables.gradle:4` | Package probes inert on targetSdk 36 (no `<queries>`/`QUERY_ALL_PACKAGES` in any source manifest). Merged manifest not checked. Header comment overclaims. |
| N-7 / N-8 / N-9 (NEW, INFO) | RASP | `WalletConnectProvider.jsx:357-411`; `WalletProvider.jsx` `withPrivateKey*`; `SendCrypto.jsx:1272-1273` | WC duplicates `getFreshRaspArtifact`/`presignGateOrReject` (drift risk); no RASP check at the key accessor (per-call-site gating); `raspWarnBioOk` has no TTL. |
| Stale comments | docs | `compose.js:12-18`; `presign.js`; `typed-data.js:18-22`; `fastpathDekCache.js`; `degrade.js:127-135`; `native.js:617` | Several comments contradict behaviour. |

### Known limitations (not new bugs)
Android root detection is best-effort: resetprop-based spoofing (Shamiko/PIF) and DenyList mount namespaces defeat prop and path probes; the local-socket probe is likely SELinux-denied on Android 12+; hook detection is name-based (renamed Frida, stalker, Zygisk map-hiding escape it); probe canaries cover three syscalls. Root maps to WARN only. `rasp_early` JNI is fail-open by design. The iOS biometric cache is not enrollment-invalidated (disclosed; `biometricUnlockSecurityMode()` stays `'app-gate'`).

---

## Status vs prior audit (2026-10-12)

| Finding | Status |
|---|---|
| H-1 / N-B1 WC typed-data fall-through | STILL PRESENT |
| H-2 attestation on dashboard | STILL PRESENT (re-read) |
| H-3 profile-walk timing | STILL PRESENT |
| H-4 primary/decoy tier | STILL PRESENT (re-read) |
| H-5 refused WC request stays queued | STILL PRESENT (located: `:~395-562,~1100-1195`) |
| N-C2 raw-DEK fast path default-on | STILL PRESENT |
| M-1 `'sign'` unread | STILL PRESENT (see N-2) |
| M-2 calldata gaps | STILL PRESENT |
| M-3 v3 reseal drops `kekKdf` | STILL PRESENT |
| M-4 kill-before-count | STILL PRESENT |
| M-5 duress resets counter | STILL PRESENT |
| M-6 decoy Settings | STILL PRESENT |
| M-7 iOS NSLog | STILL PRESENT |
| N-B2, N-B3, N-B4, N-B5, N-B6 | STILL PRESENT (N-B2 upgraded to MEDIUM) |
| N-A1 package probes | STILL PRESENT (now confirmed) |
| N-A2 / N-A3 | PARTIALLY FIXED (revoke gated on BLOCK tiers; WARN gap remains) |
| L-6 KEK enroll/clearCredential | PARTIALLY FIXED, unchanged |
| N-C3, N-C4, N-C5, L-7, N-D1, N-D2 | STILL PRESENT |
| Android tamper-cert placeholder | FIXED / PASS |
| C-3 Android `hmacResult` zeroing | FIXED / PASS |
| Any REGRESSED | None |

---

## INFO / PASS (read-confirmed, not device-verified)

**RASP:** shape validation fails closed (`detect.js:95-109`, `nativeProbe.js:226-240`); unknown conditions map to BLOCK (`degrade.js:184,213-232`, `compose.js`); `presign.js:44-53` — only ALLOW proceeds without ack, BLOCK never proceeds; no chokepoint reads the retired `gate.blocked`/`gate.sentence` (WC `:400-411,1018-1027`, Send `SendCrypto.jsx:1509` / `sendGate.js:184`, CryptoSigning `:62-64`); `sensitiveGate` fails closed on null artifact; native never uses browser-leg CLEAN (`selectPresignProbeSource.js:51-62`); `VITE_BYPASS_RASP` hard-fails in PROD; Android tamper/early gates fail closed (`.kt:824-857,1030-1056,932-935`), release build rejects blank cert (`build.gradle:370-378`); `getHardwareFactor` BLOCK-gated natively on both platforms; fast-path DEK requires ALLOW on populate and read.

**WalletConnect:** all three signing handlers call `presignGateOrReject` before key use and throw on refusal; domain `chainId` required and matched (`:424-435`); `parseTypedData` reconciles type graph with `primaryType`; all six Permit2 types recognised; v1/v3/`eth_sign`/`eth_signTransaction` blocked; topic→session binding with no prop fallback; gas capped at 1M including omitted-`gas`; step-up re-auth, session expiry, `eth_chainId` verification, spend-limit and 2FA gates in place; WC disabled in decoy/hidden/demo/locked; known-bad domains rejected at session proposal.

**Hardware KEK:** Android `setUserAuthenticationRequired(true)`, `setInvalidatedByBiometricEnrollment(true)`, `BIOMETRIC_STRONG` only (no `DEVICE_CREDENTIAL`), real StrongBox tier read back and reported; iOS `.biometryCurrentSet | .privateKeyUsage`, `kSecAttrTokenIDSecureEnclave` with no software fallback, truthful tier name (I4); `combineKek` ordered H‖C with domain separation, length/all-zero rejection, buffers zeroed (`kek.js:216-280`); `unwrapDekWithProfiles` zeroes per attempt; 32-byte salt enforced.

**Auth:** wipe reachable through backoff, `shouldWipe` uses `>=`, session floor monotonic, backoff clamped to 5 min; `lock()` zeroes verifier and seed copies; `captureVerifierSafe` OOM returns null → `VERIFIER_OOM` bricked without burning an attempt; `MAX_CREDENTIAL_LEN` 1024; infra/gate errors do not increment the counter; `twoFactorGate` pure with no decoy input; `constantTimeEqual` full-length; `copySecret` wipe commits only on confirmed write with bounded retries; `stampedProfile` bounds a tampered stamp.

### Refutations discarded (summary)
Domainless Permit acceptance; `primaryType` spoofing; `presignGate` bypass in WC; StrongBox not enforced; `DEVICE_CREDENTIAL` weakening; iOS "Secure Enclave" misnaming; Android `hmacResult` leak; zero-H/C collapse; success-vs-miss timing oracle on the equalizer path; verifier-OOM lockout; self-renewing attestation BLOCK; iOS `fork()` probe crash.

## Suggested fix order (owner; nothing here was changed)
1. H-1/N-B1 deny-by-shape typed-data policy.
2. N-2/M-1 + N-1: close the WARN/timeout paths to Send signing; N-3/N-4 gate the two ungated seed-import pages.
3. H-3 stamp-on-any-unstamped-success, then M-4 provisional counter increment.
4. H-5 + N-B2 + N-B6 queue handling; N-B8/N-B3 fee and estimate refusal; N-B7 request expiry.
5. M-7 delete `SceneDelegate.swift:67-73`; N-C2 `CryptoObject`/wrap; M-3 carry `kekKdf`; Android `enroll`/`clearCredential` RASP gate.
