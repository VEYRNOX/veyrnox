package com.veyrnox.app

// PlayIntegrityJwsVerifierTest.kt
//
// Executable JVM unit tests for PlayIntegrityJwsVerifier.verify().
// Uses BouncyCastle to generate real P-256 / RSA-2048 key pairs and X.509
// certs — no Robolectric, no android.* imports, no mock play integrity tokens.
//
// Fixture design (issue #1097):
//   - A test root CA (`testRootCert`) is generated once per class run and its
//     SHA-256 fingerprint is passed to verify() as the `extraTrustedRoots`
//     argument (via the verifyWithTestRoot helper) so that legitimate 2-cert
//     chains (leaf signed by testRoot) exercise the full crypto/trust path.
//     S-3 (2026-09-03): this used to be injected into a process-wide mutable
//     set on the verifier. That set is gone — production passes no extra roots
//     at all, so there is no writable trust anchor in the release binary. This replaces the previous fixture of self-signed
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

    // Every fixture chain terminates at testRootCert, which is NOT in the Google
    // pinset — so each call must hand verify() the fixture root explicitly.
    // Production calls verify() with no third argument at all.
    private fun verifyWithTestRoot(token: String): Boolean =
        PlayIntegrityJwsVerifier.verify(token, b64Decode, testRoots)


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

        // Test root CA (EC) — its fingerprint is passed per-call as an extra
        // trusted root; nothing global is mutated.
        lateinit var testRootPair: KeyPair
        lateinit var testRootCert: X509Certificate

        // The fixture's extra-trusted-root set, handed to verify() explicitly.
        lateinit var testRoots: Set<String>

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

            // The fixture root is trusted only for calls that explicitly pass it.
            testRoots = setOf(sha256Hex(testRootCert.encoded))

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
        assertTrue(verifyWithTestRoot(token))
    }

    // S-3 (2026-09-03): the security property behind removing the mutable test
    // seam. The fixture chain is cryptographically perfect — it is the SAME token
    // the happy path above accepts — and differs only in that no extra root is
    // passed. That is exactly how production calls verify(). If this ever returns
    // true, the fixture root has become trusted by default and the Google pinset
    // is no longer the sole production trust anchor.
    @Test
    fun `S-3 - fixture chain is NOT trusted on the production 2-arg call`() {
        val token = buildJws("ES256", ec256Pair, listOf(ecLeafCert, testRootCert))
        assertTrue("precondition: this exact token verifies WITH the fixture root", verifyWithTestRoot(token))
        assertFalse(
            "Production passes no extra roots — the fixture root must not be trusted there",
            PlayIntegrityJwsVerifier.verify(token, b64Decode),
        )
    }

    @Test
    fun `RS256 happy path with pinned test root returns true`() {
        val token = buildJws("RS256", rsa2048Pair, listOf(rsaLeafCert, testRootCert))
        assertTrue(verifyWithTestRoot(token))
    }

    @Test
    fun `ES256 bit-flip on r byte returns false`() {
        val token = buildJws("ES256", ec256Pair, listOf(ecLeafCert, testRootCert),
            tamperSig = { sig -> sig.clone().also { it[0] = (it[0].toInt() xor 0x01).toByte() } })
        assertFalse(verifyWithTestRoot(token))
    }

    @Test
    fun `ES256 sig not 64 bytes returns false`() {
        val token = buildJws("ES256", ec256Pair, listOf(ecLeafCert, testRootCert),
            tamperSig = { it.copyOf(32) })
        assertFalse(verifyWithTestRoot(token))
    }

    @Test
    fun `payload tampered after signing returns false`() {
        val token = buildJws("ES256", ec256Pair, listOf(ecLeafCert, testRootCert))
        val parts = token.split(".")
        val tamperedPayload = b64Encode("""{"verdict":"FAILS_INTEGRITY"}""".toByteArray())
        val tampered = "${parts[0]}.$tamperedPayload.${parts[2]}"
        assertFalse(verifyWithTestRoot(tampered))
    }

    @Test
    fun `ES256 signed with different key returns false`() {
        // Leaf cert holds ec256Pair.public, but we sign with ec256Pair2 → sig mismatch.
        val token = buildJws("ES256", ec256Pair2, listOf(ecLeafCert, testRootCert))
        assertFalse(verifyWithTestRoot(token))
    }

    @Test
    fun `unknown alg HS256 returns false`() {
        val token = buildJws("HS256", ec256Pair, listOf(ecLeafCert, testRootCert))
        assertFalse(verifyWithTestRoot(token))
    }

    @Test
    fun `malformed JWS with only two parts returns false`() {
        val token = "aGVhZGVy.cGF5bG9hZA"
        assertFalse(verifyWithTestRoot(token))
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
            verifyWithTestRoot(token),
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
            verifyWithTestRoot(token),
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
            verifyWithTestRoot(token),
        )
    }

    @Test
    fun `L-3 - chain with issuer CN Google but non-pinned root SHA-256 returns false`() {
        // Doc-contract tripwire (L-3): PlayIntegrityPlugin.verifyJwsSignature's KDoc used
        // to state "assert root issuer contains 'Google'" as the trust rule. #1097 replaced
        // that with a SHA-256 pin, and the plugin's KDoc has been shortened to point here.
        // This test converts the current contract into an executable check: an attacker
        // who forges a chain whose root DN says "Google" but whose SHA-256 is not in the
        // pinned set MUST be rejected. If someone reintroduces an issuer-string bypass,
        // this test goes red.
        val forgedRootKp = KeyPairGenerator.getInstance("EC", "BC").apply {
            initialize(256, SecureRandom())
        }.generateKeyPair()
        val forgedLeafKp = KeyPairGenerator.getInstance("EC", "BC").apply {
            initialize(256, SecureRandom())
        }.generateKeyPair()
        val forgedRoot = buildCert(
            subjectDn = "CN=Google",
            subjectPublicKey = forgedRootKp.public,
            issuerDn = "CN=Google",
            issuerPrivateKey = forgedRootKp.private,
            sigAlg = "SHA256withECDSA",
        )
        // Sanity: the forged root's fingerprint must NOT be in the trusted-pin set.
        val forgedFp = MessageDigest.getInstance("SHA-256").digest(forgedRoot.encoded)
            .joinToString("") { "%02x".format(it) }
        assertFalse(
            "Precondition: forged root fingerprint must not be pinned",
            testRoots.contains(forgedFp),
        )
        val forgedLeaf = buildCert(
            subjectDn = "CN=attest.google.com",
            subjectPublicKey = forgedLeafKp.public,
            issuerDn = "CN=Google",
            issuerPrivateKey = forgedRootKp.private,
            sigAlg = "SHA256withECDSA",
        )
        val token = buildJws("ES256", forgedLeafKp, listOf(forgedLeaf, forgedRoot))
        assertFalse(
            "Issuer CN 'Google' must not substitute for a SHA-256 pin match (L-3 doc contract)",
            verifyWithTestRoot(token),
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
        assertFalse(verifyWithTestRoot(token))
    }
}
