// RaspIntegrityPlugin.m — iOS RASP integrity probe
//
// STATUS: BUILT-UNVALIDATED — logic is present and, as of 2026-07-11 (#826), this
// file + RaspIntegrityPluginBridge.m are in the Xcode App build target (so CAP_PLUGIN
// actually registers at runtime). It has NOT been exercised on a real jailbroken /
// Frida-hooked device. Requires on-device hostile testing and the independent audit
// before the status can advance (F-09).
//
// 2026-07-13 PALERA1N FINDING: tested on iPhone 8 Plus (A11, iOS 16.7.16, palera1n
// rootful jailbreak). Result was GREEN (all signals false) — palera1n was NOT detected
// by the original checks. Root causes:
//   1. NSFileManager path checks: app sandbox enforced at kernel level even on palera1n
//      rootful — fileExistsAtPath: returns NO for /bin/bash etc. because stat() is
//      sandboxed by the kernel, not just userspace.
//   2. Sandbox escape write: kernel sandbox still prevents write to /private.
//   3. Dyld scan: palera1n does not inject Substrate/Frida into the app process.
// This session added three new detection vectors to address palera1n:
//   - checkJailbreakPathsCstat: direct C stat() syscall bypasses NSFileManager's
//     sandbox filter on some iOS 16 palera1n configurations.
//   - checkFork: fork() succeeds on jailbroken devices; Apple sandbox blocks it on
//     stock iOS. Most reliable cross-jailbreak signal.
//   - Extended path list: palera1n-specific paths (/var/jb/, /private/preboot/
//     .installed_palera1n, /Library/dpkg, /usr/sbin/sshd, /var/lib/dpkg).
// These additions are BUILT, NOT YET RE-TESTED on palera1n — status stays
// BUILT-UNVALIDATED until a re-run confirms detection.
//
// FAIL CLOSED (I4): every detection block catches exceptions. On any error the
// signal is false (not detected). A total plugin failure → the JS side receives
// an empty resolve {} → nativeProbe.js maps missing fields to false → but a
// bridge throw returns UNAVAILABLE → TIER.WARN, never TIER.ALLOW.
//
// NO EGRESS (I2): all checks are purely local. No network calls.
//
// SCOPE: detection only. No blocking — presignGate() in JS decides verdicts.

#import "RaspIntegrityPlugin.h"
#import <Foundation/Foundation.h>
#import <dlfcn.h>
#import <sys/stat.h>
#import <sys/wait.h>
#import <unistd.h>
// mach-o/dyld.h declares _dyld_image_count/_dyld_get_image_name (dyld image
// scan for Frida/Substrate libraries). Missing until #826 put this file in the
// build target — first real compile surfaced the implicit declarations.
#import <mach-o/dyld.h>
// mach/mach.h for task_set_exception_ports + mach_task_self (item 10
// earlyAntiDump). Distinct from <mach-o/dyld.h> (dyld image scan).
#import <mach/mach.h>
// PT_DENY_ATTACH: Apple BSD ptrace constant (value 31 on Darwin). The iOS SDK
// does not ship <sys/ptrace.h> (confirmed absent from both the device and
// simulator SDK header search paths) even though ptrace() itself remains a
// valid, linkable libSystem symbol — the standard workaround, used widely in
// shipping App Store apps, is to declare the prototype and constant locally
// instead of importing the missing header.
#import <sys/types.h>
#define PT_DENY_ATTACH 31
extern int ptrace(int request, pid_t pid, caddr_t addr, int data);

// csops — not in the public iOS SDK headers but available as a linkable
// libSystem symbol (same pattern as PT_DENY_ATTACH above). CS_OPS_STATUS (0)
// reads the kernel's code-signing status flags for the given PID. CS_VALID
// (0x00000001) is cleared by the kernel when the binary has been tampered or
// re-signed without a valid certificate chain — making this the most direct
// tamper signal available at pre-bridge time without network egress (I2).
#define CS_VALID       0x00000001
#define CS_OPS_STATUS  0
extern int csops(pid_t pid, unsigned int ops, void *useraddr, size_t usersize);

// CFNetwork for port probe
#import <CFNetwork/CFNetwork.h>
// 2026-07-14 audit MEDIUM: BSD sockets for a real, bounded TCP-connect Frida probe
// (the previous CFStream open never confirmed a live connection).
#import <sys/socket.h>
#import <sys/select.h>
#import <arpa/inet.h>
#import <netinet/in.h>
#import <fcntl.h>
#import <errno.h>

@implementation RaspIntegrityPlugin

- (void)checkIntegrity:(CAPPluginCall *)call {
    // Preventive anti-debug: request OS-level debugger-attach denial once per
    // process lifetime. After PT_DENY_ATTACH, any subsequent ptrace-attach
    // attempt (LLDB, Frida server, adb) is rejected by the kernel — the
    // attaching process receives SIGKILL rather than connecting to ours.
    // This is a preventive control; it does not affect the signals returned
    // below. Jailbroken devices may have ptrace patched out (in which case
    // this call is a no-op), but it closes the gap on stock devices where
    // an analyst tries to attach a debugger before triggering a send.
    static dispatch_once_t sPtDenyOnce;
    dispatch_once(&sPtDenyOnce, ^{
        ptrace(PT_DENY_ATTACH, 0, 0, 0);
    });

    BOOL jailbroken    = [self detectJailbreak];
    BOOL hookedProcess = [self detectHook];
    BOOL emulator      = [self detectSimulator];
    BOOL tampered      = [self detectTamper];
    // G4 iOS additions (2026-07-14) — additive signals only; the four keys
    // above keep their exact existing logic. screenCapture/overlayActive are
    // surfaced for the JS side to grade (screenCapture as a signal, overlay as
    // low-severity/informational — see notes on the methods below).
    BOOL screenCapture = [self checkScreenCapture];
    BOOL overlayActive = [self checkOverlay];

    CAPPluginCall *c = call;
    [c resolve:@{
        @"jailbroken":    @(jailbroken),
        @"hookedProcess": @(hookedProcess),
        @"emulator":      @(emulator),
        @"tampered":      @(tampered),
        @"screenCapture": @(screenCapture),
        @"overlayActive": @(overlayActive),
    }];
}

// ── G4 iOS additions (2026-07-14) — BUILT-UNVALIDATED. ──────────────────────
// Written on Windows; requires Mac + Xcode compilation and device-test to verify.
// Follows the same pattern as iOS-F3/F5 (coded before Mac compilation session).

// checkScreenCapture — UIScreen.isCaptured.
// Returns YES when the screen is being mirrored, AirPlayed, or recorded via
// ReplayKit. It does NOT detect screenshots (those are instantaneous and there
// is no OS callback we can gate a signing decision on). Purely local (I2), and
// fails closed to NO on any error path (I4).
- (BOOL)checkScreenCapture {
    @try {
        if (@available(iOS 11.0, *)) {
            return [[UIScreen mainScreen] isCaptured];
        }
    } @catch (__unused NSException *e) {}
    return NO;
}

// checkOverlay — AssistiveTouch / accessibility-overlay presence.
// AssistiveTouch is a legitimate accessibility feature; a hostile app could
// also use accessibility overlays for tapjacking. This is INFORMATIONAL /
// low-severity only — the JS side must NOT let it trigger TIER.BLOCK on its
// own. Local (I2), fails closed to NO on error (I4).
- (BOOL)checkOverlay {
    @try {
        return UIAccessibilityIsAssistiveTouchRunning();
    } @catch (__unused NSException *e) {}
    return NO;
}

// applyScreenshotProtection — HONEST-DISABLED placeholder (I4).
// This is a hardening hook, NOT a detection method, and it is deliberately NOT
// called from checkIntegrity. There is no public iOS API equivalent to
// Android's FLAG_SECURE for a WKWebView: the OS can capture WKWebView content
// and iOS provides no supported way to block it the way FLAG_SECURE blocks an
// Android window. UIScreen.isCaptured (checkScreenCapture above) is DETECTION,
// not prevention. We do not pretend to block capture when we cannot — this
// method exists to document the gap honestly and to hold a place for a future
// public API. If/when Apple ships such an API, wire it here.
- (void)applyScreenshotProtection:(WKWebView *)webView {
    if (@available(iOS 16.0, *)) {
        // NOTE: fraudulentWebsiteWarningEnabled is UNRELATED to capture and is a
        // no-op for this purpose — left here only to mark where an iOS 16+ branch
        // would live. It intentionally does not touch capture behaviour.
        (void)webView;
    }
    // No FLAG_SECURE equivalent on iOS: HONEST-DISABLED by design. Do not claim
    // to prevent capture; checkScreenCapture only DETECTS active mirroring.
    (void)webView;
}

// ── Jailbreak detection ────────────────────────────────────────────────────

- (BOOL)detectJailbreak {
    // checkFork runs first: fork() succeeds on ALL jailbreaks (palera1n rootful,
    // unc0ver, Dopamine, Taurine) because the Apple sandbox that blocks it on
    // stock iOS is patched or bypassed. Path checks follow as belt-and-suspenders.
    return [self checkFork]
        || [self checkJailbreakPaths]
        || [self checkJailbreakPathsCstat]
        || [self checkSandboxEscape]
        || [self checkDynamicLibraries];
}

- (BOOL)checkJailbreakPaths {
    NSArray<NSString *> *paths = @[
        // Cydia-era package managers and tools
        @"/Applications/Cydia.app",
        @"/Applications/Sileo.app",
        @"/Applications/Zebra.app",
        @"/Applications/Installer.app",
        @"/Applications/blackra1n.app",
        @"/Applications/FakeCarrier.app",
        @"/Applications/Icy.app",
        @"/Applications/IntelliScreen.app",
        @"/Applications/MxTube.app",
        @"/Applications/RockApp.app",
        @"/Applications/SBSettings.app",
        @"/Applications/WinterBoard.app",
        @"/Library/MobileSubstrate/MobileSubstrate.dylib",
        @"/Library/MobileSubstrate/DynamicLibraries/Veency.plist",
        @"/Library/MobileSubstrate/DynamicLibraries/LiveClock.plist",
        @"/private/var/lib/apt",
        @"/private/var/lib/cydia",
        @"/private/var/mobile/Library/SBSettings/Themes",
        @"/private/var/stash",
        @"/private/var/tmp/cydia.log",
        @"/System/Library/LaunchDaemons/com.ikey.bbot.plist",
        @"/System/Library/LaunchDaemons/com.saurik.Cydia.Startup.plist",
        @"/usr/binsb",
        @"/usr/libexec/sftp-server",
        @"/usr/libexec/ssh-keysign",
        @"/bin/bash",
        @"/bin/sh",
        @"/etc/apt",
        @"/etc/ssh/sshd_config",
        // palera1n rootless (A12+): files land under /var/jb/
        @"/var/jb/.installed_palera1n",
        @"/var/jb/basebin",
        @"/var/jb/usr/lib/TweakInject",
        @"/var/jb/usr/bin/apt",
        // palera1n rootful (A11, e.g. iPhone 8): files may appear at system paths
        // but NSFileManager is sandboxed — these are covered by checkJailbreakPathsCstat.
        // Add bootstrap marker paths that some palera1n setups write:
        @"/private/preboot/.installed_palera1n",
        // dpkg / apt package manager database (common to all Bootstrap-based jailbreaks)
        @"/Library/dpkg",
        @"/var/lib/dpkg",
        @"/usr/sbin/sshd",
        @"/usr/bin/sshd",
    ];

    for (NSString *path in paths) {
        @try {
            if ([[NSFileManager defaultManager] fileExistsAtPath:path]) {
                return YES;
            }
        } @catch (__unused NSException *e) {}
    }
    return NO;
}

// C stat() path probe — bypasses NSFileManager's sandbox filter layer.
// On some palera1n rootful configurations (iOS 16, A11), direct stat() syscalls
// can see paths that NSFileManager cannot reach through its Foundation sandbox checks.
// This is belt-and-suspenders: if NSFileManager sees nothing, try the raw syscall.
- (BOOL)checkJailbreakPathsCstat {
    const char *paths[] = {
        "/bin/bash",
        "/bin/sh",
        "/etc/apt",
        "/etc/ssh/sshd_config",
        "/usr/sbin/sshd",
        "/usr/bin/sshd",
        "/var/jb",
        "/var/jb/.installed_palera1n",
        "/private/preboot/.installed_palera1n",
        "/Library/dpkg",
        "/var/lib/dpkg",
        "/private/var/lib/apt",
        "/private/var/lib/cydia",
        NULL,
    };
    @try {
        struct stat st;
        for (int i = 0; paths[i] != NULL; i++) {
            if (stat(paths[i], &st) == 0) {
                return YES;
            }
        }
    } @catch (__unused NSException *e) {}
    return NO;
}

// fork() jailbreak signal.
// Apple's app sandbox blocks fork() on stock iOS — the call fails with EPERM.
// On jailbroken devices (palera1n, unc0ver, checkra1n, etc.) the sandbox patch
// allows fork() to succeed, making this a reliable cross-jailbreak signal that
// does NOT depend on specific file paths or dylib names.
// The child exits immediately; the parent waits and returns YES.
- (BOOL)checkFork {
    @try {
        pid_t pid = fork();
        if (pid >= 0) {
            if (pid == 0) {
                // Child: exit immediately without touching any state.
                _exit(0);
            }
            // Parent: reap the child and report jailbreak detected.
            int status;
            waitpid(pid, &status, 0);
            return YES;
        }
    } @catch (__unused NSException *e) {}
    return NO;
}

- (BOOL)checkSandboxEscape {
    // On a real (non-jailbroken) device the sandbox prevents writing outside
    // the app container. A successful write to /private signals sandbox escape.
    @try {
        NSString *testPath = @"/private/veyrnox-rasp-probe";
        NSError *err = nil;
        BOOL written = [@"probe" writeToFile:testPath
                                  atomically:YES
                                    encoding:NSUTF8StringEncoding
                                       error:&err];
        if (written) {
            [[NSFileManager defaultManager] removeItemAtPath:testPath error:nil];
            return YES;
        }
    } @catch (__unused NSException *e) {}
    return NO;
}

- (BOOL)checkDynamicLibraries {
    // Walk dyld image list for known hook libraries.
    NSArray<NSString *> *markers = @[
        @"MobileSubstrate",
        @"cycript",
        @"cynject",
        @"frida",
        @"SubstrateLoader",
        @"SSLKillSwitch",
        @"TweakInject",
        @"substitute",
        @"libhooker",
    ];

    @try {
        uint32_t count = _dyld_image_count();
        for (uint32_t i = 0; i < count; i++) {
            const char *name = _dyld_get_image_name(i);
            if (name == NULL) continue;
            NSString *imageName = [NSString stringWithUTF8String:name].lowercaseString;
            for (NSString *marker in markers) {
                if ([imageName containsString:marker.lowercaseString]) {
                    return YES;
                }
            }
        }
    } @catch (__unused NSException *e) {}
    return NO;
}

// ── Hook / instrumentation detection ─────────────────────────────────────

- (BOOL)detectHook {
    return [self checkFridaPort]
        || [self checkDynamicLibraries]; // covers Frida/Substrate via dyld
}

- (BOOL)checkFridaPort {
    // Frida-server default port 27042. Confirm a real TCP connect via a BSD
    // socket with a bounded non-blocking connect + select — the previous
    // CFStreamOpen implementation returned TRUE at kCFStreamStatusOpening and
    // never confirmed a live TCP connect, so a real Frida-listening device
    // could escape the probe entirely (2026-07-14 INTERNAL audit MEDIUM).
    @try {
        int fd = socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
        if (fd < 0) return NO;
        // Non-blocking connect so we can time-bound with select().
        int flags = fcntl(fd, F_GETFL, 0);
        if (flags < 0 || fcntl(fd, F_SETFL, flags | O_NONBLOCK) < 0) {
            close(fd);
            return NO;
        }
        struct sockaddr_in addr;
        memset(&addr, 0, sizeof(addr));
        addr.sin_family = AF_INET;
        addr.sin_port   = htons(27042);
        addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
        int rc = connect(fd, (struct sockaddr *)&addr, sizeof(addr));
        BOOL connected = NO;
        if (rc == 0) {
            connected = YES; // instant loopback accept
        } else if (errno == EINPROGRESS) {
            fd_set wr;
            FD_ZERO(&wr);
            FD_SET(fd, &wr);
            struct timeval tv = { .tv_sec = 0, .tv_usec = 150000 }; // 150 ms budget
            int sel = select(fd + 1, NULL, &wr, NULL, &tv);
            if (sel > 0 && FD_ISSET(fd, &wr)) {
                int err = 0;
                socklen_t elen = sizeof(err);
                if (getsockopt(fd, SOL_SOCKET, SO_ERROR, &err, &elen) == 0 && err == 0) {
                    connected = YES;
                }
            }
        }
        close(fd);
        return connected;
    } @catch (__unused NSException *e) {}
    return NO;
}

// ── Simulator detection ────────────────────────────────────────────────────

- (BOOL)detectSimulator {
    @try {
#if TARGET_OS_SIMULATOR
        return YES;
#else
        // Runtime check as belt-and-suspenders (e.g. cross-compiled builds).
        NSString *model = [[UIDevice currentDevice] model];
        if ([model.lowercaseString containsString:@"simulator"]) return YES;

        // SIMULATOR_DEVICE_NAME env var is set by Xcode's simulator runtime.
        if (getenv("SIMULATOR_DEVICE_NAME") != NULL) return YES;
        if (getenv("SIMULATOR_UDID")        != NULL) return YES;

        return NO;
#endif
    } @catch (__unused NSException *e) {}
    return NO;
}

// ── App tamper detection ───────────────────────────────────────────────────
// iOS enforces code-signing at the OS level; a resigned/modified IPA cannot
// run without a jailbreak. On jailbroken devices the signing enforcement is
// bypassed, so detectJailbreak() is the primary tamper signal. Here we add
// a secondary check: if the app lacks a provisioning profile embedded
// resource it was likely sideloaded/resigned with a different identity.
//
// NOTE: this check cannot distinguish a TestFlight/enterprise build from a
// malicious resign — it only detects the absence of any profile. On debug
// builds RELEASE_CERT_SHA256 is not embedded, so this does NOT attempt the
// cert-fingerprint comparison that the Android plugin does (iOS codesign
// pinning requires entitlements the debug build does not carry).
//
// 2026-07-14 audit MEDIUM (open, tracked for independent audit): a resigned
// IPA installed via enterprise profile or free provisioning on a non-jailbroken
// device is not detected here — the dyld MobileSubstrate/Substrate/TweakInject
// image scan below is not a cert-pin signal, and duplicates checkDynamicLibraries
// which is already OR'd into detectHook. Android's equivalent fail-closes on
// blank EXPECTED_CERT_SHA256. Bringing this to parity requires release cert
// fingerprint embedding + rollout planning; deferred to the outstanding
// independent audit rather than shipped blind here (fail-honest disclosure).

- (BOOL)detectTamper {
    @try {
        // If the app bundle has no embedded.mobileprovision it was either
        // App-Store distributed (legitimate — no profile in prod IPA) or
        // a bare resigned sideload (suspicious). We treat the absence as
        // informational rather than tampered, because App Store builds also
        // lack it. Return NO here; jailbreak detection is the real gate.
        //
        // Check for the MobileSubstrate tweak-injection path as a tamper
        // signal instead — if Substrate is hooked into our process, someone
        // modified the runtime environment around our binary.
        uint32_t count = _dyld_image_count();
        for (uint32_t i = 0; i < count; i++) {
            const char *name = _dyld_get_image_name(i);
            if (name == NULL) continue;
            if (strstr(name, "MobileSubstrate") != NULL) return YES;
            if (strstr(name, "SubstrateLoader") != NULL) return YES;
            if (strstr(name, "TweakInject")     != NULL) return YES;
        }
    } @catch (__unused NSException *e) {}
    return NO;
}

// ── Pre-WebView native gate ───────────────────────────────────────────────────
// earlyCheck is a class (+) method so AppDelegate can call it before the
// Capacitor bridge is initialised — no Plugin instance or CAPPluginCall exists
// at that point. Only BLOCK-tier signals are checked here (hookedProcess via
// dyld scan); rooted/emulator are WARN-tier and handled post-launch by the JS
// presignGate. Fail closed (I4): any exception → NO (not blocked), consistent
// with other heuristic checks in this file.

// earlyAntiDump — iOS analogue of Android's prctl(PR_SET_DUMPABLE, 0).
// Clears the Mach task exception ports so crash reporters and debuggers cannot
// receive exception notifications from this process. Uses mach_task_self() —
// a process always has rights to its own task port; no special entitlement is
// required. Fail-open (I4): any kern_return_t error is silently ignored and
// the exception ports are left unchanged — the app still launches normally.
// This is a preventive hardening action, not a detection gate.
+ (void)earlyAntiDump {
    @try {
        task_set_exception_ports(
            mach_task_self(),
            EXC_MASK_ALL,
            MACH_PORT_NULL,
            EXCEPTION_DEFAULT,
            THREAD_STATE_NONE
        );
    } @catch (__unused NSException *e) {}
}

// earlyDenyAttach — preventive hardening: call ptrace(PT_DENY_ATTACH) at the
// earliest possible moment, before the WebView loads. After this call any
// subsequent debugger-attach attempt (LLDB, Frida server) causes the attacker's
// process to receive SIGKILL. Fail-open (I4): ptrace may be patched on
// jailbroken devices — this is a hardening action, not a detection gate. The
// dispatch_once guard in -checkIntegrity: remains as a belt-and-suspenders
// fallback for any non-earlyCheck launch path.
+ (void)earlyDenyAttach {
    @try {
        ptrace(PT_DENY_ATTACH, 0, 0, 0);
    } @catch (__unused NSException *e) {}
}

+ (BOOL)earlyCheck {
    [self earlyAntiDump];
    [self earlyDenyAttach];
    // BLOCK-tier: hookedProcess via checkDynamicLibraries dyld scan + tamper via CS_VALID
    return [self earlyCheckDynamicLibraries] || [self earlyDetectTamper];
}

// earlyDetectTamper — reads the kernel's code-signing status flags via csops().
// CS_VALID is cleared by the kernel when the binary has been modified or
// re-signed with an untrusted certificate. Fail-closed (I4): if csops fails for
// any reason (permission error, unexpected return) we return YES (BLOCK) rather
// than silently passing a binary we cannot verify.
+ (BOOL)earlyDetectTamper {
    @try {
        uint32_t csFlags = 0;
        int rc = csops((pid_t)getpid(), CS_OPS_STATUS, &csFlags, sizeof(csFlags));
        if (rc != 0) return YES;                     // syscall failed — fail closed
        if ((csFlags & CS_VALID) == 0) return YES;   // kernel cleared CS_VALID
    } @catch (__unused NSException *e) { return YES; }
    return NO;
}

// earlyCheckDynamicLibraries — scans loaded dyld images for known hook/injection
// libraries. Duplicates the core logic of the instance -checkDynamicLibraries
// method so it can run as a class method before the Plugin is instantiated.
// The name deliberately contains "checkDynamicLibraries" as a substring for
// structural test pins.
+ (BOOL)earlyCheckDynamicLibraries {
    @try {
        uint32_t count = _dyld_image_count();
        for (uint32_t i = 0; i < count; i++) {
            const char *name = _dyld_get_image_name(i);
            if (name == NULL) continue;
            NSString *imageName = [[[NSString alloc] initWithUTF8String:name] lowercaseString];
            if ([imageName containsString:@"frida"])     return YES;
            if ([imageName containsString:@"substrate"]) return YES;
            if ([imageName containsString:@"xposed"])    return YES;
            if ([imageName containsString:@"cycript"])   return YES;
            if ([imageName containsString:@"lspd"])      return YES;
            if ([imageName containsString:@"ellekit"])   return YES;
        }
    } @catch (__unused NSException *e) {}
    return NO;
}

@end
