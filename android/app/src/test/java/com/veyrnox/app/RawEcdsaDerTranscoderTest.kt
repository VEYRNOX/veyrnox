package com.veyrnox.app

import org.junit.Assert.*
import org.junit.Test
import java.security.KeyPairGenerator
import java.security.Signature
import java.security.spec.ECGenParameterSpec

/**
 * JVM unit tests for EcdsaDerTranscoder — the ES256 raw-R‖S → ASN.1 DER transcoder
 * extracted from PlayIntegrityPlugin (issue #957).
 *
 * The JS mirror (src/rasp/__tests__/helpers/rawToDerEcdsa.js) proved the algorithm via
 * Node crypto + 10 Vitest cases. These tests execute the actual Kotlin object so any
 * regression in EcdsaDerTranscoder is caught on `./gradlew test` without a device.
 *
 * Test vectors mirror the JS Vitest suite for algorithmic equivalence.
 * INTERNAL — not independently audited.
 */
class RawEcdsaDerTranscoderTest {

    // ── rawEcdsaSignatureToDer ────────────────────────────────────────────────

    @Test(expected = IllegalArgumentException::class)
    fun `rejects 0-byte input`() { EcdsaDerTranscoder.rawEcdsaSignatureToDer(ByteArray(0)) }

    @Test(expected = IllegalArgumentException::class)
    fun `rejects 63-byte input`() { EcdsaDerTranscoder.rawEcdsaSignatureToDer(ByteArray(63)) }

    @Test(expected = IllegalArgumentException::class)
    fun `rejects 65-byte input`() { EcdsaDerTranscoder.rawEcdsaSignatureToDer(ByteArray(65)) }

    @Test(expected = IllegalArgumentException::class)
    fun `rejects 128-byte input`() { EcdsaDerTranscoder.rawEcdsaSignatureToDer(ByteArray(128)) }

    @Test
    fun `output is valid DER SEQUENCE for all-zero r and s`() {
        val raw = ByteArray(64) // pathological all-zero r‖s
        val der = EcdsaDerTranscoder.rawEcdsaSignatureToDer(raw)
        assertEquals(0x30.toByte(), der[0]) // SEQUENCE tag
        // Each all-zero 32-byte r/s DER-encodes to INTEGER(0) = 0x02 0x01 0x00 (3 bytes)
        assertEquals(6, der[1].toInt())     // SEQUENCE length = 3 + 3
        assertEquals(0x02.toByte(), der[2]) // first INTEGER tag
        assertEquals(1, der[3].toInt())
        assertEquals(0x00.toByte(), der[4])
        assertEquals(0x02.toByte(), der[5]) // second INTEGER tag
        assertEquals(1, der[6].toInt())
        assertEquals(0x00.toByte(), der[7])
    }

    @Test
    fun `output starts with SEQUENCE tag 0x30 for typical r‖s`() {
        val raw = ByteArray(64) { (it + 1).toByte() }
        val der = EcdsaDerTranscoder.rawEcdsaSignatureToDer(raw)
        assertEquals(0x30.toByte(), der[0])
    }

    @Test
    fun `round-trips via JCA SHA256withECDSA verifier`() {
        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"))
        val kp = kpg.generateKeyPair()
        val data = "play-integrity-test-payload".toByteArray()

        // Sign with JCA → DER-encoded sig → extract raw R‖S → re-encode → verify.
        val signer = Signature.getInstance("SHA256withECDSA")
        signer.initSign(kp.private)
        signer.update(data)
        val derSig = signer.sign()

        val raw = derToRaw(derSig)
        assertEquals(64, raw.size)

        val reEncoded = EcdsaDerTranscoder.rawEcdsaSignatureToDer(raw)

        val verifier = Signature.getInstance("SHA256withECDSA")
        verifier.initVerify(kp.public)
        verifier.update(data)
        assertTrue("JCA verify must accept DER from rawEcdsaSignatureToDer",
            verifier.verify(reEncoded))
    }

    @Test
    fun `fuzz 20 random P-256 signatures all round-trip`() {
        val kpg = KeyPairGenerator.getInstance("EC")
        kpg.initialize(ECGenParameterSpec("secp256r1"))
        val kp = kpg.generateKeyPair()
        val data = "veyrnox-fuzz".toByteArray()

        repeat(20) { i ->
            val signer = Signature.getInstance("SHA256withECDSA")
            signer.initSign(kp.private)
            signer.update(data + i.toByte())
            val raw = derToRaw(signer.sign())
            val reEncoded = EcdsaDerTranscoder.rawEcdsaSignatureToDer(raw)

            val verifier = Signature.getInstance("SHA256withECDSA")
            verifier.initVerify(kp.public)
            verifier.update(data + i.toByte())
            assertTrue("Fuzz iteration $i failed", verifier.verify(reEncoded))
        }
    }

    // ── derEncodeInteger ──────────────────────────────────────────────────────

    @Test
    fun `derEncodeInteger prepends 0x00 when high bit set`() {
        val highBit = ByteArray(32).also { it[0] = 0x80.toByte() }
        val der = EcdsaDerTranscoder.derEncodeInteger(highBit)
        assertEquals(0x02.toByte(), der[0])
        assertEquals(33, der[1].toInt()) // 32 bytes + 0x00 pad
        assertEquals(0x00.toByte(), der[2])
        assertEquals(0x80.toByte(), der[3])
    }

    @Test
    fun `derEncodeInteger strips leading zeros keeps at least one byte`() {
        val buf = ByteArray(32).also { it[2] = 0x01; it[3] = 0x23 }
        val der = EcdsaDerTranscoder.derEncodeInteger(buf)
        assertEquals(0x02.toByte(), der[0])
        assertEquals(30, der[1].toInt()) // 32 - 2 leading zeros stripped
        assertEquals(0x01.toByte(), der[2])
        assertEquals(0x23.toByte(), der[3])
    }

    @Test
    fun `derEncodeInteger all-zero produces single zero byte`() {
        val zeros = ByteArray(32)
        val der = EcdsaDerTranscoder.derEncodeInteger(zeros)
        assertEquals(0x02.toByte(), der[0])
        assertEquals(1, der[1].toInt())
        assertEquals(0x00.toByte(), der[2])
    }

    @Test(expected = IllegalArgumentException::class)
    fun `derEncodeInteger empty input throws`() {
        EcdsaDerTranscoder.derEncodeInteger(ByteArray(0))
    }

    // ── helper ───────────────────────────────────────────────────────────────

    /** Parse JCA DER ECDSA-Sig-Value to a fixed 32‖32 raw byte array. */
    private fun derToRaw(der: ByteArray): ByteArray {
        var pos = 2 // skip SEQUENCE tag + length
        fun readInt(): ByteArray {
            check(der[pos] == 0x02.toByte()) { "Expected INTEGER tag" }
            val len = der[pos + 1].toInt()
            val bytes = der.copyOfRange(pos + 2, pos + 2 + len)
            pos += 2 + len
            val stripped = bytes.dropWhile { it == 0x00.toByte() }.toByteArray()
            val out = ByteArray(32)
            stripped.copyInto(out, 32 - stripped.size)
            return out
        }
        return readInt() + readInt()
    }
}
