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
    // Issue #2019 — fast-path DEK cache alias + pref keys. Separate
    // ciphertext/IV pair so a partial write cannot cross-contaminate the
    // legacy / unauth blobs.
    private val fastpathAlias = AndroidBiometricCacheConfig.FASTPATH_ALIAS
    private val dataFastpathKey = "ciphertext_fastpath_b64"
    private val ivFastpathKey = "iv_fastpath_b64"

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
        if (rejectIfBlockTier(ctx, call)) return
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
        if (rejectIfBlockTier(ctx, call)) return
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

    // ── Issue #2019 fast-path DEK cache methods ─────────────────────────
    //
    // These read/write a THIRD Keystore alias built with
    // setUserAuthenticationRequired(true) AND
    // setInvalidatedByBiometricEnrollment(true) — the STRONG form. Any
    // biometric enrollment change on the device wipes the key at the OS
    // level, so the next getFastpathDek() Cipher.init throws
    // KeyPermanentlyInvalidatedException → we clear state and the JS layer
    // falls through to the slow path.
    //
    // L-12 correction (2026-08-25): the paragraph this replaces asserted
    // the JS layer always fires a Veyrnox prompt immediately before calling
    // in here. It does not, and the real gate is different — read on.
    //
    // The alias is BIOMETRIC-REQUIRED with a 30-second validity window
    // (setUserAuthenticationParameters(30, AUTH_BIOMETRIC_STRONG), below),
    // so Cipher.init in encrypt/decrypt is satisfied by whatever
    // BIOMETRIC_STRONG authentication last occurred DEVICE-WIDE within the
    // last 30 s — the lockscreen fingerprint, an unrelated app — not
    // necessarily a prompt Veyrnox fired. Outside that window Cipher.init
    // throws UserNotAuthenticatedException, caught below and mapped to a
    // silent wrappedDek=null miss (JS falls through to the slow PIN path).
    //
    // Call ordering is also the reverse of what the old comment claimed:
    // getFastpathDek() (read/decrypt) is called from the JS layer BEFORE
    // it requests a hardware factor for this unlock attempt at all — see
    // native.js unlockBiometricOnly(), which reads the cache slot first so
    // an empty/miss slot surfaces without any biometric prompt. So on a
    // cold call there is nothing in THIS call chain that could have primed
    // the 30 s window; it either rides a recent device-wide auth or misses.
    // putFastpathDek() (write/encrypt) is the one call that reliably lands
    // inside the window — it runs from populateFastpathBestEffort() right
    // after a full slow-path unlock, using the H that unlock's own
    // getHardwareFactor() prompt just produced.
    //
    // No secret is disclosed by a stale-but-successful decrypt here: the
    // wrapped DEK is useless without H (KEK = HKDF(H ‖ C)), and the real
    // hardware-gated prompt still fires later in the JS flow for H itself.
    // The consequence is a hit-rate one, not a confidentiality one — see
    // docs/kek-fast-path-design.md for the tradeoff this buys and its
    // (unmeasured, statically-reasoned) cost.
    //
    // ponytail: 30 s validity window trades one class of freshness for less
    // Kotlin plumbing. Upgrade path is CryptoObject + per-use auth
    // (`setUserAuthenticationParameters(0, BIOMETRIC_STRONG)` +
    // BiometricPrompt.authenticate(promptInfo, CryptoObject(cipher))) if a
    // reviewer wants no window at all — pins the ceiling here so the
    // upgrade is explicit rather than accidental.

    @PluginMethod
    fun putFastpathDek(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("Plugin context unavailable", "NO_CONTEXT")
            return
        }
        if (!isSupported(ctx)) {
            call.reject("Android biometric cache requires Android 11+ with BIOMETRIC_STRONG enrolled", "ANDROID_BIOMETRIC_CACHE_UNSUPPORTED")
            return
        }
        val wrapped = call.getString("wrappedDek")
        if (wrapped.isNullOrEmpty()) {
            call.reject("wrappedDek is required", "ANDROID_BIOMETRIC_CACHE_SECRET_REQUIRED")
            return
        }
        try {
            ensureFastpathKey()
            val encoded = encryptSecretWith(fastpathAlias, wrapped)
            prefs(ctx).edit()
                .putString(dataFastpathKey, encoded.first)
                .putString(ivFastpathKey, encoded.second)
                .commit()
            call.resolve()
        } catch (_: KeyPermanentlyInvalidatedException) {
            // Biometric enrollment changed between ensureFastpathKey() and
            // the encrypt attempt — fail closed by clearing state; JS falls
            // through to the slow path and repopulates next unlock.
            clearFastpathState(ctx)
            call.reject("Fast-path key was invalidated by biometric change", "ANDROID_BIOMETRIC_CACHE_INVALIDATED")
        } catch (e: Exception) {
            call.reject("putFastpathDek failed: ${e.message}", "ANDROID_BIOMETRIC_CACHE_STORE_FAILED")
        }
    }

    @PluginMethod
    fun getFastpathDek(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("Plugin context unavailable", "NO_CONTEXT")
            return
        }
        if (rejectIfBlockTier(ctx, call)) return
        try {
            val p = prefs(ctx)
            val ctB64 = p.getString(dataFastpathKey, null)
            val ivB64 = p.getString(ivFastpathKey, null)
            if (ctB64.isNullOrEmpty() || ivB64.isNullOrEmpty()) {
                // No cache slot yet — silent miss, JS falls through to slow path.
                call.resolve(JSObject().put("wrappedDek", null))
                return
            }
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(
                Cipher.DECRYPT_MODE,
                loadSecretKey(fastpathAlias),
                GCMParameterSpec(128, Base64.decode(ivB64, Base64.NO_WRAP)),
            )
            val plaintext = cipher.doFinal(Base64.decode(ctB64, Base64.NO_WRAP))
            call.resolve(JSObject().put("wrappedDek", String(plaintext, StandardCharsets.UTF_8)))
        } catch (_: KeyPermanentlyInvalidatedException) {
            // Design mandate: on biometric enrollment change, clear + fall
            // through silently. No oracle.
            clearFastpathState(ctx)
            call.resolve(JSObject().put("wrappedDek", null))
        } catch (_: android.security.keystore.UserNotAuthenticatedException) {
            // Auth window expired between JS-side prompt and Cipher.init.
            // Treat as a silent miss; JS falls through to the slow path.
            call.resolve(JSObject().put("wrappedDek", null))
        } catch (e: Exception) {
            // Any other failure (tampered blob, missing alias, Keystore
            // transient) is treated as a miss — I4 fail-closed to the slow
            // path. Reject with a code the JS layer swallows.
            call.reject("getFastpathDek failed: ${e.message}", "ANDROID_BIOMETRIC_CACHE_READ_FAILED")
        }
    }

    @PluginMethod
    fun clearFastpathDek(call: PluginCall) {
        val ctx = context ?: run {
            call.reject("Plugin context unavailable", "NO_CONTEXT")
            return
        }
        try {
            clearFastpathState(ctx)
            call.resolve()
        } catch (e: Exception) {
            call.reject("clearFastpathDek failed: ${e.message}", "ANDROID_BIOMETRIC_CACHE_CLEAR_FAILED")
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

    private fun rejectIfBlockTier(ctx: Context, call: PluginCall): Boolean {
        if (!RaspIntegrityPlugin.isBlockTier(ctx)) return false
        call.reject("Device integrity check failed — biometric cache access refused (I4)", "RASP_BLOCK")
        return true
    }

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

    private fun ensureFastpathKey() {
        val ks = keyStore()
        if (ks.containsAlias(fastpathAlias)) return
        // Fast-path alias: BOTH biometric-required AND
        // invalidated-by-enrollment (STRONG form). Config constants pinned
        // by AndroidBiometricCacheConfigTest.T5.
        if (!tryGenerateFastpathKey(preferStrongBox = true)) {
            tryGenerateFastpathKey(preferStrongBox = false)
        }
    }

    private fun tryGenerateFastpathKey(preferStrongBox: Boolean): Boolean {
        return try {
            val builder = KeyGenParameterSpec.Builder(
                fastpathAlias,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
            )
                .setKeySize(AndroidBiometricCacheConfig.KEY_SIZE)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
            // MUST match REQUIRES_USER_AUTH_FASTPATH + INVALIDATE_ON_
            // BIOMETRIC_ENROLL_FASTPATH — JVM tripwire pins both to true.
            if (AndroidBiometricCacheConfig.REQUIRES_USER_AUTH_FASTPATH) {
                builder.setUserAuthenticationRequired(true)
            }
            if (AndroidBiometricCacheConfig.INVALIDATE_ON_BIOMETRIC_ENROLL_FASTPATH) {
                builder.setInvalidatedByBiometricEnrollment(true)
            }
            // 30-second validity window (BIOMETRIC_STRONG). See the
            // ponytail note above the fast-path methods for the CryptoObject
            // upgrade path if a reviewer wants per-use auth instead.
            builder.setUserAuthenticationParameters(30, KeyProperties.AUTH_BIOMETRIC_STRONG)
            if (preferStrongBox) builder.setIsStrongBoxBacked(true)
            val keyGen = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
            keyGen.init(builder.build())
            keyGen.generateKey()
            true
        } catch (_: StrongBoxUnavailableException) {
            false
        }
    }

    private fun clearFastpathState(ctx: Context) {
        prefs(ctx).edit()
            .remove(dataFastpathKey).remove(ivFastpathKey)
            .commit()
        deleteAliasIfPresent(fastpathAlias)
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
            // Issue #2019: panic-wipe / clearSecret must ALSO sweep the
            // fast-path pref keys and Keystore alias. I3 deniability + I4
            // fail-closed apply to all three alias pairs symmetrically.
            .remove(dataFastpathKey).remove(ivFastpathKey)
            .commit()
        deleteAliasIfPresent(storageAlias)
        deleteAliasIfPresent(invalidationAlias)
        deleteAliasIfPresent(storageUnauthAlias)
        deleteAliasIfPresent(fastpathAlias)
    }
}
