package com.veyrnox.app

// PlayIntegrityPlugin.kt
//
// Native REMOTE ATTESTATION probe for Android — RASP Phase 2b (Option B, signed
// off 2026-07-13, docs/rasp-attestation-egress-decision.md).
//
// STATUS: BUILT-UNVALIDATED — logic is present but has NOT been exercised on a
// real device with Play Services, nor against a genuinely failing (rooted/hidden)
// device. Requires on-device verification (roadmap Phase 4) and the independent
// audit (Phase 5) before the status can advance.
//
// WHAT THIS DOES. Requests a Play Integrity verdict token (a JWS) from Google Play
// Services, decodes its JSON payload ON-DEVICE, and reports whether the device
// meets the minimum integrity bar (MEETS_BASIC_INTEGRITY). Unlike
// RaspIntegrityPlugin (on-device probes, no egress), this makes a NETWORK CALL —
// it is the disclosed, deniability-gated egress leg. The JS caller
// (attestationProbeSource) guarantees it is never invoked under a decoy/hidden
// session and only at the pre-sign gate.
//
// ── HONEST LIMITATION (must not be overstated) ─────────────────────────────
// The Play Integrity token is a JWS signed with Google's RS256 key. This plugin
// does NOT cryptographically verify that signature on-device — no Google public
// key is bundled in this build. We decode the payload (the middle base64url
// segment) and read the verdict directly. The token's integrity therefore rests
// on the Play Services delivery channel (the app talks to Google Play Services via
// a bound, in-process API, not an open network endpoint an attacker can trivially
// forge), NOT on an on-device signature check. A future cycle can bundle Google's
// public key and verify the JWS (or move verification server-side under I5 rules).
// Until then, treat the "attestationFailed:false" result as PROVISIONAL.
//
// I4 — FAIL CLOSED. A missing/short nonce, absent Play Services, a token request
// failure, or ANY parse exception resolves with { available:false }, which the JS
// layer maps to INTEGRITY_UNAVAILABLE (→ WARN), never a fabricated clean/allow.
//
// I2/I3 — the only outbound argument is the caller-supplied random nonce; no
// wallet-set handle, no seed, no key material is ever transmitted. The verdict
// DECISION is made on-device (I5): no backend holds authority over signing.

import android.util.Base64
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import org.json.JSONArray
import org.json.JSONObject

@CapacitorPlugin(name = "PlayIntegrity")
class PlayIntegrityPlugin : Plugin() {

    /**
     * requestVerdict({ nonce }) →
     *   { available, attestationFailed, meetsDeviceIntegrity, meetsBasicIntegrity }
     *   or { available:false } on any failure (fail-closed, I4).
     *
     * Play Integrity's Task callbacks are delivered on the main thread, so no
     * explicit runOnUiThread is required here.
     */
    @PluginMethod
    fun requestVerdict(call: PluginCall) {
        val nonce = call.getString("nonce")
        // A real request MUST carry a fresh nonce that binds the verdict to this
        // request. Absent/short → we cannot make a trustworthy request → fail closed.
        if (nonce == null || nonce.length < 16) {
            call.resolve(unavailable())
            return
        }

        val manager = try {
            IntegrityManagerFactory.create(context)
        } catch (e: Exception) {
            // Play Services absent / too old / disabled → no attestation channel.
            call.resolve(unavailable())
            return
        }

        try {
            manager
                .requestIntegrityToken(
                    IntegrityTokenRequest.builder().setNonce(nonce).build()
                )
                .addOnSuccessListener { response ->
                    // On-device verdict read: parse the JWS payload directly.
                    call.resolve(
                        try {
                            parseVerdictToken(response.token())
                        } catch (e: Exception) {
                            unavailable()
                        }
                    )
                }
                .addOnFailureListener { _ ->
                    // Network failure, integrity API error, quota, etc. → fail closed.
                    call.resolve(unavailable())
                }
        } catch (e: Exception) {
            call.resolve(unavailable())
        }
    }

    /**
     * Decode the Play Integrity JWS payload (middle base64url segment) and extract
     * deviceIntegrity.deviceRecognitionVerdict.
     *
     * MINIMUM BAR: MEETS_BASIC_INTEGRITY. A device that does not even meet basic
     * integrity is treated as a failed attestation (attestationFailed = true →
     * INTEGRITY_FAIL → BLOCK in the JS degrade lattice). MEETS_DEVICE_INTEGRITY is
     * surfaced separately for future policy but is NOT required to pass here.
     *
     * NOTE (honest limitation, see the file header): the JWS RS256 signature is NOT
     * verified — only the payload is decoded. Any structural anomaly throws and the
     * caller maps it to fail-closed { available:false }.
     */
    private fun parseVerdictToken(token: String): JSObject {
        val parts = token.split(".")
        // A JWS has three dot-separated segments: header.payload.signature.
        if (parts.size < 2) throw IllegalArgumentException("malformed JWS")

        val payloadJson = String(base64UrlDecode(parts[1]), Charsets.UTF_8)
        val root = JSONObject(payloadJson)

        val deviceIntegrity = root.optJSONObject("deviceIntegrity")
            ?: throw IllegalArgumentException("no deviceIntegrity")
        val verdicts: JSONArray = deviceIntegrity.optJSONArray("deviceRecognitionVerdict")
            ?: JSONArray()

        var meetsBasic = false
        var meetsDevice = false
        for (i in 0 until verdicts.length()) {
            when (verdicts.optString(i)) {
                "MEETS_BASIC_INTEGRITY" -> meetsBasic = true
                "MEETS_DEVICE_INTEGRITY" -> meetsDevice = true
                "MEETS_STRONG_INTEGRITY" -> { meetsDevice = true; meetsBasic = true }
            }
        }
        // MEETS_DEVICE_INTEGRITY implies basic integrity in practice; be defensive.
        if (meetsDevice) meetsBasic = true

        return JSObject().apply {
            put("available", true)
            put("attestationFailed", !meetsBasic)
            put("meetsDeviceIntegrity", meetsDevice)
            put("meetsBasicIntegrity", meetsBasic)
        }
    }

    // Base64URL decode: Play Integrity JWS segments are base64url (- and _, no
    // padding). Convert to standard alphabet and pad to a multiple of 4.
    private fun base64UrlDecode(segment: String): ByteArray {
        var s = segment.replace('-', '+').replace('_', '/')
        val rem = s.length % 4
        if (rem > 0) s += "=".repeat(4 - rem)
        return Base64.decode(s, Base64.DEFAULT)
    }

    private fun unavailable(): JSObject = JSObject().apply { put("available", false) }
}
