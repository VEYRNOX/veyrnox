package com.veyrnox.app

// PlayIntegrityJwsVerifierTest.kt
//
// Executable JVM unit tests for PlayIntegrityJwsVerifier.verify().
// Uses BouncyCastle to generate real P-256 / RSA-2048 key pairs and X.509
// certs — no Robolectric, no android.* imports, no mock play integrity tokens.
//
// Fixture design (issue #1097):
//   - A test root CA (`testRootCert`) is generated once per class run and its
//     SHA-256 fingerprint is injected into
//     PlayIntegrityJwsVerifier.ADDITIONAL_TRUSTED_ROOTS_FOR_TESTING so that
//     legitimate 2-cert chains (leaf signed by testRoot) exercise the full
//     crypto/trust path. This replaces the previous fixture of self-signed
//     "CN=Google LLC" leaves, which pinned the WRONG behaviour: it relied on
//     the `issuer.contains("Google")` trust-bypass fallback that #1097 removes.
//
// What this covers:
//   ES256 happy path (2-cert chain, pinned test root, correct sig) → true
//   RS256 happy path (2-cert chain, pinned test root, correct RSA sig) → true
//   Wrong signature (bit-flip on r byte) → false
//   Sig bytes not 64 bytes for ES256 → false
//   Payload tampered after signing → false
//   Key mismatch (signed with different key) → false
//   Unknown alg (HS256) → false
//   Malformed JWS (2 parts only) → false
//   ISSUE #1097 — self-signed "CN=Google" cert MUST NOT verify (trust bypass) → false
//   ISSUE #1097 — x5c chain of length 1 MUST NOT verify (forged-chain signal) → false
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
import java.security.MessageDigest
import java.security.PrivateKey
import java.security.PublicKey
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
        val b64Decode: (String) -> ByteArray = { seg ->
            var s = seg.replace('-', '+').replace('_', '/')
            val rem = s.length % 4
            if (rem > 0) s += "=".repeat(4 - rem)
            Base64.getDecoder().decode(s)
        }

        val b64Encode: (ByteArray) -> String = { bytes ->
            Base64.getUrlEncoder().withoutPadding().encodeToString(bytes)
        }

        // Test root CA (EC) — its fingerprint is registered as a trusted pin.
        lateinit var testRootPair: KeyPair
        lateinit var testRootCert: X509Certificate

        // Leaf key pairs (signed by testRootCert).
        lateinit var ec256Pair: KeyPair
        lateinit var ec256Pair2: KeyPair
        lateinit var rsa2048Pair: KeyPair
        lateinit var ecLeafCert: X509Certificate
        lateinit var rsaLeafCert: X509Certificate

        @JvmStatic
        @BeforeClass
        fun setup() {
            Security.addProvider(BouncyCastleProvider())

            // Root CA (EC P-256 self-signed).
            testRootPair = KeyPairGenerator.getInstance("EC", "BC").apply {
                initialize(256, SecureRandom())
            }.generateKeyPair()
            testRootCert = buildCert(
                subjectDn = "CN=Veyrnox Test Root CA",
                subjectPublicKey = testRootPair.public,
                issuerDn = "CN=Veyrnox Test Root CA",
                issuerPrivateKey = testRootPair.private,
                sigAlg = "SHA256withECDSA",
            )

            // Register the test root fingerprint via the internal test seam.
            val fp = sha256Hex(testRootCert.encoded)
            PlayIntegrityJwsVerifier.ADDITIONAL_TRUSTED_ROOTS_FOR_TESTING.add(fp)

            // Leaves signed by the test root.
            ec256Pair = KeyPairGenerator.getInstance("EC", "BC").apply {
                initialize(256, SecureRandom())
            }.generateKeyPair()
            ec256Pair2 = KeyPairGenerator.getInstance("EC", "BC").apply {
                initialize(256, SecureRandom())
            }.generateKeyPair()
            rsa2048Pair = KeyPairGenerator.getInstance("RSA", "BC").apply {
                initialize(2048, SecureRandom())
            }.generateKeyPair()

            ecLeafCert = buildCert(
                subjectDn = "CN=Veyrnox Test EC Leaf",
                subjectPublicKey = ec256Pair.public,
                issuerDn = "CN=Veyrnox Test Root CA",
                issuerPrivateKey = testRootPair.private,
                sigAlg = "SHA256withECDSA",
            )
            rsaLeafCert = buildCert(
                subjectDn = "CN=Veyrnox Test RSA Leaf",
                subjectPublicKey = rsa2048Pair.public,
                issuerDn = "CN=Veyrnox Test Root CA",
                issuerPrivateKey = testRootPair.private,
                sigAlg = "SHA256withECDSA",
            )
        }

        private fun sha256Hex(bytes: ByteArray): String =
            MessageDigest.getInstance("SHA-256").digest(bytes)
                .joinToString("") { "%02x".format(it) }

        fun buildCert(
            subjectDn: String,
            subjectPublicKey: PublicKey,
            issuerDn: String,
            issuerPrivateKey: PrivateKey,
            sigAlg: String,
        ): X509Certificate {
            val spki = SubjectPublicKeyInfo.getInstance(subjectPublicKey.encoded)
            val now = Date()
            val expiry = Date(now.time + 365L * 24 * 3600 * 1000)
            val builder = X509v3CertificateBuilder(
                X500Name(issuerDn),
                BigInteger.valueOf(SecureRandom().nextLong()),
                now, expiry,
                X500Name(subjectDn),
                spki,
            )
            val signer = JcaContentSignerBuilder(sigAlg).setProvider("BC").build(issuerPrivateKey)
            return JcaX509CertificateConverter().setProvider("BC")
                .getCertificate(builder.build(signer))
        }

        /**
         * Build a JWS with the given alg + full cert chain (leaf..root). Signs with kp.
         */
        fun buildJws(
            algHeader: String,
            signingKey: KeyPair,
            chain: List<X509Certificate>,
            payload: ByteArray = """{"verdict":"MEETS_DEVICE_INTEGRITY"}""".toByteArray(),
            tamperSig: ((ByteArray) -> ByteArray)? = null,
        ): String {
            val x5c = JSONArray()
            chain.forEach { x5c.put(b64Encode(it.encoded)) }
            val header = JSONObject().put("alg", algHeader).put("x5c", x5c)
            val headerEnc = b64Encode(header.toString().toByteArray())
            val payloadEnc = b64Encode(payload)
            val signedData = "$headerEnc.$payloadEnc".toByteArray()

            val rawSig: ByteArray = when (algHeader) {
                "ES256" -> {
                    val sig = Signature.getInstance("SHA256withECDSA", "BC")
                    sig.initSign(signingKey.private)
                    sig.update(signedData)
                    derToRawEcdsaRs(sig.sign())
                }
                "RS256" -> {
                    val sig = Signature.getInstance("SHA256withRSA", "BC")
                    sig.initSign(signingKey.private)
                    sig.update(signedData)
                    sig.sign()
                }
                else -> ByteArray(32) { 0xAA.toByte() }
            }
            val finalSig = tamperSig?.invoke(rawSig) ?: rawSig
            return "$headerEnc.$payloadEnc.${b64Encode(finalSig)}"
        }

        /** ASN.1 DER ECDSA-Sig-Value → raw R‖S 64 bytes (inverse of EcdsaDerTranscoder). */
        private fun derToRawEcdsaRs(der: ByteArray): ByteArray {
            var i = 2 // skip SEQUENCE tag + length
            fun readInt(): ByteArray {
                check(der[i] == 0x02.toByte()) { "Expected INTEGER tag" }
                val len = der[i + 1].toInt() and 0xFF
                val bytes = der.copyOfRange(i + 2, i + 2 + len)
                i += 2 + len
                return if (bytes[0] == 0x00.toByte() && bytes.size > 1)
                    bytes.copyOfRange(1, bytes.size) else bytes
            }
            val r = readInt()
            val s = readInt()
            val out = ByteArray(64)
            r.copyInto(out, destinationOffset = 32 - r.size)
            s.copyInto(out, destinationOffset = 64 - s.size)
            return out
        }
    }

    // ---------- Legitimate crypto path (2-cert chain, pinned test root) ----------

    @Test
    fun `ES256 happy path with pinned test root returns true`() {
        val token = buildJws("ES256", ec256Pair, listOf(ecLeafCert, testRootCert))
        assertTrue(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    @Test
    fun `RS256 happy path with pinned test root returns true`() {
        val token = buildJws("RS256", rsa2048Pair, listOf(rsaLeafCert, testRootCert))
        assertTrue(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    @Test
    fun `ES256 bit-flip on r byte returns false`() {
        val token = buildJws("ES256", ec256Pair, listOf(ecLeafCert, testRootCert),
            tamperSig = { sig -> sig.clone().also { it[0] = (it[0].toInt() xor 0x01).toByte() } })
        assertFalse(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    @Test
    fun `ES256 sig not 64 bytes returns false`() {
        val token = buildJws("ES256", ec256Pair, listOf(ecLeafCert, testRootCert),
            tamperSig = { it.copyOf(32) })
        assertFalse(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    @Test
    fun `payload tampered after signing returns false`() {
        val token = buildJws("ES256", ec256Pair, listOf(ecLeafCert, testRootCert))
        val parts = token.split(".")
        val tamperedPayload = b64Encode("""{"verdict":"FAILS_INTEGRITY"}""".toByteArray())
        val tampered = "${parts[0]}.$tamperedPayload.${parts[2]}"
        assertFalse(PlayIntegrityJwsVerifier.verify(tampered, b64Decode))
    }

    @Test
    fun `ES256 signed with different key returns false`() {
        // Leaf cert holds ec256Pair.public, but we sign with ec256Pair2 → sig mismatch.
        val token = buildJws("ES256", ec256Pair2, listOf(ecLeafCert, testRootCert))
        assertFalse(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    @Test
    fun `unknown alg HS256 returns false`() {
        val token = buildJws("HS256", ec256Pair, listOf(ecLeafCert, testRootCert))
        assertFalse(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    @Test
    fun `malformed JWS with only two parts returns false`() {
        val token = "aGVhZGVy.cGF5bG9hZA"
        assertFalse(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }

    // ---------- Issue #1097 negative tests ----------

    @Test
    fun `issue 1097 - self-signed CN=Google cert MUST NOT verify (trust bypass)`() {
        // Attacker generates their own key + self-signed cert with "Google" in the DN
        // and signs a JWS with it. The old code accepted this because of the
        // `|| issuer.contains("Google")` OR fallback. The fix removes that fallback
        // AND rejects chainLen==1, so this MUST fail-closed regardless.
        val attackerKp = KeyPairGenerator.getInstance("EC", "BC").apply {
            initialize(256, SecureRandom())
        }.generateKeyPair()
        val forgedGoogleCert = buildCert(
            subjectDn = "CN=Google LLC, O=Google Inc",
            subjectPublicKey = attackerKp.public,
            issuerDn = "CN=Google LLC, O=Google Inc",
            issuerPrivateKey = attackerKp.private,
            sigAlg = "SHA256withECDSA",
        )
        val token = buildJws("ES256", attackerKp, listOf(forgedGoogleCert))
        assertFalse(
            "Self-signed CN=Google cert must not be trusted — issuer-string bypass removed (#1097)",
            PlayIntegrityJwsVerifier.verify(token, b64Decode),
        )
    }

    @Test
    fun `issue 1097 - self-signed CN=Google TWO-cert chain still MUST NOT verify (pin miss)`() {
        // Defence-in-depth: even if an attacker forges a length>=2 chain of self-signed
        // "Google" certs, the root's SHA-256 will not match any pin. The old
        // `issuer.contains("Google")` OR fallback would have accepted it — the fix
        // makes the pin the sole trust decision.
        val attackerRootKp = KeyPairGenerator.getInstance("EC", "BC").apply {
            initialize(256, SecureRandom())
        }.generateKeyPair()
        val attackerLeafKp = KeyPairGenerator.getInstance("EC", "BC").apply {
            initialize(256, SecureRandom())
        }.generateKeyPair()
        val forgedRoot = buildCert(
            subjectDn = "CN=Google Trust Services LLC",
            subjectPublicKey = attackerRootKp.public,
            issuerDn = "CN=Google Trust Services LLC",
            issuerPrivateKey = attackerRootKp.private,
            sigAlg = "SHA256withECDSA",
        )
        val forgedLeaf = buildCert(
            subjectDn = "CN=attestation.android.com",
            subjectPublicKey = attackerLeafKp.public,
            issuerDn = "CN=Google Trust Services LLC",
            issuerPrivateKey = attackerRootKp.private,
            sigAlg = "SHA256withECDSA",
        )
        val token = buildJws("ES256", attackerLeafKp, listOf(forgedLeaf, forgedRoot))
        assertFalse(
            "Forged 2-cert Google chain must not be trusted — root fingerprint pin is authoritative (#1097)",
            PlayIntegrityJwsVerifier.verify(token, b64Decode),
        )
    }

    @Test
    fun `issue 1097 - x5c chain of length 1 MUST NOT verify (forged-chain signal)`() {
        // Even with a cert whose fingerprint happens to match a trusted pin, a chain
        // of length 1 is a forged-chain signal: real Play Integrity tokens always
        // carry at least leaf + intermediate. Verify unconditional rejection.
        // We use testRootCert here — its fingerprint IS pinned via the test seam,
        // so this test isolates the "length < 2 → reject" rule from the pin rule.
        val token = buildJws("ES256", testRootPair, listOf(testRootCert))
        assertFalse(
            "x5c length 1 must not verify even if that single cert's fingerprint is pinned (#1097)",
            PlayIntegrityJwsVerifier.verify(token, b64Decode),
        )
    }

    @Test
    fun `issue 1097 - pin miss on unknown self-signed root returns false`() {
        // Belt-and-suspenders: a length>=2 chain whose root fingerprint is not in
        // the trusted set must fail even without any "Google" wording present.
        val strangerRootKp = KeyPairGenerator.getInstance("EC", "BC").apply {
            initialize(256, SecureRandom())
        }.generateKeyPair()
        val strangerLeafKp = KeyPairGenerator.getInstance("EC", "BC").apply {
            initialize(256, SecureRandom())
        }.generateKeyPair()
        val strangerRoot = buildCert(
            "CN=Untrusted Root", strangerRootKp.public,
            "CN=Untrusted Root", strangerRootKp.private, "SHA256withECDSA")
        val strangerLeaf = buildCert(
            "CN=Untrusted Leaf", strangerLeafKp.public,
            "CN=Untrusted Root", strangerRootKp.private, "SHA256withECDSA")
        val token = buildJws("ES256", strangerLeafKp, listOf(strangerLeaf, strangerRoot))
        assertFalse(PlayIntegrityJwsVerifier.verify(token, b64Decode))
    }
}
