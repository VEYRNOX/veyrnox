package com.veyrnox.app

// Pure-JVM allowlist gate for VeyrnoxEnclavePlugin.deleteWrappingKey.
//
// Extracted as a stand-alone object so it can be unit-tested off-device in the
// standard JUnit test rig, without spinning up a Capacitor PluginCall or a
// keystore.
//
// Mirrors the JS wrapper gate in src/plugins/veyrnoxEnclave.js and the Swift
// bridge gate in ios/App/CapApp-SPM/Sources/CapApp-SPM/VeyrnoxEnclavePlugin.swift
// (VeyrnoxEnclavePlugin.deleteWrappingKey). The allowlist MUST stay identical
// across all three: JS wrapper, Swift bridge, Kotlin bridge.
//
// Rationale: Capacitor auto-registers the plugin, so
// Capacitor.Plugins.VeyrnoxEnclave.deleteWrappingKey() is reachable from any
// in-page JS on Android — an injected script bypassing the JS wrapper's intent
// check would otherwise strand a live Enclave-wrapped vault once M2d is enabled.
// Enforcing the same allowlist at the native bridge closes that gap on Android
// exactly as Codex 2026-07-17 P2-A closed it on iOS.
//
// Not a confidentiality control (delete cannot reveal key material) — this is
// defence-in-depth against an availability hazard.
object VeyrnoxEnclaveDeleteIntent {

    val ALLOWED_INTENTS: Set<String> = setOf("cleanup", "unenroll", "wipe")

    const val REJECT_CODE: String = "M2C_DELETE_INTENT_REQUIRED"
    const val REJECT_MESSAGE: String = "deleteWrappingKey requires an explicit intent"

    /**
     * @return true iff [intent] is a non-null string that appears in [ALLOWED_INTENTS].
     * Fail-closed on null / empty / unknown value.
     */
    fun isAllowed(intent: String?): Boolean =
        intent != null && intent in ALLOWED_INTENTS
}
