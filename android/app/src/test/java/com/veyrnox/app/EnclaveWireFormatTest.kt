package com.veyrnox.app

import org.junit.Assert.assertArrayEquals
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.fail
import org.junit.Test

/**
 * JVM unit tests for EnclaveWireFormat — pure Kotlin bytes-only helpers for the
 * M2d wrap/unwrap ciphertext bundle. The BiometricPrompt(CryptoObject(cipher))
 * integration itself cannot be JVM-unit-tested (needs Android UI thread + a real
 * BiometricPrompt); these tests pin the deterministic pack/unpack shape used by
 * that integration.
 *
 * Wire format: `IV (12 bytes) || GCM output (ciphertext || 16-byte tag)`,
 * base64-encoded end to end at the plugin layer. This helper works in raw bytes.
 *
 * INTERNAL — not device-verified, not independently audited.
 */
class EnclaveWireFormatTest {

    // ── T1: roundtrip for non-empty ciphertext ──────────────────────────

    @Test
    fun `T1 pack then unpack roundtrip for non-empty ciphertext`() {
        val iv = ByteArray(12) { (it + 1).toByte() }
        val ctWithTag = ByteArray(64) { (0x40 + it).toByte() } // arbitrary bytes
        val bundle = EnclaveWireFormat.pack(iv, ctWithTag)
        assertEquals(12 + 64, bundle.size)
        val (unpackedIv, unpackedCt) = EnclaveWireFormat.unpack(bundle)
        assertArrayEquals(iv, unpackedIv)
        assertArrayEquals(ctWithTag, unpackedCt)
    }

    // ── T2: roundtrip for empty plaintext (just IV + 16-byte tag) ───────

    @Test
    fun `T2 pack then unpack roundtrip for empty ciphertext (28 bytes total)`() {
        val iv = ByteArray(12) { 0x11.toByte() }
        val tagOnly = ByteArray(16) { 0x22.toByte() }
        val bundle = EnclaveWireFormat.pack(iv, tagOnly)
        assertEquals(28, bundle.size)
        val (unpackedIv, unpackedCt) = EnclaveWireFormat.unpack(bundle)
        assertArrayEquals(iv, unpackedIv)
        assertArrayEquals(tagOnly, unpackedCt)
    }

    // ── T3: pack rejects wrong-sized IVs ────────────────────────────────

    @Test
    fun `T3 pack throws on IV of length 0`() {
        try {
            EnclaveWireFormat.pack(ByteArray(0), ByteArray(16))
            fail("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            assertNotNull(e.message)
        }
    }

    @Test
    fun `T3 pack throws on IV of length 11`() {
        try {
            EnclaveWireFormat.pack(ByteArray(11), ByteArray(16))
            fail("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            assertNotNull(e.message)
        }
    }

    @Test
    fun `T3 pack throws on IV of length 13`() {
        try {
            EnclaveWireFormat.pack(ByteArray(13), ByteArray(16))
            fail("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            assertNotNull(e.message)
        }
    }

    @Test
    fun `T3 pack throws on IV of length 20`() {
        try {
            EnclaveWireFormat.pack(ByteArray(20), ByteArray(16))
            fail("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            assertNotNull(e.message)
        }
    }

    // ── T4: unpack rejects bundles that are too short ───────────────────

    @Test
    fun `T4 unpack throws on empty bundle`() {
        try {
            EnclaveWireFormat.unpack(ByteArray(0))
            fail("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            assertNotNull(e.message)
        }
    }

    @Test
    fun `T4 unpack throws on 12-byte bundle (IV only, missing tag)`() {
        try {
            EnclaveWireFormat.unpack(ByteArray(12))
            fail("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            assertNotNull(e.message)
        }
    }

    // ── T5: unpack boundary at 27 bytes (one less than minimum) ─────────

    @Test
    fun `T5 unpack throws on exactly 27 bytes (boundary)`() {
        try {
            EnclaveWireFormat.unpack(ByteArray(27))
            fail("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            assertNotNull(e.message)
        }
    }

    // ── T6: unpack of exactly 28 bytes = 12-byte IV + 16-byte tag ───────

    @Test
    fun `T6 unpack of exactly 28 bytes yields 12-byte IV and 16-byte tag`() {
        val bundle = ByteArray(28) { it.toByte() }
        val (iv, ct) = EnclaveWireFormat.unpack(bundle)
        assertEquals(12, iv.size)
        assertEquals(16, ct.size)
        // IV = bytes[0..11], ciphertext = bytes[12..27]
        assertArrayEquals(bundle.copyOfRange(0, 12), iv)
        assertArrayEquals(bundle.copyOfRange(12, 28), ct)
    }

    // ── T7: no leaked byte data in exception messages ───────────────────

    @Test
    fun `T7 pack error message does not leak input hex or base64`() {
        // Bytes chosen so their lowercase hex ("a1","b2","c3","d4","e5","f6")
        // does not collide with fixed structural tokens in the shape message
        // (which legitimately mentions the required size "12" and IV_SIZE_BYTES).
        val iv = byteArrayOf(0xA1.toByte(), 0xB2.toByte(), 0xC3.toByte())
        val ct = byteArrayOf(0xD4.toByte(), 0xE5.toByte(), 0xF6.toByte())
        try {
            EnclaveWireFormat.pack(iv, ct)
            fail("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            val msg = (e.message ?: "").lowercase()
            // no hex traces of input bytes
            assertFalse("message must not leak input hex: $msg", msg.contains("a1"))
            assertFalse("message must not leak input hex: $msg", msg.contains("b2"))
            assertFalse("message must not leak input hex: $msg", msg.contains("c3"))
            assertFalse("message must not leak input hex: $msg", msg.contains("d4"))
            assertFalse("message must not leak input hex: $msg", msg.contains("e5"))
            assertFalse("message must not leak input hex: $msg", msg.contains("f6"))
        }
    }

    @Test
    fun `T7 unpack error message does not leak input hex or base64`() {
        // Bytes chosen so their lowercase hex does not collide with fixed
        // structural tokens in the shape message ("28 bytes", "length=4").
        val bundle = byteArrayOf(0xA1.toByte(), 0xB2.toByte(), 0xC3.toByte(), 0xD5.toByte())
        try {
            EnclaveWireFormat.unpack(bundle)
            fail("expected IllegalArgumentException")
        } catch (e: IllegalArgumentException) {
            val msg = (e.message ?: "").lowercase()
            assertFalse("message must not leak input hex: $msg", msg.contains("a1"))
            assertFalse("message must not leak input hex: $msg", msg.contains("b2"))
            assertFalse("message must not leak input hex: $msg", msg.contains("c3"))
            assertFalse("message must not leak input hex: $msg", msg.contains("d5"))
        }
    }

    // ── Constants pinned ────────────────────────────────────────────────

    @Test
    fun `IV_SIZE_BYTES is 12 (AES-GCM standard)`() {
        assertEquals(12, EnclaveWireFormat.IV_SIZE_BYTES)
    }

    @Test
    fun `TAG_SIZE_BYTES is 16 (AES-GCM 128-bit tag)`() {
        assertEquals(16, EnclaveWireFormat.TAG_SIZE_BYTES)
    }
}
