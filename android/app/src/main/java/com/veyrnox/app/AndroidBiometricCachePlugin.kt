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
    // HardwareKekPlugin.KEY_ALIAS — see hardwareKekPresent() for why it is copied.
    private val HARDWARE_KEK_ALIAS = "veyrnox_kek_hmac_v1"
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
        // L-13 (audit 2026-09-07): gate WRITES on block tier too, not just reads.
        // The three get* methods already do this; the three put* methods did not,
        // so on a hooked/tampered runtime the plugin would still persist a secret
        // to a Keystore alias. Low severity by itself — an attacker on a BLOCK-tier
        // runtime already holds the plaintext being cached, and the JS populate
        // path fail-closes on non-ALLOW before reaching here — but a read/write
        // asymmetry is exactly what a later refactor mis-reads as "writes are safe
        // by design", so the two halves are made symmetric.
        if (rejectIfBlockTier(ctx, call)) return
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
        // L-13 (audit 2026-09-07): gate WRITES on block tier too, not just reads.
        // The three get* methods already do this; the three put* methods did not,
        // so on a hooked/tampered runtime the plugin would still persist a secret
        // to a Keystore alias. Low severity by itself — an attacker on a BLOCK-tier
        // runtime already holds the plaintext being cached, and the JS populate
        // path fail-closes on non-ALLOW before reaching here — but a read/write
        // asymmetry is exactly what a later refactor mis-reads as "writes are safe
        // by design", so the two halves are made symmetric.
        if (rejectIfBlockTier(ctx, call)) return
        // M-6 (audit 2026-09-07): do not CREATE an unauth entry unless the
        // hardware KEK exists. Without it the cached PIN is not a C-factor, it is
        // the vault password, and this alias is read with no biometric prompt.
        // Enforced on the write as well as the read because the JS migration
        // fallback re-persists here immediately after a null read
        // (biometricUnlock.js nativeReadSecretUnauth) — a read-only guard would
        // be undone on the very next unlock.
        if (!hardwareKekPresent()) {
            call.reject(
                "Refusing to cache an unauth secret with no hardware KEK enrolled",
                "ANDROID_BIOMETRIC_CACHE_NO_KEK",
            )
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
        // M-6 (audit 2026-09-07): the KEK is the whole justification for reading
        // this alias without a biometric prompt. If the hardware key is gone the
        // invariant is gone with it, so purge the entry and report a miss rather
        // than release it. A miss is the SAFE outcome, not a degradation: the JS
        // layer falls through to the auth-gated legacy read (biometricUnlock.js),
        // which is biometric-gated. Resolving null rather than rejecting keeps
        // that fall-through on its existing, tested path.
        if (!hardwareKekPresent()) {
            try {
                prefs(ctx).edit().remove(dataUnauthKey).remove(ivUnauthKey).commit()
                deleteAliasIfPresent(storageUnauthAlias)
            } catch (_: Exception) { /* best-effort purge; the miss below is the gate */ }
            call.resolve(JSObject().put("secret", null))
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
            // L-11 (audit 2026-09-07): scrub the decrypted buffer, matching
            // HardwareKekPlugin.kt's treatment of the H buffer. The String copy
            // below is immutable and cannot be wiped — that residual is
            // architectural — but the ByteArray can be, so it is.
            try {
                call.resolve(JSObject().put("secret", String(plaintext, StandardCharsets.UTF_8)))
            } finally {
                java.util.Arrays.fill(plaintext, 0)
            }
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
    // WHAT THIS SLOT HOLDS — corrected 2026-09-07 (audit M-5). Read this before
    // reasoning about the fast path; the paragraph it replaces was describing an
    // architecture the code had already left behind.
    //
    // It used to say: "No secret is disclosed by a stale-but-successful decrypt
    // here: the wrapped DEK is useless without H (KEK = HKDF(H ‖ C)), and the
    // real hardware-gated prompt still fires later in the JS flow for H itself.
    // The consequence is a hit-rate one, not a confidentiality one."
    //
    // Every clause of that is now false. The 2026-08-28 silent-fastpath refactor
    // removed the wrapped-DEK envelope: populateFastpathBestEffort stores the RAW
    // DEK as base64 (native.js — `btoa` of the 32 bytes), and unlockBiometricOnly
    // decodes it straight back and calls decryptVaultWithDek with NO combineKek,
    // NO H and NO C. `deriveFastpathKek`/`wrapForFastpath` still exist in
    // fastpathDekCache.js but are explicitly OFF the hot path.
    //
    // So a stale-but-successful decrypt here yields a key that opens the real
    // vault outright, with no PIN and no H. The consequence IS a confidentiality
    // one. The field name `wrappedDek` is historical and is kept only because
    // renaming it would churn the JS bridge; it is not wrapped.
    //
    // What actually bounds this is the Keystore gating described above and
    // nothing else: the alias is BIOMETRIC_STRONG-required with a 30 s validity
    // window, so a caller needs a device-wide strong-biometric auth inside that
    // window. That residual (a coerced or recent unrelated biometric within 30 s)
    // is owner-accepted and separately gated — opt-in OFF by default, a
    // disclosure card, isDuressConfigured write+read gates in native.js, and
    // RASP-ALLOW required. See docs/kek-fast-path-design.md.
    //
    // Do not restore the "useless without H" reasoning unless the wrapping is
    // restored with it.
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
        // L-13 (audit 2026-09-07): gate WRITES on block tier too, not just reads.
        // The three get* methods already do this; the three put* methods did not,
        // so on a hooked/tampered runtime the plugin would still persist a secret
        // to a Keystore alias. Low severity by itself — an attacker on a BLOCK-tier
        // runtime already holds the plaintext being cached, and the JS populate
        // path fail-closes on non-ALLOW before reaching here — but a read/write
        // asymmetry is exactly what a later refactor mis-reads as "writes are safe
        // by design", so the two halves are made symmetric.
        if (rejectIfBlockTier(ctx, call)) return
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
            // L-11 (audit 2026-09-07): scrub. This buffer is the RAW DEK since the
            // 2026-08-28 fastpath refactor (the `wrappedDek` key name is historical
            // — see AndroidBiometricCachePlugin's header note and audit M-5), so a
            // lingering heap copy here is the vault key itself, not a wrapped blob.
            try {
                call.resolve(JSObject().put("wrappedDek", String(plaintext, StandardCharsets.UTF_8)))
            } finally {
                java.util.Arrays.fill(plaintext, 0)
            }
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

    // M-6 (audit 2026-09-07) — the precondition that makes the unauth alias safe,
    // enforced HERE rather than trusted from the caller.
    //
    // The unauth alias exists to be read WITHOUT a biometric prompt. The only
    // reason that is acceptable is the KEK invariant: on a KEK-wrapped vault the
    // cached PIN is the C-factor of DEK = HKDF(H ‖ C), and H is producible only
    // inside a StrongBox/TEE-gated op, so C alone opens nothing. On a NON-KEK
    // vault the same cached PIN IS the vault password, and an unauth read would
    // strip the sole biometric gate.
    //
    // The JS layer checks that invariant with keyStore.hasVaultKekWrap() at write
    // time, and biometricUnlock.js says in as many words that "a caller-attested
    // isEnrolled flag would not be trustworthy here". That is exactly right and is
    // why this does NOT take a `kekEnrolled` argument: injected in-page JS on a
    // compromised runtime controls every argument it passes, so a caller-supplied
    // flag would be decoration, not a gate.
    //
    // A Keystore fact is not caller-controlled. If the hardware KEK key is gone —
    // cleared via clearHardwareCredential(), or wiped by the OS on a biometric
    // enrollment change — then H can never be produced again, the invariant that
    // justified the unauth alias no longer holds, and any entry still sitting
    // there must not be released without auth. Note clearHardwareCredential()
    // deletes the KEK key and does NOT purge this cache, so "entry present, KEK
    // absent" is genuinely reachable rather than theoretical.
    //
    // Alias string is duplicated from HardwareKekPlugin.KEY_ALIAS (private there)
    // rather than exported: this is a read-only existence probe across a plugin
    // boundary, and widening that field's visibility to share one constant would
    // give more away than it buys. If it is ever renamed, this must follow — the
    // regression test pins the literal for that reason.
    private fun hardwareKekPresent(): Boolean = try {
        keyStore().containsAlias(HARDWARE_KEK_ALIAS)
    } catch (_: Exception) {
        // Fail closed: a Keystore we cannot query is not evidence of a KEK.
        false
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
        // L-11 (audit 2026-09-07): scrub before returning.
        try {
            return String(plaintext, StandardCharsets.UTF_8)
        } finally {
            java.util.Arrays.fill(plaintext, 0)
        }
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
