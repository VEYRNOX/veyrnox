# M2d — AndroidKeyStore/StrongBox key-wrap: physical-Android device-test report

> **STATUS: NOT RUN.** This is the checklist to execute on physical Android
> hardware before `M2D_ENABLED` (in
> `android/app/src/main/java/com/veyrnox/app/VeyrnoxEnclavePlugin.kt`) may be
> flipped to `true`. Nothing below is confirmed. Per CLAUDE.md ("Verify, don't
> assert") the M2d path is **BUILT (scaffold), not verified** until every box
> here is checked on real hardware AND the independent audit signs off. The
> Android emulator/simulator does NOT have a real Secure Element and can
> confirm none of the hardware guarantees below — TEE-tier keys on the
> emulator are software-backed under the hood.
>
> Related: `docs/M2cd.native-acl-plan.md` §5 (plan),
> `docs/audit-triage/m2c-enclave-device-test.md` (iOS mirror, also NOT RUN),
> the M2d code in `android/app/src/main/java/com/veyrnox/app/VeyrnoxEnclavePlugin.kt`,
> `EnclaveKeyService.kt`, `VeyrnoxEnclaveDeleteIntent.kt`.

## Devices required (both tiers, both classes of biometric)

Run the whole matrix twice, once per device, at minimum:

- [ ] **StrongBox device** — Pixel 3+ (Titan M) or Samsung with Knox Vault.
      Recommended: Pixel 10 Pro XL (already validated for Hardware KEK).
      Verifies StrongBox path (`backing: 'strongBox'`).
- [ ] **TEE-only device** — mid-range Samsung / OnePlus / Xiaomi WITHOUT
      StrongBox. Verifies `StrongBoxUnavailableException` fall-through to TEE
      (`backing: 'tee'`).

## Preconditions

- [ ] Device passcode set; Class 3 (`BIOMETRIC_STRONG`) biometric enrolled
      (fingerprint on Pixel; do not use Face Unlock as it is Class 2 on Pixel
      hardware and will not authorise the key).
- [ ] A build where `M2D_ENABLED = true` (test build ONLY — do not merge the
      flip until this report is complete AND the independent audit signs off).
- [ ] `adb logcat` attached and filtered for tag `VeyrnoxEnclave`.

## Capability detection (scaffold — M2d-1a already ships this)

- [ ] `isHardwareKeyAvailable()` returns `{ backing: 'strongBox', biometryEnrolled: true }` on the StrongBox device.
- [ ] Same call returns `{ backing: 'tee', biometryEnrolled: true }` on the TEE-only device.
- [ ] On the Android emulator returns `{ backing: 'tee', biometryEnrolled: false }` (or `'none'` on older images) and the app uses the M2b fallback.
- [ ] With biometric NOT enrolled, `biometryEnrolled: false` — regardless of tier.

## Fresh vault (M2d-1b/1c — createVault hardware path)

- [ ] Create a new wallet. No biometric prompt during creation on the wrap-only
      key (AES-GCM in AndroidKeyStore, no `setUserAuthenticationRequired`).
- [ ] Confirm `KeyInfo.isInsideSecureHardware == true` on the wrap-only alias.
- [ ] Confirm `KeyInfo.isInsideSecureHardware == true` AND
      `securityLevel == SECURITY_LEVEL_STRONGBOX` on the unwrap alias (StrongBox
      device only); on TEE-only device `securityLevel == SECURITY_LEVEL_TRUSTED_ENVIRONMENT`.
- [ ] Inspect the stored record: it is `{ wrap: 'androidkey-v1', hw: '<base64>' }` — NOT a raw `{v,kdf,salt,iv,ct}` blob.
- [ ] The mnemonic / decrypted blob NEVER appears in logcat during create.

## Unlock (M2d-1d — unwrap → BiometricPrompt with CryptoObject)

- [ ] Unlock prompts the OS `BiometricPrompt` UI (fingerprint sheet).
- [ ] The prompt shows the wallet-specific reason string ("Unlock your VEYRNOX wallet").
- [ ] Correct fingerprint → unlock succeeds; wrong fingerprint or cancel → fail-closed.
- [ ] Force biometric lockout (5 failed attempts) → `ERROR_LOCKOUT`; record the
      exact fallback UX and confirm PIN recovery works.
- [ ] Repeated failures beyond lockout → `ERROR_LOCKOUT_PERMANENT`; PIN recovery still works.

## Non-exportability & invalidation (the F-2 guarantees)

- [ ] Confirm the AES key material is non-exportable
      (`KeyStore.getKey(alias, null)` returns a `SecretKey` whose `getEncoded()` returns null — AndroidKeyStore contract).
- [ ] **`setInvalidatedByBiometricEnrollment(true)` — the critical F-2 test:**
      enrol a NEW fingerprint on the device, then attempt unlock →
      `KeyPermanentlyInvalidatedException` thrown at `Cipher.init()`; PIN
      recovery required. Same guarantee as Hardware KEK Android (PR #516/#518
      on Pixel 10 Pro XL — reuse that device to keep the test conditions
      identical).
- [ ] Remove the enrolled biometric → same invalidation, same recovery path.

## Delete-intent gate (M2d-1a — already ships)

- [ ] Call `Capacitor.Plugins.VeyrnoxEnclave.deleteWrappingKey()` from Chrome
      DevTools with no argument → rejects with `M2C_DELETE_INTENT_REQUIRED`,
      no keystore write.
- [ ] Call with `{ intent: 'CLEANUP' }` (wrong case) → rejects.
- [ ] Call with `{ intent: 'cleanup' }` → resolves; keystore aliases removed.
- [ ] Call with `{ intent: 'unenroll' }` → resolves; keystore aliases removed.
- [ ] Call with `{ intent: 'wipe' }` → resolves; keystore aliases removed.

## Migration (legacy M2b → M2d) — OPT-IN

> Policy mirrors M2c: up-migration fires ONLY when biometric unlock is
> enabled. A password-only vault stays M2b.

- [ ] Install a pre-M2d (or flag-off) build, create a wallet, note address(es) + balances. Do NOT enable biometric unlock.
- [ ] Install the flag-on build over it (do not wipe). Unlock with password only → record stays legacy M2b.
- [ ] Enable biometric unlock, then unlock again → after this unlock the stored record is `{ wrap: 'androidkey-v1', ... }`.
- [ ] Same address(es) + balances (funds byte-identical).
- [ ] Force-quit + reopen → unlocks via the M2d path; migration is idempotent.
- [ ] Down-migration on disable (`disableBiometricUnlock` → `keyStore.downgradeFromHardwareWrap()`): turn biometric unlock OFF → one biometric prompt (the unwrap), record becomes plain M2b, both aliases deleted, subsequent unlock works with password only.
- [ ] Disable-cancel edge case: cancel the biometric during disable → vault stays M2d-wrapped, no fund loss, no strand.

## Attestation (M2d-3)

- [ ] `KeyStore.getCertificateChain(unwrapAlias)` returns a chain rooted at a
      Google attestation root; parse and verify.
- [ ] The attestation extension records `SECURITY_LEVEL_STRONGBOX` on the
      StrongBox device (closes independent-audit gate-2: non-exportable + in
      hardware, provably).
- [ ] Extension records the ACL flags (`ATTESTATION_KEY_USAGE_ENCRYPT`,
      `USER_AUTH_REQUIRED`, etc.) matching the KeyGenParameterSpec.

## Log hygiene (LOG-1 defence-in-depth)

- [ ] logcat at DEBUG contains no cleartext seed, no vault blob, no unwrapped
      plain bytes. Reuse the LOG-1 redaction canary spec
      (`e2e/log-redaction.spec.js` if present).
- [ ] logcat at INFO release build: silent bridge — no plugin result echo.

## Independent audit

- [ ] The KEK+M2c+M2d suite is submitted to the outstanding independent
      third-party audit. Findings ≤ MEDIUM before flipping the flag; any HIGH
      or CRITICAL blocks the flip.

## Flag flip

- [ ] All boxes above checked on BOTH tier devices.
- [ ] Independent audit sign-off recorded here with date + auditor name.
- [ ] PR flips ALL three gates in lockstep in a single commit:
      `VeyrnoxEnclavePlugin.kt` `M2D_ENABLED`,
      `src/plugins/veyrnoxEnclave.js` `M2C_ENABLED` (shared JS gate; keeps
      iOS in lockstep too — do not flip Android alone without iOS device-verify),
      `src/wallet-core/keystore/native.js` `M2C_HARDWARE_WRAP_ENABLED`.
- [ ] Testnet send from the M2d-enabled vault; on-chain txid captured and
      pasted here. This is the codebase's verification bar.
