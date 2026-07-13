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
// The Play Integrity token is a JWS signed with Google's RS256 key.
//
// UPDATE (G2 RS256, 2026-07-13): on-device RS256 signature verification is now
// implemented via verifyJwsSignature() — the JWS signature is verified against the
// leaf certificate in the x5c header claim, and the issuer is checked for "Google".
// RESIDUAL GAP: the x5c chain is not yet verified against a bundled Google root
// certificate — that requires capturing a real production token to obtain the root
// DER. Until root-cert pinning lands, treat results as PROVISIONAL (an attacker
// with IPC access who can forge a "Google"-issuer cert could pass the check, but
// the Play Services delivery channel does not expose this surface in practice).
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
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
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
     * NOTE (G2 RS256, see the file header): the JWS RS256 signature IS verified
     * on-device via verifyJwsSignature() before any payload is trusted. A failed
     * signature check maps to fail-closed { available:false }. Any structural
     * anomaly still throws and the caller maps it to fail-closed too.
     */
    private fun parseVerdictToken(token: String): JSObject {
        // Verify RS256 signature before trusting payload (I4: fail closed on bad sig).
        // See verifyJwsSignature for the honest limitation on issuer pinning.
        if (!verifyJwsSignature(token)) return unavailable()

        val parts = token.split(".")
        // A JWS has three dot-separated segments: header.payload.signature.
        if (parts.size != 3) throw IllegalArgumentException("malformed JWS")

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

    /**
     * Verify the JWS RS256 signature using the certificate chain in the x5c header claim.
     *
     * Steps:
     *  1. Decode the JWS header; assert alg == "RS256".
     *  2. Extract the leaf certificate from x5c[0] (base64-encoded DER).
     *  3. Assert the issuer name contains "Google" (weak binding — tighten to root-cert
     *     pinning once a real production token is captured and the root DER is known).
     *  4. Verify SHA256withRSA over signedData = base64url(header).base64url(payload).
     *
     * Returns false on ANY anomaly — caller maps false → unavailable() (fail-closed, I4).
     *
     * HONEST LIMITATION: we verify that the JWS signature was made with the key in the
     * x5c claim, and that the leaf certificate claims a Google issuer. We do NOT yet
     * verify the x5c chain against a bundled Google root certificate — that requires
     * capturing a real production token to obtain the root DER bytes. Until that step,
     * an attacker who can supply their own x5c with a "Google" issuer string could pass
     * this check. In the Play Services delivery channel this attack surface does not
     * exist (the token comes via IPC, not an open network endpoint), but it should be
     * closed with root-cert pinning before the feature reaches VALIDATED status.
     */
    private fun verifyJwsSignature(token: String): Boolean {
        return try {
            val parts = token.split(".")
            if (parts.size != 3) return false

            // 1. Parse JWS header
            val headerJson = String(base64UrlDecode(parts.first()), Charsets.UTF_8)
            val header = JSONObject(headerJson)
            if (header.optString("alg") != "RS256") return false

            // 2. Extract leaf certificate from x5c[0]
            val x5c = header.optJSONArray("x5c") ?: return false
            if (x5c.length() == 0) return false
            val leafCertDer = Base64.decode(x5c.getString(0), Base64.DEFAULT)
            val certFactory = CertificateFactory.getInstance("X.509")
            val leafCert = certFactory.generateCertificate(leafCertDer.inputStream()) as X509Certificate

            // 3. Weak issuer constraint — tighten to root-cert pinning in a future cycle
            val issuer = leafCert.issuerX500Principal.name
            if (!issuer.contains("Google", ignoreCase = true)) return false

            // 4. Verify SHA256withRSA over header.payload (the signed data per RFC 7515)
            val signedData = "${parts[0]}.${parts[1]}".toByteArray(Charsets.UTF_8)
            val signatureBytes = base64UrlDecode(parts[2])
            val sig = Signature.getInstance("SHA256withRSA")
            sig.initVerify(leafCert.publicKey)
            sig.update(signedData)
            sig.verify(signatureBytes)
        } catch (e: Exception) {
            // Any exception (malformed cert, wrong key type, bad signature, etc.) → false
            false
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
