package com.veyrnox.app

// Native half of OTA web-bundle updates. The JS half (src/lib/otaUpdate.js)
// only moves bytes; every trust decision is made here, against the key pinned
// in OtaConfig, using the pure logic in OtaBundleVerifier. See docs/ota-updates.md.
//
// STATUS: BUILT, INTERNAL — not device-verified, no key provisioned.

import android.content.Context
import android.util.Base64
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

@CapacitorPlugin(name = "VeyrnoxOta")
class OtaUpdatePlugin : Plugin() {

    companion object {
        private const val PREFS = "VeyrnoxOta"
        private val lock = Any()

        /** Bundle version the WebView was booted with this process (0 = embedded). */
        @Volatile private var running: Long = 0L

        /** Launch resolution runs once per process; see resolveLaunchDir. */
        private var resolved = false
        private var resolvedDir: String? = null

        private fun decode(s: String): ByteArray = Base64.decode(s, Base64.DEFAULT)

        /** Must equal OTA_ROOT on iOS: JS writes here via Filesystem Directory.LIBRARY (= filesDir). */
        private const val OTA_ROOT = "VeyrnoxOTA"
        private fun root(ctx: Context) = File(ctx.filesDir, OTA_ROOT)
        private fun dirFor(ctx: Context, v: Long) = File(root(ctx), v.toString())

        private fun load(ctx: Context): OtaState {
            val p = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            return OtaState(
                active = p.getLong("active", 0),
                pending = p.getLong("pending", 0),
                pendingBooted = p.getBoolean("pendingBooted", false),
                floor = p.getLong("floor", 0),
            )
        }

        private fun save(ctx: Context, s: OtaState) {
            // commit(), not apply(): the state must be on disk before the WebView
            // boots a pending bundle, or a crash would not count as a failed boot.
            ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit()
                .putLong("active", s.active)
                .putLong("pending", s.pending)
                .putBoolean("pendingBooted", s.pendingBooted)
                .putLong("floor", s.floor)
                .commit()
        }

        /** Manifest shipped inside the APK. Null (missing/garbled) disables OTA. */
        private fun embedded(ctx: Context): OtaManifest? = try {
            ctx.assets.open("public/${OtaBundleVerifier.MANIFEST_NAME}").use {
                OtaBundleVerifier.parseManifest(it.readBytes())
            }
        } catch (e: Exception) {
            null
        }

        private fun isValid(ctx: Context, v: Long, channel: String): Boolean {
            val dir = dirFor(ctx, v)
            val m = OtaBundleVerifier.readVerifiedManifest(
                dir, v, channel, OtaConfig.PUBLIC_KEY_SPKI_B64, ::decode,
            ) ?: return false
            return OtaBundleVerifier.verifyFiles(dir, m)
        }

        /**
         * Called from MainActivity before the bridge is built. Returns an absolute
         * directory to serve the web app from, or null for the embedded bundle.
         */
        @JvmStatic
        fun resolveLaunchDir(ctx: Context): String? = synchronized(lock) {
            // MainActivity can be recreated inside one process. Re-resolving would
            // count a healthy boot as a failed one, or swap in a bundle staged this
            // session mid-session. Only the first call per process decides.
            // Capacitor's built-in persisted server path is loaded with NO
            // verification, so any script that reaches the WebView plugin could
            // persist code across restarts. We never use it. Cleared on EVERY
            // Activity creation (a warm relaunch reuses the process), and also
            // switched off via DisableDeploy in capacitor.config.json.
            ctx.getSharedPreferences("CapWebViewSettings", Context.MODE_PRIVATE)
                .edit().remove("serverBasePath").commit()
            if (resolved) return resolvedDir
            resolved = true

            val emb = embedded(ctx)
            if (OtaConfig.PUBLIC_KEY_SPKI_B64.isEmpty() || emb == null) {
                root(ctx).deleteRecursively()
                running = 0
                return null // resolvedDir stays null
            }
            val (boot, st) = OtaBundleVerifier.resolveLaunch(load(ctx), emb.bundleVersion) {
                isValid(ctx, it, emb.channel)
            }
            save(ctx, st)
            val keep = setOf(st.active.toString(), st.pending.toString())
            root(ctx).listFiles()?.forEach { if (it.name !in keep) it.deleteRecursively() }
            running = boot
            resolvedDir = if (boot == 0L) null else dirFor(ctx, boot).absolutePath
            resolvedDir
        }
    }

    private fun versionArg(call: PluginCall): Long? =
        call.getData().optLong("version", 0).takeIf { it > 0 }

    @PluginMethod
    fun status(call: PluginCall) {
        val emb = embedded(context)
        val st = synchronized(lock) { load(context) }
        call.resolve(JSObject().apply {
            put("enabled", OtaConfig.PUBLIC_KEY_SPKI_B64.isNotEmpty() && emb != null)
            put("channel", emb?.channel ?: "")
            put("nativeApi", OtaConfig.NATIVE_API)
            put("runningVersion", if (running != 0L) running else (emb?.bundleVersion ?: 0))
            put("newestKnownVersion", maxOf(st.floor, st.active, st.pending, emb?.bundleVersion ?: 0))
        })
    }

    /** Create an empty staging directory for [version]. */
    @PluginMethod
    fun begin(call: PluginCall) {
        val v = versionArg(call) ?: return call.reject("OTA_BAD_ARGS")
        val emb = embedded(context) ?: return call.reject("OTA_DISABLED")
        if (OtaConfig.PUBLIC_KEY_SPKI_B64.isEmpty()) return call.reject("OTA_DISABLED")
        synchronized(lock) {
            if (!OtaBundleVerifier.canAccept(load(context), emb.bundleVersion, v)) return call.reject("OTA_NOT_NEWER")
            val dir = dirFor(context, v)
            dir.deleteRecursively()
            if (!dir.mkdirs()) return call.reject("OTA_IO")
            call.resolve(JSObject().put("path", "$OTA_ROOT/$v"))
        }
    }

    /**
     * After JS has downloaded the manifest + signature into the staging dir:
     * verify the signature, pre-fill every file we already hold (same sha256) from
     * the embedded or active bundle, and return what still has to be downloaded.
     */
    @PluginMethod
    fun prepare(call: PluginCall) {
        val v = versionArg(call) ?: return call.reject("OTA_BAD_ARGS")
        val emb = embedded(context) ?: return call.reject("OTA_DISABLED")
        val dir = dirFor(context, v)
        val m = OtaBundleVerifier.readVerifiedManifest(
            dir, v, emb.channel, OtaConfig.PUBLIC_KEY_SPKI_B64, ::decode,
        ) ?: return call.reject("OTA_BAD_SIGNATURE")
        try {
            val st = synchronized(lock) { load(context) }
            val activeDir = if (st.active != 0L) dirFor(context, st.active) else null
            val activeFiles = activeDir?.let {
                OtaBundleVerifier.parseManifest(File(it, OtaBundleVerifier.MANIFEST_NAME).readBytes())?.files
            } ?: emptyMap()
            val fromActive = activeFiles.entries.associate { (p, h) -> h to p }
            val fromEmbedded = emb.files.entries.associate { (p, h) -> h to p }
            val missing = JSArray()
            for ((path, hash) in m.files) {
                val dest = File(dir, path)
                dest.parentFile?.mkdirs()
                when {
                    activeDir != null && fromActive.containsKey(hash) ->
                        File(activeDir, fromActive.getValue(hash)).copyTo(dest, overwrite = true)
                    fromEmbedded.containsKey(hash) ->
                        context.assets.open("public/${fromEmbedded.getValue(hash)}").use { input ->
                            dest.outputStream().use { input.copyTo(it) }
                        }
                    else -> missing.put(path)
                }
            }
            call.resolve(JSObject().put("missing", missing))
        } catch (e: Exception) {
            call.reject("OTA_IO")
        }
    }

    /** Full verification of the staging dir; on success it boots on next cold start. */
    @PluginMethod
    fun stage(call: PluginCall) {
        val v = versionArg(call) ?: return call.reject("OTA_BAD_ARGS")
        val emb = embedded(context) ?: return call.reject("OTA_DISABLED")
        if (!isValid(context, v, emb.channel)) return call.reject("OTA_VERIFY_FAILED")
        synchronized(lock) {
            val st = load(context)
            if (!OtaBundleVerifier.canAccept(st, emb.bundleVersion, v)) return call.reject("OTA_NOT_NEWER")
            if (st.pending != 0L && st.pending != running) dirFor(context, st.pending).deleteRecursively()
            save(context, st.copy(pending = v, pendingBooted = false))
        }
        call.resolve()
    }

    /** The running bundle rendered. Promotes a pending bundle to active. */
    @PluginMethod
    fun notifyReady(call: PluginCall) {
        synchronized(lock) { save(context, OtaBundleVerifier.promote(load(context), running)) }
        call.resolve()
    }
}
