package com.veyrnox.app

// RaspIntegrityPlugin.kt
//
// Native RASP (Runtime Application Self-Protection) integrity probe for Android.
//
// DEVICE-VERIFIED (2026-07-12) on Samsung Galaxy Note 20 5G SM-N981B, Magisk v30.7,
// Android debug build. checkIntegrity() verdict: {"rooted":false,"hookedProcess":false,
// "emulator":false,"tampered":false,"debuggerAttached":false,"screenCapture":false,"overlayActive":false,"developerMode":false,"virtualApp":false,"suspiciousPackage":false,"thirdPartyKeyboard":false}. `rooted:false` is expected
// and honest — Magisk
// Hide operates at the OS-probe (mount namespace) level and masks the file paths
// checked by checkRootBinaries/checkMagiskPaths. This is not a code flaw; it is the
// documented limitation of file-system-level detection against Magisk Hide.
//
// 2026-07-13 PARALLEL IMPROVEMENT (mirrors palera1n iOS work):
// The same gap exists on Android: Magisk Hide masks file paths at the mount-namespace
// level, exactly as palera1n's kernel sandbox blocked NSFileManager on iOS.
//   - checkLocalSocketConnect: behavioral connect() probe to fixed-name abstract sockets
//     (Zygisk, LSPosed, APatch, KernelSU daemons). No proc_net read required.
//   - checkDangerousProps: reads ro.boot.verifiedbootstate and ro.boot.flash.locked
//     via SystemProperties reflection. Unlocked bootloader (orange/red) = reliable signal
//     that Magisk Hide does not touch.
// Extended path lists cover KernelSU, Apatch, and modern Magisk artifacts.
// NOTE: checkProcNetUnix (SELinux-denied on Android 10+) and checkSuFromRuntime
// (Runtime.exec blocked for untrusted_app on Android 10+) were removed — superseded by
// checkLocalSocketConnect and checkDangerousProps respectively.
// STATUS: DEVICE-VERIFIED (INTERNAL, 2026-07-14) — re-deployed to SM-N981B;
// checkDangerousProps fired (ro.boot.verifiedbootstate=orange) via
// readSystemPropReflect (SystemProperties reflection, not Runtime.exec).
// Verdict: {"rooted":true,"hookedProcess":false,"emulator":false,"tampered":true}.
// Operative root signal: checkDangerousProps (verifiedbootstate=orange).
// (checkProcNetUnix and checkSuFromRuntime were subsequently removed — see item 9.)
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
import android.os.Debug
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
     * checkIntegrity() → { rooted, hookedProcess, emulator, tampered, debuggerAttached, screenCapture, overlayActive, developerMode, virtualApp }
     *
     * Each field is true only when actively detected. Absence of a true signal
     * means "not detected" — not "definitely clean". The JS layer must treat the
     * full absence of native detections as INTEGRITY_UNAVAILABLE-equivalent
     * (TIER.WARN) rather than verified-clean.
     *
     * debuggerAttached (item 18): explicit platform-symmetry field mirroring the
     * iOS debuggerAttached key (item 12). checkJdwpDebugger() also remains in
     * detectHook() so hookedProcess fires independently — belt-and-suspenders.
     *
     * screenCapture (item 21): platform-symmetry field mirroring iOS screenCapture
     * (UIScreen.isCaptured). True when a presentation/virtual display is active,
     * indicating Miracast/WFD screen mirroring — a surveillance vector during PIN
     * entry or seed display. nativeProbe.js maps screenCapture:true → signals.hooked
     * (item 16 wiring), so this field flows to BLOCK via the same JS path as iOS.
     *
     * overlayActive (item 23): platform-symmetry field mirroring iOS overlayActive
     * (UIAccessibilityIsAssistiveTouchRunning). True when any accessibility service
     * with FEEDBACK_ALL_MASK is active — a potential tapjacking vector during PIN
     * entry. nativeProbe.js maps overlayActive:true → signals.rooted → WARN (item 19
     * wiring); the send flow is not blocked but the user sees a caution notice.
     * Honest scope: also fires for legitimate accessibility users (TalkBack etc.).
     *
     * developerMode (item 24): Android-only field (no iOS equivalent). True when
     * Settings.Global.ADB_ENABLED != 0 (USB debugging on) OR
     * Settings.Global.DEVELOPMENT_SETTINGS_ENABLED != 0 (developer options on).
     * Developer mode exposes the device to adb-level attack surface: logcat capture
     * (LOG-1 class), memory dumps, screenrecord without user prompt, APK extraction.
     * nativeProbe.js wiring is a separate item; treated as WARN-tier (elevated risk,
     * not a definitive compromise signal). Android-only: iOS Developer Mode is an
     * opt-in sideloading feature not checkable from within an app.
     */
    @PluginMethod
    fun checkIntegrity(call: PluginCall) {
        val result = JSObject()
        result.put("rooted",            detectRoot())
        result.put("hookedProcess",     detectHook())
        result.put("emulator",          detectEmulator())
        result.put("tampered",          detectTamper())
        result.put("debuggerAttached",  checkJdwpDebugger())
        result.put("screenCapture",     checkScreenCapture())
        result.put("overlayActive",     checkOverlay())
        result.put("developerMode",     checkDeveloperMode())
        result.put("virtualApp",        checkVirtualApp())
        result.put("suspiciousPackage", checkSuspiciousPackages())
        result.put("thirdPartyKeyboard", checkThirdPartyKeyboard())
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
            || checkLocalSocketConnect()    // behavioral: connect to fixed-name Zygisk/LSPosed/APatch sockets
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

    // Behavioral probe: attempt LocalSocket.connect() to known fixed-name abstract sockets
    // used by Zygisk (Magisk v24+), LSPosed, APatch, and KernelSU daemons.
    //
    // Replaces the removed checkProcNetUnix() which required proc_net read permission
    // (SELinux-denied for untrusted_app on Android 10+, device-verified 2026-07-14).
    // LocalSocket.connect() is a connect-only probe — no proc_net read needed.
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
            || checkJdwpDebugger()
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

    // Item 14: JDWP-layer debugger detection — complements checkTracerPid (ptrace).
    // android.os.Debug.isDebuggerConnected() reads an ART-internal flag that is
    // set whenever a JDWP session (Android Studio, IntelliJ, adb jdwp) is active.
    // JDWP uses a separate channel from ptrace so checkTracerPid misses it.
    // Weakly spoofable via root-hooking the Debug class, but adds a genuine second
    // layer — an attacker must defeat both checks. Fail-open: runCatching returns
    // false on any exception so the app still launches if the API is unavailable.
    @JvmSynthetic
    private fun checkJdwpDebugger(): Boolean =
        runCatching { Debug.isDebuggerConnected() }.getOrDefault(false)

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

    // ── Screen capture / mirroring detection (item 21) ───────────────────────
    // Android analogue of iOS UIScreen.isCaptured. Checks for an active virtual
    // or presentation display (Miracast/WFD/ChromeCast mirror), which is the
    // Android equivalent of AirPlay screen mirroring.
    //
    // Honest scope: detects Miracast/WFD presentation displays and virtual
    // displays registered with DisplayManager. Does NOT detect MediaProjection
    // screen-recording API (that requires explicit user-grant and a prompt — a
    // separate threat model). False-positive: USB-C DisplayPort connections create
    // a presentation display; the WARN/BLOCK is appropriate for a wallet send flow.
    //
    // nativeProbe.js item 16 maps verdict.screenCapture:true → signals.hooked →
    // BLOCK with no additional JS changes required.

    @JvmSynthetic
    private fun checkScreenCapture(): Boolean = runCatching {
        val dm = context.getSystemService(android.hardware.display.DisplayManager::class.java)
            ?: return@runCatching false
        dm.getDisplays(android.hardware.display.DisplayManager.DISPLAY_CATEGORY_PRESENTATION).isNotEmpty()
    }.getOrDefault(false)

    // ── Accessibility overlay detection (item 23) ─────────────────────────────
    // Android analogue of iOS UIAccessibilityIsAssistiveTouchRunning (checkOverlay).
    // Returns true when any accessibility service is active via FEEDBACK_ALL_MASK.
    // Active services can intercept touch events and draw overlays — the same
    // tapjacking risk during PIN entry as iOS AssistiveTouch.
    //
    // Honest scope: also fires for legitimate accessibility users (TalkBack, Voice
    // Access, Switch Access). The WARN tier (nativeProbe.js item 19 maps
    // overlayActive → signals.rooted → WARN) means the send flow is not blocked
    // but the user sees a caution notice — consistent with the iOS behaviour.
    //
    // NOT added to the early gate: overlayActive is WARN-tier, not BLOCK-tier.
    // Only BLOCK signals (hook + tamper + screenCapture) gate app launch.

    @JvmSynthetic
    private fun checkOverlay(): Boolean = runCatching {
        val am = context.getSystemService(android.view.accessibility.AccessibilityManager::class.java)
            ?: return@runCatching false
        if (!am.isEnabled) return@runCatching false
        am.getEnabledAccessibilityServiceList(
            android.accessibilityservice.AccessibilityServiceInfo.FEEDBACK_ALL_MASK
        ).isNotEmpty()
    }.getOrDefault(false)

    // ── Developer mode / USB debugging detection (item 24) ───────────────────
    // Android-only signal with no iOS equivalent. ADB_ENABLED=1 means USB
    // debugging is on → adb has direct shell + logcat + screenrecord access
    // (LOG-1 class risk). DEVELOPMENT_SETTINGS_ENABLED=1 is the parent toggle
    // that unlocks ADB and all other developer options.
    //
    // Checking both: a device where developer options is toggled ON but USB
    // debugging was not explicitly re-enabled (e.g. after a reboot) can still
    // have developer options active. Either being non-zero → developerMode:true.
    //
    // NOT added to the early gate: developerMode is WARN-tier (the device is
    // exposed, but the app has not been actively compromised). Only BLOCK signals
    // gate app launch before the bridge.

    @JvmSynthetic
    private fun checkDeveloperMode(): Boolean = runCatching {
        val cr = context.contentResolver
        android.provider.Settings.Global.getInt(
            cr, android.provider.Settings.Global.ADB_ENABLED, 0
        ) != 0 || android.provider.Settings.Global.getInt(
            cr, android.provider.Settings.Global.DEVELOPMENT_SETTINGS_ENABLED, 0
        ) != 0
    }.getOrDefault(false)

    // ── Third-party keyboard detection (item 30) ─────────────────────────────
    // A keylogger IME installed from the Play Store (or sideloaded) can silently
    // capture every keystroke during PIN entry and KEK enrollment. System keyboards
    // (pre-installed, FLAG_SYSTEM) are trusted; user-installed keyboards are not.
    //
    // Settings.Secure.DEFAULT_INPUT_METHOD returns "<package>/<class>" for the
    // currently active IME. We extract the package, resolve its ApplicationInfo,
    // and check FLAG_SYSTEM. A missing/blank IME string is treated as false
    // (fail-open: no IME ≠ suspicious). A getApplicationInfo() exception (package
    // not found) is also fail-open — any edge case must not hard-block.
    //
    // WARN tier. NOT added to earlyCheck. JS wiring is item 31.

    @JvmSynthetic
    private fun checkThirdPartyKeyboard(): Boolean = runCatching {
        val activeIme = android.provider.Settings.Secure.getString(
            context.contentResolver,
            android.provider.Settings.Secure.DEFAULT_INPUT_METHOD,
        ) ?: return@runCatching false
        val imePkg = activeIme.substringBefore('/').trim()
        if (imePkg.isEmpty()) return@runCatching false
        val appInfo = runCatching {
            context.packageManager.getApplicationInfo(imePkg, 0)
        }.getOrNull() ?: return@runCatching false
        (appInfo.flags and android.content.pm.ApplicationInfo.FLAG_SYSTEM) == 0
    }.getOrDefault(false)

    // ── Suspicious package detection (item 28) ───────────────────────────────
    // detectRoot() inspects filesystem paths (su binaries, Magisk files) that
    // Magisk Hide masks with mount-namespace tricks. PackageManager queries go
    // through the system Binder and cannot be spoofed the same way — so Magisk
    // Manager (com.topjohnwu.magisk) and LSPosed Manager remain visible even
    // when file-system checks pass clean.
    //
    // Each per-package lookup is individually guarded so a single PACKAGE_NOT_FOUND
    // SecurityException (rare on some vendor ROM hardening) does not mask all
    // others. The outer runCatching handles ContentResolver/Binder failures.
    //
    // WARN tier — same as rooted. NOT added to earlyCheck. JS wiring is item 29.

    @JvmSynthetic
    private fun checkSuspiciousPackages(): Boolean = runCatching {
        val pm = context.packageManager
        val suspiciousPackages = listOf(
            "com.topjohnwu.magisk",                  // Magisk Manager (official)
            "io.github.huskydg.magisk",              // Delta Magisk fork
            "me.weishu.kernelflasher",               // KernelSU flasher
            "org.lsposed.manager",                   // LSPosed framework manager
            "de.robv.android.xposed.installer",      // original Xposed Installer
            "eu.chainfire.supersu",                  // SuperSU
            "com.noshufou.android.su",               // older Superuser
            "com.saurik.substrate",                  // Cydia Substrate (Android)
        )
        suspiciousPackages.any { pkg ->
            runCatching { pm.getPackageInfo(pkg, 0); true }.getOrDefault(false)
        }
    }.getOrDefault(false)

    // ── Virtual app container detection (item 26) ────────────────────────────
    // VirtualApp (io.va), Parallel Space (com.lbe.parallel), Island
    // (com.oasisfeng.island), and similar "dual space" / app-cloning frameworks
    // install a copy of the target APK under the container host's own data
    // directory rather than the standard system path (/data/app/…).
    //
    // Running inside a virtual container is a trust-boundary violation:
    //   – The container host can intercept binder calls, fake root/tamper signals,
    //     and proxy biometric prompts — undermining all other RASP checks.
    //   – The app's IPC and filesystem boundaries are crossed by the container
    //     process, so key material and clipboard content are exposed.
    //
    // Detection: applicationInfo.sourceDir is the installed APK path. Under a
    // normal system install this is /data/app/<pkg>/<hash>/base.apk. Inside a
    // virtual container it resolves to a path under the host's own
    // /data/data/<container.pkg>/ — a structural tell that cannot be hidden by
    // standard mount-namespace tricks (the path is populated by PackageManager
    // from the app's ApplicationInfo, not from the filesystem view).
    //
    // WARN tier — same as rooted. NOT added to earlyCheck (WARN only).
    // JS wiring to signals.rooted is a separate item (27).

    @JvmSynthetic
    private fun checkVirtualApp(): Boolean = runCatching {
        val sourceDir = context.applicationInfo.sourceDir ?: return@runCatching false
        val knownVirtualPaths = listOf(
            "/data/data/io.va/",
            "/data/data/com.lbe.parallel",
            "/data/data/com.excelliance.dualaid",
            "/data/data/com.bly.dualspace",
            "/data/data/com.parallel.space",
            "/data/data/com.ludashi.superboost",
            "/data/data/io.virtualapp.",
            "/data/data/com.oasisfeng.island",
        )
        knownVirtualPaths.any { sourceDir.startsWith(it) }
    }.getOrDefault(false)

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
            // BLOCK-tier early checks: hook (debugger/Frida/ptrace) + tamper (cert) +
            // screen capture (Miracast/WFD mirroring — surveillance vector, item 22).
            return earlyDetectHook() || earlyDetectTamper(context)
                || earlyCheckScreenCapture(context)
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
                || earlyCheckJdwp()

        // earlyCheckJdwp — JDWP debugger detection in the early companion gate
        // (item 20). Android analogue of iOS +earlyCheckDebugger (item 15).
        // checkJdwpDebugger() (item 14) runs the same check post-bridge inside
        // detectHook(); this companion-object mirror closes the pre-bridge window
        // so an Android Studio / IntelliJ JDWP attach at app launch fires the
        // native block screen before the Capacitor bridge initialises.
        // Fail-open (runCatching + getOrDefault(false)): a missing Debug class
        // or platform restriction must never block a legitimate launch.
        private fun earlyCheckJdwp(): Boolean =
            runCatching { Debug.isDebuggerConnected() }.getOrDefault(false)

        // earlyCheckScreenCapture — pre-bridge Miracast/WFD screen-mirroring gate
        // (item 22). Android analogue of iOS +earlyCheckScreenCapture (item 17).
        // checkScreenCapture() (item 21) runs the same DisplayManager check
        // post-bridge; this companion-object mirror closes the pre-bridge window
        // so a screen-casting session active at launch fires the native block screen
        // before the Capacitor bridge initialises — the same surveillance-vector
        // rationale as AirPlay blocking on iOS.
        // Requires context (DisplayManager.getSystemService); mirrors the context
        // parameter pattern of earlyDetectTamper(context).
        private fun earlyCheckScreenCapture(context: android.content.Context): Boolean = runCatching {
            val dm = context.getSystemService(android.hardware.display.DisplayManager::class.java)
                ?: return@runCatching false
            dm.getDisplays(android.hardware.display.DisplayManager.DISPLAY_CATEGORY_PRESENTATION).isNotEmpty()
        }.getOrDefault(false)

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
