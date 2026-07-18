package com.veyrnox.app

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Test
import java.security.SecureRandom
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.SecretKeySpec

/**
 * JVM roundtrip test for the AES-GCM 256 wire format used by M2d wrap/unwrap.
 *
 * The BiometricPrompt(CryptoObject(cipher)) integration cannot be JVM-tested
 * (needs the Android UI thread + a real prompt). But the CRYPTO CONTRACT —
 * pack(iv, ctWithTag) → base64 → base64-decode → unpack → decrypt with the
 * same key returns the original plaintext — IS deterministic, and this test
 * validates that AES/GCM/NoPadding through javax.crypto (the exact provider
 * used in the plugin code) round-trips correctly with EnclaveWireFormat's
 * layout. It also pins two tamper properties the unwrap flow's error mapping
 * depends on:
 *
 *   1. A single byte flip anywhere in the ciphertext-with-tag portion of a
 *      valid bundle throws AEADBadTagException at decrypt time — this is the
 *      signal that maps to M2D_CIPHERTEXT_TAMPERED.
 *   2. A byte flip in the IV portion of a valid bundle throws
 *      AEADBadTagException at decrypt time — same mapping.
 *
 * Uses the JDK's built-in AES-GCM (SunJCE on OpenJDK / Bouncy on some CI
 * runners). AndroidKeyStore uses the same javax.crypto.Cipher API — this is
 * the JVM-testable half of the contract; the AndroidKeyStore-hosted key with
 * per-use auth is the device-runbook half.
 *
 * INTERNAL — not device-verified, not independently audited.
 */
class EnclaveWrapRoundtripTest {

    // AES-GCM constants (mirror EnclaveWireFormat and EnclaveKeySpecConfig)
    private val ivBytes = EnclaveWireFormat.IV_SIZE_BYTES     // 12
    private val tagBits = 128                                  // 16 bytes

    private fun randomKey(): SecretKeySpec {
        val bytes = ByteArray(32)  // AES-256
        SecureRandom().nextBytes(bytes)
        return SecretKeySpec(bytes, "AES")
    }

    private fun randomIv(): ByteArray {
        val iv = ByteArray(ivBytes)
        SecureRandom().nextBytes(iv)
        return iv
    }

    private fun encrypt(key: SecretKeySpec, iv: ByteArray, plaintext: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key, GCMParameterSpec(tagBits, iv))
        return cipher.doFinal(plaintext)  // ct || tag concatenated
    }

    private fun decrypt(key: SecretKeySpec, iv: ByteArray, ctWithTag: ByteArray): ByteArray {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(tagBits, iv))
        return cipher.doFinal(ctWithTag)
    }

    // ── R1: full wrap-then-unwrap roundtrip through the wire format ──────

    @Test
    fun `R1 wire-format roundtrip with a real AES-256-GCM key returns identical plaintext`() {
        val key = randomKey()
        val iv = randomIv()
        val plaintext = "veyrnox-m2d-roundtrip-plaintext-32B".toByteArray(Charsets.UTF_8)

        // wrap: encrypt then pack
        val ctWithTag = encrypt(key, iv, plaintext)
        val bundle = EnclaveWireFormat.pack(iv, ctWithTag)

        // unwrap: unpack then decrypt
        val (unpackedIv, unpackedCtWithTag) = EnclaveWireFormat.unpack(bundle)
        val recovered = decrypt(key, unpackedIv, unpackedCtWithTag)

        assertArrayEquals("plaintext must roundtrip byte-identically", plaintext, recovered)
    }

    // ── R2: roundtrip for empty plaintext (zero-length is a valid GCM seal) ─

    @Test
    fun `R2 wire-format roundtrip works for empty plaintext (28-byte bundle)`() {
        val key = randomKey()
        val iv = randomIv()
        val plaintext = ByteArray(0)

        val ctWithTag = encrypt(key, iv, plaintext)  // 16 bytes = tag only
        assertEquals(16, ctWithTag.size)
        val bundle = EnclaveWireFormat.pack(iv, ctWithTag)
        assertEquals(28, bundle.size)

        val (unpackedIv, unpackedCtWithTag) = EnclaveWireFormat.unpack(bundle)
        val recovered = decrypt(key, unpackedIv, unpackedCtWithTag)
        assertEquals(0, recovered.size)
    }

    // ── R3: tamper the ciphertext body → AEADBadTagException ─────────────

    @Test
    fun `R3 flipping one byte in the ciphertext portion throws AEADBadTagException`() {
        val key = randomKey()
        val iv = randomIv()
        val plaintext = "sensitive-vault-blob-payload-bytes".toByteArray(Charsets.UTF_8)

        val ctWithTag = encrypt(key, iv, plaintext)
        val bundle = EnclaveWireFormat.pack(iv, ctWithTag)

        // Flip a byte in the ciphertext portion (right after the 12-byte IV).
        val tampered = bundle.copyOf()
        tampered[ivBytes] = (tampered[ivBytes].toInt() xor 0x01).toByte()
        assertNotEquals(
            "tamper must actually change bytes",
            bundle[ivBytes],
            tampered[ivBytes],
        )

        val (unpackedIv, unpackedCtWithTag) = EnclaveWireFormat.unpack(tampered)
        try {
            decrypt(key, unpackedIv, unpackedCtWithTag)
            fail("expected AEADBadTagException on tampered ciphertext")
        } catch (e: AEADBadTagException) {
            // expected — this is the signal the unwrap plugin maps to
            // M2D_CIPHERTEXT_TAMPERED, distinct from M2D_UNWRAP_FAILED.
            assertTrue("AEADBadTagException fired", true)
        }
    }

    // ── R4: tamper the IV → AEADBadTagException ──────────────────────────

    @Test
    fun `R4 flipping one byte in the IV portion throws AEADBadTagException`() {
        val key = randomKey()
        val iv = randomIv()
        val plaintext = "another-vault-blob-payload-bytes-XY".toByteArray(Charsets.UTF_8)

        val ctWithTag = encrypt(key, iv, plaintext)
        val bundle = EnclaveWireFormat.pack(iv, ctWithTag)

        // Flip a byte in the IV portion (index 0).
        val tampered = bundle.copyOf()
        tampered[0] = (tampered[0].toInt() xor 0x01).toByte()

        val (unpackedIv, unpackedCtWithTag) = EnclaveWireFormat.unpack(tampered)
        try {
            decrypt(key, unpackedIv, unpackedCtWithTag)
            fail("expected AEADBadTagException on tampered IV")
        } catch (e: AEADBadTagException) {
            assertTrue("AEADBadTagException fired on IV tamper", true)
        }
    }

    // ── R5: tag-tamper (last byte) → AEADBadTagException ─────────────────

    @Test
    fun `R5 flipping the last byte (inside the auth tag) throws AEADBadTagException`() {
        val key = randomKey()
        val iv = randomIv()
        val plaintext = "yet-another-vault-blob".toByteArray(Charsets.UTF_8)

        val ctWithTag = encrypt(key, iv, plaintext)
        val bundle = EnclaveWireFormat.pack(iv, ctWithTag)

        val tampered = bundle.copyOf()
        tampered[tampered.size - 1] = (tampered[tampered.size - 1].toInt() xor 0x80).toByte()

        val (unpackedIv, unpackedCtWithTag) = EnclaveWireFormat.unpack(tampered)
        try {
            decrypt(key, unpackedIv, unpackedCtWithTag)
            fail("expected AEADBadTagException on tampered tag")
        } catch (e: AEADBadTagException) {
            assertTrue("AEADBadTagException fired on tag tamper", true)
        }
    }

    // ── R6: wrong-key decrypt → AEADBadTagException ──────────────────────

    @Test
    fun `R6 decrypting a valid bundle under a different key throws AEADBadTagException`() {
        val key1 = randomKey()
        val key2 = randomKey()
        val iv = randomIv()
        val plaintext = "wrong-key-should-fail".toByteArray(Charsets.UTF_8)

        val ctWithTag = encrypt(key1, iv, plaintext)
        val bundle = EnclaveWireFormat.pack(iv, ctWithTag)
        val (unpackedIv, unpackedCtWithTag) = EnclaveWireFormat.unpack(bundle)

        try {
            decrypt(key2, unpackedIv, unpackedCtWithTag)
            fail("expected AEADBadTagException on wrong-key decrypt")
        } catch (e: AEADBadTagException) {
            assertTrue("AEADBadTagException fired on wrong-key decrypt", true)
        }
    }
}
