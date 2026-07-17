package com.veyrnox.app

// PlayIntegrityJwsVerifierTest.kt
//
// Executable JVM unit tests for PlayIntegrityJwsVerifier.verify().
// Uses BouncyCastle to generate real P-256 key pairs and self-signed X.509
// certs — no Robolectric, no android.* imports, no mock play integrity tokens.
//
// What this covers:
//   ES256 happy path (valid chain, Google issuer, correct sig) → true
//   RS256 happy path (valid chain, Google issuer, correct RSA sig) → true
//   Wrong signature (bit-flip on r byte) → false
//   Sig bytes not 64 bytes for ES256 → false
//   Payload tampered after signing → false
//   Key mismatch (signed with different key) → false
//   Unknown alg (HS256) → false
//   Malformed JWS (2 parts only) → false
//
// BUILT / unit-tested. NOT a substitute for testing with a real Play Integrity
// production token (that would require a real Android device and Play Services).

import org.bouncycastle.asn1.x500.X500Name
import org.bouncycastle.asn1.x509.SubjectPublicKeyInfo
import org.bouncycastle.cert.X509v3CertificateBuilder
import org.bouncycastle.cert.jcajce.JcaX509CertificateConverter
import org.bouncycastle.operator.jcajce.JcaContentSignerBuilder
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.BeforeClass
import org.junit.Test
import java.math.BigInteger
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.SecureRandom
import java.security.Security
import java.security.Signature
import java.security.cert.X509Certificate
import java.util.Base64
import java.util.Date
import org.bouncycastle.jce.provider.BouncyCastleProvider
import org.json.JSONArray
import org.json.JSONObject

class PlayIntegrityJwsVerifierTest {

    companion object {
        // JVM b64url decoder (no android.util.Base64 here — that's what we're avoiding).
        val b64Decode: (String) -> ByteArray = { seg ->
            var s = seg.replace('-', '+').replace('_', '/')
            val rem = s.length % 4
            if (rem > 0) s += "=".repeat(4 - rem)
            Base64.getDecoder().decode(s)
        }

        val b64Encode: (ByteArray) -> String = { bytes ->
            Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        }

        lateinit var ec256Pair: KeyPair
        lateinit var ec256Pair2: KeyPair
        lateinit var rsa2048Pair: KeyPair
        lateinit var ecCert: X509Certificate
        lateinit var rsaCert: X509Certificate

        @JvmStatic
        @BeforeClass
        fun setup() {
            Security.addProvider(BouncyCastleProvider())

            ec256Pair = KeyPairGenerator.getInstance("EC", "BC").apply {
                initialize(256, SecureRandom())
            }.generateKeyPair()
            ec256Pair2 = KeyPairGenerator.getInstance("EC", "BC").apply {
                initialize(256, SecureRandom())
            }.generateKeyPair()
            rsa2048Pair = KeyPairGenerator.getInstance("RSA", "BC").apply {
                initialize(2048, SecureRandom())
            }.generateKeyPair()

            ecCert = buildSelfSignedCert(ec256Pair, "SHA256withECDSA", "CN=Google LLC Test CA")
            rsaCert = buildSelfSignedCert(rsa2048Pair, "SHA256withRSA", "CN=Google Trust Services LLC")
        }

        private fun buildSelfSignedCert(kp: KeyPair, sigAlg: String, dn: String): X509Certificate {
            val name = X500Name(dn)
            val spki = SubjectPublicKeyInfo.getInstance(kp.public.encoded)
            val now = Date()
            val expiry = Date(now.time + 365L * 24 * 3600 * 1000)
            val builder = X509v3CertificateBuilder(
                name, BigInteger.valueOf(SecureRandom().nextLong()), now, expiry, name, spki
            )
            val signer = JcaContentSignerBuilder(sigAlg).setProvider("BC").build(kp.private)
            return JcaX509CertificateConverter().setProvider("BC")
                .getCertificate(builder.build(signer))
        }

        /** Build a JWS with the given alg, cert chain, and payload. Signs with kp. */
        private fun buildJws(
            algHeader: String,
            kp: KeyPair,
            cert: X509Certificate,
            payload: ByteArray = """{"verdict":"MEETS_DEVICE_INTEGRITY"}""".toByteArray(),
            tamperSig: ((ByteArray) -> ByteArray)? = null,
        ): String {
            val certDer = b64Encode(cert.encoded)
            val x5c = JSONArray().put(certDer)
            val header = JSONObject().put("alg", algHeader).put("x5c", x5c)
            val headerEnc = b64Encode(header.toString().toByteArray())
            val payloadEnc = b64Encode(payload)
            val signedData = "$headerEnc.$payloadEnc".toByteArray()

            val rawSig: ByteArray = when (algHeader) {
                "ES256" -> {
                    val sig = Signature.getInstance("SHA256withECDSA", "BC")
                    sig.initSign(kp.private)
                    sig.update(signedData)
                    val derSig = sig.sign()
                    // Convert DER → raw R‖S 64 bytes so PlayIntegrityJwsVerifier transcodes it back
                    derToRawEcdsaRs(derSig)
                }
                "RS256" -> {
                    val sig = Signature.getInstance("SHA256withRSA", "BC")
                    sig.initSign(kp.private)
                    sig.update(signedData)
                    sig.sign()
                }
                else -> ByteArray(32) { 0xAA.toByte() } // bogus bytes for unknown alg tests
            }
            val finalSig = tamperSig?.invoke(rawSig) ?: rawSig
            return "$headerEnc.$payloadEnc.${b64Encode(finalSig)}"
        }

        /** ASN.1 DER ECDSA-Sig-Value → raw R‖S 64 bytes (inverse of EcdsaDerTranscoder). */
        private fun derToRawEcdsaRs(der: ByteArray): ByteArray {
            // SEQUENCE { INTEGER r, INTEGER s }
            // skip SEQUENCE tag+len, then parse each INTEGER
            var i = 2 // skip 0x30, length
            fun readInt(): ByteArray {
                check(der[i] == 0x02.toByte()) { "Expected INTEGER tag" }
                val len = der[i + 1].toInt() and 0xFF
                val bytes = der.copyOfRange(i + 2, i + 2 + len)
                i += 2 + len
                // strip leading zero padding (sign byte) if present
                return if (bytes[0] == 0x00.toByte() && bytes.size > 1) bytes.copyOfRange(1, bytes.size)
                else bytes
            }
            val r = readInt()
            val s = readInt()
            val out = ByteArray(64)
            r.copyInto(out, destinationOffset = 32 - r.size)
            s.copyInto(out, destinationOffset = 64 - s.size)
            return out
        }
    }

    @Test
    fun `ES256 happy path returns true`() {
        val token = buildJws("ES256", ec256Pair, ecCert)
        assertTrue(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    @Test
    fun `RS256 happy path returns true`() {
        val token = buildJws("RS256", rsa2048Pair, rsaCert)
        assertTrue(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    @Test
    fun `ES256 bit-flip on r byte returns false`() {
        val token = buildJws("ES256", ec256Pair, ecCert, tamperSig = { sig ->
            sig.clone().also { it[0] = (it[0].toInt() xor 0x01).toByte() }
        })
        assertFalse(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    @Test
    fun `ES256 sig not 64 bytes returns false`() {
        val token = buildJws("ES256", ec256Pair, ecCert, tamperSig = { it.copyOf(32) })
        assertFalse(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    @Test
    fun `payload tampered after signing returns false`() {
        val token = buildJws("ES256", ec256Pair, ecCert)
        val parts = token.split(".")
        val tamperedPayload = b64Encode("""{"verdict":"FAILS_INTEGRITY"}""".toByteArray())
        val tampered = "${parts[0]}.$tamperedPayload.${parts[2]}"
        assertFalse(PlayIntegrityJwsVerifier.verify(tampered, b64Decode))
    }

    @Test
    fun `ES256 signed with different key returns false`() {
        // cert is for ec256Pair but we sign with ec256Pair2
        val token = buildJws("ES256", ec256Pair2, ecCert)
        assertFalse(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    @Test
    fun `unknown alg HS256 returns false`() {
        val token = buildJws("HS256", ec256Pair, ecCert)
        assertFalse(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    @Test
    fun `malformed JWS with only two parts returns false`() {
        val token = "aGVhZGVy.cGF5bG9hZA" // header.payload only (no sig)
        assertFalse(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }
}
