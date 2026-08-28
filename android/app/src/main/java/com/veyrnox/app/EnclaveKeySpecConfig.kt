package com.veyrnox.app

// EnclaveKeySpecConfig.kt — pure-Kotlin constants for the M2d wrapping-key spec.
//
// Extracted from EnclaveKeyService so the design decisions (cipher, key size,
// ACL flags, alias, min-API gate) can be pinned in an off-device JVM unit test
// without pulling android.* onto the classpath. Same pattern as
// PlayIntegrityJwsVerifier / PlayIntegrityNonceVerifier.
//
// The values here are byte-identical to the Android runtime KeyProperties
// constants they mirror (KeyProperties.KEY_ALGORITHM_AES == "AES",
// KeyProperties.BLOCK_MODE_GCM == "GCM",
// KeyProperties.ENCRYPTION_PADDING_NONE == "NoPadding") — comments note the
// equivalence. The service reads these strings and hands them straight to
// KeyGenParameterSpec.Builder / KeyGenerator.getInstance without translation.
//
// M2d-1b policy (docs/M2cd.native-acl-plan.md §5 fallback branch):
//   - AES-GCM 256 single-key. RSA-OAEP asymmetric was considered (would give
//     iOS-like "wrap without prompt / unwrap with prompt" on one keypair) but
//     RSA/EC StrongBox support is spotty across Android OEMs; AES-GCM is
//     universally supported. Documented UX tradeoff: biometric prompt on
//     BOTH wrap and unwrap because setUserAuthenticationRequired(true) binds
//     both PURPOSE_ENCRYPT and PURPOSE_DECRYPT to the same auth gate.
//   - Per-use auth (BIOMETRIC_STRONG only, H16 discipline: no
//     AUTH_DEVICE_CREDENTIAL fallback — a PIN/pattern unlock would bypass the
//     possession-factor guarantee).
//   - Invalidated on new biometric enrollment (the F-2 guarantee).
//   - StrongBox preferred, TEE-accepted — StrongBox is NOT enforced. On a
//     StrongBoxUnavailableException the service retries with the flag unset,
//     and reports the ACTUAL tier via KeyInfo (never fabricates a StrongBox
//     claim on a device that doesn't have one — I4).
//   - Requires API 30+ (setUserAuthenticationParameters is API 30, per
//     HardwareKekPlugin.kt precedent). We do NOT weaken auth strength to run
//     on older APIs (fail honest, fail closed).
//
// KEY_ALIAS versioning contract: the alias `.v1` suffix IS the ACL-policy
// stamp. If a key exists under this alias, it was minted by THIS code with
// THIS spec. Any change to the KeyGenParameterSpec (auth flags, cipher, key
// size, invalidation policy) MUST bump the suffix — a `.v2` alias is a new
// key and does not touch the `.v1` key material.
//
// Ungated after device verification (PR #1152, 2026-07-18).
// Independent audit still outstanding.

object EnclaveKeySpecConfig {

    // The single AES-GCM wrapping key alias. Version suffix bumped .v1 → .v2
    // for the AUTH_VALIDITY_SECONDS change below: the ACL policy contract in
    // this file's header says any change to the KeyGenParameterSpec MUST bump
    // the suffix, so a device running old code cannot accidentally read the
    // new key or vice-versa. On upgrade a returning user encounters an
    // absent .v2 alias and re-enrolls KEK on their next PIN unlock (existing
    // KEY_INVALIDATED handler in useKekEnrollmentGate).
    const val KEY_ALIAS: String = "com.veyrnox.app.enclaveWrappingKey.v2"

    // Cipher shape. Values are string-equal to KeyProperties.KEY_ALGORITHM_AES /
    // BLOCK_MODE_GCM / ENCRYPTION_PADDING_NONE. Pinned as plain strings so this
    // file has no android.* import and unit-tests off-device.
    const val ALGORITHM: String = "AES"
    const val BLOCK_MODE: String = "GCM"
    const val PADDING: String = "NoPadding"
    const val KEY_SIZE: Int = 256

    // ACL — auth required, BIOMETRIC_STRONG only, invalidated on new biometric.
    // These are `const` (not `var`) so no code path can flip them at runtime —
    // pinned by EnclaveKeySpecConfigTest T3.
    const val REQUIRES_USER_AUTH: Boolean = true
    const val INVALIDATE_ON_BIOMETRIC_ENROLL: Boolean = true

    // Time-based auth validity window (owner ruling 2026-08-28). Was 0 =
    // per-use CryptoObject; now 30s = "any STRONG biometric within the last
    // 30 seconds satisfies this cipher op". On Pixel this lets a lock-screen
    // Face-unlock (Class 3) authorise a KEK/DEK unwrap that Pixel Face refuses
    // to participate in via CryptoObject — Face becomes the effective default
    // wallet unlock, with fingerprint tap as the natural fallback when Face
    // isn't recent enough. Window kept intentionally short: an attacker who
    // gets an unattended phone within 30 seconds of the user's last biometric
    // is a real but bounded threat model, matching AndroidBiometricCachePlugin
    // which already uses the same 30-second window for the PIN-cache key.
    // BIOMETRIC_STRONG (Class 3) requirement is unchanged — no PIN/pattern
    // bypass, no Class 2 face acceptance.
    const val AUTH_VALIDITY_SECONDS: Int = 30

    // StrongBox is preferred; the service falls through to TEE on
    // StrongBoxUnavailableException. Never fabricates a StrongBox claim (I4).
    const val PREFER_STRONGBOX: Boolean = true

    // API 30 = Build.VERSION_CODES.R. setUserAuthenticationParameters is API 30+;
    // setIsStrongBoxBacked is API 28+ but PREFER_STRONGBOX is only meaningful
    // once auth-strength binding is available, so we gate the whole path at 30.
    // The plugin rejects with M2D_REQUIRES_ANDROID_11 on older devices.
    const val MIN_API: Int = 30
}
