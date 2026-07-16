package com.veyrnox.app

/**
 * Pure-JVM ES256 raw-R‖S → ASN.1 DER transcoder extracted from PlayIntegrityPlugin.
 *
 * PlayIntegrityPlugin extends Capacitor's Plugin (requires Android context), so its
 * private methods are unreachable from a bare JVM unit test. Extracting the algorithm
 * here lets RawEcdsaDerTranscoderTest execute the actual Kotlin code on the JVM without
 * any Android dependency — issue #957.
 *
 * Reference: RFC 7518 §3.4 (JWS ES256 = raw R‖S 64 bytes for P-256);
 *            RFC 3279 (ECDSA-Sig-Value SEQUENCE { INTEGER r, INTEGER s }).
 *
 * FAIL CLOSED (I4): every function throws on malformed input. PlayIntegrityPlugin wraps
 * each call in try/catch and maps a throw to `return false` → unavailable().
 */
internal object EcdsaDerTranscoder {

    /**
     * Transcode a raw JWS ECDSA P-256 signature (R‖S, exactly 64 bytes) to the
     * ASN.1 DER ECDSA-Sig-Value encoding required by JCA SHA256withECDSA.verify().
     */
    fun rawEcdsaSignatureToDer(raw: ByteArray): ByteArray {
        if (raw.size != 64) {
            throw IllegalArgumentException("ES256 raw signature must be 64 bytes, got ${raw.size}")
        }
        val r = raw.copyOfRange(0, 32)
        val s = raw.copyOfRange(32, 64)
        val rDer = derEncodeInteger(r)
        val sDer = derEncodeInteger(s)
        val contentLen = rDer.size + sDer.size
        if (contentLen >= 128) {
            throw IllegalStateException("DER SEQUENCE content too long for short-form length")
        }
        val out = ByteArray(2 + contentLen)
        out[0] = 0x30 // SEQUENCE
        out[1] = contentLen.toByte()
        System.arraycopy(rDer, 0, out, 2, rDer.size)
        System.arraycopy(sDer, 0, out, 2 + rDer.size, sDer.size)
        return out
    }

    /**
     * Encode a positive big-endian byte array as a DER INTEGER (tag 0x02).
     * Strips leading 0x00 bytes but keeps at least one; prepends 0x00 when the
     * most-significant byte has the high bit set (keeps the INTEGER positive).
     */
    fun derEncodeInteger(bytes: ByteArray): ByteArray {
        if (bytes.isEmpty()) throw IllegalArgumentException("derEncodeInteger: empty input")
        var start = 0
        while (start < bytes.size - 1 && bytes[start] == 0.toByte()) start += 1
        val stripped = bytes.copyOfRange(start, bytes.size)
        val content = if ((stripped[0].toInt() and 0x80) != 0) {
            val padded = ByteArray(stripped.size + 1)
            padded[0] = 0x00
            System.arraycopy(stripped, 0, padded, 1, stripped.size)
            padded
        } else {
            stripped
        }
        if (content.size >= 128) {
            throw IllegalStateException("DER INTEGER content too long for short-form length")
        }
        val out = ByteArray(2 + content.size)
        out[0] = 0x02 // INTEGER
        out[1] = content.size.toByte()
        System.arraycopy(content, 0, out, 2, content.size)
        return out
    }
}
