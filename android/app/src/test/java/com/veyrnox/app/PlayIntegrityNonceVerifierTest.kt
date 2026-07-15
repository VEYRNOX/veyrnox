package com.veyrnox.app

import org.junit.Assert.*
import org.junit.Test

/**
 * JVM unit tests for PlayIntegrityNonceVerifier — the pure-JVM nonce round-trip
 * check extracted from PlayIntegrityPlugin.parseVerdictToken (audit finding P1-1,
 * 2026-07-14).
 *
 * PlayIntegrityPlugin submits a fresh random nonce to Google's Play Integrity API
 * via IntegrityTokenRequest.setNonce(); Google echoes that nonce back verbatim in
 * the returned JWS payload at requestDetails.nonce. Without a byte-for-byte
 * comparison of the returned nonce against the one we sent, a hooked response
 * path could REPLAY an older genuinely-signed passing verdict — signatures pass,
 * x5c chain walk passes, no binding to THIS request exists. Real replay attack.
 *
 * These tests pin the fix-side behaviour: match → true, mismatch/missing/empty →
 * false (caller maps false → unavailable() → INTEGRITY_UNAVAILABLE → WARN, I4).
 *
 * INTERNAL — not device-verified, not independently audited. A captured real Play
 * Integrity token remains the outstanding device-verification.
 */
class PlayIntegrityNonceVerifierTest {

    // ── T1: nonce round-trip matches ─────────────────────────────────────────

    @Test
    fun `T1 verifyNonce returns true when payload nonce matches expected`() {
        val expected = "abc123-random-nonce-42chars-base64-padded-x"
        val payload = """{"requestDetails":{"nonce":"$expected"}}"""
        assertTrue(PlayIntegrityNonceVerifier.verifyNonce(payload, expected))
    }

    // ── T2: nonce mismatch → false (fail-closed) ─────────────────────────────

    @Test
    fun `T2 verifyNonce returns false when payload nonce differs from expected`() {
        val payload = """{"requestDetails":{"nonce":"different-value"}}"""
        assertFalse(PlayIntegrityNonceVerifier.verifyNonce(payload, "abc123-sent"))
    }

    // ── T3: nonce field absent → false ───────────────────────────────────────

    @Test
    fun `T3 verifyNonce returns false when requestDetails has no nonce field`() {
        val payload = """{"requestDetails":{"requestPackageName":"com.veyrnox.app"}}"""
        assertFalse(PlayIntegrityNonceVerifier.verifyNonce(payload, "abc123-sent"))
    }

    @Test
    fun `T3b verifyNonce returns false when requestDetails object itself is absent`() {
        val payload = """{"deviceIntegrity":{"deviceRecognitionVerdict":["MEETS_BASIC_INTEGRITY"]}}"""
        assertFalse(PlayIntegrityNonceVerifier.verifyNonce(payload, "abc123-sent"))
    }

    // ── T4: empty nonce → false ──────────────────────────────────────────────

    @Test
    fun `T4 verifyNonce returns false when payload nonce is empty string`() {
        val payload = """{"requestDetails":{"nonce":""}}"""
        assertFalse(PlayIntegrityNonceVerifier.verifyNonce(payload, ""))
    }

    @Test
    fun `T4b verifyNonce returns false when expected nonce is empty`() {
        val payload = """{"requestDetails":{"nonce":"abc123"}}"""
        assertFalse(PlayIntegrityNonceVerifier.verifyNonce(payload, ""))
    }

    // ── T5: replay — same token, different sent nonces ───────────────────────

    @Test
    fun `T5 verifyNonce distinguishes replays same payload with different expected nonces`() {
        val captured = "captured-nonce-from-a-past-genuine-response-A"
        val payload = """{"requestDetails":{"nonce":"$captured"}}"""
        // First call (original request that generated this token): pass.
        assertTrue(PlayIntegrityNonceVerifier.verifyNonce(payload, captured))
        // Replay attempt (attacker replays token against a NEW fresh nonce): fail.
        assertFalse(PlayIntegrityNonceVerifier.verifyNonce(payload, "fresh-nonce-for-a-later-request"))
    }

    // ── Robustness: malformed payload JSON → false, not throw ────────────────

    @Test
    fun `verifyNonce returns false on malformed JSON payload`() {
        assertFalse(PlayIntegrityNonceVerifier.verifyNonce("not-json", "abc"))
        assertFalse(PlayIntegrityNonceVerifier.verifyNonce("", "abc"))
    }

    @Test
    fun `verifyNonce returns false when nonce field is non-string type`() {
        // JSONObject.optString on a numeric field yields the string form; belt-and-braces
        // guard: an object/array in that slot must not be silently coerced.
        val payload = """{"requestDetails":{"nonce":{"nested":"x"}}}"""
        assertFalse(PlayIntegrityNonceVerifier.verifyNonce(payload, "abc"))
    }

    // ── Constant-time equality — length disparity handled ────────────────────

    @Test
    fun `verifyNonce returns false when lengths differ`() {
        val payload = """{"requestDetails":{"nonce":"short"}}"""
        assertFalse(PlayIntegrityNonceVerifier.verifyNonce(payload, "a-much-longer-value-than-short"))
    }
}
