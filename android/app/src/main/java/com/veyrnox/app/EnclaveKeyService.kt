package com.veyrnox.app

// EnclaveKeyService.kt — AndroidKeyStore key-wrap helper for VeyrnoxEnclavePlugin (M2d).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ PROVISIONAL — NOT AUDITED-SECURE, NOT DEVICE-VERIFIED.                  │
// │ M2d-1a scaffold — capability probe only. Key material lifecycle         │
// │ (create / wrap / unwrap / delete) lands in M2d-1b through M2d-1e.       │
// │ Until then the plugin fails closed at the M2D_ENABLED=false JS gate,    │
// │ mirroring M2C_ENABLED on iOS. See docs/M2cd.native-acl-plan.md §5.      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Scope of this file today: reports capability so callers (native.js) can
// decide whether the hardware path is even reachable on this device — no
// AndroidKeyStore write, no biometric prompt, no key touched.
//
// Follows the same versioned-tag discipline as iOS EnclaveKeyService.swift
// (P2-B, PR #1098): the .v1 suffix encodes the ACL policy this codepath will
// mint keys under once M2d-1b lands. Any change to the KeyGenParameterSpec
// (ACL flags, cipher, key size) MUST bump the alias suffix.

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.biometric.BiometricManager

class EnclaveKeyService {

    // Alias reserved for the future unwrap key (per-use biometric-gated,
    // StrongBox-preferred). NOT created in M2d-1a — landing in M2d-1b.
    // Kept private to this file so the alias is the single source of truth.
    @Suppress("unused")
    private val unwrapAlias = "com.veyrnox.app.enclaveWrappingKey.v1"

    // Alias reserved for the future wrap-only key (no auth-required). Split
    // from unwrapAlias because AES-GCM cannot expose the "encrypt without
    // prompt / decrypt with prompt" property that iOS gets from ECIES on a
    // single asymmetric key. NOT created in M2d-1a.
    @Suppress("unused")
    private val wrapAlias = "com.veyrnox.app.enclaveWrapOnlyKey.v1"

    data class Capability(
        // "strongBox" | "tee" | "none". Mirrors iOS "secureEnclave" | "none",
        // extended for Android's two hardware tiers. Reported truthfully — no
        // synthetic "strongBox" claim on a device without one (I4).
        val backing: String,
        // BiometricManager.canAuthenticate(BIOMETRIC_STRONG) == SUCCESS.
        // Class 3 biometric only (matches HardwareKekPlugin H16 discipline).
        val biometryEnrolled: Boolean,
    )

    /**
     * Report OS-level capability WITHOUT touching AndroidKeyStore.
     *
     * StrongBox tier: PackageManager.FEATURE_STRONGBOX_KEYSTORE (added in API
     * 28). This is the OS's own claim — a StrongBox-backed key allocation may
     * still fail with StrongBoxUnavailableException at KeyGenerator.init()
     * time (that fall-through will be handled by M2d-1b's createWrappingKey).
     * TEE tier: AndroidKeyStore is API 23+ and is TEE-backed on virtually
     * every real device; we report "tee" for API 23+ without a StrongBox
     * feature declaration. On API <23 (unreachable today, minSdk 24) we
     * report "none".
     */
    fun capability(context: Context): Capability {
        val hasStrongBox = Build.VERSION.SDK_INT >= Build.VERSION_CODES.P &&
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
        val backing = when {
            hasStrongBox -> "strongBox"
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.M -> "tee"
            else -> "none"
        }
        val biometricManager = BiometricManager.from(context)
        val biometryEnrolled = biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        ) == BiometricManager.BIOMETRIC_SUCCESS
        return Capability(backing = backing, biometryEnrolled = biometryEnrolled)
    }
}
