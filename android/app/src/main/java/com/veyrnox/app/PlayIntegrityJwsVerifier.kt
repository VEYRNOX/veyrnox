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
// SECURITY (issue #1097): the root cert trust check is a strict SHA-256 pin.
// The prior "|| issuer.contains(\"Google\")" fallback was a full trust bypass —
// any self-signed cert whose subject DN contained "Google" satisfied the OR
// and was accepted as a trusted root. That fallback is removed; pin-miss now
// fail-closes (I4). Additionally, x5c chains of length 1 are rejected
// unconditionally: real Play Integrity tokens always chain leaf → intermediate
// → root, so a length-1 chain is a forged-chain signal.
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
    // Source: Google Trust Services published root CA bundle (https://pki.goog/repository/,
    // captured 2026-07-17). All four roots are currently in Play Integrity signing rotation;
    // real tokens observed in the wild have chained via any of R1/R2/R3/R4.
    private val GOOGLE_ROOT_CA_SHA256 = setOf(
        // GTS Root R1
        "2a575471e31340bc21581cbd2cf13e158463203ece94bcf9d3cc196bf09a5472",
        // GTS Root R2
        "c45d7bb08e6d67e62e4235110b564e5f78fd92ef058c840aea4e6455d7585c60",
        // GTS Root R3
        "15d5b8774619ea7d54ce1ca6d0b0c403e037a917f131e8a04e1e6b7a71babce5",
        // GTS Root R4
        "71cca5391f9e794b04802530b363e121da8a3043bb26662fea4dca7fc951a4bd",
    )

    // Test seam: same-module JVM tests may inject a test-generated root's SHA-256
    // fingerprint here so a legitimate 2-cert fixture chain can exercise the full
    // crypto/trust path without requiring a real Google-issued cert. NEVER read
    // outside `internal` scope; NEVER populated by production code. If a production
    // path ever tries to write here, treat it as a supply-chain compromise.
    internal val ADDITIONAL_TRUSTED_ROOTS_FOR_TESTING: MutableSet<String> = mutableSetOf()

    /**
     * Verify the JWS token's signature and cert chain.
     *
     * @param token      Three-part JWS string (header.payload.signature).
     * @param b64Decode  Platform-appropriate base64url decoder. Production callers
     *                   supply android.util.Base64; tests supply java.util.Base64 so
     *                   this object stays free of android.* imports (issue #957).
     * @return true iff the chain walks, root is pin-trusted, and signature verifies.
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

            // 2. Build cert chain from x5c array. Reject length < 2 unconditionally:
            //    real Play Integrity tokens always carry leaf + intermediate (+ root);
            //    a single-element chain is either a forged/self-signed root claim or a
            //    malformed token, and either way must not be trusted (issue #1097).
            val x5c = header.optJSONArray("x5c") ?: return false
            val chainLen = x5c.length()
            if (chainLen < 2) return false
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

            // 4. Root cert trust: SHA-256 pin ONLY. No issuer-string fallback.
            //    (issue #1097 — the prior OR fallback was a full trust bypass; any
            //    self-signed cert with "Google" in the subject DN passed.)
            val rootCert = chain[chainLen - 1]
            if (!verifyRootCertFingerprint(rootCert)) return false

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
        val digest = MessageDigest.getInstance("SHA-256")
        val fingerprint = digest.digest(cert.encoded).joinToString("") { "%02x".format(it) }
        fingerprint in GOOGLE_ROOT_CA_SHA256 || fingerprint in ADDITIONAL_TRUSTED_ROOTS_FOR_TESTING
    }.getOrDefault(false)
}
