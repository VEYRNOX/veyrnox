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

> M2d-1b landed the real `createWrappingKey` (2026-07-17); M2d-1c landed the
> real `wrap()` behind `BiometricPrompt(CryptoObject(cipher))` (2026-07-18) —
> the full create-key + first-wrap path is now runnable end-to-end on a device
> once `M2D_ENABLED` is flipped in a test build. M2d-1a's separate "wrap-only"
> alias was DROPPED — M2d uses one AES-GCM 256 key at
> `EnclaveKeySpecConfig.KEY_ALIAS` (`com.veyrnox.app.enclaveWrappingKey.v1`)
> for both encrypt and decrypt. Documented UX tradeoff: biometric prompt on
> BOTH wrap and unwrap.

- [ ] `createWrappingKey()` succeeds; response contains
      `{ backing: 'strongBox'|'tee', securityLevel, securityLevelName, created: true }`.
- [ ] Call `createWrappingKey()` a second time — response has `created: false`
      and the same `securityLevel` (idempotent; no silent re-key).
- [ ] Confirm `KeyInfo.securityLevel == SECURITY_LEVEL_STRONGBOX` on the
      StrongBox device; on TEE-only device it is
      `SECURITY_LEVEL_TRUSTED_ENVIRONMENT`. The `backing` string in the
      response matches the KeyInfo tier (no synthetic StrongBox claim on a
      TEE-only device — I4).
- [ ] On API < 30, `createWrappingKey()` rejects with
      `M2D_REQUIRES_ANDROID_11` — no keystore write, no biometric prompt.
- [ ] (M2d-1c) Create a new wallet. Wrap path issues one biometric prompt
      (AES-GCM single-key means both wrap and unwrap prompt — documented).
      Prompt strings are the generic
      `"Confirm to save vault"` / `"Unlock the wallet key with your biometric
      to encrypt this vault."` — no wallet or session identifier (I3
      defence-in-depth; any real I3 gating is the JS-side caller's job).
- [ ] (M2d-1c) On the successful prompt, `wrap()` resolves with
      `{ ciphertext: '<base64>' }` (matches JS wrapper + iOS parity —
      Codex 2026-07-18 P2). Decode → first 12 bytes are the IV
      (`EnclaveWireFormat.IV_SIZE_BYTES`), remaining bytes are
      `ciphertext ‖ 16-byte GCM tag`. Each wrap call yields a DIFFERENT IV
      (AndroidKeyStore's KeyGenerator picks it — reused IV under GCM is
      catastrophic; verify by running wrap twice on the same plaintext and
      confirming the first 12 bytes differ across the two ciphertexts).
- [ ] (M2d-1c) Cancel the biometric prompt (negative button) → `wrap()`
      rejects with `M2D_USER_CANCEL` — no ciphertext, no partial write.
- [ ] (M2d-1c) Force biometric lockout (5 failed attempts) during wrap →
      `wrap()` rejects with `M2D_BIOMETRY_LOCKOUT`. Repeat past lockout →
      `M2D_BIOMETRY_LOCKOUT` still (both `ERROR_LOCKOUT` and
      `ERROR_LOCKOUT_PERMANENT` map to the same code).
- [ ] (M2d-1c) Delete the wrapping key via `deleteWrappingKey({intent:'cleanup'})`
      then call `wrap()` immediately → rejects with `M2D_KEY_NOT_FOUND`; no
      biometric prompt rendered (cipher init fails first).
- [ ] (M2d-1c, the F-2 guarantee overlap with the invalidation test below):
      enrol a new fingerprint AFTER `createWrappingKey`, then call `wrap()` →
      rejects with `M2D_KEY_INVALIDATED`; PIN recovery path fires.
- [ ] (M2d-1c) Inspect the stored record: it is
      `{ wrap: 'androidkey-v1', hw: '<base64>' }` — NOT a raw `{v,kdf,salt,iv,ct}` blob.
- [ ] (M2d-1c/1d integration) Roundtrip: unwrap the ciphertext produced by
      wrap → get back the original base64 plaintext byte-identical
      (`Cipher.doFinal` auth-tag verify passes). A single-byte flip in the
      IV or in the AES-GCM output → auth-tag verify fails →
      `M2D_CIPHERTEXT_TAMPERED` on the unwrap side (distinct from
      `M2D_UNWRAP_FAILED`; see the M2d-1d Unlock section below). This box
      is now runnable end-to-end since M2d-1d landed the real unwrap.
- [ ] The mnemonic / decrypted blob NEVER appears in logcat during create or
      wrap (both debug and release builds). Includes the base64 plaintext
      argument, the raw AES-GCM output, and the returned base64 ciphertext.

## Unlock (M2d-1d — unwrap → BiometricPrompt with CryptoObject)

> M2d-1d landed the real `unwrap` (2026-07-18): base64 `IV||ct+tag` bundle
> in → `EnclaveWireFormat.unpack` → `Cipher.getInstance("AES/GCM/NoPadding")`
> in `DECRYPT_MODE` → `BiometricPrompt(CryptoObject(cipher))` gated on
> `BIOMETRIC_STRONG` only → `cipher.doFinal` → base64 plaintext out. Response
> shape is `{ blob: '<base64>' }` matching the shared JS wrapper
> (`src/plugins/veyrnoxEnclave.js:hwUnwrap` — `const { blob } = await
> VeyrnoxEnclave.unwrap(...)`) and the iOS bridge. Every box below is now
> runnable on-device; still fail-closed at the `M2D_ENABLED=false` gate.

- [ ] Unlock prompts the OS `BiometricPrompt` UI (fingerprint sheet).
- [ ] The prompt shows the wallet-specific reason string ("Unlock your VEYRNOX wallet").
- [ ] Correct fingerprint → unlock succeeds; response is `{ blob: '<base64>' }`
      (NOT `{ plaintext }` or `{ ciphertext }` — pinned by the shared JS wrapper).
- [ ] Roundtrip against a known-good wrap output: pass the `ciphertext` returned
      by `wrap({blob: X})` back into `unwrap({ciphertext})` → resolved `blob`
      equals the original `X` byte-for-byte (base64-identical).
- [ ] Cancel the biometric prompt (negative button) → `unwrap()` rejects with
      `M2D_USER_CANCEL`; no plaintext ever surfaces.
- [ ] Wrong fingerprint (individual attempt): prompt stays open (OS retry UX);
      NO callback fires. Only terminal events surface.
- [ ] Force biometric lockout (5 failed attempts) → `M2D_BIOMETRY_LOCKOUT`
      (BiometricPrompt `ERROR_LOCKOUT`); record the exact fallback UX and
      confirm PIN recovery works.
- [ ] Repeated failures beyond lockout → `M2D_BIOMETRY_LOCKOUT`
      (BiometricPrompt `ERROR_LOCKOUT_PERMANENT`); PIN recovery still works.
- [ ] Tamper the stored ciphertext (flip one byte in the base64-decoded body)
      → `M2D_CIPHERTEXT_TAMPERED` (javax.crypto.AEADBadTagException). MUST
      be distinct from `M2D_UNWRAP_FAILED` at the JS bridge — pinned by
      `EnclaveErrorsTest`.
- [ ] Tamper the IV (flip one byte in the first 12 bytes) → also
      `M2D_CIPHERTEXT_TAMPERED` (same AEAD auth-tag failure signal).
- [ ] Feed a bundle shorter than 28 bytes (IV+TAG minimum) → the plugin
      rejects with `M2D_MALFORMED_BUNDLE` BEFORE the biometric sheet is
      shown. Rejection is a pre-cipher shape check — MUST be distinct from
      `M2D_CIPHERTEXT_TAMPERED` (which requires a valid-shape input).
- [ ] Feed a base64 string that fails to decode (e.g. contains `!`) → same
      `M2D_MALFORMED_BUNDLE`, prompt not shown.
- [ ] Delete the AndroidKeyStore alias (via `deleteWrappingKey({intent:'cleanup'})`
      or by disabling biometric unlock) then call `unwrap` → `M2D_KEY_NOT_FOUND`.
- [ ] After enrolling a NEW biometric on the device (the F-2 test): call
      `unwrap` on a previously-wrapped bundle → the OS throws
      `KeyPermanentlyInvalidatedException` at `Cipher.init(DECRYPT_MODE)` →
      `M2D_KEY_INVALIDATED`; PIN recovery required. This is the same
      guarantee exercised on the wrap path — running BOTH pins F-2 across
      both key operations.
- [ ] logcat at DEBUG contains NO decrypted plaintext (no base64 `blob`
      value in ANY plugin result echo). The plaintext IS the secret
      (decrypted vault blob) — the LOG-1 discipline is absolute here.
- [ ] logcat at INFO release build: silent bridge on the unwrap response too.
- [ ] Concurrent-call hygiene: call `unwrap` twice in quick succession → the
      second call is queued or fails cleanly, no retained-slot leak (verify
      via successive wrap/unwrap pairs; `setKeepAlive(false)` is called on
      every terminal path — Codex 2026-07-18 P2 lesson from M2d-1c).

## Non-exportability & invalidation (the F-2 guarantees)

> M2d-1b sets both `setUserAuthenticationRequired(true)` and
> `setInvalidatedByBiometricEnrollment(true)` on the KEY_ALIAS. Both boxes
> below are now runnable on-device against a real key.

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
- [ ] Call with `{ intent: 'cleanup' }` → resolves; KEY_ALIAS removed (M2d-1b: single alias — wrap-only alias dropped).
- [ ] Call with `{ intent: 'unenroll' }` → resolves; KEY_ALIAS removed.
- [ ] Call with `{ intent: 'wipe' }` → resolves; KEY_ALIAS removed.

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
