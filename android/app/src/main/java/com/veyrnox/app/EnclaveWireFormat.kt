package com.veyrnox.app

// EnclaveWireFormat.kt — pure-Kotlin bytes-only helper for the M2d wrap/unwrap
// ciphertext bundle. Extracted from VeyrnoxEnclavePlugin so the pack/unpack shape
// can be pinned by an off-device JVM unit test without pulling android.* or a
// BiometricPrompt rig onto the classpath. Same extraction pattern as
// EnclaveKeySpecConfig / PlayIntegrityJwsVerifier.
//
// Wire format (M2d-1c):
//
//     [ IV (12 bytes) ] [ GCM output (ciphertext ‖ 16-byte auth tag) ]
//
// Everything is base64-encoded at the plugin layer; this helper stays in raw
// bytes. The IV is chosen by AndroidKeyStore's KeyGenerator during Cipher.init
// (ENCRYPT_MODE) — the plugin MUST NOT choose it (a caller-picked IV against a
// per-use-auth key would still catastrophically break GCM if ever reused).
//
// Constants:
//   - IV_SIZE_BYTES = 12  (AES-GCM standard nonce length, RFC 5116 §5.3)
//   - TAG_SIZE_BYTES = 16 (128-bit authentication tag, javax.crypto default)
//
// Error posture: throws IllegalArgumentException on shape errors. Messages
// describe the shape ("iv must be N bytes; got K") but MUST NOT include any
// actual bytes (hex, base64, or otherwise) — the plaintext this helper handles
// is secret-adjacent (a vault DEK/blob). Pinned by EnclaveWireFormatTest T7.

object EnclaveWireFormat {

    const val IV_SIZE_BYTES: Int = 12
    const val TAG_SIZE_BYTES: Int = 16

    /**
     * Concat IV || (ciphertext || tag) into a single bundle. The
     * ciphertextWithTag argument is whatever Cipher.doFinal returns from an
     * AES/GCM/NoPadding cipher — GCM appends the 16-byte tag to the raw
     * ciphertext, so the caller does not split it.
     *
     * @throws IllegalArgumentException if iv is not exactly IV_SIZE_BYTES.
     *   Error message describes shape only — never leaks any input bytes.
     */
    fun pack(iv: ByteArray, ciphertextWithTag: ByteArray): ByteArray {
        if (iv.size != IV_SIZE_BYTES) {
            throw IllegalArgumentException(
                "iv must be exactly $IV_SIZE_BYTES bytes; got length=${iv.size}"
            )
        }
        val out = ByteArray(iv.size + ciphertextWithTag.size)
        System.arraycopy(iv, 0, out, 0, iv.size)
        System.arraycopy(ciphertextWithTag, 0, out, iv.size, ciphertextWithTag.size)
        return out
    }

    /**
     * Split a bundle back into (iv, ciphertextWithTag). Minimum valid bundle
     * size is IV_SIZE_BYTES + TAG_SIZE_BYTES (12 + 16 = 28) — that corresponds
     * to a zero-length plaintext, which is still a valid GCM sealing.
     *
     * @throws IllegalArgumentException if bundle is shorter than 28 bytes.
     *   Error message describes shape only — never leaks any input bytes.
     */
    fun unpack(bundle: ByteArray): Pair<ByteArray, ByteArray> {
        val minSize = IV_SIZE_BYTES + TAG_SIZE_BYTES
        if (bundle.size < minSize) {
            throw IllegalArgumentException(
                "bundle too short: expected at least $minSize bytes; got length=${bundle.size}"
            )
        }
        val iv = bundle.copyOfRange(0, IV_SIZE_BYTES)
        val ctWithTag = bundle.copyOfRange(IV_SIZE_BYTES, bundle.size)
        return Pair(iv, ctWithTag)
    }
}
