# Internal Security Audit — 2026-07-14
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-07-14
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `claude/samsung-phone-rasp-testing-ece279`
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

---

## Headline

**One CRITICAL, high-confidence, verified by hand.** The C-01 native-probe fail-open fix
(`selectPresignProbeSource`, PR #825) was applied **only** to `SendCrypto.jsx`. Three
other live signing chokepoints — cold-sign broadcast, WalletConnect signing, and the
in-app signing tool — still evaluate the RASP verdict off the **browser** probe leg, which
on a native Capacitor WebView always reports CLEAN. On a rooted / Magisk / Frida-hooked /
tampered device those three paths sign with zero RASP friction. Two independent specialist
agents (RASP surface and WalletConnect surface) converged on this same root cause; a manual
grep of all four call sites confirmed it.

| Severity | Count |
|---|---|
| CRITICAL | 1 |
| HIGH | 1 |
| MEDIUM | 8 |
| LOW | 8 |
| PASS (controls confirmed correct) | 30+ across all four surfaces |

---

## ⚠️ Reconciliation against `origin/main` (added post-audit, 2026-07-14)

**The audit above ran against branch `claude/samsung-phone-rasp-testing-ece279`, which was
139 commits behind `origin/main`.** This is the "fetch main before diagnosing" trap
(CLAUDE.md §Working pattern). Every finding was re-verified against `origin/main` (worktree
at `280b9f43`, `fix(kek)… (#995)`). Corrected status per finding:

| # | Severity (branch) | Verdict vs `origin/main` | Evidence |
|---|---|---|---|
| **C-1** | CRITICAL | ✅ **FIXED** | `ColdSign.jsx:63` + `CryptoSigning.jsx:33` use `useRaspArtifact()`; `WalletConnectProvider.jsx:49-51` imports `nativeProbeSource`+`selectPresignProbeSource`; `RaspSecurity.jsx:87` native-aware. PRs #954 (WC), #960 (ColdSign/CryptoSigning), #966 (test sync), #953 (RaspSecurity). |
| **H-1** | HIGH | ⚠️ **STILL PRESENT** | `WalletProvider.jsx:215` `PRIMARY_UNLOCK_EQUALIZER_MS=2000`; flow unchanged — primary-success ≈2 KDF+2000 ms vs miss/duress 5 KDF. Equalizer invariant comment (:198-215) still assumes a ~1-KDF gap; M-4 fix only equalized miss-vs-hit, not success-vs-miss. **Caveat:** static call-graph inference; magnitude needs on-device wall-clock. |
| **M-1** | MEDIUM | ⚠️ **STILL PRESENT** | `HardwareKekPlugin.kt:359-360` — `hmacResult` (plaintext H) base64-encoded, never `.fill(0)`. |
| **M-2** | MEDIUM | ⚠️ **STILL PRESENT** | `HardwareKekPlugin.m:170` enroll uses immutable `NSData dataWithBytes`; the `NSMutableData`+`resetBytesInRange` fix exists only on the decrypt path (:329-333), not enroll. |
| **M-3** | MEDIUM | ⚠️ **STILL PRESENT** | `RequestApprovalModal.jsx:140-145` `approveBlocked` excludes `dapp.flagged`/`sessionUnresolved`; `riskBlocks` (:136) covers only SEND risk verdict. |
| **M-4** | MEDIUM | ⚠️ **STILL PRESENT** (partially mitigated) | `WalletConnectProvider.jsx:325-327` still `rejectRequest(...).catch(()=>{})` with no throw → modal closes with no reason shown. Note: WARN/CONFIRM now **rejected** on the WC surface (:262-264), stricter than at audit time. |
| **M-5** | MEDIUM | 🟡 **PARTIALLY FIXED** | `requiresBiometric` is no longer dead: `SendCrypto.jsx:793-866,1678-1690` (B5, 2026-07-13) reads it and enforces `verifyBiometric2fa()` on native WARN. Still acknowledge-only on the WC/ColdSign/CryptoSigning WARN paths. |
| **M-6** | MEDIUM | ⚠️ **STILL PRESENT** (minor under-claim) | `RaspSecurity.jsx:45` still returns `detection: "pending"` despite native plugin BUILT + device-verified-FULL (2026-07-12). Under-claim, not I4. |
| **M-7** | MEDIUM | ✅ **FIXED** | `RaspSecurity.jsx:87-88` uses `selectPresignProbeSource` (native-aware readout). PR #953. |
| **M-8** | MEDIUM | ⚠️ **STILL PRESENT** (disclosed/design) | PIN counter still `localStorage`; honestly disclosed (`WalletEntry.jsx:65`), hardware-KEK is the tracked fix. |
| **L-1** | LOW | ⚠️ STILL PRESENT | `RaspIntegrityPlugin.kt:91` `checkSystemWritable()` — inherent technique limit, OR'd with stronger checks. Not a defect. |
| **L-2** | LOW | ⚠️ STILL PRESENT | `WalletConnectProvider.jsx:115-118` `resolveGasLimit` still doesn't clamp negative `txGas` (RPC rejects anyway). |
| **L-3** | LOW | ⚠️ STILL PRESENT | `checkTypedDataChainId` defined (`typed-data.js:43`) but still not called by the provider (inline dup). |
| **L-4** | LOW | ⚠️ STILL PRESENT | Modal dApp identity still from React `sessions` state, not live store (tied to M-3). |
| **L-5** | LOW | ⚠️ STILL PRESENT | `hardware.js:227` matches Android's literal `'User cancelled'`; iOS cancel → `NO_HARDWARE_FACTOR`. UX-copy only, verified not data-loss. |
| **L-6** | LOW | ⚠️ STILL PRESENT | Android salt `ByteArray` not zeroed (same site as M-1). |
| **L-7** | LOW | ⚠️ STILL PRESENT | `HardwareKekPlugin.kt:396-398` `prompt.authenticate` inside async `runOnUiThread` still outside the enclosing try/catch. |
| **L-8** | LOW | ⚠️ STILL PRESENT (disclosed) | `copySecret.js:28-30` unconditional overwrite, no read-back sentinel — data-loss nuisance, not secrecy. |

**Corrected posture on `origin/main`:** **0 CRITICAL** (C-1 fixed), **1 HIGH** (H-1, with a
static-analysis confidence caveat), plus MEDIUM/LOW residuals — most of them defense-in-depth
zeroing gaps (M-1/M-2/L-6), honest under-claims (M-6), or disclosed/design items (M-8, L-8).
The single finding worth prioritising on main is **H-1** (primary-unlock timing oracle),
pending an on-device wall-clock measurement to size the fix. M-1/M-2 (native-bridge H
residue) are the next tier — same class as the already-tracked open M-6/iOS-F5.

*All original branch-relative findings are preserved verbatim below for the record.*

---

## Changes since last audit

Recent security-relevant commits on this branch (`git log --oneline`):

- `fe50c4c9` docs: F-09 device-verified FULL (SM-N981B, 2026-07-12) + PR #832/#834 presign fixes (#835)
- `ebba03c3` fix(presign): `riskReady=true` when simulation is disabled (#834)
- `433fd1e9` fix(presign): CAUTION verdict now requires confirmation + RASP WARN acknowledge button (#832)
- `b03f6f91` perf(presign): parallel RPC calls + 10s timeout + verify-screen toggle hint (#831)
- `f6fa1992` docs: sync audit status — PRs #821/#822/#825, F-09 PARTIAL, RASP C-01 (#830)
- `cb065cee` build(ios): add RaspIntegrity plugin to the Xcode target (#826)
- `7633c308` **fix(rasp): fail closed on native in the pre-sign gate (C-01) (#825)** ← the fix whose scope this audit finds incomplete
- `90edde15` fix(security+test+docs): audit findings M-3/M-5/M-2/M-9 — enclave gate, migration logging, hw-send tests, PIN disclosure (#821)
- `055bf8dd` fix(security+ui): KEK biometric-invalidation lockout, Samsung error UX (#813)
- `dcf8db11` feat(rasp): F-09 native RASP probe wired + device-verified (PARTIAL) on Samsung Note 20 5G (#814)

The bulk of the RASP work (C-01 fix #825, F-09 native probe wiring #814, presign gate
fixes #831/#832/#834) landed since the prior audit trail. The C-01 fix is the direct cause
of this week's CRITICAL: the pre-sign gate was hardened correctly on the Send path but the
same pattern was not propagated to the other signing entry points.

Uncommitted working-tree noise at audit time: `package.json` / `package-lock.json` modified
(dependency churn, not security-relevant to this scope) and an untracked stray file `span]`.
Neither is part of this audit.

---

## CRITICAL

### C-1 — C-01 fail-open fix never propagated: three live signing chokepoints still evaluate RASP off the browser-only probe (fail-OPEN on native)
**Files (verified by grep at audit time):**
- `src/pages/ColdSign.jsx:160` — `tier = degrade(detect(browserProbeSource)).tier`
- `src/lib/WalletConnectProvider.jsx:213` — `const { tier } = degrade(detect(browserProbeSource));` (gates `personal_sign`, `eth_sign`→blocked, `eth_signTypedData_v4`, `eth_sendTransaction` via `presignGateOrReject`)
- `src/pages/CryptoSigning.jsx:100` — `tier = degrade(detect(browserProbeSource)).tier` (a real ethers-key signing chokepoint, per its own H13 comment)

**Reference (correctly fixed):** `src/pages/SendCrypto.jsx:697` —
`degrade(detect(selectPresignProbeSource(Capacitor.isNativePlatform(), nativeProbe, browserProbeSource)))`

**Failure scenario.** `browserProbeSource` (`src/rasp/browserProbe.js:69-74`) is honestly
documented to hard-code `rooted:false / emulator:false / tampered:false` and `available:true`
inside a WebView — it has no OS-level visibility. On native, `detect(browserProbeSource)`
therefore always classifies CLEAN → `degrade` → `TIER.ALLOW` → `presignGate(ALLOW, OK, false)`
returns `proceedAllowed:true` unconditionally. So:
- A user broadcasting a cold-signed tx (`ColdSign.jsx`),
- A dApp sending a WalletConnect `eth_sendTransaction` / `personal_sign` / `signTypedData_v4`
  request (`WalletConnectProvider.jsx`) — dApp-triggered, reaches the gate with no extra tap,
- A user signing via the `/crypto-signing` tool (`CryptoSigning.jsx`),

all evaluate RASP on browser-only signals that read CLEAN, even when the native
`RaspIntegrityPlugin.kt` would have reported `rooted:true` / `hookedProcess:true` /
`tampered:true`. The three sites do not import `nativeProbeSource` / `selectPresignProbeSource`
and have no `Capacitor.isNativePlatform()` branch for the gate.

**This is a scope-regression of C-01, not a new class.** C-01 (internal-audit-2026-07-11,
PR #825) fixed exactly this bug — but the fix touched only `SendCrypto.jsx` (+ the `rasp/`
module + its tests). The other three chokepoints present a gate that *looks* identical to
the fixed one but silently degrades to a no-op on the exact devices it exists to catch.

**I4 violation: YES.** A control that silently passes when it cannot actually check.

**Note — a regression test currently pins the vulnerable pattern:**
`src/pages/__tests__/ColdSign.h11.test.js:30-33` asserts
`expect(src).toMatch(/detect\(\s*browserProbeSource\s*\)/)`. Any fix must update this test.

**Recommended fix.** Apply the `SendCrypto.jsx:664-697` pattern to all three sites: sample
`nativeProbeSource()` once (Capacitor bridge, cached in state/module scope) and route through
`selectPresignProbeSource(Capacitor.isNativePlatform(), nativeProbe, browserProbeSource)`
before `detect()`. For `WalletConnectProvider.jsx`, plumb an async-sampled `nativeProbe` into
the provider. Update `ColdSign.h11.test.js` and add a C-01 regression test per chokepoint
mirroring `SendCrypto.raspNativeProbe.test.jsx`. Priority remediation before any further
mainnet-facing native release.

---

## HIGH

### H-1 — Primary-unlock timing equalizer under-compensates by ~2.3 s; real-PIN vs duress/wrong-PIN distinguishable by stopwatch (I3 timing oracle)
**Files:** `src/lib/WalletProvider.jsx:195-212` (`PRIMARY_UNLOCK_EQUALIZER_MS`, rationale), `:1476-1490` (primary-success path), `:1502-1557` (deniability / total-miss path), `:1710` (shared trailing `captureVerifierSafe`); `src/wallet-core/deniabilityUnlock.js:71-96`.

**Traced call graph (KDF count per outcome):**

| Outcome | Real Argon2id KDFs | Sleep | Approx wall time* |
|---|---|---|---|
| Primary success (correct real PIN) | 2 | 2000 ms | ~4.9 s |
| Duress hit / Hidden hit | 5 | 0 | ~7.2 s |
| Total miss (wrong PIN) | 5 | 0 | ~7.2 s |
| Panic-PIN hit | 4 | 0 | ~5.8 s |

\* using the repo's own stated ~1.44 s/KDF mobile-WebView figure at current 192 MiB / t=3 params (`WalletProvider.jsx:202-206`).

**Root cause.** The equalizer constant (2000 ms) is sized against a *single* extra KDF, but
in the composed `unlock()` flow the primary-success path runs **3 fewer** real KDFs than the
duress/wrong-PIN path (the failed-primary attempt already costs 1 KDF before
`resolveDeniabilityUnlock`'s 3 KDFs even begin; the trailing `captureVerifierSafe` at :1710 is
common to both and cancels out). Net residual gap ≈ 2.3 s (~47% longer for duress/wrong-PIN),
trivially measurable with a stopwatch — no timing harness required.

**Why CI misses it.** `primaryUnlockEqualizer.test.js` and the H3 block in
`deniability-timing.test.js` assert the *constant* is between 1 and 4 KDFs in isolation; neither
measures end-to-end `unlock()` wall-clock across outcomes.

**Exploit (I3).** A coercer/attacker timing PIN entry can distinguish a ~4.9 s response (real
primary PIN entered) from a ~7.2 s response (duress PIN or wrong guess) — undermining the
deniability threat model, which only accepts a ~1-KDF residual.

**Confidence caveat.** Finding is from static call-graph tracing, not an on-device measurement;
the *magnitude* depends on real per-KDF cost, but the *direction and structural deficit* (3 KDFs,
not 1) are code-evident. **Recommended:** restructure so primary-success spends the same
real/dummy KDF count as the failure path (avoids a second magic-number in the other direction),
and add an end-to-end wall-clock test across success / duress-hit / total-miss. Alternatively
raise `PRIMARY_UNLOCK_EQUALIZER_MS` to cover ~3 KDFs, derived from `KDF_PARAMS`, not hardcoded.

---

## MEDIUM

### M-1 — [KEK/Android] Raw HMAC output (hardware factor H) `ByteArray` never zeroed after base64 encode
**File:** `android/app/src/main/java/com/veyrnox/app/HardwareKekPlugin.kt:359-361`. `hmacResult` (plaintext H, mutable `ByteArray`) is base64-encoded then handed to `call.resolve` and never `.fill(0)`'d — lingers in the Android heap until GC, extractable via heap dump on a compromised device. Same defense-in-depth class as the iOS-F5 residue already fixed in `getHardwareFactor` (`HardwareKekPlugin.m:317-321`) but never mirrored on Android. Not I4 (H is genuinely hardware-bound); a residue-zeroing gap. **Fix:** `hmacResult.fill(0)` (and `macInput`/decoded salt at :302-310) immediately after `b64` is computed, before `call.resolve`.

### M-2 — [KEK/iOS] `enroll()` plaintext-H buffer (`hData`) is an immutable `NSData` copy, never zeroed
**File:** `ios/App/App/HardwareKekPlugin.m:162-179`. `memset(hBytes, …)` correctly zeroes the stack buffer, but `[NSData dataWithBytes:…]` copies those 32 bytes into an internal heap allocation that is never wiped and is architecturally un-wipeable via the immutable `NSData` API. Distinct site from the already-remediated *decrypt*-path residue (iOS-F5); the *enroll* path never got the fix. **Fix:** build `hData` as `NSMutableData` and `[hData resetBytesInRange:…]` after `SecKeyCreateEncryptedData` returns, mirroring :317-321.

### M-3 — [WC] Known-bad dApp flag is display-only at the per-request signing gate — Approve is not blocked on it
**File:** `src/components/walletconnect/RequestApprovalModal.jsx:139-161`. `dapp.flagged` renders a "⚠ Known scam / phishing dApp" banner (:199-207) but is **not** in `approveBlocked`. Session-establishment blocks known-bad domains (`session.js:194-207`), but no equivalent hard block exists at the per-request signing chokepoint. Scenario: a domain added to `LOCAL_KNOWN_BAD` after a session was approved (app update, stale session) shows the warning but Approve stays clickable; `sessionUnresolved` sets `flagged:true` with an explicit "treat as suspicious" reason that is never enforced. **Fix:** add `dapp.flagged` (or at least `sessionUnresolved`) to `approveBlocked` behind an acknowledgement checkbox, mirroring `permitAcknowledged`.

### M-4 — [WC] RASP-blocked WC request fails silently in the UI (fail-closed on the wire, not fail-*honest* to the user)
**File:** `src/lib/WalletConnectProvider.jsx:233-237, 279-283, 324-328`. When `presignGateOrReject()` blocks, the handler calls `rejectRequest(...)` and `return`s without throwing; the modal's `handleApprove` sees no exception and just `onClose()`s — the user is never told a device/environment check failed. The request *is* genuinely denied on the wire (fail-closed), so this weakens the "fail honest" half of I4 only. **Fix:** throw after `rejectRequest` on gate block so the modal's existing `catch { setErr(e.message) }` surfaces a real reason (mirrors the `PERSONAL_SIGN_ADDRESS_MISMATCH` pattern).

### M-5 — [RASP] WARN-tier `requiresBiometric` is a fully dead field; WARN enforcement is a checkbox, not step-up auth
**File:** `src/rasp/degrade.js:50,61,70,81,88,95,102,112,141`; enforcement `src/sign-gate/presign.js:44-59`; UI `src/pages/SendCrypto.jsx:1509-1524`. `degrade()` sets `requiresBiometric:true` for ROOTED / INTEGRITY_UNAVAILABLE, but no caller reads it (repo-wide grep). WARN handling only requires a boolean `acknowledged`; the only UI consumer renders a plain unauthenticated "I understand and want to proceed anyway" checkbox. On a rooted device a user taps a checkbox — no biometric re-auth — to sign. **Not I4** (honestly disclosed in `degrade.js:30-35` and `RaspSecurity.jsx:58-61` as "not yet wired"), but a real friction gap. **Fix:** wire real step-up biometric into the WARN path (reuse `verifyBiometric2fa`), or remove the misleading dead field.

### M-6 — [RASP] `RaspSecurity.jsx` / feature catalogue *understate* RASP status (stale "unbuilt/pending" copy)
**File:** `src/pages/RaspSecurity.jsx:9-12,58-61,115-119`; `src/lib/featureCatalogue.js:291`. The live security surface says OS-level detection "remains UNBUILT / pending Phase 4," but the native plugin is built, registered on both platforms, and device-verified (FULL, INTERNAL) 2026-07-12 on SM-N981B. **Not I4** (under-claiming, not false security) but will mislead an internal reviewer / audit scoping. **Fix:** sync copy to the actual BUILT + device-verified-FULL status per `docs/Feature-Status.md`, while still noting the independent audit is outstanding.

### M-7 — [RASP] `RaspSecurity.jsx` "Current environment" readout is browser-only on native (misleading display)
**File:** `src/pages/RaspSecurity.jsx:81` — `const liveCondition = detect(browserProbeSource);`. On a rooted native device this diagnostic page renders "clean" — materially misleading for a page whose purpose is transparency, and it compounds M-6. Display only, enforces nothing (no signing impact). **Borderline I4** (could read as false assurance). **Fix:** route through the same native/browser selection as the real gate, or explicitly label it "browser signals only."

### M-8 — [Auth] PIN failed-attempt counter lives in clearable localStorage — trivially resettable (disclosed, tracked)
**File:** `src/lib/pinAttemptGuard.js:11-17`; `src/components/WalletEntry.jsx:591-600,679-680`. The 10-strikes→panic-wipe counter (`PIN_WIPE_AFTER = 10`) is plaintext `localStorage` (`veyrnox-pin-attempts`). An attacker with a seized/unlocked device defeats the wipe via Settings→Clear Data or direct WebView-storage access. **Not I4** — extensively disclosed in-code and in `featureClassification.js`, with hardware-KEK as the tracked remediation. Remains a real local/offline bypass today. **Fix:** none needed for I4; folded into the already-planned hardware-KEK work.

---

## LOW

- **L-1 — [RASP] `checkSystemWritable()` weak on modern Android.** `RaspIntegrityPlugin.kt:94-101`. `/system` is RO under SELinux/OverlayFS even when rooted (Magisk keeps it RO), so this rarely fires. Inherent technique limitation, OR'd with three stronger checks. Not a defect; consider commenting as low-yield.
- **L-2 — [WC] `resolveGasLimit` does not reject negative `txGas`.** `src/lib/WalletConnectProvider.jsx:61-65`. A negative `txGas` passes the `> WC_GAS_CAP` check and is returned as-is (malformed gasLimit; RPC will reject, so not fund-loss). Clamp to `[0, WC_GAS_CAP]` for parity with `resolveMaxPriorityFeePerGas` (:102, which clamps negatives to 0n).
- **L-3 — [WC] Two independent EIP-712 chainId-binding implementations.** `src/wallet-core/evm/typed-data.js:43-64` (`checkTypedDataChainId`, exported + unit-tested but not called by the provider) vs the inline duplicate in `WalletConnectProvider.jsx:294-313`. Both currently correct; duplication is a divergence risk. Have `_handleSignTypedData` call the tested helper.
- **L-4 — [WC] Modal dApp identity uses possibly-stale React state.** `RequestApprovalModal.jsx:151` reads `sessions` from React context, whereas the authoritative binding (`assertSessionLive`, `WalletConnectProvider.jsx:492-509`) reads `getActiveSessions()` live. Display-only staleness; becomes more consequential once M-3 is fixed.
- **L-5 — [KEK] iOS Face ID cancel misclassified as `NO_HARDWARE_FACTOR` not `USER_CANCELLED`.** `src/wallet-core/keystore/hardware.js:226-233`; `HardwareKekPlugin.m:296-308`. iOS never emits the literal `'User cancelled'` string Android uses, so cancel falls through to the generic code. **Verified not a wipe-counter/data-loss risk** (`WalletEntry.jsx:666` exempts `NO_HARDWARE_FACTOR` from the counter identically to `USER_CANCELLED`). UX-copy precision only.
- **L-6 — [KEK] Android MAC input (salt) `ByteArray` not zeroed after HMAC.** `HardwareKekPlugin.kt:294-313,359`. Low sensitivity (salt, not secret); fix alongside M-1.
- **L-7 — [KEK] Android: exception inside the async `runOnUiThread` biometric-prompt callback escapes the surrounding try/catch.** `HardwareKekPlugin.kt:396-398`. Worst case is an unhandled crash (effectively fail-closed — no H fabricated), a robustness gap not a bypass. Wrap `prompt.authenticate(...)` in its own try/catch → `call.reject`.
- **L-8 — [Auth] `copySecret` wipe is an unconditional overwrite with no read-back sentinel.** `src/lib/copySecret.js:26-30,57-63`. If the user copies unrelated content within the 30 s window, the wipe clobbers it too. Data-loss nuisance, **not** a secrecy risk (the seed is still wiped); honestly disclosed in-source. All three triggers (timer / visibilitychange / APP_LOCK_EVENT) fire correctly exactly once.

---

## Status vs prior audit

| Prior finding | Source | Status this pass |
|---|---|---|
| **C-01** — RASP pre-sign gate fail-open on native (browser leg masks absent OS probe) | internal-audit-2026-07-11, PR #825 | **PARTIALLY FIXED / SCOPE-REGRESSED.** Fixed in `SendCrypto.jsx`; **STILL PRESENT** in `ColdSign.jsx`, `WalletConnectProvider.jsx`, `CryptoSigning.jsx` → see **C-1** above. |
| `selectPresignProbeSource.js` logic itself | PR #825 | **FIXED / CORRECT** — native leg trusted only when `available===true`, else WARN, never browser-CLEAN on native. Confirmed PASS. |
| KEK **C-1** Android fixed-salt CRITICAL → v3 per-enrollment salt binding | 2026-07-05, PR #568 | **STILL FIXED.** v3 salt threaded via `hardware.js:201-212` (base64 STRING) + `HardwareKekPlugin.kt:277-322` validation. Confirmed PASS. |
| WC **H-1** `personal_sign` null-`evmAddress` bypass | 2026-07-08, PR #757 | **STILL FIXED.** Both `_handlePersonalSign` and display resolver reject on null/mismatch address. PASS. |
| WC **H7** EIP-712 chainId binding; domainless typed data rejected | 2026-06-27 | **STILL FIXED.** PASS. |
| WC **M9** 1M gas cap; **M11** session/topic expiry; **H-NEW-B** step-up re-auth | 2026-06-27 | **STILL FIXED.** All PASS (gas cap escape via omitted field also covered). |
| `twoFactorGate` session-blindness invariant | PR #650 | **STILL FIXED.** No `isDecoy/isHidden` param; call sites don't forward flags. PASS. |
| KEK combineKek H/C/dek zeroing (JS layer) | ECC KEK audit 2026-07-01 | **STILL FIXED** in JS. New native-layer H-residue gaps found (**M-1/M-2**) — same class as still-open M-6/iOS-F5. |
| KEK **M-6 / iOS-F5** NSString `hB64` bridge residue | 2026-07-07/08 KEK stack audit | **STILL OPEN** (known, architectural). M-1/M-2 are additional sibling sites in the same class. |
| StrongBox tier honesty; software-tier enroll refused | PR #527, decision 2026-07-06 | **STILL FIXED.** `hardware.js` refuses SOFTWARE tier (`INSECURE_TIER`). PASS. |
| Biometric-invalidation-on-enrollment (both platforms) | PR #516/#518 (Android), 2026-07-08 (iOS) | **STILL FIXED.** `setInvalidatedByBiometricEnrollment(true)` / `.biometryCurrentSet`. PASS. |
| ColdSign **H11** hardcoded `TIER.ALLOW` | prior RASP audit | **STILL FIXED** (real `detect()`, catch→BLOCK). Its *remaining* flaw is the different native-probe issue → C-1. |
| RASP BLOCK tier unconditional, no override path | 2026-07-08 | **STILL FIXED.** `presign.js` cannot force `proceedAllowed` true when `signerReachable` false. PASS. |
| Credential verifier fail-closed on OOM | S1–S4 audit | **STILL FIXED.** `captureVerifierSafe` returns null on throw; `verifyCredential(null)` → false. PASS. |

No prior finding **regressed to worse-than-before**; the one movement is C-01, which is
better than before (fixed on the highest-traffic Send path) but **incompletely** fixed —
scored CRITICAL because three live signing paths remain fail-open on native.

---

## INFO / PASS (controls confirmed working)

**RASP / sign-gate**
- `RaspIntegrityPlugin.kt` fail-closed exception handling — every check `runCatching{…}.getOrDefault(false)` (roots/hooks/emulator) or `.getOrElse{true}` (tamper); a thrown check never fabricates a wrong-direction signal.
- Tamper-cert fail-closed default: unset `RELEASE_CERT_SHA256` → blank expected cert → `tampered=true` (`RaspIntegrityPlugin.kt:221-224`); production build with the property unset correctly BLOCKS every launch. Honestly disclosed (in code + CLAUDE.md).
- `detect.js` returns `INTEGRITY_UNAVAILABLE` (not CLEAN) unless `available===true`; absent fields never read as affirmative-clean.
- `degrade.js` unknown-condition → strongest FAIL_CLOSED BLOCK; `compose.js` lattice maps unrecognized input to most-severe; BLOCK has no override path in code.
- `nativeProbe.js` off-platform / absent plugin / thrown / non-object → `{available:false}`, never fabricated clean.
- Magisk/root-hiding honestly surfaced as probe-level, never presented as a clean-device guarantee.
- No egress anywhere in `src/rasp` or `src/sign-gate` (I2). I3 set-blindness: no wallet-set handle in any gate function.

**WalletConnect / EIP-712**
- `presignGate()` called at the top of all three key-touching handlers (the C-1 defect is the probe *source*, not gate *presence*).
- Legacy methods `eth_sign`, `signTypedData` v1/v3 in `BLOCKED_METHODS`, auto-rejected before any handler; only `_v4` routed to the signer. `eth_signTransaction` → UNKNOWN → Approve hidden (fail-closed).
- `eth_sendTransaction` chain bound via `resolveSessionCaip2` against the live session; RPC on-chain sanity check (VULN-19 guard).
- `personal_sign` address binding resolves EIP-1474 vs MetaMask-legacy ordering, rejects on no-match / null address.
- Topic-to-session binding + expiry via `assertSessionLive` (live `getActiveSessions()`, not stale React state).
- Gas cap 1,000,000n unconditional incl. omitted-`gas` (wallet estimates + clamps); `maxPriorityFeePerGas` clamped to capped max fee.
- Session-establishment phishing hard-block (`session.js:194-207`); SDK method allowlist; `wc:` URI structural validation; proposal TTL eviction (H9); `EIP712Domain` type stripped before signing.

**Hardware KEK** (0 CRITICAL / 0 HIGH this pass)
- StrongBox honestly surfaced — real `KeyInfo.securityLevel` read verbatim; SOFTWARE-tier enroll **refused** (`INSECURE_TIER`).
- Android key: `setUserAuthenticationRequired(true)` + `AUTH_BIOMETRIC_STRONG`, **no** `AUTH_DEVICE_CREDENTIAL` on the crypto key; app-layer device-credential fallback is honestly disclosed (`H16-DEVIATION`) and governs only the outer UX gate, never the key op.
- iOS genuinely uses `kSecAttrTokenIDSecureEnclave` P-256 + ECIES; SE naming honest; bare-vault Keychain path explicitly not conflated with SE.
- combineKek/web/native zero H, C, kek, dek, salt in try/finally on every path (F-06 WebCrypto-buffer limit honestly documented).
- Salt binding threaded intact through the bridge (v3); iOS immune (fresh random H per enrollment).
- Fail-closed on missing/degenerate factor (`DEGENERATE_INPUT` on all-zero H/C); deniability-preserving generic `UNWRAP_FAILED`; dormant M2c enclave scaffold correctly gated off (`M2C_HARDWARE_WRAP_ENABLED=false`, `M2C_ENABLED=false`).

**Auth gates / keystore**
- `credentialVerifier` fails closed on OOM/error (null verifier → false; `VERIFIER_OOM` distinguished from wrong-credential); `constantTimeEqual` genuine XOR-accumulate.
- `twoFactorGate` session-blind; wrong-credential → single opaque `WRONG` code; `actionPasswordConfigured` defaults false.
- Biometric cache: sole release chokepoint performs a real OS biometric match; KEK fast-path only reachable when enrollment positively confirmed (fails safe to the *more*-gated path); cleared on panic/rollback/create/import/disable/removeDuress; real-vs-duress cache segregation enforced (`authModel.js`); deliberately not cleared on `lock()` (correct-by-design, still gated + segregated).
- `copySecret` three wipe triggers converge on a single `done`-guarded `wipe()` with full teardown; seed/key call sites route through `copySecret` not `copyPlain`.
- `pinAttemptGuard` uses `>=` threshold (tamper-skip can't slip past); genuine infra failures excluded from the counter (no data-loss wipe from a flaky sensor).

---

## Recommended remediation order

1. **C-1 (CRITICAL)** — propagate the `selectPresignProbeSource` fix to `ColdSign.jsx`,
   `WalletConnectProvider.jsx`, `CryptoSigning.jsx`; update `ColdSign.h11.test.js`; add
   per-chokepoint C-01 regression tests. Blocks native mainnet-facing release.
2. **H-1 (HIGH)** — restructure primary-unlock to spend an equal KDF count across outcomes
   (or resize the equalizer from `KDF_PARAMS`), + an end-to-end wall-clock test.
3. **M-1 / M-2 (KEK zeroing)** — mirror the proven `NSMutableData` / `.fill(0)` pattern on
   the Android HMAC-output and iOS enroll paths.
4. **M-3 / M-4 (WC)** — gate Approve on `dapp.flagged`; throw on RASP block so the modal
   surfaces an honest reason.
5. **M-5 / M-6 / M-7 (RASP)** — wire or remove WARN `requiresBiometric`; sync RaspSecurity /
   catalogue copy; label the environment readout as browser-only on native.
6. LOW items as convenient.

**None of the above is fixed by this report.** Nothing here is "verified" — no on-chain txid
or on-device evidence was produced by this static pass. The independent third-party audit
remains outstanding and is not substituted by this internal review.
