package com.veyrnox.app

import android.content.Context
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyPermanentlyInvalidatedException
import android.security.keystore.KeyProperties
import android.security.keystore.StrongBoxUnavailableException
import android.util.Base64
import androidx.biometric.BiometricManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.nio.charset.StandardCharsets
import java.security.InvalidKeyException
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

@CapacitorPlugin(name = "AndroidBiometricCache")
class AndroidBiometricCachePlugin : Plugin() {

    private val prefsName = "veyrnox_android_biometric_cache"
    private val dataKey = "ciphertext_b64"
    private val ivKey = "iv_b64"
    // Issue #2037 — separate pref keys for the unauth alias so a partial
    // write / migration state cannot cross-contaminate the legacy blob. The
    // pair is (dataUnauthKey, ivUnauthKey), read/written only by the
    // *Unauth() plugin methods.
    private val dataUnauthKey = "ciphertext_unauth_b64"
    private val ivUnauthKey = "iv_unauth_b64"
    private val storageAlias = AndroidBiometricCacheConfig.STORAGE_ALIAS
    private val invalidationAlias = AndroidBiometricCacheConfig.INVALIDATION_ALIAS
    private val storageUnauthAlias = AndroidBiometricCacheConfig.STORAGE_UNAUTH_ALIAS

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("Plugin context unavailable", "NO_CONTEXT")
            return
        }
        val available = Build.VERSION.SDK_INT >= 30 && hasStrongBiometry(ctx)
        call.resolve(JSObject().apply {
            put("available", available)
            put("sdkInt", Build.VERSION.SDK_INT)
        })
    }

    @PluginMethod
    fun putSecret(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("Plugin context unavailable", "NO_CONTEXT")
            return
        }
        if (!isSupported(ctx)) {
            call.reject("Android biometric cache requires Android 11+ with BIOMETRIC_STRONG enrolled", "ANDROID_BIOMETRIC_CACHE_UNSUPPORTED")
            return
        }
        val secret = call.getString("secret")
        if (secret.isNullOrEmpty()) {
            call.reject("Secret is required", "ANDROID_BIOMETRIC_CACHE_SECRET_REQUIRED")
            return
        }
        try {
            ensureStorageKey()
            ensureInvalidationKey()
            val encoded = encryptSecret(secret)
            prefs(ctx).edit()
                .putString(dataKey, encoded.first)
                .putString(ivKey, encoded.second)
                .commit()
            call.resolve()
        } catch (e: Exception) {
            call.reject("putSecret failed: ${e.message}", "ANDROID_BIOMETRIC_CACHE_STORE_FAILED")
        }
    }

    @PluginMethod
    fun getSecret(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("Plugin context unavailable", "NO_CONTEXT")
            return
        }
        try {
            if (!isCacheStructurallyPresent(ctx)) {
                call.resolve(JSObject().put("secret", null))
                return
            }
            if (!isInvalidationKeyStillValid()) {
                clearAllState(ctx)
                call.resolve(JSObject().put("secret", null))
                return
            }
            val secret = decryptSecret(ctx)
            call.resolve(JSObject().put("secret", secret))
        } catch (e: Exception) {
            call.reject("getSecret failed: ${e.message}", "ANDROID_BIOMETRIC_CACHE_READ_FAILED")
        }
    }

    @PluginMethod
    fun hasSecret(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("Plugin context unavailable", "NO_CONTEXT")
            return
        }
        try {
            if (!isCacheStructurallyPresent(ctx)) {
                call.resolve(JSObject().put("present", false))
                return
            }
            if (!isInvalidationKeyStillValid()) {
                clearAllState(ctx)
                call.resolve(JSObject().put("present", false))
                return
            }
            call.resolve(JSObject().put("present", true))
        } catch (e: Exception) {
            call.reject("hasSecret failed: ${e.message}", "ANDROID_BIOMETRIC_CACHE_HAS_FAILED")
        }
    }

    // ── Issue #2037 unauth-alias methods ─────────────────────────────────
    //
    // These read/write a SEPARATE Keystore alias built WITHOUT
    // setUserAuthenticationRequired(true), and never touch the invalidation
    // sentinel. Consumed ONLY by retrieveUnlockSecretDirect({ kekEnrolled:
    // true }) in the JS layer — on a KEK vault the cached C alone is useless
    // (DEK = HKDF(H ‖ C), H requires the StrongBox gate inside
    // getHardwareFactor), so this path collapses the redundant second OS
    // biometric prompt without downgrading anything the KEK contract holds.
    //
    // The auth-required flag is pinned by AndroidBiometricCacheConfigTest —
    // a future edit that flips REQUIRES_USER_AUTH_UNAUTH to true trips the
    // JVM test and blocks the PR.

    @PluginMethod
    fun putSecretUnauth(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("Plugin context unavailable", "NO_CONTEXT")
            return
        }
        if (!isSupported(ctx)) {
            call.reject("Android biometric cache requires Android 11+ with BIOMETRIC_STRONG enrolled", "ANDROID_BIOMETRIC_CACHE_UNSUPPORTED")
            return
        }
        val secret = call.getString("secret")
        if (secret.isNullOrEmpty()) {
            call.reject("Secret is required", "ANDROID_BIOMETRIC_CACHE_SECRET_REQUIRED")
            return
        }
        try {
            ensureUnauthStorageKey()
            val encoded = encryptSecretWith(storageUnauthAlias, secret)
            prefs(ctx).edit()
                .putString(dataUnauthKey, encoded.first)
                .putString(ivUnauthKey, encoded.second)
                .commit()
            call.resolve()
        } catch (e: Exception) {
            call.reject("putSecretUnauth failed: ${e.message}", "ANDROID_BIOMETRIC_CACHE_STORE_FAILED")
        }
    }

    @PluginMethod
    fun getSecretUnauth(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("Plugin context unavailable", "NO_CONTEXT")
            return
        }
        try {
            val p = prefs(ctx)
            val ctB64 = p.getString(dataUnauthKey, null)
            val ivB64 = p.getString(ivUnauthKey, null)
            if (ctB64.isNullOrEmpty() || ivB64.isNullOrEmpty()) {
                // Fresh install / pre-#2037 vault. JS layer falls through to
                // the auth-gated legacy read for migration; never synthesize
                // a null password path.
                call.resolve(JSObject().put("secret", null))
                return
            }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                loadSecretKey(storageUnauthAlias),
                GCMParameterSpec(128, Base64.decode(ivB64, Base64.NO_WRAP)),
            )
            val plaintext = cipher.doFinal(Base64.decode(ctB64, Base64.NO_WRAP))
            call.resolve(JSObject().put("secret", String(plaintext, StandardCharsets.UTF_8)))
        } catch (e: Exception) {
            call.reject("getSecretUnauth failed: ${e.message}", "ANDROID_BIOMETRIC_CACHE_READ_FAILED")
        }
    }

    @PluginMethod
    fun clearSecret(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("Plugin context unavailable", "NO_CONTEXT")
            return
        }
        try {
            clearAllState(ctx)
            call.resolve()
        } catch (e: Exception) {
            call.reject("clearSecret failed: ${e.message}", "ANDROID_BIOMETRIC_CACHE_CLEAR_FAILED")
        }
    }

    private fun prefs(ctx: Context) =
        ctx.getSharedPreferences(prefsName, Context.MODE_PRIVATE)

    private fun hasStrongBiometry(ctx: Context): Boolean {
        val biometricManager = BiometricManager.from(ctx)
        return biometricManager.canAuthenticate(
            BiometricManager.Authenticators.BIOMETRIC_STRONG
        ) == BiometricManager.BIOMETRIC_SUCCESS
    }

    private fun isSupported(ctx: Context): Boolean =
        Build.VERSION.SDK_INT >= 30 && hasStrongBiometry(ctx)

    private fun isCacheStructurallyPresent(ctx: Context): Boolean {
        val p = prefs(ctx)
        return !p.getString(dataKey, null).isNullOrEmpty() && !p.getString(ivKey, null).isNullOrEmpty()
    }

    private fun keyStore(): KeyStore =
        KeyStore.getInstance("AndroidKeyStore").also { it.load(null) }

    private fun deleteAliasIfPresent(alias: String) {
        val ks = keyStore()
        if (ks.containsAlias(alias)) ks.deleteEntry(alias)
    }

    private fun ensureStorageKey() {
        val ks = keyStore()
        if (ks.containsAlias(storageAlias)) return
        if (!tryGenerateKey(storageAlias, requiresAuth = false, preferStrongBox = true)) {
            tryGenerateKey(storageAlias, requiresAuth = false, preferStrongBox = false)
        }
    }

    private fun ensureUnauthStorageKey() {
        val ks = keyStore()
        if (ks.containsAlias(storageUnauthAlias)) return
        // Same shape as the legacy storage key: AES-GCM 256, StrongBox
        // preferred, but crucially requiresAuth = false — pinned by
        // AndroidBiometricCacheConfig.REQUIRES_USER_AUTH_UNAUTH which the
        // JVM tripwire asserts is false.
        val requiresAuth = AndroidBiometricCacheConfig.REQUIRES_USER_AUTH_UNAUTH
        if (!tryGenerateKey(storageUnauthAlias, requiresAuth = requiresAuth, preferStrongBox = true)) {
            tryGenerateKey(storageUnauthAlias, requiresAuth = requiresAuth, preferStrongBox = false)
        }
    }

    private fun ensureInvalidationKey() {
        val ks = keyStore()
        if (ks.containsAlias(invalidationAlias)) return
        if (!tryGenerateKey(invalidationAlias, requiresAuth = true, preferStrongBox = true)) {
            tryGenerateKey(invalidationAlias, requiresAuth = true, preferStrongBox = false)
        }
    }

    private fun tryGenerateKey(alias: String, requiresAuth: Boolean, preferStrongBox: Boolean): Boolean {
        return try {
            val builder = KeyGenParameterSpec.Builder(
                alias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setKeySize(256)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            if (requiresAuth) {
                builder
                    .setUserAuthenticationRequired(true)
                    .setInvalidatedByBiometricEnrollment(true)
                    .setUserAuthenticationParameters(0, KeyProperties.AUTH_BIOMETRIC_STRONG)
            }
            if (preferStrongBox) builder.setIsStrongBoxBacked(true)
            val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            keyGen.init(builder.build())
            keyGen.generateKey()
            true
        } catch (e: StrongBoxUnavailableException) {
            false
        }
    }

    private fun loadSecretKey(alias: String): SecretKey {
        val ks = keyStore()
        return ks.getKey(alias, null) as? SecretKey
            ?: throw IllegalStateException("Missing key for alias $alias")
    }

    private fun encryptSecret(secret: String): Pair<String, String> =
        encryptSecretWith(storageAlias, secret)

    private fun encryptSecretWith(alias: String, secret: String): Pair<String, String> {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, loadSecretKey(alias))
        val ciphertext = cipher.doFinal(secret.toByteArray(StandardCharsets.UTF_8))
        val iv = cipher.iv ?: throw IllegalStateException("Cipher returned no IV")
        return Pair(
            Base64.encodeToString(ciphertext, Base64.NO_WRAP),
            Base64.encodeToString(iv, Base64.NO_WRAP),
        )
    }

    private fun decryptSecret(ctx: Context): String? {
        val p = prefs(ctx)
        val ctB64 = p.getString(dataKey, null) ?: return null
        val ivB64 = p.getString(ivKey, null) ?: return null
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(
            Cipher.DECRYPT_MODE,
            loadSecretKey(storageAlias),
            GCMParameterSpec(128, Base64.decode(ivB64, Base64.NO_WRAP)),
        )
        val plaintext = cipher.doFinal(Base64.decode(ctB64, Base64.NO_WRAP))
        return String(plaintext, StandardCharsets.UTF_8)
    }

    private fun isInvalidationKeyStillValid(): Boolean {
        return try {
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE, loadSecretKey(invalidationAlias))
            true
        } catch (_: KeyPermanentlyInvalidatedException) {
            false
        } catch (_: android.security.keystore.UserNotAuthenticatedException) {
            true
        } catch (_: InvalidKeyException) {
            false
        } catch (_: Exception) {
            false
        }
    }

    private fun clearAllState(ctx: Context) {
        // Panic-wipe / disable / reset must sweep BOTH alias pairs so no
        // ciphertext or Keystore key material survives on either path.
        // I3 deniability + I4 fail-closed apply symmetrically.
        prefs(ctx).edit()
            .remove(dataKey).remove(ivKey)
            .remove(dataUnauthKey).remove(ivUnauthKey)
            .commit()
        deleteAliasIfPresent(storageAlias)
        deleteAliasIfPresent(invalidationAlias)
        deleteAliasIfPresent(storageUnauthAlias)
    }
}
