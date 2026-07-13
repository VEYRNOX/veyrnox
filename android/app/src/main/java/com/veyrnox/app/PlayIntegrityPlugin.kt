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
// UPDATE (G2 x5c chain-walk, 2026-07-13): on-device JWS signature verification is
// implemented via verifyJwsSignature() — the full x5c chain is walked (each cert
// verified by the next cert's key), the root cert issuer is checked for "Google",
// and the JWS RS256/ES256 signature is verified with the leaf cert's public key.
//
// ALGORITHM AMBIGUITY (2026-07-13): Google's Play Integrity documentation cites
// ES256 (ECDSA P-256 / SHA-256); the predecessor SafetyNet API used RS256 (RSA
// PKCS#1 v1.5 / SHA-256). Both are accepted: the `alg` field in the JWS header
// selects the correct Signature instance. This cannot be confirmed without a real
// production token from a properly registered Play Console app.
//
// RESIDUAL GAP — ROOT CERT PINNING (G2-ROOTCERT-PIN): the root cert is still
// checked only via issuer.contains("Google") — a weak check. Replacing it with a
// SHA-256 fingerprint requires either capturing a real production token on-device,
// or Google publishing the root CA fingerprint (currently not documented). Until
// pinning lands, treat attestation results as PROVISIONAL.
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
     *  2. Build the cert chain from x5c (x5c[0]=leaf, x5c[last]=root).
     *  3. Walk the chain: verify each cert[i] is signed by cert[i+1]. This ensures
     *     the x5c array contains a valid PKI chain, not injected unrelated certs.
     *  4. Assert the root cert issuer contains "Google" (weak — pending full pinning;
     *     see G2-ROOTCERT-PIN below).
     *  5. Verify SHA256withRSA over signedData using the leaf cert's public key.
     *
     * Returns false on ANY anomaly — caller maps false → unavailable() (fail-closed, I4).
     *
     * HONEST LIMITATION: the chain walk (step 3) closes the "injected random cert"
     * attack by proving the x5c array is a cryptographically valid chain. However, the
     * root cert is still only checked with issuer.contains("Google") — an attacker who
     * can forge a Google-issuer self-signed root can still pass. In the Play Services
     * IPC delivery channel this surface doesn't exist, but it should be closed with
     * root-cert SHA-256 fingerprint pinning (G2-ROOTCERT-PIN: requires capturing a
     * real production token on-device to extract the root DER, then replacing the
     * issuer check with a fingerprint comparison).
     *
     * ALGORITHM: Google's Play Integrity documentation cites ES256; the predecessor
     * SafetyNet API used RS256. Both are accepted (the `alg` field dispatches the
     * correct Signature instance). Algorithm selection cannot be confirmed without a
     * real production token. Any unknown alg returns false (fail-closed, I4).
     */
    private fun verifyJwsSignature(token: String): Boolean {
        return try {
            val parts = token.split(".")
            if (parts.size != 3) return false

            // 1. Parse JWS header — accept RS256 (RSA) or ES256 (ECDSA); any other
            //    alg is rejected fail-closed (I4). See ALGORITHM note in the file header.
            val headerJson = String(base64UrlDecode(parts[0]), Charsets.UTF_8)
            val header = JSONObject(headerJson)
            val javaAlg = when (header.optString("alg")) {
                "RS256" -> "SHA256withRSA"
                "ES256" -> "SHA256withECDSA"
                else -> return false
            }

            // 2. Build cert chain from x5c array
            val x5c = header.optJSONArray("x5c") ?: return false
            val chainLen = x5c.length()
            if (chainLen == 0) return false
            val certFactory = CertificateFactory.getInstance("X.509")
            val chain: List<X509Certificate> = (0 until chainLen).map { i ->
                val der = Base64.decode(x5c.getString(i), Base64.DEFAULT)
                certFactory.generateCertificate(der.inputStream()) as X509Certificate
            }

            // 3. Walk chain: every cert must be signed by the next cert's key.
            // This prevents an attacker from supplying an arbitrary leaf cert alongside
            // an unrelated Google root — the whole chain must be cryptographically linked.
            for (i in 0 until chainLen - 1) {
                try {
                    chain[i].verify(chain[i + 1].publicKey)
                } catch (e: Exception) {
                    return false
                }
            }

            // 4. Root cert issuer check (weak — G2-ROOTCERT-PIN: replace with SHA-256
            // fingerprint of the actual Google root DER once captured on-device).
            val rootIssuer = chain[chainLen - 1].subjectX500Principal.name
            if (!rootIssuer.contains("Google", ignoreCase = true)) return false

            // 5. Verify JWS signature over header.payload (RFC 7515 signed data).
            //    Algorithm dispatched from the `alg` header field (RS256 → SHA256withRSA,
            //    ES256 → SHA256withECDSA). Public key from the verified leaf cert (x5c[0]).
            val signedData = "${parts[0]}.${parts[1]}".toByteArray(Charsets.UTF_8)
            val signatureBytes = base64UrlDecode(parts[2])
            val sig = Signature.getInstance(javaAlg)
            sig.initVerify(chain[0].publicKey)
            sig.update(signedData)
            sig.verify(signatureBytes)
        } catch (e: Exception) {
            // Any exception → false → unavailable() → INTEGRITY_UNAVAILABLE → WARN (I4)
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
