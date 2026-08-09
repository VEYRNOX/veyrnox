# RASP certification evidence package — Veyrnox

**Date:** 2026-08-09
**Audience:** internal record / handoff to outstanding independent audit (see §24, [`docs/Audit.scope.md`](Audit.scope.md))
**Status of RASP itself:** BUILT + device-verified INTERNAL on both platforms. **NOT independently audited.**
**Status of this package:** internal working document; nothing here promotes any RASP claim from INTERNAL to INDEPENDENT (I4).

---

## 1. Purpose

Point an auditor (or a returning engineer) at every RASP artifact in one hop:
source, tests, signals, device-verified evidence, composition with the sign gate,
fail-closed proof sites, and the honest gaps that stay open until an independent
firm signs off.

This document is a **pointer index**, not a rewrite. Source of truth stays in
[`docs/Feature-Status.md`](Feature-Status.md) (per-signal rows) and
[`docs/CLAUDE-audit-archive.md`](CLAUDE-audit-archive.md) (per-session evidence).
If a claim here disagrees with those, they win.

---

## 2. Read order

1. [`docs/Audit.scope.md`](Audit.scope.md) — the mainnet gate + what "independent audit" means
2. This file — the RASP index
3. [`docs/Feature-Status.md`](Feature-Status.md) `F-01`–`F-09`, `G3`, `C-01`, `M2c/M2d` rows
4. [`docs/CLAUDE-audit-archive.md`](CLAUDE-audit-archive.md) sections `2026-07-11 → 2026-07-14`
5. Source (§4 below)
6. Tests (`src/rasp/__tests__/`, `android/app/src/test/java/com/veyrnox/app/`)

---

## 3. Scope

**In scope**
- Anti-tamper / anti-rooting / anti-jailbreak signals shipped in the app
- The pre-sign gate composition that turns a signal set into `ALLOW / WARN / BLOCK`
- Play Integrity JWS verification + nonce binding
- iOS App Attest (Enclave) key-wrap surface
- Deniability (I3) composition
- Fail-closed (I4) behaviour on control errors

**Not in scope for THIS package** (belongs to the outstanding independent audit,
NOT redressed here)
- Full-stack crypto review (KEK, vault, signing)
- Supabase RLS enumeration on the live DB
- RevenueCat runtime + IAP entitlement enforcement
- Native binary reverse-engineering
- Threat modelling against nation-state adversaries
- Attestation supply-chain (Google Play attestor / Apple App Attest CA)

---

## 4. Component inventory

### 4.1 JavaScript layer (`src/rasp/`)
| File | Role |
|---|---|
| [`src/rasp/index.js`](../src/rasp/index.js) | Public API surface |
| [`src/rasp/detect.js`](../src/rasp/detect.js) | Signal → condition mapping |
| [`src/rasp/degrade.js`](../src/rasp/degrade.js) | Condition → RASP tier ladder |
| [`src/rasp/conditions.js`](../src/rasp/conditions.js) | Enumerated condition constants |
| [`src/rasp/browserProbe.js`](../src/rasp/browserProbe.js) | `navigator.webdriver`, legacy automation fingerprints |
| [`src/rasp/nativeProbe.js`](../src/rasp/nativeProbe.js) | Capacitor bridge into native plugins |
| [`src/rasp/selectPresignProbeSource.js`](../src/rasp/selectPresignProbeSource.js) | Selects native probe on native, browser probe on web |
| [`src/rasp/raspIntegrityPlugin.js`](../src/rasp/raspIntegrityPlugin.js) | JS wrapper for the Android plugin |
| [`src/rasp/attestation.js`](../src/rasp/attestation.js) | Play Integrity + App Attest surface |
| [`src/rasp/getFreshRaspArtifact.js`](../src/rasp/getFreshRaspArtifact.js) | Cache-busting probe fetch |
| [`src/rasp/useRaspArtifact.js`](../src/rasp/useRaspArtifact.js) | React hook |
| [`src/rasp/sensitiveGate.js`](../src/rasp/sensitiveGate.js) | Additional gate for sensitive UI mounts |
| [`src/rasp/__tests__/`](../src/rasp/__tests__/) | Unit tests (~29 for G3 alone) |

### 4.2 Android native (`android/app/src/main/java/com/veyrnox/app/`)
| File | Role |
|---|---|
| [`RaspIntegrityPlugin.kt`](../android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt) | `checkIntegrity()` bridge — rooted / hookedProcess / emulator / tampered |
| [`PlayIntegrityPlugin.kt`](../android/app/src/main/java/com/veyrnox/app/PlayIntegrityPlugin.kt) | Play Integrity token request + verify |
| [`PlayIntegrityJwsVerifier.kt`](../android/app/src/main/java/com/veyrnox/app/PlayIntegrityJwsVerifier.kt) | ES256 JWS signature verification, issuer-CN Google, SHA-256 pin |
| [`PlayIntegrityNonceVerifier.kt`](../android/app/src/main/java/com/veyrnox/app/PlayIntegrityNonceVerifier.kt) | Nonce binding |
| [`HardwareKekPlugin.kt`](../android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt) | StrongBox / TEE key-wrap (M2d) |
| [`EnclaveKeySpecConfig.kt`](../android/app/src/main/java/com/veyrnox/app/EnclaveKeySpecConfig.kt) | Key-spec pinning |

### 4.3 iOS native (`ios/App/`)
| File | Role |
|---|---|
| [`ios/App/CapApp-SPM/Sources/CapApp-SPM/VeyrnoxEnclavePlugin.swift`](../ios/App/CapApp-SPM/Sources/CapApp-SPM/VeyrnoxEnclavePlugin.swift) | Secure Enclave key-wrap (M2c) + jailbreak dylib scan |
| [`ios/App/App/AppDelegate.swift`](../ios/App/App/AppDelegate.swift) | Plugin registration |

### 4.4 Composition (sign gate)
| File | Role |
|---|---|
| [`src/sign-gate/presign.js`](../src/sign-gate/presign.js) | `presignGateOrReject()` — the single chokepoint. Returns `{proceedAllowed, signerReachable}` |
| [`src/sign-gate/compose.js`](../src/sign-gate/compose.js) | 4-value lattice composition of RASP tier + risk score |
| [`src/lib/sendGate.js`](../src/lib/sendGate.js) | Consumer for on-chain sends |
| [`src/lib/wcTypedLevel.js`](../src/lib/wcTypedLevel.js) | Scores WC typed-data → gate level (M-5, 2026-07-28) |

---

## 5. Signal catalog

Authoritative row is in [`docs/Feature-Status.md`](Feature-Status.md); columns
below name the signal, current status, and the file that implements it. **Read
the Feature-Status row before quoting.**

| ID | Signal | Status | Implementation |
|---|---|---|---|
| F-01 | Vault at rest (AES-256-GCM, Argon2id) | BUILT | vault code |
| F-02..F-05 | Panic wipe + residue inspection | BUILT | wipe path |
| F-09 | Native RASP integrity probe | **BUILT + device-verified INTERNAL** on Android (2026-07-12) and iOS (2026-07-14) | `RaspIntegrityPlugin.kt`, `VeyrnoxEnclavePlugin.swift` |
| G3 | Frida Gadget detection | **BUILT + device-verified INTERNAL** on both platforms (2026-07-14) | `RaspIntegrityPlugin.kt::checkGadgetThreads`, iOS dylib scan; 29/29 unit tests in `src/rasp/__tests__/g3-frida-gadget.test.js` |
| C-01 | Pre-sign gate fails closed when native probe missing | FIXED PR #825 (2026-07-11) | `src/sign-gate/presign.js` |
| M2c | iOS Secure Enclave key-wrap | BUILT + device-verified FULL 2026-07-08 | `VeyrnoxEnclavePlugin.swift`; ungated PR #1152 |
| M2d | Android StrongBox/TEE key-wrap | BUILT + device-verified FULL 2026-07-17/18 | `HardwareKekPlugin.kt`; ungated PR #1152 |
| — | Browser probe (`navigator.webdriver`, phantom, selenium) | BUILT | `src/rasp/browserProbe.js`; e2e proof `e2e/rasp-automation-detection.spec.js` (PR #644) |
| — | Play Integrity JWS + nonce | FIXED PRs #955, #1009 (ES256 JWS, nonce binding) | `PlayIntegrityJwsVerifier.kt`, `PlayIntegrityNonceVerifier.kt` |
| — | H-1 WC session-approval RASP gate | FIXED PR #1276 (2026-07-20) — was reading `gate.blocked` which `presignGateOrReject` never returns; now `!gate.proceedAllowed` | `src/lib/WalletConnectProvider.jsx::handleApproveSession` |

---

## 6. Device-verified evidence log

All INTERNAL — verified in-house, not by an independent firm.

| Date | Signal | Device | Result | Evidence |
|---|---|---|---|---|
| 2026-07-11 | C-01 fail-closed pre-sign | Android debug | Fixed | PR #825; unit tests `src/sign-gate/__tests__` |
| 2026-07-12 | F-09 Android | Samsung Galaxy Note 20 5G (SM-N981B), Magisk v30.7, Android debug | `checkIntegrity() → {rooted:false, hookedProcess:false, emulator:false, tampered:false}`. `rooted:false` expected (Magisk Hide operates at probe level). Pre-sign TIER.ALLOW → CAUTION-ack → send. | On-chain: Ethereum mainnet txid `0x4556e2e68087d0b75b35504247ed09f011d42614f11b31c5d1423694799da515`, block 25,511,567, SUCCESS, 0.001 ETH. Bugs found + fixed same session: PR #832, #834. |
| 2026-07-14 | F-09 iOS | iPhone 8 Plus (iPhone10,5), iOS 16.7.16, palera1n rootful | Security Dashboard RED; RASP Security page RED "hooked" — `checkDynamicLibraries()` caught Substrate/ElleKit dylib injected by palera1n bootstrap → TIER.BLOCK (signing refused). | PRs #947, #953. Honest gap: individual check contributions (`checkJailbreakPathsCstat`, `checkFork`) confirmed by UI state only (syslog unavailable this session). |
| 2026-07-13/14 | G3 Frida Gadget Android | SM-N981B, Frida 17.15.4, real GLib runtime threads | `System.loadLibrary("frida-gadget")` in verification-only debug build; Frida configured listen mode port 27042; `adb forward`; client connected. `/proc/28707/task/*/comm` confirmed `gum-js-loop`, `gmain`, `gdbus`, `frida-gadget`. Verdict: `{rooted:true, hookedProcess:true, emulator:false, tampered:true}` — flipped from clean baseline. | PR #948. Operative signal: thread-comm scan. `pool-frida` thread absent (Frida-version-specific). Verification build reverted after session (System.loadLibrary block + jniLibs removed). |
| 2026-07-14 | G3 Frida Gadget iOS | iPhone 8 Plus, iOS 16.7.16, palera1n rootful, stub FridaGadget.dylib | Detected via `checkDynamicLibraries` dylib scan | See §2026-07-13/14 in [`CLAUDE-audit-archive.md`](CLAUDE-audit-archive.md) |
| 2026-07-14 | Magisk Hide bypass | SM-N981B | Verdict `{rooted:true, hookedProcess:false, emulator:false, tampered:true}` — `rooted:true` fired via `checkDangerousProps` (`verifiedbootstate=orange`, unlocked bootloader). `checkProcNetUnix` did NOT fire (Magisk v30.7 uses different socket names). `checkSuFromRuntime` did NOT fire (Magisk Hide covers `su` in PATH). `tampered:true` expected (debug build, `RELEASE_CERT_SHA256` unset — fail-closed I4). | Extended path lists cover KernelSU, Apatch, LSPosed, newer Magisk. `checkXposed` + `checkProcMapsForHook` extended with LSPosed/Zygisk markers. |

Additional structural test proof:
- 29/29 G3 unit tests: [`src/rasp/__tests__/g3-frida-gadget.test.js`](../src/rasp/__tests__/g3-frida-gadget.test.js)
- Play Integrity JWS: [`android/app/src/test/java/com/veyrnox/app/PlayIntegrityJwsVerifierTest.kt`](../android/app/src/test/java/com/veyrnox/app/PlayIntegrityJwsVerifierTest.kt) — includes a JVM test constructing an issuer-CN-"Google" cert with wrong SHA-256; asserts `verify() = false`
- Play Integrity nonce: [`android/app/src/test/java/com/veyrnox/app/PlayIntegrityNonceVerifierTest.kt`](../android/app/src/test/java/com/veyrnox/app/PlayIntegrityNonceVerifierTest.kt)
- e2e RASP automation: `e2e/rasp-automation-detection.spec.js` (PR #644, commit `dc63c8ec9`, ran 2026-07-07 GREEN 1/1 in CI)

---

## 7. Composition — how a signal becomes a gate decision

Chokepoint: [`src/sign-gate/presign.js::presignGateOrReject`](../src/sign-gate/presign.js). Every signing path funnels through it.

Order of operations:
1. `selectPresignProbeSource()` picks browser or native probe (native on Capacitor, browser otherwise)
2. `detect(probe)` maps signals → conditions (`ROOTED`, `HOOKED`, `EMULATOR`, `TAMPERED`, `INTEGRITY_UNAVAILABLE`, …)
3. `degrade(conditions)` reduces to a tier: `ALLOW` / `WARN` / `BLOCK`
4. `compose()` in [`src/sign-gate/compose.js`](../src/sign-gate/compose.js) combines RASP tier with risk score (S1–S9, see [`docs/Feature-Status.md`](Feature-Status.md) risk-scoring row) on a 4-value lattice → `{proceedAllowed, signerReachable}`
5. Consumers check `!proceedAllowed` and refuse (send, WC session approve, WC signing request)

Consumers (each MUST read `!proceedAllowed`, never any other shape):
- [`src/lib/sendGate.js:133`](../src/lib/sendGate.js) — on-chain sends
- [`src/lib/WalletConnectProvider.jsx::handleApproveSession`](../src/lib/WalletConnectProvider.jsx) — WC session approval (PR #1276 fixed this; was reading `gate.blocked` which never existed)
- WC signing chokepoints (`eth_sendTransaction`, `eth_signTypedData_v4`, `personal_sign`) — all three go through `presignGateOrReject`
- [`src/lib/wcTypedLevel.js`](../src/lib/wcTypedLevel.js) — typed-data gets `scoreWcTypedDataLevel` promoting to `assetAuthorising` (M-5, 2026-07-28)

---

## 8. Fail-closed proof sites (I4)

An auditor should assert each of these still holds — a regression here is
higher-severity than an added signal.

| Site | Property | File:line |
|---|---|---|
| Native probe missing | `INTEGRITY_UNAVAILABLE` → WARN/biometric re-confirm, NEVER fabricated `CLEAN` | `src/rasp/degrade.js` |
| Pre-sign gate error | Denies the action, never allows | `src/sign-gate/presign.js` |
| Play Integrity JWS bad signature | `verify() = false` | `PlayIntegrityJwsVerifier.kt` + test |
| Play Integrity nonce mismatch | Rejected | `PlayIntegrityNonceVerifier.kt` + test |
| Release-cert fingerprint mismatch | `tampered:true` (verified 2026-07-14; debug build with `RELEASE_CERT_SHA256` unset is the same code path as a wrong-cert release) | `RaspIntegrityPlugin.kt::checkTampered` |
| WC session approval | Requires `!gate.proceedAllowed` denial, not `gate.blocked` | `WalletConnectProvider.jsx::handleApproveSession` (PR #1276) |
| Native release-cert build guard | Fails closed on missing keystore / unreadable keystore | `android/app/build.gradle` (PRs #1386, #1391, issue #1373 closed 2026-07-26) |

---

## 9. Deniability composition (I3)

RASP signals are functions of the environment only — no wallet-set handle,
so no set-existence oracle. Verified via unit test that a deniability session
does NOT flip any RASP UI state on/off.

- Reader: `isDeniabilityOrDemoActive()` — 89 files use it (2026-07-29 count)
- Consent write-gate: [`src/lib/consent.js`](../src/lib/consent.js) — PR #1410 pattern
- Telemetry egress gate: [`api/trackEvent.js`](../api/trackEvent.js) — separate chokepoint

---

## 10. Known gaps (honest, from `CLAUDE.md` + audit archive)

1. **Independent third-party security audit — OUTSTANDING.** Internal audit (2026-06-17) and ECC internal review (2026-06-23) complete; full-stack third party has not run. Nothing in this package elevates that.
2. **Individual iOS palera1n check contributions** (`checkJailbreakPathsCstat`, `checkFork`) confirmed via UI state only on 2026-07-14; syslog unavailable that session.
3. **Magisk `rooted:false` false-negative expected** — Magisk Hide operates at probe level. `checkDangerousProps` still fires on `verifiedbootstate=orange` (unlocked bootloader).
4. **`RELEASE_CERT_SHA256`** must be set in the production Gradle build for `tampered` to distinguish official from repackaged builds. Debug builds intentionally fail closed with `tampered:true`.
5. **RASP does NOT gate the fiat on-ramp (Buy).** Design decision (`docs/transak-integration-spec.md §9`) — Buy is fiat-in only, no signing. Revisit if scope expands.
6. **Vault AAD v:3 migration** — plan r2 done, implementation blocked (issue #1111). Unrelated to RASP proper; relevant because the AAD binding is what makes a stolen vault blob unusable off-device.
7. **Codex second-pass reviews are INTERNAL** — Claude-run tooling. Do not count Codex verdicts as independent.

---

## 11. Auditor reproduction runbook

### 11.1 Android (Magisk root path)
1. Flash factory image, unlock bootloader (`verifiedbootstate=orange`), install Magisk.
2. Install release APK via `adb install`.
3. Launch app; unlock or create wallet.
4. Navigate to Send. Expect RASP tier promotion → BLOCK or WARN (per §7).
5. Enable Magisk Hide targeting `com.veyrnox.app`. Expect probes still fire via `checkDangerousProps` (unlocked bootloader).
6. Inject Frida Gadget via `System.loadLibrary` in a verification-only debug build (see 2026-07-13 log for exact steps). Expect `hookedProcess:true`.
7. Attempt a WC session approve — expect denial per PR #1276.

### 11.2 iOS (palera1n path)
1. Restore iPhone with a palera1n-compatible iOS version.
2. Install ipa via TestFlight or Xcode.
3. Bootstrap palera1n rootful (ElleKit).
4. Launch app; open Settings → RASP Security page. Expect RED "hooked" — `checkDynamicLibraries` catches the Substrate/ElleKit dylib.
5. Attempt to sign. Expect TIER.BLOCK.

### 11.3 Reading the source without a device
1. Read `src/sign-gate/presign.js` end-to-end.
2. Follow the imports back to `src/rasp/degrade.js`, `detect.js`, `conditions.js`.
3. Read `src/rasp/__tests__/g3-frida-gadget.test.js` — 29 assertions cover the Frida detection matrix.
4. Read the two Play Integrity Kotlin tests.
5. Grep for `presignGateOrReject` — every hit is a chokepoint consumer; verify each reads `!proceedAllowed`.

---

## 12. Where this file MUST NOT be quoted

- App Store / Play submissions describing anti-tamper claims — Apple/Google want a lab attestation (MASA), not this doc.
- Insurance / procurement questionnaires that ask for "third-party security certification" — the answer stays "independent audit outstanding".
- Marketing copy.

Use for: internal handoff, engineer onboarding, drafting the independent-audit
scope-of-work, spot-checking RASP claims before they land in `Feature-Status`.
