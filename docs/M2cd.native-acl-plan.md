# M2c / M2d — Plan: OS-enforced biometric ACL + Secure Enclave/StrongBox key-wrap

> **STATUS (2026-07-18): iOS M2c-1 + M2c-2 code BUILT (behind an OFF flag, NOT
> device-verified; hardened further by PR #1098, 2026-07-17). Android M2d-1a/1b/1c
> code BUILT (behind an OFF flag, NOT device-verified, PRs #1116/#1131/#1141,
> 2026-07-17/18) — plugin scaffold, capability probe, real StrongBox/TEE
> `createWrappingKey`, real `BiometricPrompt`-gated `wrap()`. Android M2d-1d (unwrap)
> and M2d-2/M2d-3 (hardening + attestation + docs) remain PLAN.** Closes finding **F-2**
> (app-layer biometric gate → OS-enforced) from `docs/SECURITY_SELFREVIEW_FINDINGS.md`
> (Pass 2) and delivers the iOS Secure Enclave + Android Keystore/StrongBox paths the M2
> spec calls for. Builds on the merged M2a/M2b work. Testnet only; mainnet stays gated;
> no crypto-algorithm change. **F-2 is NOT closed on either platform** — see §5/§6 below
> and `docs/Feature-Status.md` §F-01/F-02 for the full per-PR detail.
>
> **What landed (iOS):** the Swift key-wrap plugin
> (`ios/App/CapApp-SPM/Sources/CapApp-SPM/VeyrnoxEnclavePlugin.swift`,
> `EnclaveKeyService.swift`, `EnclaveError.swift`), its JS bridge
> (`src/plugins/veyrnoxEnclave.js`), and the capability-detected
> `hardwareWrappedStore` branch + one-time legacy→Enclave migration in
> `src/wallet-core/keystore/native.js`. Verified on a Mac: compiles, 1399 tests
> green, `vault.js` byte-identical, plugin JS stays out of the web bundle. **PR #1098
> (2026-07-17)** added defence-in-depth: `deleteWrappingKey` now requires an
> allowlisted `intent` (`'cleanup'|'unenroll'|'wipe'`) enforced at both the JS wrapper
> and the Swift native selector; a stale non-Enclave-backed key reuse now throws
> `EnclaveError.staleWrappingKey` instead of silently deleting/recreating; the Enclave
> key tag is now versioned (`...enclaveWrappingKey.v2`). Two Codex second-model review
> passes on this PR — INTERNAL, never presented as independent.
>
> **What landed (Android, 2026-07-17/18):** `VeyrnoxEnclavePlugin.kt` (Capacitor
> plugin) + `EnclaveKeyService.kt` + `VeyrnoxEnclaveDeleteIntent.kt` (M2d-1a, PR #1116)
> — capability probe only, `M2D_ENABLED = false`, all key-touching methods fail closed,
> the same cross-platform `intent` allowlist as iOS. `EnclaveKeySpecConfig.kt` +
> real `createWrappingKey()` (M2d-1b, PR #1131) — real AES-GCM 256 AndroidKeyStore key,
> `setUserAuthenticationRequired(true)` + `setInvalidatedByBiometricEnrollment(true)` +
> `AUTH_BIOMETRIC_STRONG` only (H16, no device-credential fallback), StrongBox-preferred
> with TEE fall-through, versioned idempotent alias
> (`com.veyrnox.app.enclaveWrappingKey.v1`), honest tier reporting from `KeyInfo`. Real
> `wrap()` behind `BiometricPrompt(CryptoObject(cipher))` (M2d-1c, PR #1141) — see §5 for
> the design tradeoff this took (single AES-GCM key instead of the plan's asymmetric
> option). 73/73 Android JVM tests green across the three PRs' new suites plus existing
> PlayIntegrity suites. **NOT device-verified on either platform. NOT independently
> audited. No on-chain txid — M2c/M2d are key-wrap gates, not send paths.**
>
> **Product decision — RESOLVED (owner, 2026-07-06): OPT-IN.** Enclave-wrap is
> tied to the existing biometric-unlock toggle, NOT mandatory on all Enclave
> devices — preserving the "password is an independent route, biometric is
> optional" invariant. Consequences in code (all implemented, behind the OFF
> flag): `createVault` always stores M2b at creation; the up-migration in
> `unlock()` is gated on `opts.requireBiometric` (biometric enabled); disabling
> biometric unlock re-wraps DOWN to M2b via
> `nativeKeyStore.downgradeFromHardwareWrap()`, wired into
> `WalletProvider.disableBiometricUnlock` (unwrap → store plain M2b → drop the
> wrapping key), so a password-only unlock keeps working after disable.
>
> **F-2 is NOT closed.** The whole path is gated behind
> `M2C_HARDWARE_WRAP_ENABLED = false`, so native behaviour is byte-identical to
> M2b until it is verified on a **physical iPhone** — the Simulator has no Secure
> Enclave and can confirm none of the guarantees. Run
> `docs/audit-triage/m2c-enclave-device-test.md`, THEN flip the flag. The plugin
> also still enters the independent-audit scope.
>
> See also: `docs/M2.secure-storage.md` (spec + verification gates),
> `docs/M2b.native-keystore-notes.md` (what M2b shipped), and the Pass-2 findings.

---

## 1. Objective — what "closing F-2" actually means

Today (M2b) the biometric check is **app-layer**: `authenticate()` succeeds, *then*
the app reads a passcode-gated secure-storage item. Anyone able to run code in the
app/webview context can skip the prompt and read the item directly — the item is
only passcode-gated, not biometry-bound.

**F-2 is closed only when reading the secret is cryptographically impossible
without a fresh OS-enforced biometric** — i.e. the vault key is wrapped by a
**non-exportable hardware key whose *use* the OS gates on biometry** (Secure
Enclave on iOS; Android Keystore/StrongBox with `setUserAuthenticationRequired`).

Closing F-2 this way also upgrades two other Pass-2 verdicts:
- **Gate 2** (non-exportable hardware key) → becomes assertable via key attestation.
- **Gate 3** (biometric strength) → OS-enforced instead of app-layer.

---

## 2. Core design decision — wrap the *existing* vault blob (keep Design B, keep crypto)

**Recommended: Option A — hardware-wrap the already-encrypted blob.**

```
create:  blob = encryptVault(mnemonic, password)      // vault.js UNCHANGED (gate 8 stays PASS)
         wrapped = hwWrap(blob)                        // new hardware layer
         store(wrapped)                                // still ThisDeviceOnly, no-backup
unlock:  OS biometric  →  blob = hwUnwrap(wrapped)  →  decryptVault(blob, password)
```

- **Two genuine factors** (biometric **and** password) — faithful to the spec's
  "password OR biometric" intent, strictly stronger than either alone.
- **`vault.js` byte-identical** → gate 8 stays green, audit delta stays small.
- **Rejected — Option B** (drop the password, rely on hardware only): loses a
  factor, larger blast radius, weaker against a stolen-unlocked-device threat.

---

## 3. Why a thin custom Capacitor plugin (and the audit cost)

The current `@aparajita/capacitor-secure-storage` + `…-biometric-auth` plugins do
**not** expose per-item biometric ACL or Enclave key-wrap. Staying on a general
plugin was evaluated and rejected: for a self-custody wallet a **small bespoke
plugin** with a minimal, fully-reviewable native surface beats depending on a
general plugin's ACL semantics. The M2 spec explicitly permits this and notes it
**expands the audit scope** — we accept that and add the plugin (Swift + Kotlin)
to the independent audit.

### Plugin interface (behind the *unchanged* `keyStore` contract)

```
isHardwareKeyAvailable() → { backing: 'secureEnclave'|'strongBox'|'tee'|'none', biometryEnrolled }
createWrappingKey({ requireBiometry })   // idempotent; generates the non-exportable HW key + ACL
wrap(blobB64) → ciphertextB64            // no prompt (public-key / create-time op)
unwrap(ciphertextB64) → blobB64          // TRIGGERS OS biometric; throws on cancel/lockout/no-enrol
deleteWrappingKey()
```

`native.js` gains a `hardwareWrappedStore` path, selected when
`isHardwareKeyAvailable()` reports real Enclave/StrongBox **and** biometry is
enrolled; otherwise it **capability-detects and falls back** to today's app-layer
path so older / less-capable devices still work. **`WalletProvider` and the rest of
the JS are untouched** — the `keyStore` interface from M2a absorbs the change.

---

## 4. M2c — iOS (Secure Enclave + OS-enforced ACL) → closes F-2 on iOS

**Swift, in the plugin:**

- **Key generation:** `SecKeyCreateRandomKey` —
  `kSecAttrKeyType = kSecAttrKeyTypeECSECPrimeRandom`, 256-bit,
  `kSecAttrTokenID = kSecAttrTokenIDSecureEnclave` (non-exportable; never leaves
  the Enclave), permanent, with
  `SecAccessControlCreateWithFlags(accessibility, [.privateKeyUsage, .biometryCurrentSet])`.
  - `.biometryCurrentSet` → the key **auto-invalidates if the enrolled Face/Touch
    set changes** (anti-coercion). Deliberate; requires a documented
    "re-enroll → re-create from seed/password" recovery flow.
- **wrap:** `SecKeyCreateEncryptedData(publicKey, .eciesEncryptionCofactorX963SHA256AESGCM, blob)`
  — public-key op, **no prompt** (the blob is a few hundred bytes; ECIES handles it).
- **unwrap:** `SecKeyCreateDecryptedData(enclaveKey, …)` → **the OS presents Face ID
  / Touch ID** because the key's ACL demands it, and returns the blob only on
  success. **This is the gate that closes F-2.**
- **LocalAuthentication:** `LAContext` with reason string; policy decision —
  strict `.deviceOwnerAuthenticationWithBiometrics` vs `.deviceOwnerAuthentication`
  (passcode fallback after lockout). Handle `biometryNotEnrolled`,
  `biometryLockout`, `userCancel`, `userFallback`.
- **Info.plist:** `NSFaceIDUsageDescription` already present (M2b). ✅
- **Migration:** on first launch of the new build, after one successful legacy
  unlock, **re-wrap the existing blob under the Enclave key** and overwrite (add a
  `wrap` version field to the stored record). No seed re-entry for the user.

> **⚠️ Test reality:** the **iOS Simulator has no Secure Enclave** —
> `kSecAttrTokenIDSecureEnclave` fails there, so the simulator exercises only the
> fallback path. **The Enclave path must be verified on a physical iPhone.**

---

## 5. M2d — Android (Keystore/StrongBox) parity + cross-platform hardening → closes F-2 on Android

> **Progress (2026-07-17/18): M2d-1a/1b/1c BUILT behind `M2D_ENABLED = false`.** NOT
> device-verified (`docs/audit-triage/m2d-strongbox-device-test.md` — STATUS: NOT RUN).
> NOT independently audited. No on-chain txid. Items below are marked ✅ BUILT where
> code has landed, with the honest scope; unmarked items remain PLAN (M2d-1d/M2d-2/M2d-3).

**Kotlin, in the plugin:**

- **Key generation:** ✅ **BUILT (M2d-1b, PR #1131).** `KeyGenParameterSpec` in
  `AndroidKeyStore` with `setUserAuthenticationRequired(true)`,
  `setUserAuthenticationParameters(0, AUTH_BIOMETRIC_STRONG)` (**per-use** auth —
  every unwrap needs a fresh biometric), `setInvalidatedByBiometricEnrollment(true)`
  (the `.biometryCurrentSet` analogue), and StrongBox-preferred **inside
  try/catch** → falls back to TEE on `StrongBoxUnavailableException`. Idempotent
  versioned alias `com.veyrnox.app.enclaveWrappingKey.v1`; honest `KeyInfo`-derived
  tier reporting (never fabricates a StrongBox claim). API 30+ gated
  (`M2D_REQUIRES_ANDROID_11`). 12-case JVM `EnclaveKeySpecConfigTest`.
- **wrap / unwrap:** **Design decision made (2026-07-17, M2d-1b): AES-GCM single key,
  not the asymmetric option this plan originally proposed.** The plan's preferred
  "asymmetric Keystore key (RSA-OAEP or EC) to mirror iOS (public-key wrap = no
  prompt; private-key unwrap = auth-required)" was evaluated and NOT taken — StrongBox
  asymmetric (RSA/EC) support is spotty across Android OEMs in practice, so M2d ships
  the plan's documented fallback: **one AES-GCM 256 key for both wrap and unwrap**,
  meaning BOTH operations prompt biometric in production (not just unwrap, as the
  iOS-parity ideal would have it). The M2d-1a-reserved separate `wrapAlias` was
  dropped in M2d-1b — two AES-GCM aliases cannot decrypt each other's output. This is
  a documented UX tradeoff, not a defect; revisit trigger is the M2d-1c/-1d device
  runbook surfacing real UX pain, or a future StrongBox OEM landscape that makes
  asymmetric keys reliable enough to revisit.
  - **wrap:** ✅ **BUILT (M2d-1c, PR #1141).** Real `Cipher.getInstance("AES/GCM/NoPadding")`
    in `ENCRYPT_MODE`, wrapped in a `CryptoObject`, gated by `BiometricPrompt`
    (`BIOMETRIC_STRONG` only, H16 — no device-credential fallback). Wire format
    `IV (12B) ‖ ciphertext ‖ 16B GCM tag`, base64, response `{ ciphertext }` (matches JS
    wrapper + iOS parity). IV chosen by AndroidKeyStore's `KeyGenerator` inside
    `Cipher.init` — never caller-picked. Typed error codes mirror iOS
    (`M2D_KEY_NOT_FOUND`, `M2D_KEY_INVALIDATED`, `M2D_USER_CANCEL`,
    `M2D_BIOMETRY_LOCKOUT`, `M2D_BIOMETRY_NOT_ENROLLED`, `M2D_AUTH_FAILED`,
    `M2D_WRAP_FAILED`). Pure `EnclaveWireFormat` pack/unpack helper, 14-case JVM
    `EnclaveWireFormatTest`. Kotlin main+test compile verified this session via
    `npx cap sync android` (73/73 JVM tests green). BiometricPrompt integration itself
    is code-only — no Android UI-thread test rig; NOT device-verified.
  - **unwrap:** still PLAN — **M2d-1d**, the next scoped chunk. Will mirror the wrap
    implementation (`Cipher.getInstance(...)` in `DECRYPT_MODE`, `BiometricPrompt` +
    `CryptoObject`), unpacking the same `IV ‖ ciphertext ‖ tag` wire format.
- **Errors:** ✅ **BUILT (M2d-1c).** `setAllowedAuthenticators(BIOMETRIC_STRONG)` only
  (no `DEVICE_CREDENTIAL`); `ERROR_LOCKOUT`/`ERROR_LOCKOUT_PERMANENT` both map to
  `M2D_BIOMETRY_LOCKOUT`; negative button → `M2D_USER_CANCEL`; individual bad
  face/finger (`onAuthenticationFailed`) does not call back — OS keeps the sheet open
  for retry.
- **Attestation (audit-grade):** still PLAN (M2d-3) — use **Key Attestation** to prove
  StrongBox/TEE backing → `isSecureHardwareAvailable()` stops being a proxy (clears the
  **gate-2 CAN'T-VERIFY** from Pass 2).
- **Manifest:** `allowBackup=false` + `data_extraction_rules` already exclude
  everything (M2b). ✅

**Cross-platform hardening (the spec's original M2d):**

- **Background key drop:** already wired (`@capacitor/app` `pause` +
  `visibilitychange`); on device, also drop the `LAContext` / auth handle on
  background so a cached auth can't be replayed.
- **Failed-auth taxonomy → resolves F-6:** unify lockout / no-enrol / cancel into
  one error set surfaced by the unlock screen and `BiometricUnlockSettings`.
- **No-secret-in-logs:** runtime verification on device (logcat / Console.app)
  that no mnemonic / blob / DEK is logged; add a release-build assertion.
- **F-3 revisit:** with biometric now OS-enforced, make the settings toggle *real*
  — let it choose `biometryCurrentSet` (require biometric) vs passcode-only,
  instead of the current forced-on label.
- **Idle timeout:** the `session.js` auto-lock work is **orthogonal** to F-2;
  finish it or keep the existing default. Not a blocker here.

---

## 6. Sequencing (small, reviewable PRs)

| PR | Scope | Verify | Status |
|----|-------|--------|--------|
| **M2c-1** | Plugin scaffold + interface; iOS Enclave wrap/unwrap; capability-detect + fallback behind `keyStore` | web/tests unchanged; `vault.js` untouched; **iPhone**: prompt + non-export + invalidation | ✅ BUILT (PRs #690/#695, 2026-07-07); hardened PR #1098 (2026-07-17: delete-intent gate, stale-key check, versioned key tag). NOT device-verified. |
| **M2c-2** | iOS one-time re-wrap migration of legacy vaults + device-test report | physical iPhone | ✅ BUILT (migration code-complete). Device-test report: STATUS NOT RUN (`docs/audit-triage/m2c-enclave-device-test.md`). |
| **M2d-1a** | Android plugin scaffold + capability probe + delete-intent gate | web/tests unchanged; JVM unit tests | ✅ BUILT (PR #1116, 2026-07-17). 12-case `VeyrnoxEnclaveDeleteIntentTest`. `M2D_ENABLED = false`. NOT device-verified. |
| **M2d-1b** | Real `createWrappingKey` — StrongBox-preferred AndroidKeyStore AES-GCM key | JVM unit tests; Kotlin compile | ✅ BUILT (PR #1131, 2026-07-17). 12-case `EnclaveKeySpecConfigTest`. NOT device-verified. |
| **M2d-1c** | Real `BiometricPrompt`-gated `wrap()` | JVM unit tests; Kotlin compile (verified via `cap sync` this session) | ✅ BUILT (PR #1141, 2026-07-18). 14-case `EnclaveWireFormatTest`. NOT device-verified — no Android UI-thread test rig. |
| **M2d-1d** | Real `BiometricPrompt`-gated `unwrap()` — mirrors M2d-1c | **Android device** + emulator | 📋 PLAN — next scoped chunk. |
| **M2d-2** | Hardening: background key-drop, F-6 error taxonomy, no-logs check, F-3 toggle, gate-2 attestation | device | 📋 PLAN |
| **M2d-3** | Docs: audit-scope + threat-model + `M2.secure-storage.md` gate checkboxes; **Findings Pass 3** (F-2 → closed-pending-audit) | — | 📋 PLAN |

All BUILT rows above are unit-tested only — NOT device-verified on real StrongBox/TEE
hardware, NOT independently audited, no on-chain txid. `M2D_ENABLED` stays `false`
throughout; nothing in this table changes production runtime behaviour.

---

## 7. Decisions needed before M2c-1

1. **Accessibility class:** `WhenUnlockedThisDeviceOnly` vs
   `WhenPasscodeSetThisDeviceOnly` — the **F-4** data-loss tradeoff (passcode
   removal erases the vault). *Recommend* `WhenPasscodeSet…` (strongest), paired
   with seed-backup messaging.
2. **Re-enroll invalidation:** `biometryCurrentSet` /
   `setInvalidatedByBiometricEnrollment(true)` (invalidate on biometric change —
   *recommended* for a wallet) vs `biometryAny` (friendlier UX).
3. **Lockout fallback:** allow device passcode after biometric lockout
   (*recommended*, matches M2b) vs hard-fail biometric-only.
4. **Device access:** the Enclave/StrongBox gates are **not simulator-testable** —
   confirm a physical iPhone + an Android device (ideally Pixel 3+ for StrongBox)
   are available for M2c-2 / M2d-1.

---

## 8. Scope guardrails (carried from the M2 spec)

- **No crypto-algorithm change** — `vault.js` (Argon2id + AES-GCM) stays
  byte-identical; this changes only *where the vault key comes from*.
- **Web path untouched** — the change lives entirely behind the native branch of
  the `keyStore` interface; the 58-test suite and `check:rng` stay green.
- **Additive + capability-detected** — devices without Enclave/StrongBox or with no
  enrolled biometric fall back to the existing M2b path.
- **Testnet only; mainnet stays gated.**
- **The custom plugin (Swift + Kotlin) goes into the independent-audit scope.**

---

## 9. Verification matrix (what's provable where)

| Environment | Can verify | Cannot verify |
|-------------|-----------|---------------|
| Mac / web / CI | build, JS tests, `check:rng`, web path unchanged, fallback path | any hardware-backed behaviour |
| iOS Simulator | app-layer fallback, prompt plumbing | **Secure Enclave path (no SE on simulator)** |
| Physical iPhone | Enclave key-gen, Face/Touch prompt on unwrap, non-export, `biometryCurrentSet` invalidation, lockout/passcode fallback | — |
| Android device/emulator | `BiometricPrompt` + `CryptoObject`, Keystore key, invalidation, lockout (StrongBox only on Pixel 3+/StrongBox devices) | StrongBox on non-StrongBox hardware |
| Independent audit | the real sign-off on all of the above | — |
