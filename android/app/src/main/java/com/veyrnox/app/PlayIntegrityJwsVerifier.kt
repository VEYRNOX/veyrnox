package com.veyrnox.app

// PlayIntegrityJwsVerifier.kt
//
// Pure-JVM extraction of the JWS signature-verification path from
// PlayIntegrityPlugin.verifyJwsSignature (issue #957).
//
// This object has NO android.* imports — all crypto uses java.security.* and
// org.json.*.  Production code passes android.util.Base64 as the decoder;
// JVM unit tests pass java.util.Base64 so no Robolectric is needed.
//
// BUILT / unit-tested (PlayIntegrityJwsVerifierTest). NOT device-verified
// against a real Play Integrity token — see PlayIntegrityPlugin file header.

import java.security.MessageDigest
import java.security.Signature
import java.security.cert.CertificateFactory
import java.security.cert.X509Certificate
import org.json.JSONObject

internal object PlayIntegrityJwsVerifier {

    // Known Google root CA SHA-256 fingerprints (DER bytes of the cert).
    // GTS Root R1 confirmed from https://pki.goog/repository/ (2026-07-14).
    // Additional roots (R2, R3, R4) added once confirmed from a live token.
    private val GOOGLE_ROOT_CA_SHA256 = setOf(
        "2a575471e31340bc21581cbd2cf13e158463203ece94bcf9d3cc196bf09a5472",
    )

    /**
     * Verify the JWS token's signature and cert chain.
     *
     * @param token      Three-part JWS string (header.payload.signature).
     * @param b64Decode  Platform-appropriate base64url decoder. Production callers
     *                   supply android.util.Base64; tests supply java.util.Base64 so
     *                   this object stays free of android.* imports (issue #957).
     * @return true iff the chain walks, root is trusted, and signature verifies.
     *         Returns false on any parse/crypto failure (fail-closed, I4).
     */
    fun verify(token: String, b64Decode: (String) -> ByteArray): Boolean {
        return try {
            val parts = token.split(".")
            if (parts.size != 3) return false

            // 1. Parse JWS header — ES256 (ECDSA) or RS256 (RSA). Any other alg → false.
            val headerJson = String(b64Decode(parts[0]), Charsets.UTF_8)
            val header = JSONObject(headerJson)
            val javaAlg = when (header.optString("alg")) {
                "RS256" -> "SHA256withRSA"
                "ES256" -> "SHA256withECDSA"
                else -> return false
            }

            // 2. Build cert chain from x5c array.
            val x5c = header.optJSONArray("x5c") ?: return false
            val chainLen = x5c.length()
            if (chainLen == 0) return false
            val certFactory = CertificateFactory.getInstance("X.509")
            val chain: List<X509Certificate> = (0 until chainLen).map { i ->
                val der = b64Decode(x5c.getString(i))
                certFactory.generateCertificate(der.inputStream()) as X509Certificate
            }

            // 3. Walk chain: every cert must be signed by the next cert's key.
            for (i in 0 until chainLen - 1) {
                try {
                    chain[i].verify(chain[i + 1].publicKey)
                } catch (e: Exception) {
                    return false
                }
            }

            // 4. Root cert trust: fingerprint pin OR "Google" in issuer (belt-and-suspenders).
            val rootCert = chain[chainLen - 1]
            val rootIssuer = rootCert.subjectX500Principal.name
            if (!verifyRootCertFingerprint(rootCert) &&
                !rootIssuer.contains("Google", ignoreCase = true)) return false

            // 5. JWS signature over "header.payload" — ES256 raw R‖S 64 bytes transcoded to
            //    ASN.1 DER before JCA verify(); RS256 PKCS#1 bytes used as-is.
            //    (issue #951 fix: raw bytes fed directly to verify() silently fail-closed on
            //    every real ES256 token before this transcoding step was added.)
            val signedData = "${parts[0]}.${parts[1]}".toByteArray(Charsets.UTF_8)
            val rawSigBytes = b64Decode(parts[2])
            val signatureBytes = when (javaAlg) {
                "SHA256withECDSA" -> {
                    if (rawSigBytes.size != 64) return false
                    EcdsaDerTranscoder.rawEcdsaSignatureToDer(rawSigBytes)
                }
                else -> rawSigBytes
            }
            val sig = Signature.getInstance(javaAlg)
            sig.initVerify(chain[0].publicKey)
            sig.update(signedData)
            sig.verify(signatureBytes)
        } catch (e: Exception) {
            false
        }
    }

    private fun verifyRootCertFingerprint(cert: X509Certificate): Boolean = runCatching {
        if (GOOGLE_ROOT_CA_SHA256.isEmpty()) return@runCatching true
        val digest = MessageDigest.getInstance("SHA-256")
        val fingerprint = digest.digest(cert.encoded).joinToString("") { "%02x".format(it) }
        GOOGLE_ROOT_CA_SHA256.any { pin -> pin == fingerprint }
    }.getOrDefault(false)
}
