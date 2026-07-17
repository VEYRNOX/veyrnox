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
 * ships. Extending Codex 2026-07-17 P2-A (which closed the same class of gap
 * on iOS at VeyrnoxEnclavePlugin.swift) to the Android bridge.
 *
 * Allowlist parity across platforms (JS wrapper, Swift bridge, Kotlin bridge)
 * is the security contract: any drift is a bug. These tests pin the Kotlin
 * end of that contract.
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
    //        try, so the JS/Swift/Kotlin contract stays byte-identical ────

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

    // ── T4: allowlist and reject codes are the JS/Swift/Kotlin contract ──

    @Test
    fun `T4 allowlist size matches iOS Swift allowlist (three intents)`() {
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
    fun `T4 reject code matches JS wrapper and Swift bridge`() {
        assertEquals("M2C_DELETE_INTENT_REQUIRED", VeyrnoxEnclaveDeleteIntent.REJECT_CODE)
    }
}
