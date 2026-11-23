# Internal Security Audit — 2026-11-23
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-11-23
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `origin/main` @ `3611f71fec520497f9879eefdf17f37fb078b051` (isolated worktree, branch `security-audit/2026-11-23`)
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

Deviations: none. All four `subagent_type` names resolved. Prior report: `docs/audit-2026-11-16-weekly.md` (@ `5cd7de75`). No node_modules in the worktree; nothing was executed. Finding IDs below keep the 2026-11-16 numbering; new items are prefixed `N-<surface letter>`.

---

## Changes since last audit (5cd7de75..3611f71f)

- **No source change in any audited surface.** `git diff 5cd7de75..HEAD` over `src/`, `android/`, `ios/` is empty. Commits since: #2975 (the 11-16 audit), #2977 (weekly dependency audit), and daily security-diff docs #2978 to #2982. All are docs-only.
- This pass is therefore a re-verification against the live tree. Every prior finding was re-read: **none FIXED, none REGRESSED**. Surfaces B, C, D confirm their carried items with unchanged cites. Surface A confirms its items and adds two MEDIUM and several LOW items, which are newly found in unchanged code, not new regressions.
- Owner decision honoured: WalletConnect contract calls via unregistered routers stay allowed (2026-11-01); not flagged.

## CRITICAL / HIGH / MEDIUM / LOW findings

### CRITICAL
None.

### HIGH

**H-1 (carried) — Silent biometric fast-path stores the raw DEK under a 30 s device-wide auth window** [C] — STILL PRESENT
- `AndroidBiometricCachePlugin.kt:566` (`setUserAuthenticationParameters(30, AUTH_BIOMETRIC_STRONG)`, no `CryptoObject`); `getFastpathDek` `.kt:382-428`, gated only by `rejectIfBlockTier` at `:387`; `native.js:1296-1400` (`unlockBiometricOnly`) base64-decodes the DEK and calls `decryptVaultWithDek` with no `combineKek`/H/C/PIN (I6). `populateFastpathBestEffort` `native.js:625-662` stores the raw DEK.
- Enabled/disclosure/duress gates are JS-only (`native.js:1310-1337`), so any WebView JS can call the plugin. Default-on (`src/lib/fastpathUnlock.js:10-21`); the "opt-in OFF" comment at `.kt:320-326` is stale.
- Fix: per-use `CryptoObject` with timeout 0, or wrap the DEK under H; enforce enabled/disclosure/duress natively; correct the comment.

**H-2 (carried) — WalletConnect EIP-712 shape check fails open** [B] — STILL PRESENT
- `typed-data.js:34` (`AUTHORISING_FIELD_NAMES`), `:62-74`, `:138-170`; `src/lib/wcTypedLevel.js:113-129` returns `LEVEL.OK` when nothing is flagged; `WalletConnectProvider.jsx:485-486`; `RequestApprovalModal.jsx:209,233-239` blocks only `isAssetAuth`.
- EIP-3009 `TransferWithAuthorization`/`ReceiveWithAuthorization`, `Withdraw{destination,amount}`, CoW-style `Order`, `Delegation{delegatee}` and Safe `SafeTx` wrappers score OK and Approve stays enabled.
- Fix: invert the default; sign only an allowlist of vetted benign `primaryType`s, otherwise CAUTION.

### MEDIUM

- **M-1 (carried) — SendCrypto never reads `'sign'` in `blockedActions` (I4)** [A]. `degrade.js:226` adds `'sign'`; sole enforcement is `sign-gate/presignGateOrReject.js:54`. `SendCrypto.jsx:1491-1509` reads only `.tier`/`.requiresBiometric`; `sendGate.js`, `composeVerdict.js`, `signingPolicy.js` never read it. Comments at `degrade.js:34,126-136` are false for the main send path. Caution: if Android pinset (#2276) or iOS attestation (#2277) is still unverified, enforcing `'sign'` would block every send; check first.
- **M-2 (carried) — Native hard-signal latch bypassed by the 1500 ms timeout (I4)** [A]. Latch inside `nativeProbeSource()` (`nativeProbe.js:81,131-165`); `getFreshRaspArtifact.js:90,93` wraps it in `withFailClosedTimeout` (`:68-80`), which resolves bare `{available:false}` on stall. Same shape at `WalletConnectProvider.jsx:113,373,376`, `attestation.js:216-301`, and `lib/getFreshLocalRaspArtifact.js:67-69` (benign: UNAVAILABLE still blocks seed-reveal/export/import). Comments at `getFreshRaspArtifact.js:35-38`, `nativeProbe.js:91-92` overclaim. Fix: apply latch after the timeout wrapper, with a mutation-checked test.
- **M-3 (carried, widened further) — Magisk/Zygisk exposure** [A]. No `<queries>`/`QUERY_ALL_PACKAGES`, targetSdk 36, so `checkSuspiciousPackages` (`RaspIntegrityPlugin.kt:753-768`) and `checkXposed` (`:419-436`, feeds BLOCK-tier `detectHook`) are dead. **Refinement:** the plugin's own device record (`.kt:6-13`) shows Magisk v30.7 first read `rooted:false`; `/data/adb` is root-only so `File.exists()` returns false (`checkMagiskPaths` `:214`, `checkRootBinaries` `:185`), and `checkLocalSocketConnect` (`:258`) is marked not device-verified. Practically Android root detection reduces to `checkDangerousProps` (`:293`), spoofable with resetprop-class modules (and `ro.boot.secureboot=="0"` is a known false positive). ROOTED has no `'sign'` block (`degrade.js:59-68`). Prior wording that the `/data/adb` leg "still works" is withdrawn.
- **M-4 (carried) — Android biometric-cache legacy alias unauthenticated** [C]. `AndroidBiometricCachePlugin.kt:530-531` hardcodes `requiresAuth=false`; `AndroidBiometricCacheConfig.kt:64` `REQUIRES_USER_AUTH_LEGACY=true` unused. Mitigated on KEK vaults (`hardwareKekPresent()` checks at `.kt:181,224,512`); exposure remains for non-KEK vaults.
- **M-5 (carried, latent) — v3 reseal keeps a stale `kekKdf` stamp** [C, D]. `vault.js:676-700` destructures only `kekWrap`/`kekSalt`/`hardwareKekVersion`; callers spread `{...blob, ...sealed}` (`native.js:1160-1167,1678-1685,1779-1788`; `web.js:786-792,933-936`). `AAD_V3_MIGRATION_ENABLED=false` (`vault.js:323`). Do not flip it before carrying `binding.kekKdf` with a rotate-then-unlock test.
- **M-6 (carried) — PIN-attempt accounting cluster** [C, D]. (a) profile-0 match never stamped (`kekProfiles.js:101`; `native.js:789`, `web.js:538`); (b) counter persisted only after `unlock()` rejects (`WalletEntry.jsx:1200-1206`), so a process kill mid-KDF is uncounted; (c) Argon2id `RangeError` and tampered stamp (`kekProfiles.js:55`) carry no `.code`, fall through `WalletEntry.jsx:1130-1198`, and count toward the 10-miss wipe. No `KDF_RESOURCE`/`KDF_PARAMS_INVALID` code exists in `src`.
- **M-7 (carried) — WC refused request stays queued with Approve enabled** [B]. Reject-then-throw sites `WalletConnectProvider.jsx:422,440,461,488,509,531,540,582,603,625,639,718`; dequeue only on success (`:1128,1147,1243`); modal keeps the request (`RequestApprovalModal.jsx:282-287`).
- **M-8 (carried) — WC gas/fee fallback holes (I5)** [B]. `:824` `estimateGas().catch(() => WC_GAS_CAP)`; `:767-785` unparseable fee leaves fields unset; `:810-816` empty catch, ethers fills uncapped; `fee.js:98-103` shows no worst-case row; mainnet ceiling 1000 gwei × 1M gas ≈ 1 ETH (`fees.js:23-25`).
- **M-9 (carried) — `risk/calldata.js` classifier gaps** [B]. Unrecognised and scored "Not an approval": Permit2 `permit` (`0x2b67b570`/`0x2a2d80d1`), `increaseApproval`, Universal Router `execute`, Safe `multiSend`, NFT `transferFrom`/`safeTransferFrom` out of the wallet.
- **M-10 (carried) — `personal_sign` unscored** [B]. `WalletConnectProvider.jsx:419-473` default `LEVEL.OK`; no SIWE domain check; `RequestApprovalModal.jsx:203,327` renders decoded text in a `<pre>` without stripping bidi/control characters.
- **M-11 (carried) — iOS `SceneDelegate.swift` NSLog of every URLContext URL** [C]. `SceneDelegate.swift:67-73` still holds `QA-INSTRUMENT-TEMP: remove before commit`; can log WalletConnect pairing symKeys. Fix: delete lines 67-73.
- **M-12 (carried, inference) — WC request expiry never enforced** [B]. `session.js:121`; handler `WalletConnectProvider.jsx:1016-1018` filters on `data.topic`, which the SDK event likely lacks (unverified, no node_modules); nothing reads `expiryTimestamp`.
- **M-13 (carried, design-level) — WARN-tier biometric is a caller-attested boolean** [A]. `SendCrypto.jsx:1272-1273,1539,2680-2688`; `TokenApprovals.jsx:201,272-279`; `presignGateOrReject.js:40,76`. `verifyBiometric2fa()` (`lib/biometric.js:130-170`) is a real OS prompt but its result is only a JS boolean, not bound to a signing attempt.
- **M-14 (NEW, I4 overclaim) — Android attestation leg gives no root or repack signal** [A]. `PlayIntegrityPlugin.kt:149-207` sets `attestationFailed = !meetsBasic`; basic integrity is satisfied by rooted/unlocked devices. `appRecognitionVerdict`, `requestPackageName` and cert digest are ignored; `meetsDeviceIntegrity` is never consumed (`src/plugins/attestation.js:73`). A Magisk device that evades local probes (M-3) therefore composes to CLEAN and gets ALLOW with no ack/biometric; a repacked APK that patches `BuildConfig.RELEASE_CERT_SHA256` also passes. `attestation.js:9-14` and `featureCatalogue.js:314` overstate this. Fix: require MEETS_DEVICE_INTEGRITY and PLAY_RECOGNIZED, check package and cert digest, fix docs; per #2276 capture a real token before tightening.
- **M-15 (NEW, availability, unconfirmed on device) — PersonalBackup Recover/Split tabs gate on the remote attestation leg** [A]. `PersonalBackup.jsx:548` and `:813` call `useRaspArtifact()` with attestation on (ExportTab `:103` passes `excludeAttestation:true`, owner decision 2026-07-16). `runRestore` (`:597`) and `runSplit` (`:829`) call `sensitiveGate(...,'export')` first; INTEGRITY_UNAVAILABLE blocks it, so share recovery/export is refused on sideload or non-Play builds, and attestation egresses on mount and every 60 s (I2). Fix: `excludeAttestation:true` at `:548` and `:813`.

### LOW

Carried, still present:
- **L-1** attestation probed on dashboard mounts [A]: `useRaspArtifact.js:104`, 60 s heartbeat `:138`; callers `SecurityPosture.jsx:105`, `SecurityDashboard.jsx:107`, `RaspSecurity.jsx:92`, `PersonalBackup.jsx:548,813`.
- **L-2** decoy WARN vs real ALLOW tell [A]: `attestation.js:244-246`, `getFreshRaspArtifact.js:92-94`; contradicts "byte-identical" at `degrade.js:13-24`.
- **L-3** divergent `presignGateOrReject` copies [A, D]: `WalletConnectProvider.jsx:362`, `sign-gate/presignGateOrReject.js:37`, `sign-gate/presignOrReject.js:23`, inline gates `CryptoSigning.jsx:61-64`, `SendCrypto.jsx:1491-1509`; signing functions `evm/send.js:28,65`, `approvals.js:114` rely on the caller; only `replacement.js:462` gates inside the flow. (Prior path `wallet-core/sign-gate/` was wrong; the directory is `src/sign-gate/`.)
- **L-4** `enroll`/`clearCredential` not RASP-gated [C]: Android `HardwareKekPlugin.kt:126-138,279-290`; iOS `clearCredential` `.m:278-293`. Android `enroll` deletes any existing key (`.kt:149-158`), so injected JS can re-key a live enrollment and destroy the `kekWrap` (DoS).
- **L-5** plaintext H/DEK String residue [C]: `.m:458-476`, `HardwareKekPlugin.kt:420-423`, `AndroidBiometricCachePlugin.kt:409-411,663`. Bridge-architectural; disclosed.
- **L-6** KEK minor [C]: StrongBox fallback catches only `StrongBoxUnavailableException` (`HardwareKekPlugin.kt:256`; `AndroidBiometricCachePlugin.kt:572,625`); `combineKek` uses Web Crypto HKDF (`kek.js:245-250`); `unwrapDek` accepts `WRAP_V1` without AAD (`kek.js:342,349-351`).
- **L-7** leftover verifier-capture KDF may overlap next unlock [D, unconfirmed]: `WalletProvider.jsx:1928`; backoff starts at 3 misses.
- **L-8** custom-token symbol contract-controlled [D]: `CustomTokensPanel.jsx:63,74-79`.
- **L-10** WC misc [B]: queue evicts by `id` only (`:916,937,962,1011,1014`); unguarded `BigInt(reqParams[0].value)` at `RequestApprovalModal.jsx:89` throws on render. Refined: `value:"zz"` passes the pre-modal filter (`:944-963`), lands in the per-route ErrorBoundary, and the request stays in provider state, so `/walletconnect` re-crashes until the session is disconnected or the app restarts (dApp-triggered UI DoS, fails closed, not run). Persisted sessions rechecked only at proposal (`session.js:225`).
- **L-11** iOS "SecureEnclave" label [C]: `HardwareKekPlugin.m:245`, `hardware.js:17,74`, `native.js:1018`; H is random bytes from `SecRandomCopyBytes` (`.m:204-210`) wrapped by the SE key. Suggest "SE-wrapped factor".
- **L-12** tamper/doc residuals [A, D]: `credentialVerifier.js:3-5` says "SAME" cost (verifier 96 MiB/t6 vs legacy 192 MiB/t3); Android `sigs.firstOrNull()` (`RaspIntegrityPlugin.kt:851,1053`); iOS `detectTamper` (`.m:508-529`) has no cert pin; `earlyDetectTamper` (`.m:586-594`) passes a validly re-signed app. Disclosed.
- **L-13** stale comments [A, C]: `AndroidBiometricCachePlugin.kt:324`, `presign.js:3`, `compose.js:3,12-18` ("HELD"), `degrade.js:34,126-136`.
- **L-14** phishing-domain banner is tier-gated in the modal [B]: `RequestApprovalModal.jsx:254-256`; documented upsell pattern.
- **L-15** "independent audit" wording [A]: `presign.js:3`, `compose.js:3`, `featureCatalogue.js:314`, plus **new site** `browserProbe.js:4`. Reword to "internal".
- **L-16** web fresh artifact is never ALLOW [A]: `getFreshRaspArtifact.js:88-95`, `attestation.js:185`. Side effect: web message signing refused with a misleading "automation or a tampered runtime" message (`CryptoSigning.jsx:62-65,81-84`). No test pins it.
- **L-17** `copySecret` can give up while backgrounded [D, unconfirmed]: `copySecret.js:74,91-101,117-130`; blur/hidden events also consume attempts, so exhaustion can come sooner than 3.5 minutes.

New this pass:
- **N-A3 (I4 inversion)** `'sign'` block breaks danger-monotonicity [A]. `degrade.js:226` blocks `'sign'` only for INTEGRITY_UNAVAILABLE (rank 3); ROOTED (rank 4) does not. A rooted device with unavailable attestation can revoke approvals with ack and biometric; a non-rooted one with an unavailable probe cannot. `l5-tier-monotonicity.test.js` runs with `isNativePlatform()` false, so it never covers this.
- **N-A4** Android BLOCK early gate does not stop the bridge [A, inference from Capacitor source]. `MainActivity.java:32-36` calls `super.onCreate(null)` (which loads the bridge) then shows a dialog; WebView and JS run beneath it and FLAG_SECURE is skipped (`:~85-98`). Contradicts `MainActivity.java:28-31` and `RaspIntegrityPlugin.kt:~880-884`. iOS does this correctly (`SceneDelegate.swift:44-51`).
- **N-A5 (availability)** loopback port squat weaponises the Frida port probe [A]. Any listener on 127.0.0.1:27042 is treated as a hook (`checkFridaPort`/`earlyFridaPort`) and feeds `isBlockTier` (`.kt:928`), gating `HardwareKekPlugin:320`, `VeyrnoxEnclavePlugin:168,228,347`, `AndroidBiometricCachePlugin:462` and the launch screen. A co-installed app with INTERNET can deny unlock and signing while it runs. Fail-closed, recoverable. iOS `.m:~420` is similar at sign time.
- **N-A6** iOS hook-library marker lists differ between runtime (`.m:384-401`) and early scan (`.m:596-612`); should be one shared list.
- **N-A7 (needs owner confirmation)** the iOS archive may omit `VITE_RELEASE=1`. iOS release steps (`docs/RELEASE-v1.0.3.md:114`, CLAUDE.md checklist item 1) say plain `npm run build`; Android CI uses `build:release` (`ci.yml:578-585`). Without it `demoClient.js:29-62` leaves the demo opt-in live (guarded by real-vault markers, so a pre-vault device only), and `verifyBiometric2fa()` returns true under DEMO (`biometric.js:131`). The checklist `.ipa` grep cannot detect a missing `VITE_RELEASE`.
- **N-B1** known-bad dApp banner never gates approval [B]: `RequestApprovalModal.jsx:310-321` shows the banner but `approveBlocked` (`:233-239`) ignores `dapp.flagged`; no handler rechecks the domain. A persisted session later added to the phishing feed can still approve `personal_sign` and OK-scoring typed data. Fix: add `dapp.flagged` to `approveBlocked` or re-run `checkDappDomain` in `assertSessionLive`.
- **N-B2** per-request Reown Verify context ignored [B]: `verifyContext` is read only at the proposal (`WalletConnectProvider.jsx:1067-1070`), never in `session_request` (`:917-1015`); `metadata.url` is self-declared, so a spoofed benign URL defeats `checkDappDomain`.
- **N-B3 (griefing)** no floor on dApp-supplied fees or gas [B]: `:763-777`, `:822-825` clamp from above only; a very low fee can strand the nonce (inference), a low gas limit reverts and costs the fee.
- **N-B4** some early refusals throw without `rejectRequest` [B]: `:738-740` and the `BigInt(txParams.value)` throw inside `withPrivateKey` (`:759`) leave the dApp without a 4001 until expiry. Fails closed.
- **N-B5** unbounded pending-request queue [B]: `:1013-1015` queues every unknown method with no per-topic cap.
- **N-C1 (honesty)** `fastpathDekCache.js` is dead code with a false header [C]: `:1-50` describes an H-bound, opt-in, OFF-by-default path; the live path stores the raw DEK (see H-1). Delete or correct.
- **N-C2** iOS `enroll` leaves a plaintext H copy [C]: `HardwareKekPlugin.m:210` copies into an immutable `NSData *hData`; `memset` at `:221` clears only the stack array. Same class as L-5.
- **N-C3 (note)** `combineKek` zeroes the caller's H and C (`kek.js:281-282`); no violating caller seen, a future reuse would get zeros and fail closed.
- **N-D1 (policy drift, owner decision)** CLAUDE.md says "PIN ≥12 chars on mainnet builds"; code enforces `MIN_PIN_LENGTH = 8` digits (`src/lib/pinStrength.js:19`, self-described "~27 bits" at `:7`), and duress PINs need 4 (`:16`). Probably a deliberate 8-digit cohort; one document needs amending.
- **N-D2** `nativeClear` is asymmetric [D, unconfirmed]: `src/lib/biometricUnlock.js` about `:367-385` clears only the plugin cache when available, leaving any older SecureStorage `bio_unlock_secret` at rest (and vice versa). Not a remote bypass. Fix: always clear both.
- **N-D3** biometric unlock does not reset `veyrnox-pin-attempts` [D]: `clearPinAttempts()` runs only on PIN success (`WalletEntry.jsx:1089`) and after a wipe (`:1218`). An owner at 9 misses who unlocks by Face ID is one typo from the irreversible wipe. Data-loss risk only.

**INFO**: `veyrnox-custom-tokens` plaintext in localStorage (in `METADATA_RESIDUE_KEYS`); web PRF factor uses a fixed eval salt (`web.js:121,249,479`, low confidence); `deriveFastpathKek`/`wrapForFastpath`/`unwrapFromFastpath` dead code; `WC_TOKEN_NOT_LIVE` matches only the verified registry (owner decision); `handleApproveSession` accepts a proposal with no `verifyContext`, refusing only on `isScam`/`INVALID`; the probe is self-attested in-process and the canary catches only hooks that throw; `earlyPtraceTraceme` (`.kt:991`) relies on SELinux refusing PTRACE_TRACEME (fails closed but fragile); any WebView JS can dispatch `veyrnox:app-lock` to clear both latches (inside the M-13 threat model); `RELEASE_CERT_SHA256` is one global pin, so the samsung/huawei/fdroid flavours (`build.gradle:119-148`) would read `tampered=true` and be BLOCKed on every launch (confirm they are not shipped, or add per-flavour pins).

## Status vs prior audit (2026-11-16)

| Prior finding | Status |
|---|---|
| H-1 raw-DEK fast path, 30 s window | STILL PRESENT (HIGH) |
| H-2 typed-data fall-through | STILL PRESENT (HIGH) |
| M-1 SendCrypto ignores `'sign'` | STILL PRESENT |
| M-2 latch bypassed by timeout | STILL PRESENT |
| M-3 Magisk/Zygisk | STILL PRESENT, wording corrected (file-path legs likely dead too) |
| M-4 legacy alias | STILL PRESENT (mitigated on KEK vaults) |
| M-5 v3 reseal `kekKdf` | STILL PRESENT (latent) |
| M-6 PIN accounting (a, b, c) | STILL PRESENT |
| M-7 refused request stays queued | STILL PRESENT (N-B4 variant added) |
| M-8 gas/fee fallbacks | STILL PRESENT |
| M-9 calldata selector gaps | STILL PRESENT |
| M-10 `personal_sign` unscored | STILL PRESENT |
| M-11 SceneDelegate NSLog | STILL PRESENT |
| M-12 WC request expiry | STILL PRESENT (inference) |
| M-13 WARN-tier biometric caller-attested | STILL PRESENT |
| L-1 to L-8, L-10 to L-17 | STILL PRESENT (L-1 and L-15 widened, L-10 refined) |
| Android tamper-cert placeholder | PASS (build guard rejects blank/malformed; CI secret value not visible) |
| iOS tamper no cert pin | STILL PRESENT (disclosed) |
| REGRESSED | None |
| FIXED | None |
| NEW | M-14, M-15; LOW N-A3 to N-A7, N-B1 to N-B5, N-C1 to N-C3, N-D1 to N-D3 |

## INFO / PASS

Read-confirmed, not device-verified.

- **Gate logic:** every chokepoint reads `proceedAllowed`: WC `personal_sign`/typed/send (`WalletConnectProvider.jsx:420,486,580`), session approval (`:1043-1050`), `replacement.js:462-468`, `TokenApprovals.jsx:202-204`, `CryptoSigning.jsx:62-64`, `SendCrypto.jsx:1509`. The historic `gate.blocked`/`gate.sentence` bug is absent; remaining hits are `sensitiveGate()`, which legitimately returns those fields. No probe error, timeout or malformed shape yields ALLOW (worst case WARN; chain throw gives BLOCK; `degrade()` falls back to FAIL_CLOSED; unknown tier BLOCK, unknown level CONFIRM). `presignGateOrReject.js` refuses malformed `blockedActions` (`:54`) and a WARN artifact without `requiresBiometric` (`:60`). Unlock fast-paths gate on `tier === ALLOW` (`native.js:645,1328`). `VITE_BYPASS_RASP` is hook-only and hard-fails in production builds (`useRaspArtifact.js:45-56`). Seed-reveal/export/import use the fresh local artifact. iOS BLOCK never creates the bridge (`SceneDelegate.swift:44-51`).
- **WalletConnect:** presignGate in all three handlers and session approval; v1/v3, `eth_sign`, `eth_signTransaction`, add/switch chain blocked (`router.js:50-57`); namespace advertises only the three supported methods; typed-data `domain.chainId` required and bound to the session chain (domainless Permit rejected); primaryType root reconciliation (`typed-data.js:110-114`); topic-to-session binding from the live SDK store; foreign signer/`from` rejected pre-modal and at sign time; gas clamp; step-up enforced in every handler; `WC_TOKEN_NOT_LIVE` fails closed; 2FA, spend-limit and limits-unreadable gates fail closed; client destroyed in lock/decoy/hidden/demo (I3).
- **KEK:** `combineKek` is ordered H‖C with domain `veyrnox/kek/v1/combine(H||C)`, 32-byte and non-zero checks, H/C/ikm/KEK zeroed in `finally` (`kek.js:216-285`); `native.js` zeroes H, C, KEK, DEK in `finally` blocks; hardware tier restricted to `ACCEPTED_TIER_NAMES` (`hardware.js:183`); `setInvalidatedByBiometricEnrollment(true)` on Android keys, `.biometryCurrentSet` on iOS, invalidation maps to wipe-exempt stable codes; no DEVICE_CREDENTIAL at the OS key level (`.kt:243,454`); iOS SE key real (`kSecAttrTokenIDSecureEnclave`, `.m:177`, `EnclaveKeyService.swift:131`) and `VeyrnoxEnclavePlugin` gates create/wrap/unwrap on `IntegrityGate`; `getHardwareFactor` RASP-gated on both platforms with fail-closed salt handling; `allowBackup="false"`.
- **Auth:** timing equalizer holds (no oracle beyond M-6a); `captureVerifierSafe` catches everything and returns null (`credentialVerifier.js:102-108`); `verifyCredential` fails closed, constant-time compare, `MAX_CREDENTIAL_LEN=1024`; `lock()` zeroes the verifier; PIN counter keys in the panic residue list (`panic.js:259-260`), session floor monotonic, backoff clamped to 5 minutes, `shouldWipe` uses `>=`; tampered `kekKdf` stamp cannot force a large allocation (`kekProfiles.js:48-57`); `retrieveUnlockSecretDirect` requires KEK enrollment; `twoFactorGate` pure, fail-closed, I3-safe; `copySecret` wipe commits only on confirmed write.
- **Build:** release cert injected via `-P RELEASE_CERT_SHA256`, blank/malformed rejected (`build.gradle:370-378`), CI guard (`ci.yml:1267-1312`); `detectTamper` fails closed on blank cert/missing signature/exception (`.kt:824-870`).

## Priority order suggested by the agents

1. H-1 (raw-DEK fast path; accepted-risk comment stale).
2. H-2 (typed-data deny-by-shape).
3. M-14 + M-3 (attestation and local root probes both blind to a hidden-root device) and M-1 + M-2 (check Android/iOS attestation state first; apply latch after the timeout wrapper).
4. M-6 error codes (OOM / tampered stamp wipe-exempt) with M-5 before any `AAD_V3_MIGRATION_ENABLED` flip.
5. One-block fixes: M-11 (delete `SceneDelegate.swift:67-73`), M-15 (`excludeAttestation:true` at `PersonalBackup.jsx:548,813`), L-4 (RASP-gate `enroll`/`clearCredential`).
6. Owner decisions: N-D1 (PIN length policy vs code), N-A7 (iOS `VITE_RELEASE`), per-flavour cert pins.
