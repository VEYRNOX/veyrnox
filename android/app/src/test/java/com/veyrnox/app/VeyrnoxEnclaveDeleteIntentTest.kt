package com.veyrnox.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * JVM unit tests for VeyrnoxEnclaveDeleteIntent — the pure-JVM allowlist gate
 * for VeyrnoxEnclavePlugin.deleteWrappingKey.
 *
 * The plugin is auto-registered by Capacitor and reachable from any in-page
 * JS on Android — the intent gate is defence-in-depth against an injected
 * script calling deleteWrappingKey() directly with no argument once M2d
 * ships. Extends the Codex 2026-07-17 P2-A pattern (originating on iOS at
 * VeyrnoxEnclavePlugin.swift and JS at src/plugins/veyrnoxEnclave.js on
 * PR #1098) to the Android bridge. On this branch — cut from origin/main —
 * the intent gate is Android-only; the iOS Swift bridge and JS wrapper
 * converge on the same allowlist only once #1098 merges.
 *
 * Allowlist convergence across platforms (JS wrapper, Swift bridge, Kotlin
 * bridge) is the eventual security contract; any drift once all three land
 * is a bug. These tests pin the Kotlin end of that contract from day one.
 *
 * Not a confidentiality control — delete cannot leak key material. This is an
 * availability hazard (an injected script stranding a live Enclave-wrapped
 * vault); the intent check makes the accident/attack loud rather than silent.
 *
 * INTERNAL — not device-verified, not independently audited.
 */
class VeyrnoxEnclaveDeleteIntentTest {

    // ── T1: three allowlisted intents pass ───────────────────────────────

    @Test
    fun `T1 cleanup is allowed`() {
        assertTrue(VeyrnoxEnclaveDeleteIntent.isAllowed("cleanup"))
    }

    @Test
    fun `T1 unenroll is allowed`() {
        assertTrue(VeyrnoxEnclaveDeleteIntent.isAllowed("unenroll"))
    }

    @Test
    fun `T1 wipe is allowed`() {
        assertTrue(VeyrnoxEnclaveDeleteIntent.isAllowed("wipe"))
    }

    // ── T2: fail-closed on null / empty / unknown ────────────────────────

    @Test
    fun `T2 null is rejected`() {
        assertFalse(VeyrnoxEnclaveDeleteIntent.isAllowed(null))
    }

    @Test
    fun `T2 empty string is rejected`() {
        assertFalse(VeyrnoxEnclaveDeleteIntent.isAllowed(""))
    }

    @Test
    fun `T2 arbitrary string is rejected`() {
        assertFalse(VeyrnoxEnclaveDeleteIntent.isAllowed("something-else"))
    }

    // ── T3: case sensitivity — reject variants that a fuzzy caller might
    //        try, so the eventual JS/Swift/Kotlin contract (post-#1098)
    //        stays byte-identical across platforms ────────────────────────

    @Test
    fun `T3 uppercase is rejected (case-sensitive)`() {
        assertFalse(VeyrnoxEnclaveDeleteIntent.isAllowed("CLEANUP"))
    }

    @Test
    fun `T3 mixed case is rejected (case-sensitive)`() {
        assertFalse(VeyrnoxEnclaveDeleteIntent.isAllowed("Wipe"))
    }

    @Test
    fun `T3 surrounding whitespace is rejected (no trim)`() {
        assertFalse(VeyrnoxEnclaveDeleteIntent.isAllowed(" cleanup"))
        assertFalse(VeyrnoxEnclaveDeleteIntent.isAllowed("cleanup "))
    }

    // ── T4: allowlist and reject codes pin the Kotlin end of the eventual
    //        cross-platform contract (JS wrapper + Swift bridge converge on
    //        the same values once PR #1098 merges) ─────────────────────────

    @Test
    fun `T4 allowlist size is three intents (Kotlin end of eventual contract)`() {
        assertEquals(3, VeyrnoxEnclaveDeleteIntent.ALLOWED_INTENTS.size)
    }

    @Test
    fun `T4 allowlist contains exactly cleanup unenroll wipe`() {
        assertEquals(
            setOf("cleanup", "unenroll", "wipe"),
            VeyrnoxEnclaveDeleteIntent.ALLOWED_INTENTS
        )
    }

    @Test
    fun `T4 reject code is M2C_DELETE_INTENT_REQUIRED (Kotlin end of eventual contract)`() {
        assertEquals("M2C_DELETE_INTENT_REQUIRED", VeyrnoxEnclaveDeleteIntent.REJECT_CODE)
    }
}
