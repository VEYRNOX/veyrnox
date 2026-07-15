package com.veyrnox.app

import java.security.MessageDigest
import org.json.JSONObject

/**
 * Pure-JVM nonce round-trip check for the Play Integrity JWS payload.
 *
 * Extracted from PlayIntegrityPlugin.parseVerdictToken (audit finding P1-1,
 * 2026-07-14) so the algorithm is executable-testable on the JVM without a
 * device or a real Play Integrity token.
 *
 * ── THE ATTACK ─────────────────────────────────────────────────────────────
 * PlayIntegrityPlugin.requestVerdict submits a fresh random nonce via
 * IntegrityTokenRequest.setNonce(). Google's response JWS payload echoes that
 * nonce back verbatim under `requestDetails.nonce`. Before P1-1 was fixed the
 * plugin never compared the returned nonce against what it sent — so a hooked
 * response path could REPLAY an older, genuinely-signed, passing verdict from
 * a previously-clean state and pass every other check (JWS signature, x5c
 * chain walk, root pin/issuer). This verifier closes that gap.
 *
 * ── SPEC ───────────────────────────────────────────────────────────────────
 * Per Google's Play Integrity documentation the `nonce` field under
 * `requestDetails` in the decoded JWS payload contains the EXACT string that
 * was passed to `IntegrityTokenRequest.setNonce()` — it is echoed verbatim,
 * NOT hashed on the server side. Therefore a byte-for-byte string comparison
 * against the caller-supplied `expected` value is the correct check.
 *
 * If a future Play Integrity spec revision alters that (e.g. server-side
 * SHA-256 of the sent nonce, as SafetyNet's older `noncehash` pattern), this
 * one function is the sole place to update.
 *
 * ── I4 — FAIL CLOSED ───────────────────────────────────────────────────────
 * ANY failure — malformed JSON, absent `requestDetails`, absent/empty/wrong-type
 * `nonce`, mismatch, empty expected value — returns `false`. The caller in
 * PlayIntegrityPlugin maps false → unavailable() → INTEGRITY_UNAVAILABLE →
 * WARN. Never a fabricated pass.
 *
 * ── I2/I3 — NO EGRESS, NO PERSISTENCE, NO LOGGING ──────────────────────────
 * The expected nonce is caller-supplied and lives on the stack; nothing is
 * persisted or logged from this function. Constant-time equality on the raw
 * strings avoids leaking a timing side-channel about how many leading bytes
 * matched an attacker's candidate replay.
 *
 * INTERNAL — not device-verified against a real Play Integrity token, not
 * independently audited.
 */
internal object PlayIntegrityNonceVerifier {

    /**
     * Compare the `requestDetails.nonce` field in the Play Integrity JWS payload
     * against the nonce originally passed to `IntegrityTokenRequest.setNonce()`.
     *
     * @param payloadJson the base64url-decoded JWS payload segment as a UTF-8 JSON string
     * @param expected the nonce string originally sent to Play Integrity
     * @return true iff both are non-empty and byte-for-byte equal; false otherwise
     */
    fun verifyNonce(payloadJson: String, expected: String): Boolean {
        // Empty expected — caller invariant violation; refuse (I4). An attacker who
        // can drive expected="" against a payload with nonce="" must not pass.
        if (expected.isEmpty()) return false
        return try {
            val root = JSONObject(payloadJson)
            val requestDetails = root.optJSONObject("requestDetails") ?: return false
            // JSONObject.opt returns null for absent keys, an actual JSONObject/JSONArray
            // for non-string types, and the wrapped value otherwise. Reject anything that
            // isn't a real string — do not let a nested object be silently toString()'d.
            val raw = requestDetails.opt("nonce")
            if (raw !is String) return false
            if (raw.isEmpty()) return false
            constantTimeEquals(raw, expected)
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Constant-time equality on UTF-8 byte representations. Length mismatch is
     * an immediate false but is also revealed by any side-channel a network
     * observer could exploit — this comparison guards against timing leaks
     * DURING the byte scan, not against length disclosure.
     */
    private fun constantTimeEquals(a: String, b: String): Boolean {
        val ab = a.toByteArray(Charsets.UTF_8)
        val bb = b.toByteArray(Charsets.UTF_8)
        if (ab.size != bb.size) return false
        return MessageDigest.isEqual(ab, bb)
    }
}
