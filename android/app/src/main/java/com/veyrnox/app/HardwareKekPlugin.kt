package com.veyrnox.app

// UNAUDITED-PROVISIONAL: Native Android Keystore HMAC-SHA256
// STATUS: BUILT — awaiting independent third-party audit before mainnet promotion to VERIFIED.
//
// Security invariants:
//   I4 — NEVER fabricates H (fail honest, fail closed)
//   Key is invalidated if new biometric enrolled (setInvalidatedByBiometricEnrollment)
//   Per-use auth: every getHardwareFactor() call requires biometric
//   KeyPermanentlyInvalidatedException → clear key + explicit error (fail closed)
//
// H15: StrongBox preference — enroll() tries the dedicated security chip first;
//   falls back to TEE (or software AndroidKeyStore) if StrongBoxUnavailableException.
//   StrongBox is NOT enforced: setIsStrongBoxBacked(true) is best-effort and silently
//   falls back, so the key may land in the TEE or in software (AndroidKeyStore), with
//   no guarantee of StrongBox. Do NOT claim unqualified hardware backing or a guaranteed
//   StrongBox tier — the delivered guarantee is device-bound + AndroidKeyStore.
//   OBSERVABILITY (H15 partial): enroll() now reads the key's real KeyInfo.securityLevel
//   and both logs it (tag "HardwareKek") and returns it as { securityLevel, securityLevelName }.
//   This reports the TRUE tier (StrongBox / TEE / software) — it never fabricates a tier
//   (fail honest). ENFORCING StrongBox (rejecting non-StrongBox devices) remains TARGET.
//   Both tiers use AUTH_BIOMETRIC_STRONG only (H16: no DEVICE_CREDENTIAL fallback).
// H16: AUTH_DEVICE_CREDENTIAL removed. A PIN/pattern unlock bypasses biometric
//   binding and undermines the possession-factor guarantee. BIOMETRIC_STRONG only.

import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyInfo
import android.security.keystore.KeyProperties
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import android.util.Log
import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.Mac
import javax.crypto.SecretKey
import javax.crypto.SecretKeyFactory

@CapacitorPlugin(name = "HardwareKek")
class HardwareKekPlugin : Plugin() {

    // Key alias for the HMAC-SHA256 key in AndroidKeyStore
    private val KEY_ALIAS = "veyrnox_kek_hmac_v1"

    // PRF_EVAL_SALT — "Veyrnox-prf-v1-kek-eval-salt!!!!" as UTF-8 bytes (32 bytes).
    //
    // C-1 (CRITICAL): this is the LEGACY v1 MAC input — a GLOBAL FIXED constant, so
    // HMAC(key, PRF_EVAL_SALT) yielded an identical H for every vault on the same device.
    // v3 binds the MAC input to the per-enrollment kekSalt passed from JS (v2 was the
    // earlier, INERT stamp — its salt never crossed the bridge; see getHardwareFactor).
    // This constant is now ONLY the fallback for legacy v1 vaults enrolled before the fix;
    // it MUST NOT change (doing so bricks existing v1 wraps).
    private val PRF_EVAL_SALT = byteArrayOf(
        0x56,0x65,0x79,0x72,0x6e,0x6f,0x78,0x2d,
        0x70,0x72,0x66,0x2d,0x76,0x31,0x2d,0x6b,
        0x65,0x6b,0x2d,0x65,0x76,0x61,0x6c,0x2d,
        0x73,0x61,0x6c,0x74,0x21,0x21,0x21,0x21
    )

    /**
     * enroll() — Generate HMAC-SHA256 key in AndroidKeyStore.
     *
     * H15: Tries StrongBox (dedicated security chip) first; falls back to TEE if the
     *   device has no StrongBox. Both tiers are AndroidKeyStore-backed and satisfy the
     *   same key-invalidation and per-use-auth invariants.
     * H16: AUTH_DEVICE_CREDENTIAL removed — only AUTH_BIOMETRIC_STRONG is permitted.
     *   A PIN/pattern bypass would degrade the possession factor to a knowledge factor.
     *
     * No biometric prompt at generation time; getHardwareFactor() prompts per-use.
     * Key invalidated if new biometric enrolled (setInvalidatedByBiometricEnrollment).
     *
     * M4 (audit): the key spec uses setUserAuthenticationParameters(0, ...) — an API 30
     *   call — and setIsStrongBoxBacked (API 28). minSdk is 24, so on API 24-29 the spec
     *   build throws an opaque failure. We gate the whole enroll path on
     *   Build.VERSION.SDK_INT >= 30 and reject with a CLEAR machine code
     *   (KEK_REQUIRES_ANDROID_11) so the UI can say "Hardware KEK requires Android 11+".
     *   We do NOT weaken the auth strength to run on old APIs (fail honest, fail closed).
     * L3 (audit): generateKey() on the fixed KEY_ALIAS silently RE-KEYS an existing
     *   enrollment, permanently bricking the current kekWrap (H changes → old wrap is
     *   undecryptable). We refuse to overwrite: if KEY_ALIAS already exists, reject with
     *   KEK_ALREADY_ENROLLED so re-enroll is explicit (caller must clearCredential first).
     */
    @PluginMethod
    fun enroll(call: PluginCall) {
        // M4: the KEK enroll path requires API 30+ (setUserAuthenticationParameters is
        // API 30; setIsStrongBoxBacked is API 28 — the >= 30 gate covers both). minSdk is
        // 24, so gate here and reject pre-Android-11 with an honest, machine-coded error
        // rather than failing later with an opaque "enroll failed:" message. We do NOT
        // weaken the auth strength to run on old APIs (fail honest, fail closed).
        if (Build.VERSION.SDK_INT >= 30) {
            enrollApi30(call)
        } else {
            call.reject("Hardware KEK requires Android 11+ (API 30)", "KEK_REQUIRES_ANDROID_11")
        }
    }

    private fun enrollApi30(call: PluginCall) {
        try {
            // L3: never silently re-key. Refuse to overwrite an active enrollment (where
            // the vault kekWrap is present — guarded in JS before this is called). Stale
            // aliases survive app uninstall on Android; JS best-effort clearCredential()
            // may silently fail. If the alias exists here but the JS layer called enroll()
            // anyway (meaning the vault is bare), force-delete the stale key and proceed —
            // mirrors the iOS SE pre-clear (L4). This closes the reinstall+restore stuck loop.
            val existing = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
            if (existing.containsAlias(KEY_ALIAS)) {
                try {
                    existing.deleteEntry(KEY_ALIAS)
                } catch (e: Exception) {
                    call.reject("Cannot remove stale hardware key before re-enrollment: ${e.message}", "KEK_CLEAR_STALE_FAILED")
                    return
                }
            }
            // H15: prefer StrongBox; fall back to TEE on devices without it.
            val enrolled = tryEnrollKey(useStrongBox = true)
                || tryEnrollKey(useStrongBox = false)
            if (!enrolled) {
                call.reject("enroll failed: key generation returned false")
                return
            }
            // H15 observability: report the REAL security tier of the stored key.
            // Never fabricated — read straight from KeyInfo (fail honest).
            val tier = readSecurityLevel()
            Log.i(
                "HardwareKek",
                "enroll: key stored — tier=${tier.getString("securityLevelName")} " +
                    "(securityLevel=${tier.getInteger("securityLevel")})"
            )
            call.resolve(tier)
        } catch (e: Exception) {
            call.reject("enroll failed: ${e.message}")
        }
    }

    /**
     * readSecurityLevel() — Read the stored key's actual backing tier from KeyInfo.
     * Returns { securityLevel: Int, securityLevelName: String }.
     *
     * Reads key metadata only — no biometric prompt, no key use. Reports the TRUE tier
     * (StrongBox / TEE / software); on any failure returns an explicit error marker rather
     * than guessing a tier (I4 — fail honest, never fabricate a security claim).
     *
     * securityLevel values (KeyProperties, API 31+):
     *   2 = STRONGBOX, 1 = TRUSTED_ENVIRONMENT (TEE), 0 = SOFTWARE,
     *  -1 = UNKNOWN_SECURE, -2 = UNKNOWN. On API < 31 we fall back to
     *  isInsideSecureHardware() which only distinguishes secure-hw vs software.
     */
    private fun readSecurityLevel(): JSObject {
        val out = JSObject()
        return try {
            val ks = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
            val key = ks.getKey(KEY_ALIAS, null) as? SecretKey
                ?: return out.put("securityLevel", -99).put("securityLevelName", "NO_KEY")
            val factory = SecretKeyFactory.getInstance(key.algorithm, "AndroidKeyStore")
            val info = factory.getKeySpec(key, KeyInfo::class.java) as KeyInfo
            if (Build.VERSION.SDK_INT >= 31) {
                val lvl = info.securityLevel
                out.put("securityLevel", lvl)
                out.put("securityLevelName", securityLevelName(lvl))
            } else {
                @Suppress("DEPRECATION")
                val secure = info.isInsideSecureHardware
                out.put("securityLevel", if (secure) 1 else 0)
                out.put("securityLevelName", if (secure) "SECURE_HARDWARE_PRE31" else "SOFTWARE")
            }
            out
        } catch (e: Exception) {
            out.put("securityLevel", -98)
            out.put("securityLevelName", "PROBE_ERROR: ${e.message}")
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
     * Build and store the HMAC key spec. Returns true on success, false if StrongBox
     * is requested but unavailable (caller retries with useStrongBox = false).
     */
    private fun tryEnrollKey(useStrongBox: Boolean): Boolean {
        return try {
            // NOTE: setIsStrongBoxBacked(true) is only set on the first (useStrongBox)
            // attempt and is NOT enforced — on a StrongBoxUnavailableException we retry
            // with it unset, so the key may land in the TEE or in software. StrongBox
            // enforcement (and reporting the real backing tier) is TARGET — see audit H15.
            val specBuilder = KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_SIGN
            )
                .setDigests(KeyProperties.DIGEST_SHA256)
                .setUserAuthenticationRequired(true)
                .setInvalidatedByBiometricEnrollment(true)
                // H16: AUTH_BIOMETRIC_STRONG only — no DEVICE_CREDENTIAL fallback
                .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)

            if (useStrongBox) {
                specBuilder.setIsStrongBoxBacked(true)
            }

            val keyGen = KeyGenerator.getInstance(
                KeyProperties.KEY_ALGORITHM_HMAC_SHA256,
                "AndroidKeyStore"
            )
            keyGen.init(specBuilder.build())
            keyGen.generateKey()
            true
        } catch (e: StrongBoxUnavailableException) {
            false  // caller will retry without StrongBox
        }
    }

    /**
     * isEnrolled() — Check whether KEY_ALIAS exists in AndroidKeyStore.
     * Returns { enrolled: boolean }.
     */
    @PluginMethod
    fun isEnrolled(call: PluginCall) {
        try {
            val ks = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
            val enrolled = ks.containsAlias(KEY_ALIAS)
            call.resolve(JSObject().put("enrolled", enrolled))
        } catch (e: Exception) {
            call.reject("isEnrolled failed: ${e.message}")
        }
    }

    /**
     * clearCredential() — Delete KEY_ALIAS from AndroidKeyStore if present.
     */
    @PluginMethod
    fun clearCredential(call: PluginCall) {
        try {
            val ks = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
            if (ks.containsAlias(KEY_ALIAS)) {
                ks.deleteEntry(KEY_ALIAS)
            }
            call.resolve()
        } catch (e: Exception) {
            call.reject("clearCredential failed: ${e.message}")
        }
    }

    /**
     * getHardwareFactor() — Present BiometricPrompt, compute HMAC-SHA256(key, MAC_INPUT),
     * return base64(result) as { h: string }.
     *
     * C-1 (v3 protocol): MAC_INPUT is the per-enrollment kekSalt when the JS call supplies
     * it (base64 "kekSalt" argument), so each vault derives a UNIQUE H. When "kekSalt" is
     * absent (legacy v1 vaults, and the earlier INERT v2 stamp) we fall back to the global
     * PRF_EVAL_SALT for backwards compatibility with vaults enrolled before this fix. A
     * present-but-empty kekSalt is rejected (fail closed) rather than silently reverting to
     * the fixed salt.
     *
     * LABEL NOTE: the debug log below emits "salt-source: v2-bound" / "v1-fixed". These are
     * LEGACY BRANCH labels, NOT the vault's hardwareKekVersion stamp — "v2-bound" means "a
     * per-enrollment kekSalt was supplied and used" (the genuine binding: a v3 vault, or a
     * changePassword re-wrap), and "v1-fixed" means "no salt supplied, fixed PRF_EVAL_SALT"
     * (v1/v2 vaults). The strings are kept verbatim because the on-device runbooks
     * (docs/runbook-android-kek-residuals.md) attest on them. See
     * docs/audit-triage/independent-audit-2026-07-06-android-kek-suite.md (F2.1/F2.2).
     *
     * NEVER fabricates H (I4 — fail honest, fail closed).
     * Per-use auth: every call requires biometric.
     * KeyPermanentlyInvalidatedException → clear key + reject (fail closed).
     */
    @PluginMethod
    fun getHardwareFactor(call: PluginCall) {
        try {
            // C-1: resolve the MAC input. Present kekSalt → v2 per-enrollment binding;
            // absent → v1 fallback to the fixed PRF_EVAL_SALT. A supplied-but-empty
            // kekSalt is a caller error — reject rather than fall back (fail closed).
            //
            // C-1 regression guard (2026-07-05): getString("kekSalt") returns null BOTH
            // when the key is absent AND when it is present-but-not-a-string (e.g. a JS
            // Uint8Array serialised by the bridge to {"0":86,…}). We MUST distinguish
            // those: a present-but-malformed kekSalt must FAIL CLOSED, never silently fall
            // back to the fixed salt (that fallback is what made the v2 binding inert). Use
            // the raw call data to detect presence, then require a real string value.
            val hasKekSalt = call.data.has("kekSalt")
            val kekSaltB64 = call.getString("kekSalt")
            if (hasKekSalt && kekSaltB64 == null) {
                // Key was supplied but is not a string (wrong type across the bridge) —
                // reject with a clear code rather than degrading to the fixed-salt path.
                return call.reject("KEK_SALT_MALFORMED: kekSalt must be a base64 string")
            }
            val macInput: ByteArray = if (kekSaltB64 != null) {
                // C-1 hardening (2026-07-07): Android's Base64.decode(NO_WRAP) silently
                // skips invalid characters instead of throwing, so "!!notb64" decodes to
                // a (wrong) byte array rather than failing. Validate the string contains
                // only legal base64 chars BEFORE decoding — reject anything else.
                if (!kekSaltB64.matches(Regex("^[A-Za-z0-9+/]+=*$"))) {
                    return call.reject("Invalid kekSalt encoding — not valid base64")
                }
                val decoded = try {
                    Base64.decode(kekSaltB64, Base64.NO_WRAP)
                } catch (e: Exception) {
                    return call.reject("Invalid kekSalt encoding")
                }
                if (decoded.isEmpty()) {
                    return call.reject("Empty kekSalt — refusing to fall back to fixed salt")
                }
                decoded
            } else {
                PRF_EVAL_SALT
            }
            // Evidence tooling for device re-verification (C-1): log WHICH salt branch was
            // taken so a logcat trace can prove v2-bound vs v1-fixed at unlock time. Debug
            // builds only, and NEVER logs the salt or H bytes — only the branch label.
            if (BuildConfig.DEBUG) {
                Log.d(
                    "HardwareKek",
                    "salt-source: ${if (kekSaltB64 != null) "v2-bound" else "v1-fixed"}"
                )
            }

            val ks = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
            val key = ks.getKey(KEY_ALIAS, null)
                ?: return call.reject("No hardware key enrolled — call enroll() first")

            val mac = Mac.getInstance("HmacSHA256")

            // Catch KeyPermanentlyInvalidatedException: clear the key and reject (fail closed)
            try {
                mac.init(key)
            } catch (e: KeyPermanentlyInvalidatedException) {
                // Clear the invalidated key so caller can re-enroll
                try {
                    val ks2 = KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }
                    if (ks2.containsAlias(KEY_ALIAS)) ks2.deleteEntry(KEY_ALIAS)
                } catch (ignored: Exception) { /* best-effort cleanup */ }
                // STABLE machine-code prefix (contract with hardware.js getHardwareFactor's
                // catch): the JS layer matches on "KEK_KEY_PERMANENTLY_INVALIDATED" and maps
                // it to KEK_ERR.KEY_PERMANENTLY_INVALIDATED, which WalletEntry exempts from
                // the wrong-PIN wipe counter and routes to seed recovery. Never a bare prose
                // string — that fell through to the counter → irreversible wipe (data loss).
                return call.reject("KEK_KEY_PERMANENTLY_INVALIDATED: Hardware key invalidated — biometric enrollment changed")
            }

            val cryptoObject = BiometricPrompt.CryptoObject(mac)

            val activity = activity as? FragmentActivity
                ?: return call.reject("Activity is not a FragmentActivity")

            val executor = ContextCompat.getMainExecutor(context)

            val prompt = BiometricPrompt(activity, executor, object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    try {
                        val authenticatedMac = result.cryptoObject?.mac
                            ?: return call.reject("BiometricPrompt returned no Mac object")
                        val hmacResult = authenticatedMac.doFinal(macInput)
                        val b64 = Base64.encodeToString(hmacResult, Base64.NO_WRAP)
                        call.resolve(JSObject().put("h", b64))
                    } catch (e: Exception) {
                        call.reject("HMAC computation failed: ${e.message}")
                    }
                }

                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    if (errorCode == BiometricPrompt.ERROR_USER_CANCELED ||
                        errorCode == BiometricPrompt.ERROR_NEGATIVE_BUTTON) {
                        call.reject("User cancelled")
                    } else {
                        // Prefixed so the JS layer classifies it (non-permanent hardware
                        // error → KEK_ERR.NO_HARDWARE_FACTOR, also exempt from the wrong-PIN
                        // counter). Never a bare prose string.
                        call.reject("KEK_BIOMETRIC_ERROR:${errorCode}: ${errString}")
                    }
                }

                override fun onAuthenticationFailed() {
                    // Do NOT call resolve/reject here — the prompt remains open
                    // allowing the user to retry biometric. Only terminal events
                    // (succeeded / error) produce a result.
                }
            })

            // H16: BIOMETRIC_STRONG only — DEVICE_CREDENTIAL removed.
            // setNegativeButtonText is required when DEVICE_CREDENTIAL is not set.
            val promptInfo = BiometricPrompt.PromptInfo.Builder()
                .setTitle("Veyrnox — Unlock Wallet")
                .setSubtitle("Authenticate to access your wallet")
                .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_STRONG)
                .setNegativeButtonText("Cancel")
                .build()

            // Must authenticate on the UI thread
            activity.runOnUiThread {
                prompt.authenticate(promptInfo, cryptoObject)
            }

        } catch (e: Exception) {
            call.reject("getHardwareFactor failed: ${e.message}")
        }
    }
}
