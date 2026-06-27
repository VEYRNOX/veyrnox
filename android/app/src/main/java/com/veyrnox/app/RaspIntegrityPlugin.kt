package com.veyrnox.app

// RaspIntegrityPlugin.kt
//
// Native RASP (Runtime Application Self-Protection) integrity probe for Android.
// STATUS: BUILT-UNVALIDATED — logic is present but has NOT been exercised on a
// real rooted / Frida-hooked / emulator device. Per the audit and the JS comment
// in raspIntegrityPlugin.js, this must pass on-device hostile testing (roadmap
// Phase 4) and the independent audit (Phase 5) before the status can advance.
//
// FAIL CLOSED (I4): every detection block catches exceptions independently and
// returns false (clean/unknown) rather than propagating — a crash or permission
// denial does not fabricate a "rooted=true" signal. The JS side maps
// INTEGRITY_UNAVAILABLE (thrown by the bridge) to TIER.WARN, not TIER.ALLOW, so
// a total plugin failure is safe-by-default.
//
// NO EGRESS (I2): all checks are purely local. No network calls, no analytics,
// no logging of device state off-device.
//
// SCOPE: detection only. No blocking, no enforcement — the JS presignGate()
// decides what to do with the verdict.

import android.content.pm.PackageManager
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.BufferedReader
import java.io.File
import java.io.InputStreamReader
import java.net.InetSocketAddress
import java.net.Socket

@CapacitorPlugin(name = "RaspIntegrity")
class RaspIntegrityPlugin : Plugin() {

    /**
     * checkIntegrity() → { rooted, hookedProcess, emulator, tampered }
     *
     * Each field is true only when actively detected. Absence of a true signal
     * means "not detected" — not "definitely clean". The JS layer must treat the
     * full absence of native detections as INTEGRITY_UNAVAILABLE-equivalent
     * (TIER.WARN) rather than verified-clean.
     */
    @PluginMethod
    fun checkIntegrity(call: PluginCall) {
        val result = JSObject()
        result.put("rooted",        detectRoot())
        result.put("hookedProcess", detectHook())
        result.put("emulator",      detectEmulator())
        result.put("tampered",      detectTamper())
        call.resolve(result)
    }

    // ── Root detection ────────────────────────────────────────────────────────

    private fun detectRoot(): Boolean {
        return checkRootBinaries()
            || checkMagiskPaths()
            || checkSystemWritable()
            || checkBuildTags()
    }

    private fun checkRootBinaries(): Boolean {
        val paths = listOf(
            "/system/app/Superuser.apk",
            "/system/xbin/su",
            "/system/bin/su",
            "/sbin/su",
            "/data/local/xbin/su",
            "/data/local/bin/su",
            "/data/local/su",
            "/su/bin/su",
            "/system/bin/.ext/.su",
            "/system/usr/we-need-root/su-backup",
            "/system/xbin/mu",
        )
        return paths.any { runCatching { File(it).exists() }.getOrDefault(false) }
    }

    private fun checkMagiskPaths(): Boolean {
        val paths = listOf(
            "/sbin/.magisk",
            "/sbin/.core/mirror",
            "/sbin/.core/img",
            "/data/adb/magisk",
            "/data/adb/ksu",          // KernelSU
        )
        return paths.any { runCatching { File(it).exists() }.getOrDefault(false) }
    }

    private fun checkSystemWritable(): Boolean {
        return runCatching {
            val f = File("/system/veyrnox-rasp-probe-${System.nanoTime()}")
            val writable = f.createNewFile()
            if (writable) f.delete()
            writable
        }.getOrDefault(false)
    }

    private fun checkBuildTags(): Boolean {
        return runCatching {
            val tags = Build.TAGS ?: ""
            tags.contains("test-keys") || tags.contains("dev-keys")
        }.getOrDefault(false)
    }

    // ── Hook / instrumentation detection ─────────────────────────────────────
    // Frida default port 27042; Xposed installer presence; /proc/self/maps scan.

    private fun detectHook(): Boolean {
        return checkFridaPort()
            || checkXposed()
            || checkProcMapsForHook()
    }

    private fun checkFridaPort(): Boolean {
        return runCatching {
            Socket().use { s ->
                s.soTimeout = 150
                s.connect(InetSocketAddress("127.0.0.1", 27042), 150)
                true  // connection succeeded → Frida server listening
            }
        }.getOrDefault(false)
    }

    private fun checkXposed(): Boolean {
        val xposedPkgs = listOf(
            "de.robv.android.xposed.installer",
            "com.saurik.substrate",
            "com.zachspong.temprootremovejb",
            "com.amphoras.hidemyroot",
            "io.va.exposed",       // VirtualXposed
        )
        val pm = runCatching { context.packageManager } .getOrNull() ?: return false
        return xposedPkgs.any { pkg ->
            runCatching {
                pm.getPackageInfo(pkg, 0)
                true
            }.getOrDefault(false)
        }
    }

    private fun checkProcMapsForHook(): Boolean {
        val hookMarkers = listOf(
            "frida",
            "xposed",
            "substrate",
            "magisk",
        )
        return runCatching {
            BufferedReader(InputStreamReader(File("/proc/self/maps").inputStream())).use { br ->
                br.lineSequence().any { line ->
                    val lower = line.lowercase()
                    hookMarkers.any { lower.contains(it) }
                }
            }
        }.getOrDefault(false)
    }

    // ── Emulator detection ────────────────────────────────────────────────────

    private fun detectEmulator(): Boolean {
        return checkBuildProps()
            || checkEmulatorFiles()
    }

    private fun checkBuildProps(): Boolean {
        return runCatching {
            val fingerprint = Build.FINGERPRINT?.lowercase() ?: ""
            val model       = Build.MODEL?.lowercase() ?: ""
            val manufacturer = Build.MANUFACTURER?.lowercase() ?: ""
            val hardware    = Build.HARDWARE?.lowercase() ?: ""
            val product     = Build.PRODUCT?.lowercase() ?: ""

            fingerprint.startsWith("generic")
                || fingerprint.startsWith("unknown")
                || fingerprint.contains("emulator")
                || fingerprint.contains("sdk_gphone")
                || model.contains("google_sdk")
                || model.contains("emulator")
                || model.contains("android sdk built for x86")
                || manufacturer.contains("genymotion")
                || hardware.contains("goldfish")
                || hardware.contains("ranchu")
                || product.contains("sdk_gphone")
                || product.contains("sdk_x86")
                || product.contains("vbox86p")
        }.getOrDefault(false)
    }

    private fun checkEmulatorFiles(): Boolean {
        val emulatorFiles = listOf(
            "/dev/socket/qemud",
            "/dev/qemu_pipe",
            "/system/lib/libc_malloc_debug_qemu.so",
            "/sys/qemu_trace",
            "/system/bin/qemu-props",
        )
        return emulatorFiles.any { runCatching { File(it).exists() }.getOrDefault(false) }
    }

    // ── APK tamper detection (signing certificate check) ─────────────────────
    // Compares the installed APK's signing cert against a SHA-256 fingerprint
    // embedded at build time. An unsigned or re-signed APK (sideloaded repack)
    // produces a different fingerprint → tampered = true.
    //
    // The expected fingerprint is injected at build time via the
    // RELEASE_CERT_SHA256 BuildConfig field (android/app/build.gradle). CI passes
    // -PRELEASE_CERT_SHA256=<secret> to inject the real release-key fingerprint;
    // local/dev builds fall back to the committed dev fingerprint. The fingerprint
    // is a public certificate hash, not a secret. If it is somehow blank we fail
    // honest (I4): log a warning and report not-tampered rather than fabricating a
    // signal or blocking all installs.
    // val (not const val): BuildConfig fields are not compile-time constants in
    // every Kotlin configuration.
    private val EXPECTED_CERT_SHA256: String = BuildConfig.RELEASE_CERT_SHA256

    private fun detectTamper(): Boolean {
        if (EXPECTED_CERT_SHA256.isBlank()) {
            android.util.Log.w("RASP", "RELEASE_CERT_SHA256 not configured — tamper check skipped")
            return false
        }

        return runCatching {
            val pm = context.packageManager
            @Suppress("DEPRECATION")
            val info = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNING_CERTIFICATES)
            } else {
                pm.getPackageInfo(context.packageName, PackageManager.GET_SIGNATURES)
            }

            val sigs = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                info.signingInfo?.apkContentsSigners
            } else {
                @Suppress("DEPRECATION")
                info.signatures
            } ?: return false

            val md = java.security.MessageDigest.getInstance("SHA-256")
            val actualHex = sigs.firstOrNull()?.let { sig ->
                md.digest(sig.toByteArray()).joinToString("") { "%02x".format(it) }
            } ?: return false

            // actualHex is lowercase hex with no separators; the expected value may
            // be colon-separated uppercase (the standard fingerprint format) — strip
            // colons and lowercase both sides before comparing.
            val expectedHex = EXPECTED_CERT_SHA256.replace(":", "").lowercase()
            actualHex != expectedHex
        }.getOrDefault(false)
    }
}
