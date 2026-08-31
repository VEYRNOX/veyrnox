package com.veyrnox.app

import android.app.Activity
import android.content.Intent
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.huawei.hms.common.ApiException
import com.huawei.hms.iap.Iap
import com.huawei.hms.iap.IapClient
import com.huawei.hms.iap.entity.InAppPurchaseData
import com.huawei.hms.iap.entity.OrderStatusCode
import com.huawei.hms.iap.entity.OwnedPurchasesReq
import com.huawei.hms.iap.entity.ProductInfo
import com.huawei.hms.iap.entity.ProductInfoReq
import com.huawei.hms.iap.entity.PurchaseIntentReq
import com.huawei.hms.iap.entity.StartIapActivityReq

@CapacitorPlugin(
    name = "HuaweiIap",
    requestCodes = [HuaweiIapPlugin.PURCHASE_REQUEST_CODE]
)
class HuaweiIapPlugin : Plugin() {
    private val customerInfoListeners = mutableListOf<String>()
    private var lastSeenCustomerInfo: JSObject? = null

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", activity != null)
        ret.put("configured", true)
        ret.put("store", "APP_GALLERY")
        call.resolve(ret)
    }

    @PluginMethod
    fun configure(call: PluginCall) {
        call.resolve()
    }

    @PluginMethod
    fun getProducts(call: PluginCall) {
        val productIds = call.getArray("productIds")
        if (productIds == null || productIds.length() == 0) {
            call.reject("Missing productIds parameter")
            return
        }
        val priceType = requirePriceType(call) ?: return
        val req = ProductInfoReq().apply {
            this.priceType = priceType
            this.productIds = jsArrayToStringList(productIds)
        }
        iapClient().obtainProductInfo(req)
            .addOnSuccessListener { result ->
                val payload = JSObject()
                val products = JSArray()
                result.productInfoList?.forEach { products.put(productToJs(it)) }
                payload.put("products", products)
                call.resolve(payload)
            }
            .addOnFailureListener { rejectTask(call, "Failed to load Huawei products", it) }
    }

    @PluginMethod
    fun purchaseSubscription(call: PluginCall) {
        val productId = call.getStringOrReject("productId") ?: return
        val priceType = requirePriceType(call) ?: return
        val req = PurchaseIntentReq().apply {
            this.productId = productId
            this.priceType = priceType
        }
        iapClient().createPurchaseIntent(req)
            .addOnSuccessListener { result ->
                val status = result?.status
                if (status == null || activity == null) {
                    call.reject("Huawei purchase flow is unavailable")
                    return@addOnSuccessListener
                }
                try {
                    saveCall(call)
                    bridge.saveCall(call)
                    status.startResolutionForResult(activity, PURCHASE_REQUEST_CODE)
                } catch (err: Exception) {
                    releaseCall(call)
                    call.reject("Failed to launch Huawei purchase flow", err)
                }
            }
            .addOnFailureListener { rejectTask(call, "Failed to create Huawei purchase intent", it) }
    }

    @PluginMethod
    fun getCustomerInfo(call: PluginCall) {
        resolveCustomerInfo(call, requirePriceType(call) ?: return)
    }

    @PluginMethod
    fun restorePurchases(call: PluginCall) {
        resolveCustomerInfo(call, requirePriceType(call) ?: return)
    }

    @PluginMethod
    fun manageSubscriptions(call: PluginCall) {
        val req = StartIapActivityReq()
        val currentProductId = call.getString("productId")
        if (currentProductId.isNullOrBlank()) {
            req.type = StartIapActivityReq.TYPE_SUBSCRIBE_MANAGER_ACTIVITY
        } else {
            req.type = StartIapActivityReq.TYPE_SUBSCRIBE_EDIT_ACTIVITY
            req.subscribeProductId = currentProductId
        }
        val currentActivity = activity
        if (currentActivity == null) {
            call.reject("Huawei activity is unavailable")
            return
        }
        iapClient().startIapActivity(req)
            .addOnSuccessListener { result ->
                result?.startActivity(currentActivity)
                call.resolve()
            }
            .addOnFailureListener { rejectTask(call, "Failed to open Huawei subscription settings", it) }
    }

    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    fun addCustomerInfoUpdateListener(call: PluginCall) {
        customerInfoListeners.add(call.callbackId)
        call.setKeepAlive(true)
        lastSeenCustomerInfo?.let { call.resolve(it) }
    }

    @PluginMethod
    fun removeCustomerInfoUpdateListener(call: PluginCall) {
        val callbackId = call.getStringOrReject("listenerToRemove") ?: return
        val wasRemoved = customerInfoListeners.remove(callbackId)
        bridge.getSavedCall(callbackId)?.setKeepAlive(false)
        bridge.releaseCall(callbackId)
        val payload = JSObject()
        payload.put("wasRemoved", wasRemoved)
        call.resolve(payload)
    }

    override fun handleOnActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.handleOnActivityResult(requestCode, resultCode, data)
        if (requestCode != PURCHASE_REQUEST_CODE) return
        val savedCall = getSavedCall() ?: return
        if (data == null) {
            releaseCall(savedCall)
            savedCall.reject("Huawei purchase result was empty")
            return
        }

        val purchaseResultInfo = iapClient().parsePurchaseResultInfoFromIntent(data)
        when (purchaseResultInfo.returnCode) {
            OrderStatusCode.ORDER_STATE_SUCCESS -> {
                val rawData = purchaseResultInfo.inAppPurchaseData
                if (rawData.isNullOrBlank()) {
                    releaseCall(savedCall)
                    savedCall.reject("Huawei purchase succeeded but returned no purchase payload")
                    return
                }
                if (!receiptIsVerified(rawData, purchaseResultInfo.inAppDataSignature)) {
                    releaseCall(savedCall)
                    savedCall.reject(
                        "Huawei purchase receipt failed signature verification",
                        RECEIPT_UNVERIFIED,
                        null,
                        JSObject(),
                    )
                    return
                }
                try {
                    val purchaseData = InAppPurchaseData(rawData)
                    val customerInfo = customerInfoFromPurchases(listOf(purchaseData))
                    val payload = JSObject()
                    payload.put("customerInfo", customerInfo)
                    payload.put("purchaseData", purchaseToJs(purchaseData))
                    lastSeenCustomerInfo = customerInfo
                    notifyCustomerInfoListeners(customerInfo)
                    releaseCall(savedCall)
                    savedCall.resolve(payload)
                } catch (err: Exception) {
                    releaseCall(savedCall)
                    savedCall.reject("Huawei purchase succeeded but could not be parsed", err)
                }
            }
            OrderStatusCode.ORDER_STATE_CANCEL -> {
                releaseCall(savedCall)
                val payload = JSObject()
                payload.put("userCancelled", true)
                savedCall.reject("Huawei purchase cancelled", "USER_CANCELLED", null, payload)
            }
            OrderStatusCode.ORDER_PRODUCT_OWNED -> {
                resolveOwnedPurchaseResult(savedCall, SUBSCRIPTION_PRICE_TYPE)
            }
            else -> {
                releaseCall(savedCall)
                val payload = JSObject()
                payload.put("returnCode", purchaseResultInfo.returnCode)
                payload.put("errMsg", purchaseResultInfo.errMsg ?: "")
                savedCall.reject("Huawei purchase failed", "PURCHASE_FAILED", null, payload)
            }
        }
    }

    private fun resolveCustomerInfo(call: PluginCall, priceType: Int) {
        resolveOwnedPurchaseResult(call, priceType)
    }

    private fun resolveOwnedPurchaseResult(call: PluginCall, priceType: Int) {
        fetchOwnedPurchases(priceType, null, mutableListOf()) { result ->
            result.onSuccess { purchases ->
                val customerInfo = customerInfoFromPurchases(purchases)
                lastSeenCustomerInfo = customerInfo
                notifyCustomerInfoListeners(customerInfo)
                val payload = JSObject()
                payload.put("customerInfo", customerInfo)
                call.resolve(payload)
            }.onFailure { err ->
                rejectTask(call, "Failed to load Huawei customer info", err)
            }
        }
    }

    private fun fetchOwnedPurchases(
        priceType: Int,
        continuationToken: String?,
        collected: MutableList<InAppPurchaseData>,
        callback: (Result<List<InAppPurchaseData>>) -> Unit
    ) {
        val req = OwnedPurchasesReq().apply {
            this.priceType = priceType
            this.continuationToken = continuationToken
        }
        iapClient().obtainOwnedPurchases(req)
            .addOnSuccessListener { result ->
                val rawList = result.inAppPurchaseDataList.orEmpty()
                // HMS returns inAppSignature positionally parallel to
                // inAppPurchaseDataList. Pair by index and drop anything whose
                // signature is absent at that index or does not verify — an
                // unverified receipt must never reach entitlement mapping (I4).
                val signatures = result.inAppSignature.orEmpty()
                rawList.forEachIndexed { index, raw ->
                    if (!receiptIsVerified(raw, signatures.getOrNull(index))) {
                        return@forEachIndexed
                    }
                    try {
                        collected.add(InAppPurchaseData(raw))
                    } catch (_: Exception) {
                        // Skip malformed receipts and fail closed on entitlement mapping.
                    }
                }
                val nextToken = result.continuationToken
                if (nextToken.isNullOrBlank()) {
                    callback(Result.success(collected))
                } else {
                    fetchOwnedPurchases(priceType, nextToken, collected, callback)
                }
            }
            .addOnFailureListener { callback(Result.failure(it)) }
    }

    private fun customerInfoFromPurchases(purchases: List<InAppPurchaseData>): JSObject {
        val active = JSObject()
        purchases.forEach { purchase ->
            if (!purchase.isSubValid || purchase.purchaseState != InAppPurchaseData.PurchaseState.PURCHASED) {
                return@forEach
            }
            val productId = purchase.productId ?: return@forEach
            when (productId) {
                "safety_plus_monthly",
                "safety_plus_annual" -> active.put("safety_plus", entitlementToJs("safety_plus", purchase))
                "ai_security_protection_monthly",
                "ai_security_protection_annual" -> active.put("ai_security_protection", entitlementToJs("ai_security_protection", purchase))
            }
        }

        val entitlements = JSObject()
        entitlements.put("active", active)

        val payload = JSObject()
        payload.put("entitlements", entitlements)
        payload.put("originalAppUserId", JSObject.NULL)
        return payload
    }

    private fun entitlementToJs(identifier: String, purchase: InAppPurchaseData): JSObject {
        val ret = JSObject()
        ret.put("identifier", identifier)
        ret.put("productIdentifier", purchase.productId ?: "")
        ret.put("isActive", purchase.isSubValid)
        ret.put("willRenew", purchase.isAutoRenewing)
        ret.put("latestPurchaseDateMillis", purchase.purchaseTime)
        ret.put("purchaseToken", purchase.purchaseToken ?: "")
        return ret
    }

    private fun purchaseToJs(purchase: InAppPurchaseData): JSObject {
        val ret = JSObject()
        ret.put("productId", purchase.productId ?: "")
        ret.put("productName", purchase.productName ?: "")
        ret.put("purchaseToken", purchase.purchaseToken ?: "")
        ret.put("purchaseTime", purchase.purchaseTime)
        ret.put("price", purchase.price / 100.0)
        ret.put("currency", purchase.currency ?: "")
        ret.put("isAutoRenewing", purchase.isAutoRenewing)
        ret.put("isSubValid", purchase.isSubValid)
        return ret
    }

    private fun productToJs(product: ProductInfo): JSObject {
        val ret = JSObject()
        ret.put("productId", product.productId ?: "")
        ret.put("priceType", product.priceType)
        ret.put("price", product.price ?: "")
        ret.put("microsPrice", product.microsPrice)
        ret.put("currency", product.currency ?: "")
        ret.put("productName", product.productName ?: "")
        ret.put("productDesc", product.productDesc ?: "")
        ret.put("subPeriod", product.subPeriod ?: "")
        return ret
    }

    private fun notifyCustomerInfoListeners(customerInfo: JSObject) {
        for (callbackId in customerInfoListeners) {
            bridge.getSavedCall(callbackId)?.resolve(customerInfo)
        }
    }

    private fun jsArrayToStringList(array: JSArray): MutableList<String> {
        val items = mutableListOf<String>()
        for (index in 0 until array.length()) {
            val item = array.optString(index, null)
            if (!item.isNullOrBlank()) items.add(item)
        }
        return items
    }

    private fun rejectTask(call: PluginCall, message: String, err: Throwable) {
        if (err is ApiException) {
            val payload = JSObject()
            payload.put("statusCode", err.statusCode)
            payload.put("statusMessage", err.statusMessage ?: "")
            call.reject(message, "HUAWEI_IAP_ERROR", err, payload)
            return
        }
        call.reject(message, err as? Exception ?: Exception(err))
    }

    private fun requirePriceType(call: PluginCall): Int? {
        val priceType = call.getInt("priceType") ?: SUBSCRIPTION_PRICE_TYPE
        if (priceType != SUBSCRIPTION_PRICE_TYPE) {
            call.reject("Only Huawei subscription purchases are supported in this build")
            return null
        }
        return priceType
    }

    private fun releaseCall(call: PluginCall) {
        bridge.releaseCall(call)
        freeSavedCall()
    }

    private fun iapClient(): IapClient = Iap.getIapClient(activity as Activity)

    private fun PluginCall.getStringOrReject(key: String): String? {
        val value = getString(key)
        if (value.isNullOrBlank()) {
            reject("Missing $key parameter")
            return null
        }
        return value
    }

    /**
     * True only if HMS signed this exact receipt with the key from AppGallery
     * Connect. Everything else — no signature, no configured key, a malformed
     * key, a thrown exception — is false, so the receipt is dropped rather than
     * granted (I4).
     *
     * The key is embedded at build time via BuildConfig.HUAWEI_IAP_PUBLIC_KEY
     * and defaults to "". An unconfigured huawei build therefore grants NO
     * entitlement at all, which is the intended failure direction: a build that
     * cannot check is a build that must not trust. android/app/build.gradle
     * fails a huawei RELEASE build outright when the property is blank, so this
     * default can only be hit in a local debug build.
     *
     * See HuaweiReceiptVerifier for the honest ceiling of client-side checking.
     */
    private fun receiptIsVerified(rawData: String?, signature: String?): Boolean =
        HuaweiReceiptVerifier.verify(
            rawData,
            signature,
            BuildConfig.HUAWEI_IAP_PUBLIC_KEY,
        ) { Base64.decode(it, Base64.DEFAULT) }

    companion object {
        private const val PURCHASE_REQUEST_CODE = 0x4877
        private const val SUBSCRIPTION_PRICE_TYPE = IapClient.PriceType.IN_APP_SUBSCRIPTION
        private const val RECEIPT_UNVERIFIED = "RECEIPT_UNVERIFIED"
    }
}
