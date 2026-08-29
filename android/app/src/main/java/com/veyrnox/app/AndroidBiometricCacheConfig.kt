package com.veyrnox.app

// AndroidBiometricCacheConfig.kt — pure-Kotlin constants for the
// AndroidBiometricCache plugin's TWO storage aliases.
//
// Extracted from AndroidBiometricCachePlugin so the ACL design decisions
// (auth-required vs not, alias versioning) can be pinned in an off-device
// JVM unit test without pulling android.* onto the classpath. Same pattern as
// EnclaveKeySpecConfig / PlayIntegrityJwsVerifier.
//
// Two-alias design (issue #2037):
//   - STORAGE_ALIAS + INVALIDATION_ALIAS is the legacy pair used by the auth-
//     gated getSecret() path — retrieveUnlockSecret() in the JS layer performs
//     the OS biometric authenticate BEFORE the plugin read. This path stays
//     wired for non-KEK vaults where the JS cache-gate is the SOLE biometric
//     protection.
//   - STORAGE_UNAUTH_ALIAS is a SECOND storage key built WITHOUT
//     setUserAuthenticationRequired(true) and with NO paired invalidation-key
//     probe on read. It is consumed ONLY by
//     retrieveUnlockSecretDirect({ kekEnrolled: true }), which is safe by the
//     KEK security contract: DEK = HKDF(H ‖ C), H is producible only inside a
//     StrongBox-gated Secure Enclave op, and the cached C alone is useless.
//     Reading the unauth alias therefore MUST NOT trigger an OS prompt — a
//     future edit that silently adds setUserAuthenticationRequired(true) here
//     would re-open the double-prompt bug (issue #2037) AND, on a device
//     without a KEK-enrolled vault, would be misleading rather than dangerous
//     (that JS callsite runtime-asserts kekEnrolled). The JVM tripwire
//     AndroidBiometricCacheConfigTest guards the ACL flag.
//
// Alias versioning contract: the `.v1` suffix IS the ACL-policy stamp. Any
// change to the auth flags, cipher, or key size for the given alias MUST bump
// the suffix — a `.v2` alias is a new key and does not touch the `.v1` key
// material. This makes the ACL policy discoverable in device debug artifacts
// (`keytool -list`) without reading source.
//
// INTERNAL — not device-verified, not independently audited.

object AndroidBiometricCacheConfig {

    // Legacy auth-gated storage alias. The JS layer performs the OS biometric
    // authenticate before invoking the plugin's getSecret() on this alias.
    const val STORAGE_ALIAS: String = "com.veyrnox.app.biometricCacheStorage.v1"

    // Paired biometric-enrollment invalidation sentinel for the legacy path.
    // Auth-required so a biometric-enrollment change flips
    // KeyPermanentlyInvalidatedException on the next probe.
    const val INVALIDATION_ALIAS: String = "com.veyrnox.app.biometricCacheInvalidation.v1"

    // Issue #2037 — unauth-alias storage key. NO setUserAuthenticationRequired
    // and NO invalidation-key probe on read. Consumed ONLY by
    // retrieveUnlockSecretDirect({ kekEnrolled: true }) — see the security
    // contract in biometricUnlock.js and the class-doc above.
    const val STORAGE_UNAUTH_ALIAS: String = "com.veyrnox.app.biometricCacheStorageUnauth.v1"

    // Cipher shape — string-equal to KeyProperties.KEY_ALGORITHM_AES /
    // BLOCK_MODE_GCM / ENCRYPTION_PADDING_NONE. Pinned as plain strings so
    // this file has no android.* import and unit-tests off-device.
    const val ALGORITHM: String = "AES"
    const val BLOCK_MODE: String = "GCM"
    const val PADDING: String = "NoPadding"
    const val KEY_SIZE: Int = 256

    // Legacy (auth-gated) alias — REQUIRES_USER_AUTH must stay TRUE.
    const val REQUIRES_USER_AUTH_LEGACY: Boolean = true

    // Unauth alias — REQUIRES_USER_AUTH must stay FALSE. Flipping this to true
    // re-opens issue #2037 and is guarded by AndroidBiometricCacheConfigTest.
    const val REQUIRES_USER_AUTH_UNAUTH: Boolean = false

    // Biometric-enrollment invalidation applies to the auth-required key
    // pairing only. The unauth storage key has no auth flag so the
    // invalidation flag would be a no-op.
    const val INVALIDATE_ON_BIOMETRIC_ENROLL_LEGACY: Boolean = true

    // API 30 = setUserAuthenticationParameters is API 30+; also the minimum
    // for BIOMETRIC_STRONG-only auth strength. We do NOT weaken auth strength
    // to run on older APIs (H16 discipline).
    const val MIN_API: Int = 30

    // ── Fast-path DEK cache alias (issue #2019) ──────────────────────────
    //
    // The fast-path holds the vault DEK wrapped by an Android Keystore key
    // that is BOTH biometric-required (STRONG) AND invalidated by any
    // biometric enrollment change. On steady-state unlock this replaces the
    // 5 × Argon2id KDFs with a single biometric-gated AES-GCM decrypt.
    //
    // Owner-approved (session 2019) with these must-haves:
    //   Q1: coerced-biometric gap ACCEPTED (design doc §Security model).
    //   Q3: OPT-IN, off by default (JS gate lives in lib/fastpathUnlock.js).
    //   Q5: SEPARATE slot from Personal Backup's dek-cache/v1 — distinct
    //       AAD, distinct alias name, distinct AAD-per-purpose fails closed
    //       on any slot mixup.
    //
    // Alias name pinned by AndroidBiometricCacheConfigTest.T5. The .vN
    // suffix IS the ACL-policy / stored-payload stamp: any change to the
    // auth flags, cipher, key size, invalidation policy, OR the shape of
    // the wrapped payload MUST bump the suffix — a key existing under a
    // given version is a proof-of-provenance that it was minted with the
    // ACL AND payload scheme this file declares.
    //
    // .v2 (2026-08-28, silent-fastpath refactor): payload changed from a
    // JSON envelope { v, iv, ct } wrapped by HKDF(H)+AES-GCM to the raw
    // 32-byte DEK stored base64 under this alias's Keystore key. The ACL
    // (STRONG + 30 s validity + invalidate-on-enrollment) is unchanged.
    // The .v1 alias is orphaned in Keystore on upgrade; harmless since it
    // is biometric-bound and cannot be read outside this app.
    const val FASTPATH_ALIAS: String = "com.veyrnox.app.biometricCacheFastpath.v2"

    // MUST stay true. Flipping to false removes the sole biometric gate on
    // the fast-path DEK release (design doc §Security model). Tripwire in
    // AndroidBiometricCacheConfigTest.T5.
    const val REQUIRES_USER_AUTH_FASTPATH: Boolean = true

    // STRONG form: invalidate the key on ANY biometric add/remove. A coerced
    // attacker who enrolls their own fingerprint after taking the device
    // must NOT be able to unwrap the cached DEK. Tripwire in
    // AndroidBiometricCacheConfigTest.T5.
    const val INVALIDATE_ON_BIOMETRIC_ENROLL_FASTPATH: Boolean = true
}
