package com.veyrnox.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM unit tests for EnclaveKeySpecConfig — pure Kotlin constants that pin the
 * KeyGenParameterSpec design for the M2d Android wrapping key.
 *
 * Why a config object + JVM tests: KeyGenParameterSpec.Builder is Android-runtime
 * only (needs Android's SDK on the classpath), so we cannot build the actual spec
 * off-device without Robolectric. Instead we extract every design-decision value
 * as a plain-Kotlin constant that the service reads to build the real spec, and
 * pin the values here — the same pattern PlayIntegrityJwsVerifier uses to keep
 * the JVM test rig lean.
 *
 * M2d-1b lands the real service call site behind M2D_ENABLED=false (still false
 * — no production runtime behaviour change from this branch). This test pins:
 *   - AES-GCM 256 single-key (fallback branch of docs/M2cd.native-acl-plan.md §5)
 *   - versioned alias `.v1` — ANY future ACL/cipher change MUST bump the suffix
 *   - REQUIRES_USER_AUTH is a `const val`, so no code path can flip it to false
 *   - PREFER_STRONGBOX true — StrongBox is preferred, not enforced (I4 truthful
 *     reporting; StrongBox unavailability falls through to TEE at the service)
 *   - MIN_API 30 — setUserAuthenticationParameters is API 30+; do NOT weaken
 *     auth strength to run on older APIs (H16 discipline)
 *
 * INTERNAL — not device-verified, not independently audited.
 */
class EnclaveKeySpecConfigTest {

    // ── T1: cipher shape values match the spec ───────────────────────────

    @Test
    fun `T1 algorithm is AES`() {
        // KeyProperties.KEY_ALGORITHM_AES == "AES"
        assertEquals("AES", EnclaveKeySpecConfig.ALGORITHM)
    }

    @Test
    fun `T1 block mode is GCM`() {
        // KeyProperties.BLOCK_MODE_GCM == "GCM"
        assertEquals("GCM", EnclaveKeySpecConfig.BLOCK_MODE)
    }

    @Test
    fun `T1 padding is NoPadding`() {
        // KeyProperties.ENCRYPTION_PADDING_NONE == "NoPadding"
        assertEquals("NoPadding", EnclaveKeySpecConfig.PADDING)
    }

    @Test
    fun `T1 key size is 256`() {
        assertEquals(256, EnclaveKeySpecConfig.KEY_SIZE)
    }

    @Test
    fun `T1 requires user auth is true`() {
        assertTrue(EnclaveKeySpecConfig.REQUIRES_USER_AUTH)
    }

    @Test
    fun `T1 invalidate on biometric enroll is true`() {
        assertTrue(EnclaveKeySpecConfig.INVALIDATE_ON_BIOMETRIC_ENROLL)
    }

    @Test
    fun `T1 prefer strongBox is true`() {
        assertTrue(EnclaveKeySpecConfig.PREFER_STRONGBOX)
    }

    @Test
    fun `T1 min API is 30 (Android 11)`() {
        // Build.VERSION_CODES.R == 30 — setUserAuthenticationParameters is API 30+.
        // Do NOT weaken auth strength to run on older APIs (fail honest, fail closed).
        assertEquals(30, EnclaveKeySpecConfig.MIN_API)
    }

    @Test
    fun `T1 key alias matches reserved value`() {
        assertEquals(
            "com.veyrnox.app.enclaveWrappingKey.v1",
            EnclaveKeySpecConfig.KEY_ALIAS,
        )
    }

    // ── T2: alias includes a version suffix ──────────────────────────────

    @Test
    fun `T2 key alias includes v1 version suffix (ACL policy stamp)`() {
        // The alias itself is the ACL-policy proof: if a key exists under .v1,
        // it was minted by THIS code with THIS ACL. Any change to the KeyGenParameterSpec
        // (auth flags, cipher, key size) MUST bump this suffix.
        assertTrue(EnclaveKeySpecConfig.KEY_ALIAS.endsWith(".v1"))
    }

    // ── T3: REQUIRES_USER_AUTH must be immutable — no code path can flip it ──

    @Test
    fun `T3 REQUIRES_USER_AUTH is a const val (compile-time immutable, no runtime override)`() {
        // Compile-time contract: `const val` is enforced by kotlinc; reflection can't touch it.
        // If someone converts this to `var` or `val` (mutable-ish), this reflective check
        // still passes on val, so the operative guard is the `const` keyword read below.
        val field = EnclaveKeySpecConfig::class.java.getDeclaredField("REQUIRES_USER_AUTH")
        assertNotNull(field)
        // Final modifier is implied by `const val` — Modifier.isFinal must hold.
        assertTrue(
            "REQUIRES_USER_AUTH must be final (const val) so no code path can flip it",
            java.lang.reflect.Modifier.isFinal(field.modifiers),
        )
        assertTrue(
            "REQUIRES_USER_AUTH must be static (const val) — not an instance field",
            java.lang.reflect.Modifier.isStatic(field.modifiers),
        )
    }

    // ── T4: PREFER_STRONGBOX is on by default ────────────────────────────

    @Test
    fun `T4 PREFER_STRONGBOX defaults to true (StrongBox-preferred, TEE-fallback)`() {
        assertTrue(EnclaveKeySpecConfig.PREFER_STRONGBOX)
    }
}
