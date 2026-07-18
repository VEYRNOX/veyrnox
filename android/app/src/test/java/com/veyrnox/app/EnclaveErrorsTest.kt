package com.veyrnox.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Test

/**
 * JVM unit tests for EnclaveErrors — the shared typed-error code catalogue
 * for VeyrnoxEnclavePlugin.wrap and .unwrap (M2d).
 *
 * These strings are the cross-platform contract: the JS wrapper
 * (src/plugins/veyrnoxEnclave.js) and iOS bridge (VeyrnoxEnclavePlugin.swift)
 * dispatch on them by exact string match. Any drift is a bug that would make
 * callers matching `if (e.code === 'M2D_CIPHERTEXT_TAMPERED')` silently miss.
 *
 * INTERNAL — not device-verified, not independently audited.
 */
class EnclaveErrorsTest {

    // ── Existing wrap codes (parity with iOS bridge) ─────────────────────

    @Test
    fun `KEY_NOT_FOUND is M2D_KEY_NOT_FOUND`() {
        assertEquals("M2D_KEY_NOT_FOUND", EnclaveErrors.KEY_NOT_FOUND)
    }

    @Test
    fun `KEY_INVALIDATED is M2D_KEY_INVALIDATED`() {
        assertEquals("M2D_KEY_INVALIDATED", EnclaveErrors.KEY_INVALIDATED)
    }

    @Test
    fun `USER_CANCEL is M2D_USER_CANCEL`() {
        assertEquals("M2D_USER_CANCEL", EnclaveErrors.USER_CANCEL)
    }

    @Test
    fun `BIOMETRY_LOCKOUT is M2D_BIOMETRY_LOCKOUT`() {
        assertEquals("M2D_BIOMETRY_LOCKOUT", EnclaveErrors.BIOMETRY_LOCKOUT)
    }

    @Test
    fun `BIOMETRY_NOT_ENROLLED is M2D_BIOMETRY_NOT_ENROLLED`() {
        assertEquals("M2D_BIOMETRY_NOT_ENROLLED", EnclaveErrors.BIOMETRY_NOT_ENROLLED)
    }

    @Test
    fun `AUTH_FAILED is M2D_AUTH_FAILED`() {
        assertEquals("M2D_AUTH_FAILED", EnclaveErrors.AUTH_FAILED)
    }

    @Test
    fun `WRAP_FAILED is M2D_WRAP_FAILED`() {
        assertEquals("M2D_WRAP_FAILED", EnclaveErrors.WRAP_FAILED)
    }

    // ── New unwrap-specific codes (M2d-1d) ───────────────────────────────

    @Test
    fun `CIPHERTEXT_TAMPERED is M2D_CIPHERTEXT_TAMPERED`() {
        // Security-critical: distinct from UNWRAP_FAILED. Callers may loudly
        // surface tamper events (AEADBadTagException) vs treat generic
        // internal errors as retriable.
        assertEquals("M2D_CIPHERTEXT_TAMPERED", EnclaveErrors.CIPHERTEXT_TAMPERED)
    }

    @Test
    fun `MALFORMED_BUNDLE is M2D_MALFORMED_BUNDLE`() {
        // Pre-cipher shape error — EnclaveWireFormat.unpack threw. Distinct
        // from CIPHERTEXT_TAMPERED (which is a valid-shape auth-tag failure).
        assertEquals("M2D_MALFORMED_BUNDLE", EnclaveErrors.MALFORMED_BUNDLE)
    }

    @Test
    fun `UNWRAP_FAILED is M2D_UNWRAP_FAILED`() {
        assertEquals("M2D_UNWRAP_FAILED", EnclaveErrors.UNWRAP_FAILED)
    }

    // ── Distinctness pins: the two unwrap-specific codes must not collapse
    //     into UNWRAP_FAILED, and CIPHERTEXT_TAMPERED must be distinct from
    //     MALFORMED_BUNDLE (a byte-flip in a valid bundle vs. a wrong-shape
    //     bundle carry different threat semantics). ─────────────────────

    @Test
    fun `CIPHERTEXT_TAMPERED is distinct from UNWRAP_FAILED`() {
        assertNotEquals(EnclaveErrors.CIPHERTEXT_TAMPERED, EnclaveErrors.UNWRAP_FAILED)
    }

    @Test
    fun `MALFORMED_BUNDLE is distinct from UNWRAP_FAILED`() {
        assertNotEquals(EnclaveErrors.MALFORMED_BUNDLE, EnclaveErrors.UNWRAP_FAILED)
    }

    @Test
    fun `CIPHERTEXT_TAMPERED is distinct from MALFORMED_BUNDLE`() {
        assertNotEquals(EnclaveErrors.CIPHERTEXT_TAMPERED, EnclaveErrors.MALFORMED_BUNDLE)
    }

    @Test
    fun `WRAP_FAILED is distinct from UNWRAP_FAILED`() {
        assertNotEquals(EnclaveErrors.WRAP_FAILED, EnclaveErrors.UNWRAP_FAILED)
    }

    // ── Prefix contract: every code carries the M2D_ tag ─────────────────

    @Test
    fun `every code carries the M2D_ prefix`() {
        val all = listOf(
            EnclaveErrors.KEY_NOT_FOUND,
            EnclaveErrors.KEY_INVALIDATED,
            EnclaveErrors.USER_CANCEL,
            EnclaveErrors.BIOMETRY_LOCKOUT,
            EnclaveErrors.BIOMETRY_NOT_ENROLLED,
            EnclaveErrors.AUTH_FAILED,
            EnclaveErrors.WRAP_FAILED,
            EnclaveErrors.CIPHERTEXT_TAMPERED,
            EnclaveErrors.MALFORMED_BUNDLE,
            EnclaveErrors.UNWRAP_FAILED,
        )
        for (code in all) {
            assertEquals("code $code must start with M2D_", true, code.startsWith("M2D_"))
        }
    }
}
