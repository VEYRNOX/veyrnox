package com.veyrnox.app

// VeyrnoxEnclavePlugin.kt — Android bridge for the M2d OS-ACL vault-blob wrap.
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ PROVISIONAL — NOT AUDITED-SECURE, NOT DEVICE-VERIFIED.                  │
// │ M2d-1b — real createWrappingKey landed BEHIND the M2D_ENABLED=false     │
// │ flag. Code lands, does not run in production.                          │
// │                                                                        │
// │   TRUE today:                                                          │
// │     - plugin registration, capability probe (isHardwareKeyAvailable). │
// │     - deleteWrappingKey({ intent }) intent-allowlist gate at the      │
// │       native bridge (Android-only on this branch pre-#1098).          │
// │     - createWrappingKey real path via EnclaveKeyService — AES-GCM 256 │
// │       AndroidKeyStore key, per-use BIOMETRIC_STRONG auth,             │
// │       invalidate-on-biometric-enrollment, StrongBox-preferred with    │
// │       TEE fall-through. Idempotent — refuses to silently re-key.      │
// │     - M2D_ENABLED=false fail-closed on createWrappingKey, wrap,       │
// │       unwrap — none of these run in production yet. Runtime for KEY  │
// │       MATERIAL is byte-identical to "plugin not registered" until    │
// │       the flag is flipped in lockstep with the JS-side gates AFTER   │
// │       docs/audit-triage/m2d-strongbox-device-test.md is executed and │
// │       the independent audit signs off.                                │
// │                                                                        │
// │   NOT YET (pending future increments):                                 │
// │     - wrap()   — M2d-1c (Cipher AES/GCM encrypt).                     │
// │     - unwrap() — M2d-1d (BiometricPrompt(CryptoObject(cipher)) +      │
// │       decrypt).                                                       │
// │     - JS wrapper opt-in flip (M2C_ENABLED / M2C_HARDWARE_WRAP_ENABLED)│
// │                                                                        │
// │ See docs/M2cd.native-acl-plan.md §5, docs/Feature-Status.md §F-2,     │
// │ docs/audit-triage/m2d-strongbox-device-test.md (STATUS: NOT RUN).     │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Intended parity with iOS VeyrnoxEnclavePlugin.swift — current state on
// THIS branch (cut from origin/main), before PR #1098 (M2c hardening) lands:
//   - Same @CapacitorPlugin name ("VeyrnoxEnclave") — TRUE today; the shared
//     JS bridge is one file across platforms.
//   - Same method signatures (createWrappingKey, wrap, unwrap,
//     deleteWrappingKey, isHardwareKeyAvailable) — TRUE today.
//   - Same M2C_DISABLED error code for gated methods — TRUE today (iOS
//     bridge returns M2C_DISABLED from the pre-existing scaffold).
//   - Same M2C_DELETE_INTENT_REQUIRED code + (cleanup / unenroll / wipe)
//     allowlist — CURRENTLY ANDROID-ONLY on this branch. The iOS Swift
//     bridge does not yet enforce an intent, and the JS wrapper still
//     calls deleteWrappingKey() with no argument. Both land on PR #1098;
//     once it merges, all three layers converge on the same allowlist.
//     Until then Android is intentionally STRICTER — fail-closed at the
//     native bridge from day one, before any JS-side plumbing exists.
//
// Divergence from iOS (documented and by design):
//   - capability().backing may be "strongBox" | "tee" | "none" (pre-key OS-feature
//     probe). createWrappingKey's CreateResult.backing may additionally return
//     "software" (KeyStore fell back to in-process bytes — e.g. emulator or
//     misconfigured device) or "unknown" (unmapped securityLevel); NEVER label
//     software or unknown as "tee" (I4 honesty). iOS reports "secureEnclave"
//     or "none".
//   - Cipher: AES-GCM 256 in AndroidKeyStore, NOT ECIES P-256 (plan §5:
//     RSA-OAEP/EC StrongBox support is spotty on target OEMs; AES-GCM is
//     universally supported). Consequence: `setUserAuthenticationRequired(true)`
//     on this single key means biometric prompt on BOTH wrap and unwrap.
//     RSA-OAEP asymmetric ("wrap without prompt") deferred; revisit criterion
//     is the M2d-1c/-1d device runbook surfacing UX pain.

import android.os.Build
import androidx.fragment.app.FragmentActivity
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

        private const val REQUIRES_ANDROID_11_CODE = "M2D_REQUIRES_ANDROID_11"
        private const val REQUIRES_ANDROID_11_MESSAGE =
            "M2d hardware wrap requires Android 11+ (API 30) for BIOMETRIC_STRONG auth parameters"

        private const val CREATE_FAILED_CODE = "M2D_CREATE_FAILED"
    }

    private val service = EnclaveKeyService()

    // ── Ungated: read-only capability probe ─────────────────────────────
    // Touches no key material. Callers (native.js) use this to decide whether
    // the hardware path is even reachable on this device. Reports the true
    // tier ("strongBox" | "tee" | "none") — never fabricates a claim (I4).
    // Note: CreateResult.backing (from createWrappingKey below) has a wider
    // enum ("strongBox" | "tee" | "software" | "unknown"); capability() is
    // the pre-key OS probe and stays with the M2d-1a 3-value shape.
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
        // M2D_ENABLED gate FIRST — production behaviour is byte-identical to
        // the pre-M2d-1b scaffold until this flag flips in lockstep with the
        // JS-side gates AFTER the device runbook + independent audit sign-off.
        if (!M2D_ENABLED) {
            call.reject(DISABLED_MESSAGE, DISABLED_CODE)
            return
        }
        // API gate — setUserAuthenticationParameters is API 30+. Do NOT weaken
        // auth strength to run on older APIs (fail honest, fail closed).
        if (Build.VERSION.SDK_INT < EnclaveKeySpecConfig.MIN_API) {
            call.reject(REQUIRES_ANDROID_11_MESSAGE, REQUIRES_ANDROID_11_CODE)
            return
        }
        val ctx = context ?: run {
            call.reject("Plugin context unavailable", "NO_CONTEXT")
            return
        }
        try {
            val result = service.createWrappingKey(ctx)
            val response = JSObject().apply {
                put("backing", result.backing)
                put("securityLevel", result.securityLevel)
                put("securityLevelName", result.securityLevelName)
                put("created", result.created)
            }
            call.resolve(response)
        } catch (e: Exception) {
            // Android PluginCall.reject: (message, code) — see the note on the
            // deleteWrappingKey handler below (Codex 2026-07-17 P2-A).
            call.reject("createWrappingKey failed: ${e.message}", CREATE_FAILED_CODE)
        }
    }

    // ── Gated: wraps a vault blob. Fail-closed while M2D_ENABLED is false ──
    //
    // M2d-1c: real AES-GCM encrypt behind BiometricPrompt(CryptoObject(cipher)).
    // The M2D_ENABLED gate STAYS at the top of this method — code lands INSIDE
    // the guard; production runtime is byte-identical to the M2d-1b scaffold
    // (immediate M2C_DISABLED reject) until the flag flips in lockstep with
    // the JS-side gates AFTER the device runbook + independent audit sign-off.
    //
    // Asynchronous: BiometricPrompt callbacks fire on the main thread. We
    // MUST NOT resolve/reject synchronously — the plugin call is kept alive
    // via setKeepAlive(true), and the callback surfaces the terminal result.
    //
    // I3 note: this plugin does NOT know about deniability sessions. Any I3
    // gating is the CALLER's responsibility (JS-side native.js). This is an
    // OS-primitive wrapper — future readers, do NOT add session-type logic
    // here (it would leak into the biometric prompt UX and defeat I3).
    //
    // Documented UX tradeoff (M2d-1b decision, see EnclaveKeyService header):
    // AES-GCM single-key with setUserAuthenticationRequired(true) binds BOTH
    // wrap AND unwrap to a biometric prompt. Users are present at vault
    // creation / add-wallet, so a prompt on wrap is acceptable. The
    // "wrap without prompt" alternative would require RSA-OAEP asymmetric,
    // whose StrongBox support is spotty across OEMs (plan §5 fallback branch).
    @PluginMethod
    fun wrap(call: PluginCall) {
        if (!M2D_ENABLED) {
            call.reject(DISABLED_MESSAGE, DISABLED_CODE)
            return
        }
        // API gate — mirrors createWrappingKey. wrap() uses the same key with
        // the same API-30+ auth params, so refuse on older APIs symmetrically.
        if (Build.VERSION.SDK_INT < EnclaveKeySpecConfig.MIN_API) {
            call.reject(REQUIRES_ANDROID_11_MESSAGE, REQUIRES_ANDROID_11_CODE)
            return
        }
        val blobB64 = call.getString("blob")
        if (blobB64.isNullOrEmpty()) {
            call.reject("wrap requires a non-empty base64 'blob' argument", "M2D_MISSING_BLOB")
            return
        }
        // BiometricPrompt requires a FragmentActivity. Capacitor's activity
        // (Bridge.getActivity → BridgeActivity → AppCompatActivity extends
        // FragmentActivity) satisfies this at runtime, but stay honest with
        // an explicit null/type check — I4.
        val fragmentActivity = activity as? FragmentActivity ?: run {
            call.reject("Activity is not a FragmentActivity", "NO_CONTEXT")
            return
        }
        // Async — the biometric callback is what resolves/rejects. Without
        // setKeepAlive(true), the bridge releases the PluginCall as soon as
        // this method returns, and the eventual resolve/reject no-ops.
        call.setKeepAlive(true)
        try {
            service.wrap(fragmentActivity, blobB64) { result ->
                result.fold(
                    onSuccess = { b64 ->
                        val response = JSObject().apply { put("bundle", b64) }
                        call.resolve(response)
                    },
                    onFailure = { err ->
                        // Android PluginCall.reject signature is (message, code)
                        // — see the createWrappingKey note above (Codex 2026-07-17 P2-A).
                        if (err is EnclaveKeyService.WrapException) {
                            call.reject(err.message ?: err.code, err.code)
                        } else {
                            // Never leak plaintext or ciphertext in error text.
                            call.reject(
                                "wrap failed: ${err.javaClass.simpleName}",
                                EnclaveKeyService.WrapErrors.WRAP_FAILED,
                            )
                        }
                    },
                )
            }
        } catch (e: Exception) {
            // Guard against a synchronous throw from the setup path (shouldn't
            // happen — service.wrap catches its own init errors — but I4
            // defence-in-depth).
            call.reject("wrap failed: ${e.javaClass.simpleName}", EnclaveKeyService.WrapErrors.WRAP_FAILED)
        }
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
        // M2d-1b: delete the single AES-GCM wrapping key alias. Idempotent —
        // service is a no-op if the alias is not present. The M2d-1a
        // reserved wrap-only alias was dropped in M2d-1b (see EnclaveKeyService
        // header), so there is only one alias to remove.
        try {
            service.deleteWrappingKey()
            call.resolve()
        } catch (e: Exception) {
            call.reject("deleteWrappingKey failed: ${e.message}", "M2D_DELETE_FAILED")
        }
    }
}
