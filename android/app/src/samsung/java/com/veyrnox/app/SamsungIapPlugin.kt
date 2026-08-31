package com.veyrnox.app

import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.revenuecat.purchases.CustomerInfo
import com.revenuecat.purchases.EntitlementVerificationMode
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.PurchasesAreCompletedBy
import com.revenuecat.purchases.PurchasesConfiguration
import com.revenuecat.purchases.Store
import com.revenuecat.purchases.galaxy.GalaxyBillingMode
import com.revenuecat.purchases.hybridcommon.mappers.mapAsync
import com.revenuecat.purchases.interfaces.UpdatedCustomerInfoListener

@CapacitorPlugin(name = "SamsungIap")
class SamsungIapPlugin : Plugin() {
    private val customerInfoListeners = mutableListOf<String>()
    private var lastSeenCustomerInfo: CustomerInfo? = null

    @PluginMethod
    fun getStatus(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", true)
        ret.put("configured", Purchases.isConfigured)
        ret.put("store", Store.GALAXY.name)
        call.resolve(ret)
    }

    @PluginMethod(returnType = PluginMethod.RETURN_NONE)
    fun configure(call: PluginCall) {
        val apiKey = call.getStringOrReject("apiKey") ?: return
        val appUserID = call.getString("appUserID")
        val shouldShowInAppMessages = call.getBoolean("shouldShowInAppMessagesAutomatically")
        val entitlementVerificationMode = call.getString("entitlementVerificationMode")
        val pendingTransactionsForPrepaidPlansEnabled = call.getBoolean("pendingTransactionsForPrepaidPlansEnabled")
        val diagnosticsEnabled = call.getBoolean("diagnosticsEnabled")
        val automaticDeviceIdentifierCollectionEnabled = call.getBoolean("automaticDeviceIdentifierCollectionEnabled")
        val preferredLocale = call.getString("preferredUILocaleOverride")
        val billingMode = when (call.getString("billingMode")) {
            "TEST" -> GalaxyBillingMode.TEST
            "ALWAYS_FAIL" -> GalaxyBillingMode.ALWAYS_FAIL
            else -> GalaxyBillingMode.PRODUCTION
        }

        val builder = PurchasesConfiguration.Builder(context.applicationContext, apiKey)
            .store(Store.GALAXY)
            .purchasesAreCompletedBy(PurchasesAreCompletedBy.REVENUECAT)
            .galaxyBillingMode(billingMode)

        if (!appUserID.isNullOrBlank()) {
            builder.appUserID(appUserID)
        }
        if (shouldShowInAppMessages != null) {
            builder.showInAppMessagesAutomatically(shouldShowInAppMessages)
        }
        if (pendingTransactionsForPrepaidPlansEnabled != null) {
            builder.pendingTransactionsForPrepaidPlansEnabled(pendingTransactionsForPrepaidPlansEnabled)
        }
        if (diagnosticsEnabled != null) {
            builder.diagnosticsEnabled(diagnosticsEnabled)
        }
        if (automaticDeviceIdentifierCollectionEnabled != null) {
            builder.automaticDeviceIdentifierCollectionEnabled(automaticDeviceIdentifierCollectionEnabled)
        }
        if (!preferredLocale.isNullOrBlank()) {
            builder.preferredUILocaleOverride(preferredLocale)
        }
        if (!entitlementVerificationMode.isNullOrBlank()) {
            try {
                builder.entitlementVerificationMode(
                    EntitlementVerificationMode.valueOf(entitlementVerificationMode)
                )
            } catch (_: IllegalArgumentException) {
                call.reject("Unknown entitlement verification mode: $entitlementVerificationMode")
                return
            }
        }

        Purchases.configure(builder.build())
        Purchases.sharedInstance.updatedCustomerInfoListener = UpdatedCustomerInfoListener { customerInfo ->
            lastSeenCustomerInfo = customerInfo
            customerInfo.mapAsync { map ->
                for (callbackId in customerInfoListeners) {
                    bridge.getSavedCall(callbackId)?.resolve(convertMapToJSObject(map))
                }
            }
        }
        call.resolve()
    }

    @PluginMethod(returnType = PluginMethod.RETURN_CALLBACK)
    fun addCustomerInfoUpdateListener(call: PluginCall) {
        if (rejectIfNotConfigured(call)) return
        customerInfoListeners.add(call.callbackId)
        call.setKeepAlive(true)
        lastSeenCustomerInfo?.let { info ->
            info.mapAsync { map -> call.resolve(convertMapToJSObject(map)) }
        }
    }

    @PluginMethod(returnType = PluginMethod.RETURN_PROMISE)
    fun removeCustomerInfoUpdateListener(call: PluginCall) {
        if (rejectIfNotConfigured(call)) return
        val callbackIDToRemove = call.getStringOrReject("listenerToRemove") ?: return
        val wasRemoved = customerInfoListeners.remove(callbackIDToRemove)
        bridge?.getSavedCall(callbackIDToRemove)?.setKeepAlive(false)
        call.resolveWithMap(mapOf("wasRemoved" to wasRemoved))
    }

    private fun rejectIfNotConfigured(call: PluginCall): Boolean {
        val isConfigured = Purchases.isConfigured
        if (!isConfigured) {
            call.reject("Purchases must be configured before calling this function")
        }
        return !isConfigured
    }

    private fun PluginCall.getStringOrReject(key: String): String? {
        val value = getString(key)
        if (value == null) {
            reject("Missing $key parameter")
            return null
        }
        return value
    }

    private fun PluginCall.resolveWithMap(map: Map<String, *>) {
        resolve(convertMapToJSObject(map))
    }

    @Suppress("UNCHECKED_CAST")
    private fun convertMapToJSObject(map: Map<String, *>): JSObject {
        val writableMap = JSObject()
        map.forEach { (key, value) ->
            when (value) {
                null -> writableMap.put(key, JSObject.NULL)
                is Map<*, *> -> writableMap.put(key, convertMapToJSObject(value as Map<String, *>))
                is List<*> -> writableMap.put(key, convertListToJSArray(value))
                else -> writableMap.put(key, value)
            }
        }
        return writableMap
    }

    @Suppress("UNCHECKED_CAST")
    private fun convertListToJSArray(array: List<*>): JSArray {
        val writableArray = JSArray()
        for (item in array) {
            when (item) {
                null -> writableArray.put(JSObject.NULL)
                is Map<*, *> -> writableArray.put(convertMapToJSObject(item as Map<String, *>))
                is List<*> -> writableArray.put(convertListToJSArray(item))
                else -> writableArray.put(item)
            }
        }
        return writableArray
    }
}
