package com.veyrnox.app

// EnclaveKeyService.kt — AndroidKeyStore key-wrap helper for VeyrnoxEnclavePlugin (M2d).
//
// ┌─────────────────────────────────────────────────────────────────────────┐
// │ PROVISIONAL — NOT AUDITED-SECURE, NOT DEVICE-VERIFIED.                  │
// │ M2d-1b: real createWrappingKey() lands here — AES-GCM 256 in           │
// │ AndroidKeyStore with per-use BIOMETRIC_STRONG auth and                  │
// │ invalidate-on-biometric-enrollment. Still fail-closed at the plugin's   │
// │ M2D_ENABLED=false JS gate — this code does not execute in production    │
// │ until the physical-device runbook AND the independent audit sign off.   │
// │                                                                        │
// │ Not yet landed:                                                        │
// │   - wrap()   (M2d-1c: Cipher AES/GCM encrypt of vault DEK)             │
// │   - unwrap() (M2d-1d: BiometricPrompt(CryptoObject(cipher)) + decrypt) │
// │                                                                        │
// │ See docs/M2cd.native-acl-plan.md §5, docs/Feature-Status.md §F-2,      │
// │ docs/audit-triage/m2d-strongbox-device-test.md (STATUS: NOT RUN).      │
// └─────────────────────────────────────────────────────────────────────────┘
//
// Cipher choice — AES-GCM 256 single-key (documented tradeoff):
//   iOS's SE ECIES lets one asymmetric keypair expose "encrypt without prompt"
//   (public key) + "decrypt with prompt" (SE-held private key). Android has
//   no equivalent: RSA-OAEP asymmetric could give the same shape but its
//   StrongBox support is spotty across OEMs. AES-GCM is universally supported;
//   the tradeoff is that setUserAuthenticationRequired(true) binds BOTH
//   PURPOSE_ENCRYPT and PURPOSE_DECRYPT to the biometric prompt — every wrap
//   AND every unwrap will trigger BiometricPrompt in production.
//
// M2d-1a's reserved `wrapAlias` (com.veyrnox.app.enclaveWrapOnlyKey.v1) has
// been DROPPED. It was scaffold foresight for a two-key split (a no-auth wrap
// key + an auth-required unwrap key), which AndroidKeyStore cannot make work
// for symmetric AES-GCM: two independent aliases cannot decrypt each other's
// ciphertext, so the split has no security or UX benefit here. AES-GCM
// single-key is the settled design for M2d.
//
// Alias: EnclaveKeySpecConfig.KEY_ALIAS (com.veyrnox.app.enclaveWrappingKey.v1)
// is the single source of truth. `.v1` encodes the ACL policy stamp — any
// change to the KeyGenParameterSpec MUST bump the suffix.

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory

class EnclaveKeyService {

    data class Capability(
        // "strongBox" | "tee" | "software" | "none" | "unknown". Extended from
        // the M2d-1a scaffold's 3-value enum to accommodate M2d-1b's post-key
        // check (createWrappingKey's CreateResult.backing may read the real
        // KeyInfo securityLevel and legitimately report "software" when the
        // OS falls back — an emulator, a misconfigured device — I4 honesty:
        // never label a software-backed key "tee"). capability() itself is
        // still a PRE-key OS-feature probe and returns "strongBox" | "tee" |
        // "none"; the wider enum surfaces via CreateResult.backing.
        val backing: String,
        // BiometricManager.canAuthenticate(BIOMETRIC_STRONG) == SUCCESS.
        // Class 3 biometric only (matches HardwareKekPlugin H16 discipline).
        val biometryEnrolled: Boolean,
    )

    /**
     * Result of createWrappingKey. `created=true` if a fresh key was minted,
     * `false` if the versioned alias already existed (idempotent — never
     * silently re-keys; the alias itself is the ACL-policy proof, so if it
     * exists under `.v1` it was minted by THIS code with THIS ACL).
     * `securityLevel` / `securityLevelName` are read from the stored key's
     * real KeyInfo — never fabricated (I4).
     */
    data class CreateResult(
        val backing: String,
        val securityLevel: Int,
        val securityLevelName: String,
        val created: Boolean,
    )

    /**
     * Report OS-level capability WITHOUT touching AndroidKeyStore.
     *
     * StrongBox tier: PackageManager.FEATURE_STRONGBOX_KEYSTORE (added in API
     * 28). This is the OS's own claim — a StrongBox-backed key allocation may
     * still fail with StrongBoxUnavailableException at KeyGenerator.init()
     * time (handled by createWrappingKey's TEE fallback).
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

    /**
     * Create the single AES-GCM 256 wrapping key in AndroidKeyStore.
     *
     * Idempotent: if EnclaveKeySpecConfig.KEY_ALIAS already exists, this returns
     * the existing key's real tier (read from KeyInfo) with created=false, and
     * does NOT overwrite. The versioned alias is the ACL-policy proof — a key
     * under `.v1` was minted by this code with this spec. To rotate the ACL,
     * bump the alias suffix and delete the old key via deleteWrappingKey.
     * Mirrors iOS EnclaveKeyService.createWrappingKey idempotence and the
     * L3/M2c-P2-B "never silently re-key" pattern from HardwareKekPlugin.kt.
     *
     * StrongBox preference: first attempt sets setIsStrongBoxBacked(true); on
     * StrongBoxUnavailableException the second attempt omits it. The TIER
     * reported to the caller is read from the STORED KeyInfo, not from which
     * attempt succeeded — this is the truthful-reporting guarantee (I4).
     *
     * @throws IllegalStateException if key generation fails on both StrongBox
     *   and TEE attempts. Callers must translate to a plugin reject code.
     */
    fun createWrappingKey(context: Context): CreateResult {
        val ks = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
        if (ks.containsAlias(EnclaveKeySpecConfig.KEY_ALIAS)) {
            // Idempotent — return the existing tier without touching the key.
            // The alias itself proves the ACL policy; never silently re-key.
            val tier = readSecurityLevel(ks)
            return CreateResult(
                backing = backingFromLevel(tier.first),
                securityLevel = tier.first,
                securityLevelName = tier.second,
                created = false,
            )
        }
        // StrongBox-preferred; fall through to TEE on StrongBoxUnavailableException.
        val strongBoxOk = tryEnrollKey(useStrongBox = true)
        val enrolled = strongBoxOk || tryEnrollKey(useStrongBox = false)
        if (!enrolled) {
            throw IllegalStateException("Enclave key generation failed on both StrongBox and TEE attempts")
        }
        val tier = readSecurityLevel(ks)
        return CreateResult(
            backing = backingFromLevel(tier.first),
            securityLevel = tier.first,
            securityLevelName = tier.second,
            created = true,
        )
    }

    /**
     * Typed error codes for wrap() (mirrors iOS bridge shape). Callers at the
     * plugin layer translate `.code` into `PluginCall.reject(message, code)`.
     * I4: never fabricate a success — every terminal error surfaces here.
     */
    object WrapErrors {
        const val KEY_NOT_FOUND = "M2D_KEY_NOT_FOUND"
        const val KEY_INVALIDATED = "M2D_KEY_INVALIDATED"
        const val USER_CANCEL = "M2D_USER_CANCEL"
        const val BIOMETRY_LOCKOUT = "M2D_BIOMETRY_LOCKOUT"
        const val BIOMETRY_NOT_ENROLLED = "M2D_BIOMETRY_NOT_ENROLLED"
        const val AUTH_FAILED = "M2D_AUTH_FAILED"
        const val WRAP_FAILED = "M2D_WRAP_FAILED"
    }

    class WrapException(val code: String, message: String) : Exception(message)

    /**
     * wrap() — Present BiometricPrompt(CryptoObject(cipher)), then encrypt the
     * base64 plaintext blob under the stored AES-GCM 256 wrapping key.
     *
     * Wire format (base64-encoded end-to-end):
     *
     *     out = base64( IV (12 bytes) || cipher.doFinal(plaintext) )
     *
     * where cipher.doFinal returns ciphertext ‖ 16-byte GCM tag concatenated.
     * The IV is chosen by AndroidKeyStore's KeyGenerator inside Cipher.init —
     * we NEVER pass a caller-picked IV (a reused IV against a per-use-auth key
     * still catastrophically breaks GCM confidentiality + authenticity).
     *
     * Asynchronous by construction — BiometricPrompt fires callbacks on the
     * main thread. The caller MUST NOT resolve/reject its PluginCall
     * synchronously; wrap()'s callback delivers the terminal result via a
     * Kotlin Result<String>.
     *
     * Terminal callback outcomes:
     *   - Result.success(base64Bundle)     → happy path
     *   - Result.failure(WrapException):
     *       KEY_NOT_FOUND        alias not present (createWrappingKey first)
     *       KEY_INVALIDATED      KeyPermanentlyInvalidatedException — biometric
     *                            enrollment changed (the F-2 guarantee kicked
     *                            in); caller should re-enroll
     *       USER_CANCEL          BiometricPrompt ERROR_USER_CANCELED /
     *                            ERROR_NEGATIVE_BUTTON
     *       BIOMETRY_LOCKOUT     ERROR_LOCKOUT / ERROR_LOCKOUT_PERMANENT
     *       BIOMETRY_NOT_ENROLLED ERROR_NO_BIOMETRICS
     *       AUTH_FAILED          other BiometricPrompt errors
     *       WRAP_FAILED          generic (cipher init/doFinal exception)
     *
     * I3 note: this method knows nothing about deniability sessions. Any
     * I3 gating is the CALLER's responsibility (JS-side native.js); this
     * plugin is an OS-primitive wrapper.
     *
     * I4: onAuthenticationFailed (individual bad-finger/face) does NOT
     * produce a callback — BiometricPrompt keeps the sheet open for the OS's
     * standard retry UX; only terminal events (succeeded / error) surface.
     *
     * NEVER logs the plaintext, ciphertext, or key material — anywhere.
     *
     * @param activity   FragmentActivity for BiometricPrompt attachment
     * @param blobB64    base64-encoded plaintext blob (a vault DEK / blob)
     * @param callback   fires on the main thread with the terminal result
     */
    fun wrap(
        activity: FragmentActivity,
        blobB64: String,
        callback: (Result<String>) -> Unit,
    ) {
        val cipher: Cipher
        try {
            val ks = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
            val key = ks.getKey(EnclaveKeySpecConfig.KEY_ALIAS, null) as? SecretKey
                ?: return callback(
                    Result.failure(
                        WrapException(
                            WrapErrors.KEY_NOT_FOUND,
                            "Wrapping key not found; call createWrappingKey first",
                        )
                    )
                )
            cipher = Cipher.getInstance("AES/GCM/NoPadding")
            try {
                cipher.init(Cipher.ENCRYPT_MODE, key)
            } catch (e: KeyPermanentlyInvalidatedException) {
                return callback(
                    Result.failure(
                        WrapException(
                            WrapErrors.KEY_INVALIDATED,
                            "Wrapping key invalidated — biometric enrollment changed",
                        )
                    )
                )
            }
        } catch (e: Exception) {
            return callback(
                Result.failure(
                    WrapException(
                        WrapErrors.WRAP_FAILED,
                        "wrap init failed: ${e.javaClass.simpleName}",
                    )
                )
            )
        }

        val cryptoObject = BiometricPrompt.CryptoObject(cipher)
        val executor = ContextCompat.getMainExecutor(activity)

        val prompt = BiometricPrompt(
            activity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(
                    result: BiometricPrompt.AuthenticationResult,
                ) {
                    try {
                        val authedCipher = result.cryptoObject?.cipher
                            ?: return callback(
                                Result.failure(
                                    WrapException(
                                        WrapErrors.WRAP_FAILED,
                                        "BiometricPrompt returned no Cipher",
                                    )
                                )
                            )
                        // Decode plaintext base64 → bytes. NO_WRAP: match iOS bridge.
                        val plaintext = Base64.decode(blobB64, Base64.NO_WRAP)
                        try {
                            val ctWithTag = authedCipher.doFinal(plaintext)
                            val iv = authedCipher.iv
                            val bundle = EnclaveWireFormat.pack(iv, ctWithTag)
                            val b64 = Base64.encodeToString(bundle, Base64.NO_WRAP)
                            callback(Result.success(b64))
                        } finally {
                            // Best-effort scrub of the decoded plaintext buffer.
                            java.util.Arrays.fill(plaintext, 0.toByte())
                        }
                    } catch (e: Exception) {
                        callback(
                            Result.failure(
                                WrapException(
                                    WrapErrors.WRAP_FAILED,
                                    // No plaintext or ciphertext in message.
                                    "wrap finalise failed: ${e.javaClass.simpleName}",
                                )
                            )
                        )
                    }
                }

                override fun onAuthenticationError(
                    errorCode: Int,
                    errString: CharSequence,
                ) {
                    val code = when (errorCode) {
                        BiometricPrompt.ERROR_USER_CANCELED,
                        BiometricPrompt.ERROR_NEGATIVE_BUTTON,
                        BiometricPrompt.ERROR_CANCELED,
                        -> WrapErrors.USER_CANCEL
                        BiometricPrompt.ERROR_LOCKOUT,
                        BiometricPrompt.ERROR_LOCKOUT_PERMANENT,
                        -> WrapErrors.BIOMETRY_LOCKOUT
                        BiometricPrompt.ERROR_NO_BIOMETRICS,
                        -> WrapErrors.BIOMETRY_NOT_ENROLLED
                        else -> WrapErrors.AUTH_FAILED
                    }
                    callback(
                        Result.failure(
                            WrapException(code, "BiometricPrompt error $errorCode"),
                        )
                    )
                }

                override fun onAuthenticationFailed() {
                    // I4: individual bad-finger / bad-face attempts leave the
                    // prompt open (OS-standard retry UX). Only terminal events
                    // (succeeded / error) surface a result. Do NOT callback.
                }
            },
        )

        // Generic prompt text — no session/wallet identifier that could leak
        // deniability state. I3 gating is the caller's job (JS native.js),
        // but the strings we render must be indistinguishable across sessions.
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle("Confirm to save vault")
            .setSubtitle("Unlock the wallet key with your biometric to encrypt this vault.")
            .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
            .setNegativeButtonText("Cancel")
            .build()

        activity.runOnUiThread {
            prompt.authenticate(promptInfo, cryptoObject)
        }
    }

    /**
     * Delete the wrapping key from AndroidKeyStore. Idempotent — no-op if the
     * alias is not present. Called by VeyrnoxEnclavePlugin.deleteWrappingKey
     * behind the intent allowlist gate.
     */
    fun deleteWrappingKey() {
        val ks = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
        if (ks.containsAlias(EnclaveKeySpecConfig.KEY_ALIAS)) {
            ks.deleteEntry(EnclaveKeySpecConfig.KEY_ALIAS)
        }
    }

    /**
     * Build and store the AES-GCM 256 key. Returns true on success, false if
     * StrongBox was requested but unavailable (caller retries with useStrongBox
     * = false). Any other exception propagates.
     */
    private fun tryEnrollKey(useStrongBox: Boolean): Boolean {
        return try {
            val specBuilder = KeyGenParameterSpec.Builder(
                EnclaveKeySpecConfig.KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setKeySize(EnclaveKeySpecConfig.KEY_SIZE)
                .setBlockModes(EnclaveKeySpecConfig.BLOCK_MODE)
                .setEncryptionPaddings(EnclaveKeySpecConfig.PADDING)
                .setUserAuthenticationRequired(EnclaveKeySpecConfig.REQUIRES_USER_AUTH)
                .setInvalidatedByBiometricEnrollment(EnclaveKeySpecConfig.INVALIDATE_ON_BIOMETRIC_ENROLL)
                // H16: BIOMETRIC_STRONG only — no AUTH_DEVICE_CREDENTIAL fallback.
                // A PIN/pattern bypass degrades the possession factor to a knowledge factor.
                .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)

            if (useStrongBox && EnclaveKeySpecConfig.PREFER_STRONGBOX) {
                specBuilder.setIsStrongBoxBacked(true)
            }

            val keyGen = KeyGenerator.getInstance(
                EnclaveKeySpecConfig.ALGORITHM,
                "AndroidKeyStore",
            )
            keyGen.init(specBuilder.build())
            keyGen.generateKey()
            true
        } catch (e: StrongBoxUnavailableException) {
            false  // caller will retry without StrongBox
        }
    }

    /**
     * Read the stored key's real KeyInfo securityLevel. Returns (level, name).
     * On API < 31 (unreachable per MIN_API=30 gate but defensive) falls back
     * to isInsideSecureHardware. Never fabricates — reports what KeyInfo says.
     */
    private fun readSecurityLevel(ks: KeyStore): Pair<Int, String> {
        val key = ks.getKey(EnclaveKeySpecConfig.KEY_ALIAS, null) as? SecretKey
            ?: return Pair(-99, "NO_KEY")
        val factory = SecretKeyFactory.getInstance(key.algorithm, "AndroidKeyStore")
        val info = factory.getKeySpec(key, KeyInfo::class.java) as KeyInfo
        return if (Build.VERSION.SDK_INT >= 31) {
            val lvl = info.securityLevel
            Pair(lvl, securityLevelName(lvl))
        } else {
            @Suppress("DEPRECATION")
            val secure = info.isInsideSecureHardware
            Pair(if (secure) 1 else 0, if (secure) "SECURE_HARDWARE_PRE31" else "SOFTWARE")
        }
    }

    private fun securityLevelName(level: Int): String = when (level) {
        KeyProperties.SECURITY_LEVEL_STRONGBOX -> "STRONGBOX"
        KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "TRUSTED_ENVIRONMENT"
        KeyProperties.SECURITY_LEVEL_SOFTWARE -> "SOFTWARE"
        KeyProperties.SECURITY_LEVEL_UNKNOWN_SECURE -> "UNKNOWN_SECURE"
        KeyProperties.SECURITY_LEVEL_UNKNOWN -> "UNKNOWN"
        else -> "UNMAPPED_$level"
    }

    /**
     * Map a KeyInfo securityLevel to the JS-facing `backing` string. Used only
     * by createWrappingKey's return value — capability() has its own OS-feature
     * probe that runs before any key exists.
     *
     * I4 HONESTY: never label a software-backed key as "tee" — the two provide
     * fundamentally different guarantees (in-process bits vs isolated TEE
     * hardware). AndroidKeyStore CAN return a software-backed key on emulators
     * and some misconfigured devices; we honestly report that as "software".
     * Callers (JS-side) must decide whether "software" is acceptable for their
     * gate — this method's job is truthful labelling only.
     *
     * Pre-API 31, KeyInfo.securityLevel is not populated; readSecurityLevel()
     * falls back to isInsideSecureHardware and encodes true→1, false→0.
     */
    private fun backingFromLevel(level: Int): String = when (level) {
        KeyProperties.SECURITY_LEVEL_STRONGBOX -> "strongBox"       // = 2
        KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT -> "tee"   // = 1 (also the pre-31 isInsideSecureHardware==true encoding — see readSecurityLevel)
        KeyProperties.SECURITY_LEVEL_SOFTWARE -> "software"         // = 0 (also the pre-31 isInsideSecureHardware==false encoding)
        -99 -> "none"                                               // sentinel from readSecurityLevel when key absent
        else -> "unknown"                                           // never fabricate a hardware claim from an unmapped level
    }
    // Pre-31 note: readSecurityLevel encodes isInsideSecureHardware as 1/0 —
    // those values are IDENTICAL to KeyProperties.SECURITY_LEVEL_TRUSTED_ENVIRONMENT
    // (=1) and SECURITY_LEVEL_SOFTWARE (=0), so the two named branches above cover
    // both API 31+ and pre-31 encodings without duplicate `when` conditions
    // (Kotlin compile-fails on duplicate literal branch values — Codex 2026-07-17 P1).
    // The pre-31 secure-hardware bit CANNOT distinguish TEE from StrongBox, so it
    // conservatively lands on "tee" — never a fabricated "strongBox" claim (I4).
}
