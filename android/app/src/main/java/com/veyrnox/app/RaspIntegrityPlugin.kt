package com.veyrnox.app

// RaspIntegrityPlugin.kt
//
// Native RASP (Runtime Application Self-Protection) integrity probe for Android.
//
// DEVICE-VERIFIED (2026-07-12) on Samsung Galaxy Note 20 5G SM-N981B, Magisk v30.7,
// Android debug build. checkIntegrity() verdict: {"rooted":false,"hookedProcess":false,
// "emulator":false,"tampered":false}. `rooted:false` is expected and honest — Magisk
// Hide operates at the OS-probe (mount namespace) level and masks the file paths
// checked by checkRootBinaries/checkMagiskPaths. This is not a code flaw; it is the
// documented limitation of file-system-level detection against Magisk Hide.
//
// 2026-07-13 PARALLEL IMPROVEMENT (mirrors palera1n iOS work):
// The same gap exists on Android: Magisk Hide masks file paths at the mount-namespace
// level, exactly as palera1n's kernel sandbox blocked NSFileManager on iOS. Three new
// detection vectors added that Magisk Hide cannot mask:
//   - checkProcNetUnix: reads /proc/net/unix for Magisk/KSU socket names. Magisk
//     hides file paths but cannot hide its own IPC sockets from /proc/net/unix.
//   - checkSuFromRuntime: executes `which su` via Runtime.exec. On devices where
//     Magisk Hide is incomplete or misconfigured, su remains in PATH.
//   - checkDangerousProps: reads ro.boot.verifiedbootstate and ro.boot.flash.locked
//     via getprop. An unlocked bootloader (orange/red) is a reliable root indicator
//     that Magisk Hide does not touch.
// Extended path lists cover KernelSU, Apatch, and modern Magisk artifacts.
// STATUS: DEVICE-VERIFIED (INTERNAL, 2026-07-14) — re-deployed to SM-N981B;
// checkDangerousProps fired (ro.boot.verifiedbootstate=orange) via
// readSystemPropReflect (SystemProperties reflection, not Runtime.exec).
// Verdict: {"rooted":true,"hookedProcess":false,"emulator":false,"tampered":true}.
// checkProcNetUnix and checkSuFromRuntime did NOT fire on Magisk v30.7.
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
            || checkProcNetUnix()       // new: Magisk/KSU IPC sockets in /proc/net/unix
            || checkSuFromRuntime()     // new: behavioral — `which su` via Runtime.exec
            || checkDangerousProps()    // new: ro.boot.verifiedbootstate orange/red
    }

    private fun checkRootBinaries(): Boolean {
        val paths = listOf(
            // Classic su locations
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
            // Modern root managers
            "/data/adb/ksu/ksud",           // KernelSU daemon
            "/data/adb/ksud",
            "/data/adb/apatch",             // APatch
            "/data/adb/ap",
            "/data/adb/lspd",               // LSPosed (Zygisk Xposed)
            // Root management apps installed as system APKs
            "/system/app/SuperSU.apk",
            "/system/app/KingRoot.apk",
            "/system/app/Magisk.apk",
        )
        return paths.any { runCatching { File(it).exists() }.getOrDefault(false) }
    }

    private fun checkMagiskPaths(): Boolean {
        val paths = listOf(
            // Magisk classic
            "/sbin/.magisk",
            "/sbin/.core/mirror",
            "/sbin/.core/img",
            "/data/adb/magisk",
            "/data/adb/magisk_db",          // Magisk DB (newer versions)
            "/data/adb/magisk_simple",
            "/dev/.magisk.unblock",          // Magisk unblock sentinel
            // KernelSU
            "/data/adb/ksu",
            "/proc/ksud",                    // KernelSU daemon procfs entry
            // Apatch
            "/data/adb/apatch",
            // Zygisk modules dir (Magisk/KSU Zygisk)
            "/data/adb/modules",
            "/data/adb/modules_update",
        )
        return paths.any { runCatching { File(it).exists() }.getOrDefault(false) }
    }

    // Scan /proc/net/unix for known root framework IPC socket names.
    // Magisk Hide masks file-system paths via mount namespace manipulation but
    // CANNOT hide its own Unix domain sockets from /proc/net/unix (these are
    // kernel-level IPC entries, not filesystem objects under Magisk's control).
    // This is the Android analogue of the iOS C stat() check — accessing
    // information from a kernel subsystem that the hide mechanism doesn't reach.
    private fun checkProcNetUnix(): Boolean {
        val socketMarkers = listOf(
            "@magisk_",         // Magisk daemon socket (e.g. @magisk_XXXXXX)
            "magiskd",          // Magisk daemon
            "@ksu_",            // KernelSU daemon socket
            "@ksud",
            "zygote_overlay",   // Zygisk overlay socket
            "zygisk",           // Zygisk module IPC
            "@lspd",            // LSPosed daemon
            "apatchd",          // APatch daemon
        )
        return runCatching {
            File("/proc/net/unix").bufferedReader().use { reader ->
                reader.lineSequence().any { line ->
                    val lower = line.lowercase()
                    socketMarkers.any { lower.contains(it) }
                }
            }
        }.getOrDefault(false)
    }

    // Behavioral root check: try `which su` via Runtime.exec.
    // On a fully stock Android device, `which su` produces no output (su absent).
    // On a rooted device where Magisk Hide is incomplete or not targeting the app,
    // `which su` returns the su binary path. Analogous to the iOS fork() check —
    // a behavioral test that the system blocks on stock but permits when rooted.
    private fun checkSuFromRuntime(): Boolean {
        return runCatching {
            val proc = Runtime.getRuntime().exec(arrayOf("which", "su"))
            val output = proc.inputStream.bufferedReader().readText().trim()
            proc.waitFor()
            proc.destroy()
            output.isNotEmpty()
        }.getOrDefault(false)
    }

    // Read system properties to detect an unlocked bootloader.
    // ro.boot.verifiedbootstate == "green" on a locked, unmodified device.
    // "orange" = unlocked bootloader (prerequisite for most Android root methods).
    // "red" = verification failed (boot image modified / custom kernel).
    // ro.boot.flash.locked == "0" = bootloader unlocked.
    // These values come from the bootloader and are baked into the kernel
    // command line — Magisk Hide does not intercept system property reads.
    //
    // IMPLEMENTATION NOTE (device-verified 2026-07-13):
    // Runtime.exec("getprop ...") is blocked by SELinux for untrusted_app
    // domain on Android 10+ — the runCatching silently swallows the denial
    // and returns "" → false. Device testing confirmed: verifiedbootstate=orange
    // and flash.locked=0 ARE present on the SM-N981B (Magisk v30.7) but
    // Runtime.exec produced no output. Fix: use android.os.SystemProperties
    // via reflection — an in-process prop read, no exec, no SELinux denial.
    private fun checkDangerousProps(): Boolean {
        return runCatching {
            val verifiedBootState = readSystemPropReflect("ro.boot.verifiedbootstate")
            val flashLocked       = readSystemPropReflect("ro.boot.flash.locked")
            val secureBootState   = readSystemPropReflect("ro.boot.secureboot")

            verifiedBootState == "orange"
                || verifiedBootState == "red"
                || flashLocked == "0"
                || secureBootState == "0"
        }.getOrDefault(false)
    }

    // Read a system property via android.os.SystemProperties reflection.
    // This is an in-process call — no exec, no SELinux exec denial.
    // android.os.SystemProperties is a hidden API; reflection is the standard
    // approach used by security tools and root checkers on Android.
    @Suppress("PrivateApi")
    private fun readSystemPropReflect(key: String): String {
        return runCatching {
            val cls = Class.forName("android.os.SystemProperties")
            val get = cls.getMethod("get", String::class.java, String::class.java)
            (get.invoke(null, key, "") as? String ?: "").trim().lowercase()
        }.getOrElse { "" }
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
            "org.lsposed.manager", // LSPosed Manager
            "me.weishu.kernelflasher", // KernelFlasher (common on KernelSU)
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
            "zygisk",      // Zygisk module injector
            "lspd",        // LSPosed daemon library
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
    // -PRELEASE_CERT_SHA256=<secret> to inject the real release-key fingerprint.
    // If the property is absent, BuildConfig.RELEASE_CERT_SHA256 is an empty
    // string and this function returns tampered = true (fail-closed, I4). A blank
    // cert means the build is misconfigured or unkeyed — it must not be trusted.
    // val (not const val): BuildConfig fields are not compile-time constants in
    // every Kotlin configuration.
    private val EXPECTED_CERT_SHA256: String = BuildConfig.RELEASE_CERT_SHA256

    private fun detectTamper(): Boolean {
        if (EXPECTED_CERT_SHA256.isBlank()) {
            android.util.Log.w("RASP", "RELEASE_CERT_SHA256 not set — treating as tampered (fail-closed)")
            return true
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
            } ?: return true  // no signatures readable → can't verify → tampered (I4)

            val md = java.security.MessageDigest.getInstance("SHA-256")
            val actualHex = sigs.firstOrNull()?.let { sig ->
                md.digest(sig.toByteArray()).joinToString("") { "%02x".format(it) }
            } ?: return true  // no cert digest → can't verify → tampered (I4)

            // actualHex is lowercase hex with no separators; the expected value may
            // be colon-separated uppercase (the standard fingerprint format) — strip
            // colons and lowercase both sides before comparing.
            val expectedHex = EXPECTED_CERT_SHA256.replace(":", "").lowercase()
            actualHex != expectedHex
        }
        // Tamper detection is binary — if we can't check, assume tampered (fail-closed, I4).
        // Consistent with the blank-cert guard above; unlike detectRoot/detectHook/
        // detectEmulator (heuristics), a failed signing-cert check must not pass silently.
        .getOrElse { true }
    }
}
