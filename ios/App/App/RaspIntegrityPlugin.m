// RaspIntegrityPlugin.m — iOS RASP integrity probe
//
// STATUS: BUILT-UNVALIDATED — logic is present and, as of 2026-07-11 (#826), this
// file + RaspIntegrityPluginBridge.m are in the Xcode App build target (so CAP_PLUGIN
// actually registers at runtime). It has NOT been exercised on a real jailbroken /
// Frida-hooked device. Requires on-device hostile testing and the independent audit
// before the status can advance (F-09).
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
#import <unistd.h>
// mach-o/dyld.h declares _dyld_image_count/_dyld_get_image_name (dyld image
// scan for Frida/Substrate libraries). Missing until #826 put this file in the
// build target — first real compile surfaced the implicit declarations.
#import <mach-o/dyld.h>

// CFNetwork for port probe
#import <CFNetwork/CFNetwork.h>

@implementation RaspIntegrityPlugin

- (void)checkIntegrity:(CAPPluginCall *)call {
    BOOL jailbroken    = [self detectJailbreak];
    BOOL hookedProcess = [self detectHook];
    BOOL emulator      = [self detectSimulator];
    BOOL tampered      = [self detectTamper];

    CAPPluginCall *c = call;
    [c resolve:@{
        @"jailbroken":    @(jailbroken),
        @"hookedProcess": @(hookedProcess),
        @"emulator":      @(emulator),
        @"tampered":      @(tampered),
    }];
}

// ── Jailbreak detection ────────────────────────────────────────────────────

- (BOOL)detectJailbreak {
    return [self checkJailbreakPaths]
        || [self checkSandboxEscape]
        || [self checkDynamicLibraries];
}

- (BOOL)checkJailbreakPaths {
    NSArray<NSString *> *paths = @[
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
    // Frida-server default port 27042. A successful loopback connect means
    // a Frida server is listening on the device.
    @try {
        CFReadStreamRef readStream  = NULL;
        CFWriteStreamRef writeStream = NULL;
        CFStreamCreatePairWithSocketToHost(
            kCFAllocatorDefault,
            (__bridge CFStringRef)@"127.0.0.1",
            27042,
            &readStream, &writeStream
        );
        if (readStream && writeStream) {
            BOOL opened = CFReadStreamOpen(readStream) && CFWriteStreamOpen(writeStream);
            if (readStream)  { CFReadStreamClose(readStream);  CFRelease(readStream);  }
            if (writeStream) { CFWriteStreamClose(writeStream); CFRelease(writeStream); }
            if (opened) return YES;
        }
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
        }
    } @catch (__unused NSException *e) {}
    return NO;
}

@end
