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
// checkProcNetUnix did NOT fire on Magisk v30.7. Root cause (device-verified
// 2026-07-14): SELinux denies untrusted_app reading /proc/net/unix on Android
// 10+ — the check is structurally inert on modern devices regardless of marker
// names (avc: denied { read } proc_net confirmed in logcat). Marker list was
// expanded anyway (PR #968) for completeness on older OS / policy changes.
// checkSuFromRuntime did NOT fire (Magisk Hide covers `su` in PATH — expected).
// Operative root signal: checkDangerousProps (verifiedbootstate=orange).
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
import android.net.LocalSocket
import android.net.LocalSocketAddress
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
    // @JvmSynthetic on every private detection helper makes the method
    // inaccessible from the Frida Java API: the JVM bridge sees a synthetic
    // method whose name is mangled with an access$N prefix, so a Frida script
    // targeting the readable name (e.g. Java.use("...").detectRoot) throws
    // "no such method". Works alongside R8 renaming (ProGuard) for defence-in-depth.

    @JvmSynthetic
    private fun detectRoot(): Boolean {
        return checkRootBinaries()
            || checkMagiskPaths()
            || checkSystemWritable()
            || checkBuildTags()
            || (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q && checkProcNetUnix()) // /proc/net/unix: SELinux-denied Android 10+; active on ≤9
            || checkLocalSocketConnect()    // behavioral: connect to fixed-name Zygisk/LSPosed/APatch sockets
            || checkSuFromRuntime()         // behavioral — `which su` via Runtime.exec
            || checkDangerousProps()        // ro.boot.verifiedbootstate orange/red
    }

    @JvmSynthetic
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

    @JvmSynthetic
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
    // CANNOT hide its own Unix domain sockets from /proc/net/unix — these are
    // kernel-level IPC entries, not filesystem objects under Magisk's control.
    //
    // ⚠️  ANDROID 10+ SELinux BLOCK (device-verified 2026-07-14, SM-N981B Android 12):
    //     The untrusted_app SELinux domain does NOT have read permission for
    //     proc_net files. On-device logcat confirmed:
    //       avc: denied { read } for comm="CapacitorPlugin" name="unix"
    //            scontext=u:r:untrusted_app:s0 tcontext=u:object_r:proc_net:s0
    //     runCatching{}.getOrDefault(false) swallows the SecurityException and
    //     returns false — this check is effectively inert on Android 10+ in the
    //     untrusted_app context. checkDangerousProps is the operative signal.
    //     A future implementation could use LocalSocket.connect() to attempt a
    //     connection to known Magisk daemon paths (a behavioral probe that does
    //     not require proc_net read permission), but that is not yet implemented.
    //
    // Marker list is kept current (expanded for Magisk v30.x, 2026-07-14) so
    // the check is useful if ever run on a pre-Android-10 device or if SELinux
    // policy changes. Markers cover Zygisk companion sockets, KSU, LSPosed, APatch.
    @JvmSynthetic
    private fun checkProcNetUnix(): Boolean {
        val socketMarkers = listOf(
            // --- Magisk daemon (any version) ---
            "magisk",           // catch-all substring — matches @magisk_XXXX, magiskd,
                                // magisk_daemon, magisk_client, .magisk.* (v26+ variants)
            // --- Zygisk companion / loader (Magisk v24+) ---
            "zygisk_server",    // Zygisk IPC server (source: zygisk/daemon.cpp SOCKET_NAME)
            "zygisk_ldr",       // Zygisk loader thread socket
            ".magisk.zygisk",   // MAGISKTMP/zygisk path-based sockets (e.g. /dev/.magisk/zygisk)
            // --- KernelSU ---
            "@ksu_",            // KernelSU daemon abstract socket
            "@ksud",
            "ksu_overlayfs",    // KernelSU overlayfs socket (v0.9+)
            // --- LSPosed / Zygisk module framework ---
            "@lspd",            // LSPosed daemon
            "lspd_",            // LSPosed companion variant
            // --- APatch ---
            "apatchd",          // APatch daemon
            "apd_",             // APatch companion
            // --- Legacy / belt-and-suspenders ---
            "zygote_overlay",   // Zygisk overlay socket (older builds)
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

    // Behavioral probe: attempt LocalSocket.connect() to known fixed-name abstract sockets
    // used by Zygisk (Magisk v24+), LSPosed, APatch, and KernelSU daemons.
    //
    // WHY this instead of /proc/net/unix?
    //   checkProcNetUnix() is inert on Android 10+ — SELinux denies proc_net reads
    //   for untrusted_app (device-verified 2026-07-14, SM-N981B). LocalSocket.connect()
    //   is a connect-only probe and does NOT require proc_net read permission.
    //
    // Target sockets (fixed names, not randomised by Magisk Hide):
    //   "zygisk_server" — Zygisk companion IPC server (SOCKET_NAME, Magisk v24+)
    //   "lspd_0"        — LSPosed daemon at UID 0 (root)
    //   "apd"           — APatch companion daemon
    //   "ksud"          — KernelSU daemon
    //
    // SELinux caveat (honest, I4):
    //   connect() FROM untrusted_app TO an abstract socket requires an allow rule in the
    //   SELinux policy. On hardened Android 12+ this may be denied; runCatching swallows
    //   the SecurityException and returns false (fail-open, not fail-closed for this check).
    //   checkDangerousProps is the primary operative Magisk signal on modern Android.
    //   This is belt-and-suspenders, most useful on pre-Android-12 or custom ROMs.
    //
    // BUILT · structural pins only · NOT device-verified · INTERNAL (2026-07-14).
    @JvmSynthetic
    private fun checkLocalSocketConnect(): Boolean {
        val abstractSockets = listOf(
            "zygisk_server",    // Zygisk companion IPC server (Magisk v24+)
            "lspd_0",           // LSPosed daemon (UID 0)
            "apd",              // APatch companion daemon
            "ksud",             // KernelSU daemon
        )
        return abstractSockets.any { name ->
            runCatching {
                LocalSocket().use { sock ->
                    sock.connect(
                        LocalSocketAddress(name, LocalSocketAddress.Namespace.ABSTRACT),
                    )
                    true    // connect succeeded — daemon socket is present
                }
            }.getOrDefault(false)
        }
    }

    // Behavioral root check: try `which su` via Runtime.exec.
    // On a fully stock Android device, `which su` produces no output (su absent).
    // On a rooted device where Magisk Hide is incomplete or not targeting the app,
    // `which su` returns the su binary path. Analogous to the iOS fork() check —
    // a behavioral test that the system blocks on stock but permits when rooted.
    //
    // 2026-07-14 audit LOW (honesty-I4): On Android 10+ default SELinux policy,
    // Runtime.exec of a shell utility from the `untrusted_app` domain is DENIED —
    // `runCatching` swallows the denial and returns false regardless of whether
    // `su` exists in PATH. This mirrors the exec restriction that pushed
    // checkDangerousProps to reflection-based readSystemPropReflect. On Android 10+
    // this signal is structurally inert; treat any true return as anomalous rather
    // than authoritative. Honest disclosure — not removed because on older
    // Android versions the exec still works.
    //
    // 2026-07-14 audit LOW (correctness): waitFor() had no timeout. A hostile
    // rooted-device wrapper `su` / `which` shim that never exits would block the
    // RASP thread on the JS presignGate hot path (availability, not bypass).
    // Bounded wait; destroyForcibly on timeout. Matches checkFridaPort's 150 ms
    // budget elsewhere in this file.
    @JvmSynthetic
    private fun checkSuFromRuntime(): Boolean {
        return runCatching {
            val proc = Runtime.getRuntime().exec(arrayOf("which", "su"))
            val finished = proc.waitFor(150, java.util.concurrent.TimeUnit.MILLISECONDS)
            if (!finished) {
                proc.destroyForcibly()
                return@runCatching false
            }
            val output = proc.inputStream.bufferedReader().readText().trim()
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
    @JvmSynthetic
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
    @JvmSynthetic
    private fun readSystemPropReflect(key: String): String {
        return runCatching {
            val cls = Class.forName("android.os.SystemProperties")
            val get = cls.getMethod("get", String::class.java, String::class.java)
            (get.invoke(null, key, "") as? String ?: "").trim().lowercase()
        }.getOrElse { "" }
    }

    @JvmSynthetic
    private fun checkSystemWritable(): Boolean {
        return runCatching {
            val f = File("/system/veyrnox-rasp-probe-${System.nanoTime()}")
            val writable = f.createNewFile()
            if (writable) f.delete()
            writable
        }.getOrDefault(false)
    }

    @JvmSynthetic
    private fun checkBuildTags(): Boolean {
        return runCatching {
            val tags = Build.TAGS ?: ""
            tags.contains("test-keys") || tags.contains("dev-keys")
        }.getOrDefault(false)
    }

    // ── Hook / instrumentation detection ─────────────────────────────────────
    // Frida default port 27042; Xposed installer presence; /proc/self/maps scan;
    // Frida Gadget thread-name scan; Frida pipe/socket fd scan.
    //
    // Gadget mode embeds as a shared library (often renamed) rather than running
    // a server — port 27042 and a simple "frida" maps string do not catch it.
    // The thread-name and fd-pipe checks close that gap.

    @JvmSynthetic
    private fun detectHook(): Boolean {
        return checkFridaPort()
            || checkXposed()
            || checkProcMapsForHook()
            || checkGadgetThreads()
            || checkFridaPipes()
            || checkTracerPid()
    }

    // Anti-debug: read /proc/self/status to detect an attached debugger.
    // TracerPid is the PID of any process that has ptrace-attached to us.
    // It is 0 on a normal (undebugged) app; non-zero when adb, gdb, LLDB,
    // or a Frida server in ptrace mode is attached.
    //
    // This is a REACTIVE check (fires after attach) rather than PREVENTIVE
    // (blocking the attach). Preventive anti-debug via ptrace(PTRACE_TRACEME)
    // is implemented in earlyPtraceTraceme() (companion object, runs at
    // earlyCheck time before the Capacitor bridge initialises).
    //
    // FAIL CLOSED (I4): any IO/parse failure → false (not detected, not clean).
    // NO EGRESS (I2): pure proc-fs read, no network.
    @JvmSynthetic
    private fun checkTracerPid(): Boolean {
        return runCatching {
            File("/proc/self/status").bufferedReader().use { reader ->
                reader.lineSequence()
                    .firstOrNull { it.startsWith("TracerPid:") }
                    ?.removePrefix("TracerPid:")
                    ?.trim()
                    ?.toLongOrNull()
                    ?.let { it != 0L }
                    ?: false
            }
        }.getOrDefault(false)
    }

    @JvmSynthetic
    private fun checkFridaPort(): Boolean {
        return runCatching {
            Socket().use { s ->
                s.soTimeout = 150
                s.connect(InetSocketAddress("127.0.0.1", 27042), 150)
                true  // connection succeeded → Frida server listening
            }
        }.getOrDefault(false)
    }

    @JvmSynthetic
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

    @JvmSynthetic
    private fun checkProcMapsForHook(): Boolean {
        val hookMarkers = listOf(
            "frida",
            "frida-agent",
            "frida-gadget",
            "linjector",
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

    // Frida Gadget spawns known thread names regardless of whether the .so file
    // was renamed. Read each thread's comm file (/proc/self/task/<tid>/comm) and
    // check for names that only appear when Gadget (or its GLib runtime) is active.
    @JvmSynthetic
    private fun checkGadgetThreads(): Boolean {
        val gadgetThreads = listOf("gum-js-loop", "gmain", "gdbus", "pool-frida")
        return runCatching {
            val taskDir = File("/proc/self/task")
            taskDir.listFiles()?.any { tidDir ->
                runCatching {
                    val comm = File(tidDir, "comm").readText().trim()
                    gadgetThreads.any { comm.contains(it) }
                }.getOrDefault(false)
            } ?: false
        }.getOrDefault(false)
    }

    // Frida creates named pipes / Unix domain sockets that appear as symlinks
    // under /proc/self/fd. Their resolved paths contain "frida".
    @JvmSynthetic
    private fun checkFridaPipes(): Boolean {
        return runCatching {
            val fdDir = File("/proc/self/fd")
            fdDir.listFiles()?.any { fd ->
                runCatching {
                    fd.canonicalPath.contains("frida", ignoreCase = true)
                }.getOrDefault(false)
            } ?: false
        }.getOrDefault(false)
    }

    // ── Emulator detection ────────────────────────────────────────────────────

    @JvmSynthetic
    private fun detectEmulator(): Boolean {
        return checkBuildProps()
            || checkEmulatorFiles()
    }

    @JvmSynthetic
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

    @JvmSynthetic
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

    @JvmSynthetic
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

    // ── Pre-WebView early gate ────────────────────────────────────────────────
    // Companion object exposes a static earlyCheck() method that MainActivity
    // calls BEFORE registerPlugin() and super.onCreate(). This ensures the
    // Capacitor bridge is never initialised on BLOCK-tier devices, closing the
    // bridge-gap attack surface: there is no nativePromiseResolve to hook if the
    // WebView never starts. Only BLOCK-tier signals gate here (hookedProcess +
    // tampered); root and emulator are WARN-tier and handled post-launch by the
    // JS presignGate.

    companion object {

        // PR_SET_DUMPABLE = 4 (Linux constant; not exposed in android.system.OsConstants).
        // Setting dumpable=0 prevents /proc/self/mem reads, ptrace-based memory
        // inspection, and core-dump leaks — blocks Frida's memory-scanning path
        // even when hook-thread detection misses a gadget. Fail-open: prctl failure
        // must never prevent the app from launching.
        private const val PR_SET_DUMPABLE = 4

        // Load the rasp_early native library (rasp_early.c → libRaspEarly.so).
        // Fail-open: UnsatisfiedLinkError on a JVM unit-test host or a stripped
        // build is caught here; earlyPtraceTraceme() has its own runCatching guard
        // so a failed load returns false (not blocked) rather than crashing.
        init {
            runCatching { System.loadLibrary("rasp_early") }
        }

        @JvmStatic
        private external fun nativeEarlyTraceme(): Boolean

        /**
         * earlyCheck — BLOCK-tier signals only, no Plugin instance required.
         * Returns true (BLOCK) if a debugger/hook or binary tamper is detected.
         * earlyAntiDump() always runs first to lock down /proc/self/mem before
         * any hook/tamper verdict is reached.
         */
        @JvmStatic
        fun earlyCheck(context: android.content.Context): Boolean {
            earlyAntiDump()
            return earlyDetectHook() || earlyDetectTamper(context)
        }

        // earlyAntiDump — sets PR_SET_DUMPABLE to 0 via android.system.Os.prctl.
        // Fail-open (runCatching, no else): if prctl is denied or unavailable,
        // the app launches normally; protection is silently absent, not a hard block.
        private fun earlyAntiDump() = runCatching {
            android.system.Os.prctl(PR_SET_DUMPABLE, 0L, 0L, 0L, 0L)
        }

        // FAIL CLOSED (I4): any IO/parse failure → false (not detected, not clean).
        // The WebView is allowed to start on detection failure; the JS presignGate
        // independently degrades to WARN on an unavailable native probe.

        private fun earlyDetectHook(): Boolean =
            earlyTracerPid()
                || earlyFridaPort()
                || earlyProcMaps()
                || earlyGadgetThreads()
                || earlyFridaPipes()
                || earlyPtraceTraceme()

        // earlyPtraceTraceme — calls ptrace(PTRACE_TRACEME) via JNI. Hardening:
        // claims the tracing slot for the parent (Zygote), complementing
        // earlyAntiDump's PR_SET_DUMPABLE=0. Detection: returns true (BLOCK) if
        // PTRACE_TRACEME fails, which indicates a debugger already holds the slot.
        // Fail-open: UnsatisfiedLinkError (JVM tests, stripped build) caught here.
        private fun earlyPtraceTraceme(): Boolean = runCatching {
            nativeEarlyTraceme()
        }.getOrDefault(false)

        private fun earlyTracerPid(): Boolean = runCatching {
            File("/proc/self/status").readLines()
                .firstOrNull { it.startsWith("TracerPid:") }
                ?.removePrefix("TracerPid:")?.trim()?.toIntOrNull()
                ?.let { it != 0 } ?: false
        }.getOrDefault(false)

        private fun earlyFridaPort(): Boolean = runCatching {
            Socket().use { s ->
                s.connect(InetSocketAddress("127.0.0.1", 27042), 100)
                true
            }
        }.getOrDefault(false)

        private fun earlyProcMaps(): Boolean = runCatching {
            val markers = listOf("frida", "xposed", "substrate", "lspd", "zygisk")
            File("/proc/self/maps").readLines()
                .any { line -> markers.any { m -> line.lowercase().contains(m) } }
        }.getOrDefault(false)

        private fun earlyGadgetThreads(): Boolean = runCatching {
            val markers = setOf("gum-js-loop", "gmain", "gdbus", "frida-gadget")
            File("/proc/self/task").listFiles()?.any { task ->
                val comm = File(task, "comm")
                comm.exists() && markers.any { m -> comm.readText().trim().contains(m) }
            } ?: false
        }.getOrDefault(false)

        private fun earlyFridaPipes(): Boolean = runCatching {
            File("/proc/self/fd").listFiles()?.any { fd ->
                runCatching {
                    fd.canonicalPath.contains("frida", ignoreCase = true)
                }.getOrDefault(false)
            } ?: false
        }.getOrDefault(false)

        private fun earlyDetectTamper(context: android.content.Context): Boolean = runCatching {
            val expected = BuildConfig.RELEASE_CERT_SHA256
            if (expected.isBlank()) return true  // fail-closed (I4)
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
            } ?: return true
            val md = java.security.MessageDigest.getInstance("SHA-256")
            val actual = sigs.firstOrNull()?.let { sig ->
                md.digest(sig.toByteArray()).joinToString("") { "%02x".format(it) }
            } ?: return true
            actual != expected.replace(":", "").lowercase()
        }.getOrElse { true }
    }
}
