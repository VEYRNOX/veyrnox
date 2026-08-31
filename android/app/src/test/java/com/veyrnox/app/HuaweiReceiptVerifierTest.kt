package com.veyrnox.app

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.security.KeyPair
import java.security.KeyPairGenerator
import java.security.Signature
import java.util.Base64

/**
 * Real RSA keys throughout — a test that only asserted the verifier "is called"
 * would pass against a stub that returns true, which is the failure mode this
 * code exists to prevent.
 */
class HuaweiReceiptVerifierTest {

    private val decoder: (String) -> ByteArray = { Base64.getDecoder().decode(it) }

    private fun keyPair(): KeyPair =
        KeyPairGenerator.getInstance("RSA").apply { initialize(2048) }.generateKeyPair()

    private fun sign(data: String, pair: KeyPair): String {
        val sig = Signature.getInstance("SHA256withRSA").apply {
            initSign(pair.private)
            update(data.toByteArray(Charsets.UTF_8))
        }
        return Base64.getEncoder().encodeToString(sig.sign())
    }

    private fun publicKeyB64(pair: KeyPair): String =
        Base64.getEncoder().encodeToString(pair.public.encoded)

    private val receipt =
        """{"productId":"safety_plus_monthly","purchaseState":0,"subIsvalid":true}"""

    @Test
    fun `accepts a receipt signed by the matching key`() {
        val pair = keyPair()
        assertTrue(
            HuaweiReceiptVerifier.verify(
                receipt, sign(receipt, pair), publicKeyB64(pair), decoder,
            ),
        )
    }

    @Test
    fun `rejects a receipt signed by a different key`() {
        // The forgery case: attacker signs their own receipt with their own key.
        val real = keyPair()
        val attacker = keyPair()
        assertFalse(
            HuaweiReceiptVerifier.verify(
                receipt, sign(receipt, attacker), publicKeyB64(real), decoder,
            ),
        )
    }

    @Test
    fun `rejects tampered receipt data under a valid signature`() {
        // The upgrade case: take a genuine signature for a cheap product and
        // swap the body for the expensive entitlement.
        val pair = keyPair()
        val signature = sign(receipt, pair)
        val tampered = receipt.replace("safety_plus_monthly", "ai_security_protection_annual")
        assertFalse(
            HuaweiReceiptVerifier.verify(tampered, signature, publicKeyB64(pair), decoder),
        )
    }

    @Test
    fun `rejects when the signature is missing or blank`() {
        val pair = keyPair()
        assertFalse(HuaweiReceiptVerifier.verify(receipt, null, publicKeyB64(pair), decoder))
        assertFalse(HuaweiReceiptVerifier.verify(receipt, "", publicKeyB64(pair), decoder))
        assertFalse(HuaweiReceiptVerifier.verify(receipt, "   ", publicKeyB64(pair), decoder))
    }

    @Test
    fun `rejects when the public key is unconfigured`() {
        // BuildConfig.HUAWEI_IAP_PUBLIC_KEY defaults to "" — an unconfigured
        // build must grant nothing rather than skip the check (I4).
        val pair = keyPair()
        assertFalse(HuaweiReceiptVerifier.verify(receipt, sign(receipt, pair), null, decoder))
        assertFalse(HuaweiReceiptVerifier.verify(receipt, sign(receipt, pair), "", decoder))
    }

    @Test
    fun `rejects a malformed key or signature instead of throwing`() {
        val pair = keyPair()
        assertFalse(
            HuaweiReceiptVerifier.verify(receipt, sign(receipt, pair), "not-base64!!", decoder),
        )
        assertFalse(
            HuaweiReceiptVerifier.verify(receipt, "not-base64!!", publicKeyB64(pair), decoder),
        )
        // A well-formed base64 string that is not an X.509 key.
        assertFalse(
            HuaweiReceiptVerifier.verify(
                receipt,
                sign(receipt, pair),
                Base64.getEncoder().encodeToString(byteArrayOf(1, 2, 3)),
                decoder,
            ),
        )
    }

    @Test
    fun `rejects blank purchase data`() {
        val pair = keyPair()
        assertFalse(HuaweiReceiptVerifier.verify(null, sign(receipt, pair), publicKeyB64(pair), decoder))
        assertFalse(HuaweiReceiptVerifier.verify("", sign(receipt, pair), publicKeyB64(pair), decoder))
    }

    @Test
    fun `a decoder that throws is treated as unverified, not as success`() {
        val pair = keyPair()
        assertFalse(
            HuaweiReceiptVerifier.verify(receipt, sign(receipt, pair), publicKeyB64(pair)) {
                throw IllegalStateException("decoder blew up")
            },
        )
    }
}
