package com.veyrnox.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM tripwire for AndroidBiometricCacheConfig — pins the ACL flags of the
 * TWO storage aliases used by the AndroidBiometricCache plugin.
 *
 * Why this test exists (issue #2037): the cold unlock on a KEK-enrolled Pixel
 * 10 fired TWO OS biometric prompts, one from the plugin's auth-gated
 * getSecret() alias and one from the load-bearing StrongBox H factor. The
 * fix introduces a SECOND storage alias built WITHOUT
 * setUserAuthenticationRequired(true), consumed only by
 * retrieveUnlockSecretDirect({ kekEnrolled: true }) — where the KEK contract
 * makes the cached C alone useless, so the app-layer prompt is redundant.
 *
 * A future edit that silently adds setUserAuthenticationRequired(true) to
 * ensureUnauthStorageKey (or its config-driven flag) would re-open the
 * double-prompt bug. This test is the L-3-shape tripwire: same pattern as
 * PlayIntegrityJwsVerifierTest / EnclaveKeySpecConfigTest — pinning the
 * design decisions the plugin reads at KeyGenParameterSpec build time. The
 * plugin reads REQUIRES_USER_AUTH_UNAUTH directly (see
 * ensureUnauthStorageKey), so flipping this const changes the actual
 * KeyGenParameterSpec built at runtime.
 *
 * INTERNAL — not device-verified, not independently audited.
 */
class AndroidBiometricCacheConfigTest {

    // ── T1: unauth alias must NOT require user auth ──────────────────────

    @Test
    fun `T1 REQUIRES_USER_AUTH_UNAUTH is false — issue #2037 tripwire`() {
        assertFalse(
            "REQUIRES_USER_AUTH_UNAUTH must be false. Flipping to true re-opens the " +
                "double-prompt bug (issue #2037): the unauth alias exists precisely so the " +
                "KEK-direct unlock path (retrieveUnlockSecretDirect) can read the cached PIN " +
                "without a redundant OS biometric prompt. The StrongBox H factor gate inside " +
                "getHardwareFactor is the sole hardware-enforced biometric on that path.",
            AndroidBiometricCacheConfig.REQUIRES_USER_AUTH_UNAUTH,
        )
    }

    @Test
    fun `T1 legacy REQUIRES_USER_AUTH stays true (non-KEK vaults have no other biometric gate)`() {
        // Complement to T1: never downgrade the legacy path. It is the SOLE
        // biometric protection on non-KEK vaults (web password vault, bare
        // native vault) — flipping this to false would strip the only gate.
        assertTrue(AndroidBiometricCacheConfig.REQUIRES_USER_AUTH_LEGACY)
    }

    // ── T2: aliases are versioned and distinct ────────────────────────────

    @Test
    fun `T2 unauth alias matches reserved value`() {
        assertEquals(
            "com.veyrnox.app.biometricCacheStorageUnauth.v1",
            AndroidBiometricCacheConfig.STORAGE_UNAUTH_ALIAS,
        )
    }

    @Test
    fun `T2 unauth alias includes v1 version suffix (ACL policy stamp)`() {
        // Same versioning contract as EnclaveKeySpecConfig: the alias suffix
        // IS the ACL-policy proof. Any change to the KeyGenParameterSpec for
        // this alias (auth flags, cipher, key size) MUST bump the suffix so a
        // key existing under `.v1` is a proof-of-provenance that it was
        // minted with REQUIRES_USER_AUTH_UNAUTH == false.
        assertTrue(AndroidBiometricCacheConfig.STORAGE_UNAUTH_ALIAS.endsWith(".v1"))
    }

    @Test
    fun `T2 unauth alias is distinct from the legacy storage and invalidation aliases`() {
        // Cross-contamination would defeat the whole design: a shared alias
        // means the auth flag is one edit away from re-attaching to the
        // unauth path. Pin them apart.
        assertNotEquals(
            AndroidBiometricCacheConfig.STORAGE_ALIAS,
            AndroidBiometricCacheConfig.STORAGE_UNAUTH_ALIAS,
        )
        assertNotEquals(
            AndroidBiometricCacheConfig.INVALIDATION_ALIAS,
            AndroidBiometricCacheConfig.STORAGE_UNAUTH_ALIAS,
        )
    }

    // ── T3: unauth flag is a const val (compile-time immutable) ──────────

    @Test
    fun `T3 REQUIRES_USER_AUTH_UNAUTH is a const val — no runtime override path`() {
        // Same reflective check as EnclaveKeySpecConfigTest T3: `const val`
        // is compile-time-enforced by kotlinc; the reflective final/static
        // assertions catch a downgrade to `val` or `var`.
        val field = AndroidBiometricCacheConfig::class.java
            .getDeclaredField("REQUIRES_USER_AUTH_UNAUTH")
        assertNotNull(field)
        assertTrue(
            "REQUIRES_USER_AUTH_UNAUTH must be final (const val) so no code path can flip it",
            java.lang.reflect.Modifier.isFinal(field.modifiers),
        )
        assertTrue(
            "REQUIRES_USER_AUTH_UNAUTH must be static (const val) — not an instance field",
            java.lang.reflect.Modifier.isStatic(field.modifiers),
        )
    }

    // ── T4: cipher shape mirrors the legacy path ─────────────────────────

    @Test
    fun `T4 unauth alias uses the same AES-GCM 256 cipher shape as the legacy path`() {
        // No downgrade on the cipher itself — the only intended difference
        // between the two aliases is the auth flag.
        assertEquals("AES", AndroidBiometricCacheConfig.ALGORITHM)
        assertEquals("GCM", AndroidBiometricCacheConfig.BLOCK_MODE)
        assertEquals("NoPadding", AndroidBiometricCacheConfig.PADDING)
        assertEquals(256, AndroidBiometricCacheConfig.KEY_SIZE)
    }

    @Test
    fun `T4 MIN_API is 30 (Android 11) — matches BIOMETRIC_STRONG auth-parameters gate`() {
        assertEquals(30, AndroidBiometricCacheConfig.MIN_API)
    }
}
