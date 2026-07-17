package com.veyrnox.app

// VeyrnoxEnclavePlugin.kt — Android bridge for the M2d OS-ACL vault-blob wrap.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ PROVISIONAL — NOT AUDITED-SECURE, NOT DEVICE-VERIFIED.                  │
// │ M2d-1a SCAFFOLD.                                                        │
// │                                                                        │
// │   Ships:  plugin registration, capability probe, deleteWrappingKey     │
// │           intent gate, M2D_ENABLED=false fail-closed on wrap/unwrap/   │
// │           createWrappingKey.                                           │
// │   Does NOT ship: any AndroidKeyStore key material, any biometric       │
// │           prompt, any wrap/unwrap logic. Those land in M2d-1b/-1c/-1d. │
// │                                                                        │
// │ Runtime behaviour for KEY MATERIAL is byte-identical to "plugin not    │
// │ registered" until M2D_ENABLED is flipped — no AndroidKeyStore write,   │
// │ no biometric prompt, no key touched. This scaffold DOES newly expose:  │
// │   - isHardwareKeyAvailable() — read-only capability probe, no side     │
// │     effects, no identifier leak (returns tier + biometry-enrolled bit).│
// │   - deleteWrappingKey({ intent }) — requires an explicit allowlisted   │
// │     intent (Codex 2026-07-17 P2-A extended to Android: closes the     │
// │     M-5-class auto-registration attack surface at the native bridge,   │
// │     not just the JS wrapper). No-op until M2d-1b mints a key.          │
// │                                                                        │
// │ See docs/M2cd.native-acl-plan.md §5, docs/Feature-Status.md §F-2.      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Intentional parity with iOS VeyrnoxEnclavePlugin.swift:
//   - Same @CapacitorPlugin name ("VeyrnoxEnclave") so JS bridge is one file.
//   - Same method signatures (createWrappingKey, wrap, unwrap,
//     deleteWrappingKey, isHardwareKeyAvailable).
//   - Same M2C_DISABLED error code + M2C_DELETE_INTENT_REQUIRED code.
//   - Same allowlist (cleanup / unenroll / wipe) — enforced via
//     VeyrnoxEnclaveDeleteIntent object (JVM-unit-testable).
//
// Divergence from iOS (documented and by design):
//   - Capability.backing may be "strongBox" or "tee" (Android has two hardware
//     tiers), where iOS reports "secureEnclave" or "none".
//   - Cipher choice for M2d-1b will be AES-GCM in AndroidKeyStore, NOT ECIES
//     P-256 (see plan §5: RSA-OAEP/EC StrongBox support is spotty on target
//     OEMs; AES-GCM is universally supported).

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "VeyrnoxEnclave")
class VeyrnoxEnclavePlugin : Plugin() {

    companion object {
        // MUST be flipped to true TOGETHER WITH JS-side M2C_ENABLED (in
        // src/plugins/veyrnoxEnclave.js) AND with the JS-side
        // M2C_HARDWARE_WRAP_ENABLED gate (in src/wallet-core/keystore/native.js)
        // AFTER the physical-device checklist at
        // docs/audit-triage/m2d-strongbox-device-test.md AND the independent
        // audit. All three gates in lockstep — do not flip one without the
        // others (fail honest, fail closed, I4).
        const val M2D_ENABLED: Boolean = false

        private const val DISABLED_CODE = "M2C_DISABLED"
        private const val DISABLED_MESSAGE = "M2d hardware wrap is disabled"

        // Same error code as iOS bridge for wrap/unwrap not-yet-implemented on
        // the scaffold; distinguishable from DISABLED_CODE at the JS layer via
        // a different message.
        private const val NOT_IMPLEMENTED_CODE = "M2C_DISABLED"
        private const val NOT_IMPLEMENTED_MESSAGE =
            "M2d hardware wrap is disabled (scaffold: wrap/unwrap not yet implemented)"
    }

    private val service = EnclaveKeyService()

    // ── Ungated: read-only capability probe ─────────────────────────────
    // Touches no key material. Callers (native.js) use this to decide whether
    // the hardware path is even reachable on this device. Reports the true
    // tier ("strongBox" | "tee" | "none") — never fabricates a claim (I4).
    @PluginMethod
    fun isHardwareKeyAvailable(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("Plugin context unavailable", "NO_CONTEXT")
            return
        }
        val capability = service.capability(ctx)
        val response = JSObject().apply {
            put("backing", capability.backing)
            put("biometryEnrolled", capability.biometryEnrolled)
        }
        call.resolve(response)
    }

    // ── Gated: mints key material. Fail-closed while M2D_ENABLED is false ──
    // NOTE (Codex second-pass 2026-07-17 P2-A): Android PluginCall.reject takes
    // (message, code) — OPPOSITE of the iOS bridge's (code, message). Passing
    // args in the wrong order silently mislabels err.code at the JS layer, so
    // callers matching `if (e.code === 'M2C_DISABLED')` wouldn't fire. Native
    // convention verified against HardwareKekPlugin.kt:103,120 — reject(message, code).
    @PluginMethod
    fun createWrappingKey(call: PluginCall) {
        if (!M2D_ENABLED) {
            call.reject(DISABLED_MESSAGE, DISABLED_CODE)
            return
        }
        // M2d-1b lands the AndroidKeyStore key creation here.
        call.reject(NOT_IMPLEMENTED_MESSAGE, NOT_IMPLEMENTED_CODE)
    }

    // ── Gated: wraps a vault blob. Fail-closed while M2D_ENABLED is false ──
    @PluginMethod
    fun wrap(call: PluginCall) {
        if (!M2D_ENABLED) {
            call.reject(DISABLED_MESSAGE, DISABLED_CODE)
            return
        }
        // M2d-1c lands the wrap-key AES-GCM encrypt here.
        call.reject(NOT_IMPLEMENTED_MESSAGE, NOT_IMPLEMENTED_CODE)
    }

    // ── Gated: unwraps under a biometric prompt. Fail-closed while off. ────
    @PluginMethod
    fun unwrap(call: PluginCall) {
        if (!M2D_ENABLED) {
            call.reject(DISABLED_MESSAGE, DISABLED_CODE)
            return
        }
        // M2d-1d lands the BiometricPrompt(CryptoObject(cipher)) unwrap here.
        call.reject(NOT_IMPLEMENTED_MESSAGE, NOT_IMPLEMENTED_CODE)
    }

    // ── Intent-gated: no M2D_ENABLED check (delete must remain available   ──
    // for cleanup regardless of flag state, mirroring iOS bridge). But the
    // Capacitor bridge is auto-registered, so an injected-JS attacker could
    // otherwise invoke it directly and strand a live Enclave-wrapped vault
    // once M2d ships. The intent allowlist is defence-in-depth against that
    // availability hazard — not a confidentiality control.
    //
    // M2d-1a itself does not create any keys, so today this is a no-op that
    // still enforces the gate — the intent-gate contract must be in place
    // BEFORE any key material can be minted, so this ships in the scaffold PR.
    @PluginMethod
    fun deleteWrappingKey(call: PluginCall) {
        val intent = call.getString("intent")
        if (!VeyrnoxEnclaveDeleteIntent.isAllowed(intent)) {
            // Android PluginCall.reject signature is (message, code) — see the
            // note on createWrappingKey above. Codex 2026-07-17 P2-A.
            call.reject(
                VeyrnoxEnclaveDeleteIntent.REJECT_MESSAGE,
                VeyrnoxEnclaveDeleteIntent.REJECT_CODE
            )
            return
        }
        // M2d-1b lands the AndroidKeyStore.deleteEntry() calls for both the
        // wrap-only alias and the unwrap alias here. Today's scaffold has no
        // aliases to delete — resolve as a no-op after the intent check.
        call.resolve()
    }
}
