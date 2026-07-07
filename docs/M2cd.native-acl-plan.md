# M2c / M2d — Plan: OS-enforced biometric ACL + Secure Enclave/StrongBox key-wrap

> **STATUS: iOS M2c-1 + M2c-2 code BUILT (behind an OFF flag, NOT device-verified);
> Android M2d still PLAN.** Closes finding **F-2** (app-layer biometric gate →
> OS-enforced) from `docs/SECURITY_SELFREVIEW_FINDINGS.md` (Pass 2) and delivers
> the iOS Secure Enclave path the M2 spec calls for. Builds on the merged M2a/M2b
> work. Testnet only; mainnet stays gated; no crypto-algorithm change.
>
> **What landed (iOS):** the Swift key-wrap plugin
> (`ios/App/CapApp-SPM/Sources/CapApp-SPM/VeyrnoxEnclavePlugin.swift`,
> `EnclaveKeyService.swift`, `EnclaveError.swift`), its JS bridge
> (`src/plugins/veyrnoxEnclave.js`), and the capability-detected
> `hardwareWrappedStore` branch + one-time legacy→Enclave migration in
> `src/wallet-core/keystore/native.js`. Verified on a Mac: compiles, 1399 tests
> green, `vault.js` byte-identical, plugin JS stays out of the web bundle.
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

**Kotlin, in the plugin:**

- **Key generation:** `KeyGenParameterSpec` in `AndroidKeyStore` with
  `setUserAuthenticationRequired(true)`,
  `setUserAuthenticationParameters(0, AUTH_BIOMETRIC_STRONG)` (**per-use** auth —
  every unwrap needs a fresh biometric), `setInvalidatedByBiometricEnrollment(true)`
  (the `.biometryCurrentSet` analogue), and `setIsStrongBoxBacked(true)` **inside
  try/catch** → fall back to TEE on `StrongBoxUnavailableException`.
- **wrap / unwrap:** prefer an **asymmetric Keystore key (RSA-OAEP or EC)** to
  mirror iOS (public-key wrap = no prompt; private-key unwrap = auth-required). If
  StrongBox asymmetric support is constrained on target devices, fall back to an
  **AES-GCM** key and accept a one-time biometric prompt at *create* (the user is
  present anyway).
- **unwrap:** `BiometricPrompt` + `CryptoObject(cipher)` → the authenticated
  `Cipher.doFinal` returns the blob. OS-enforced.
- **Errors:** `setAllowedAuthenticators(BIOMETRIC_STRONG [| DEVICE_CREDENTIAL])`;
  handle `ERROR_LOCKOUT(_PERMANENT)`, `ERROR_NO_BIOMETRICS`, negative button.
- **Attestation (audit-grade):** use **Key Attestation** to prove StrongBox/TEE
  backing → `isSecureHardwareAvailable()` stops being a proxy (clears the
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

| PR | Scope | Verify |
|----|-------|--------|
| **M2c-1** | Plugin scaffold + interface; iOS Enclave wrap/unwrap; capability-detect + fallback behind `keyStore` | web/tests unchanged; `vault.js` untouched; **iPhone**: prompt + non-export + invalidation |
| **M2c-2** | iOS one-time re-wrap migration of legacy vaults + device-test report | physical iPhone |
| **M2d-1** | Android Keystore/StrongBox parity in the plugin | **Android device** + emulator |
| **M2d-2** | Hardening: background key-drop, F-6 error taxonomy, no-logs check, F-3 toggle, gate-2 attestation | device |
| **M2d-3** | Docs: audit-scope + threat-model + `M2.secure-storage.md` gate checkboxes; **Findings Pass 3** (F-2 → closed-pending-audit) | — |

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
