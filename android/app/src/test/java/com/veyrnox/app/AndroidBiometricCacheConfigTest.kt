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

    // ── T5: fast-path alias (issue #2019) — the OPPOSITE ACL from the unauth alias ────
    //
    // The fast-path DEK cache (docs/kek-fast-path-design.md) trades PIN gating
    // for latency: on steady-state unlock the DEK is released after a biometric
    // match ALONE, no Argon2id, no PIN. That is only safe if the Keystore alias
    // holding the wrapped DEK is BOTH:
    //   1. auth-required (user-authentication required to use the key), AND
    //   2. invalidated by biometric enrollment (STRONG form — any new/removed
    //      biometric on the device wipes the key at the OS).
    //
    // Flipping REQUIRES_USER_AUTH_FASTPATH to false would turn the fast-path
    // into a passive Keystore read — anyone with the device could unlock without
    // even touching a biometric. Flipping INVALIDATE_ON_BIOMETRIC_ENROLL_FASTPATH
    // to false would let a coerced attacker who enrolls their own biometric
    // ride an old cache slot. Both are must-haves per the design; this test is
    // the tripwire.

    @Test
    fun `T5 REQUIRES_USER_AUTH_FASTPATH is true — issue #2019 must-have`() {
        assertTrue(
            "REQUIRES_USER_AUTH_FASTPATH must be true. Flipping to false " +
                "removes the sole biometric gate on the fast-path DEK cache — the whole " +
                "security model (docs/kek-fast-path-design.md §Security model change) " +
                "depends on the OS biometric match being enforced by the Keystore alias " +
                "itself, not by an app-layer wrapper.",
            AndroidBiometricCacheConfig.REQUIRES_USER_AUTH_FASTPATH,
        )
    }

    @Test
    fun `T5 INVALIDATE_ON_BIOMETRIC_ENROLL_FASTPATH is true — STRONG enrollment binding`() {
        assertTrue(
            "INVALIDATE_ON_BIOMETRIC_ENROLL_FASTPATH must be true. Without it a " +
                "coerced attacker who adds their own fingerprint after taking the device " +
                "can unwrap the cached DEK via the fast path. Design mandates the STRONG " +
                "form (invalidate on ANY biometric change), see design doc §Cache invalidation.",
            AndroidBiometricCacheConfig.INVALIDATE_ON_BIOMETRIC_ENROLL_FASTPATH,
        )
    }

    @Test
    fun `T5 fast-path alias matches reserved value and includes v1 stamp`() {
        assertEquals(
            "com.veyrnox.app.biometricCacheFastpath.v1",
            AndroidBiometricCacheConfig.FASTPATH_ALIAS,
        )
        assertTrue(AndroidBiometricCacheConfig.FASTPATH_ALIAS.endsWith(".v1"))
    }

    @Test
    fun `T5 fast-path alias is distinct from all three other aliases (owner Q5)`() {
        // Owner ruling Q5: separate slot from Personal Backup's dek-cache/v1.
        // Cross-contamination would defeat the whole design.
        assertNotEquals(
            AndroidBiometricCacheConfig.STORAGE_ALIAS,
            AndroidBiometricCacheConfig.FASTPATH_ALIAS,
        )
        assertNotEquals(
            AndroidBiometricCacheConfig.INVALIDATION_ALIAS,
            AndroidBiometricCacheConfig.FASTPATH_ALIAS,
        )
        assertNotEquals(
            AndroidBiometricCacheConfig.STORAGE_UNAUTH_ALIAS,
            AndroidBiometricCacheConfig.FASTPATH_ALIAS,
        )
    }

    @Test
    fun `T5 both fast-path flags are const val (no runtime override path)`() {
        val authField = AndroidBiometricCacheConfig::class.java
            .getDeclaredField("REQUIRES_USER_AUTH_FASTPATH")
        val invField = AndroidBiometricCacheConfig::class.java
            .getDeclaredField("INVALIDATE_ON_BIOMETRIC_ENROLL_FASTPATH")
        for (field in listOf(authField, invField)) {
            assertNotNull(field)
            assertTrue(
                "${field.name} must be final (const val)",
                java.lang.reflect.Modifier.isFinal(field.modifiers),
            )
            assertTrue(
                "${field.name} must be static (const val)",
                java.lang.reflect.Modifier.isStatic(field.modifiers),
            )
        }
    }
}
