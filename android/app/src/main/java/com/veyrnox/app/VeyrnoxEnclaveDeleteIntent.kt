package com.veyrnox.app

// Pure-JVM allowlist gate for VeyrnoxEnclavePlugin.deleteWrappingKey.
//
// Extracted as a stand-alone object so it can be unit-tested off-device in the
// standard JUnit test rig, without spinning up a Capacitor PluginCall or a
// keystore.
//
// Current cross-platform status (honest): at THIS branch's base — cut from
// origin/main — the JS wrapper in src/plugins/veyrnoxEnclave.js still calls
// deleteWrappingKey() with no argument, and the Swift bridge in
// ios/App/CapApp-SPM/Sources/CapApp-SPM/VeyrnoxEnclavePlugin.swift does not
// yet read or enforce an intent. Both of those changes land on PR #1098
// (M2c hardening / Codex 2026-07-17 P2-A) — merge dependency for the
// eventual M2D_ENABLED flag flip, NOT for this scaffold PR. On this branch
// today, Android is STRICTER than JS and Swift; when #1098 lands the three
// layers converge on the same allowlist (cleanup / unenroll / wipe).
//
// Rationale: Capacitor auto-registers the plugin, so
// Capacitor.Plugins.VeyrnoxEnclave.deleteWrappingKey() is reachable from any
// in-page JS on Android — an injected script bypassing the JS wrapper's
// intent check would otherwise strand a live Enclave-wrapped vault once M2d
// is enabled. Enforcing the allowlist at the native bridge closes that gap
// on Android from day one, before any JS-side plumbing exists.
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
