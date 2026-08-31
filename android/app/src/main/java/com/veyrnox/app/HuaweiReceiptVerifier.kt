package com.veyrnox.app

import java.security.KeyFactory
import java.security.Signature
import java.security.spec.X509EncodedKeySpec

/**
 * SHA256withRSA verification of Huawei IAP purchase receipts.
 *
 * HMS returns every purchase as a JSON string plus a detached signature over
 * that exact string — `inAppPurchaseDataList` / `inAppSignature` from
 * `obtainOwnedPurchases`, and `inAppPurchaseData` / `inAppDataSignature` from
 * `parsePurchaseResultInfoFromIntent`. Until this class existed, HuaweiIapPlugin
 * read the JSON and ignored the signature entirely, so `safety_plus` and
 * `ai_security_protection` were granted from an unverified receipt.
 *
 * ## What this does and does not buy
 *
 * The public key is embedded at build time from AppGallery Connect. That makes
 * a forged or replayed receipt fail, which is the gap this closes. It does NOT
 * make entitlement unforgeable: an attacker who can patch the APK or hook HMS
 * Core on a rooted device can replace the embedded key with one they hold and
 * sign their own receipts. Client-side verification raises the bar; only
 * server-side verification against Huawei's order service removes the class,
 * and Huawei's own guidance says so.
 *
 * Stated plainly because the honest ceiling matters: this is a real control
 * with a known limit, not a claim that AppGallery entitlements are now
 * tamper-proof. RASP already gates rooted devices separately.
 *
 * Lives in the shared `main` source set on purpose — it names no HMS type, so
 * the existing `:app:testGoogleDebugUnitTest` job covers it rather than needing
 * a huawei-only test variant.
 *
 * Every failure path returns false (I4). A missing signature, a missing key, a
 * malformed key, a wrong algorithm or any thrown exception all mean "not
 * verified", never "assume good".
 */
object HuaweiReceiptVerifier {
    private const val ALGORITHM = "SHA256withRSA"
    private const val KEY_ALGORITHM = "RSA"

    /**
     * @param purchaseData    the raw receipt JSON, verified byte-for-byte as HMS returned it.
     * @param signature       base64 detached signature supplied alongside it.
     * @param publicKeyBase64 base64 X.509 RSA public key from AppGallery Connect.
     * @param decodeBase64    base64 decoder. Production passes android.util.Base64;
     *                        JVM tests pass java.util.Base64, so no Robolectric is
     *                        needed — same pattern as PlayIntegrityJwsVerifier,
     *                        which exists because minSdk is 24 and java.util.Base64
     *                        is API 26.
     * @return true only if the signature verifies against the key for exactly this data.
     */
    fun verify(
        purchaseData: String?,
        signature: String?,
        publicKeyBase64: String?,
        decodeBase64: (String) -> ByteArray,
    ): Boolean {
        if (purchaseData.isNullOrBlank()) return false
        if (signature.isNullOrBlank()) return false
        if (publicKeyBase64.isNullOrBlank()) return false

        return runCatching {
            val keySpec = X509EncodedKeySpec(decodeBase64(publicKeyBase64))
            val publicKey = KeyFactory.getInstance(KEY_ALGORITHM).generatePublic(keySpec)

            Signature.getInstance(ALGORITHM).run {
                initVerify(publicKey)
                // Verify the exact bytes HMS signed. Do not re-serialise the JSON:
                // any normalisation (key order, whitespace, unicode escaping) would
                // change the bytes and break a legitimate signature.
                update(purchaseData.toByteArray(Charsets.UTF_8))
                verify(decodeBase64(signature))
            }
        }.getOrDefault(false)
    }
}
