package com.veyrnox.app

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "SamsungIap")
class SamsungIapPlugin : Plugin() {
    @PluginMethod
    fun getStatus(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", false)
        ret.put("reason", "NOT_IMPLEMENTED")
        call.resolve(ret)
    }
}
