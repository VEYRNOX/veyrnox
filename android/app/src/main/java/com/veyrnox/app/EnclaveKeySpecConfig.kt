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

    // The single AES-GCM wrapping key alias. Mirrors iOS EnclaveKeyService's
    // com.veyrnox.app.enclaveWrappingKey.v1 for cross-platform consistency —
    // both platforms use the same versioned name to make the ACL policy
    // discoverable in device debug artifacts.
    const val KEY_ALIAS: String = "com.veyrnox.app.enclaveWrappingKey.v1"

    // Cipher shape. Values are string-equal to KeyProperties.KEY_ALGORITHM_AES /
    // BLOCK_MODE_GCM / ENCRYPTION_PADDING_NONE. Pinned as plain strings so this
    // file has no android.* import and unit-tests off-device.
    const val ALGORITHM: String = "AES"
    const val BLOCK_MODE: String = "GCM"
    const val PADDING: String = "NoPadding"
    const val KEY_SIZE: Int = 256

    // ACL — per-use auth, BIOMETRIC_STRONG only, invalidated on new biometric.
    // These are `const` (not `var`) so no code path can flip them at runtime —
    // pinned by EnclaveKeySpecConfigTest T3.
    const val REQUIRES_USER_AUTH: Boolean = true
    const val INVALIDATE_ON_BIOMETRIC_ENROLL: Boolean = true

    // StrongBox is preferred; the service falls through to TEE on
    // StrongBoxUnavailableException. Never fabricates a StrongBox claim (I4).
    const val PREFER_STRONGBOX: Boolean = true

    // API 30 = Build.VERSION_CODES.R. setUserAuthenticationParameters is API 30+;
    // setIsStrongBoxBacked is API 28+ but PREFER_STRONGBOX is only meaningful
    // once auth-strength binding is available, so we gate the whole path at 30.
    // The plugin rejects with M2D_REQUIRES_ANDROID_11 on older devices.
    const val MIN_API: Int = 30
}
