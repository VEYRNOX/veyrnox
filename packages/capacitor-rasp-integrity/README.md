# @veyrnox/capacitor-rasp-integrity

Runtime Application Self-Protection (RASP) Capacitor plugin for Android and iOS.

Built across PRs #825, #832, #834, #947–#955, #1009–#1014 in the Veyrnox project.
Device-verified on Samsung Galaxy Note 20 5G (SM-N981B, Magisk v30.7, Android 16),
Pixel 10 Pro XL (clean Android 16), and iPhone 8 Plus (iOS 16.7.16, palera1n rootful jailbreak).

INTERNAL — not independently audited. See CLAUDE.md audit status for open residuals.

---

## What it detects

### Android (14 fields)

| Field | Signal |
|-------|--------|
| `rooted` | su binaries, Magisk paths, unlocked bootloader (`ro.boot.verifiedbootstate=orange/red`), writable /system, test-keys build, LocalSocket connect to Zygisk/LSPosed/APatch/KSU daemons |
| `hookedProcess` | Frida port 27042, Xposed/LSPosed packages, /proc/self/maps scan, Frida Gadget thread-names (`gum-js-loop`, `gmain`, `gdbus`), Frida fd pipes, TracerPid ≠ 0, JDWP debugger |
| `emulator` | Build fingerprint/model/hardware/product strings, emulator device files |
| `tampered` | SHA-256 cert fingerprint vs `RELEASE_CERT_SHA256` build config field |
| `debuggerAttached` | `Debug.isDebuggerConnected()` |
| `screenCapture` | Active presentation display (Miracast/WFD mirroring) |
| `overlayActive` | Non-system accessibility service with FEEDBACK_ALL_MASK |
| `developerMode` | ADB enabled or Developer Options on |
| `virtualApp` | sourceDir under known VirtualApp/Parallel Space paths |
| `suspiciousPackage` | Magisk Manager, LSPosed Manager, SuperSU, Cydia Substrate |
| `thirdPartyKeyboard` | Active IME without FLAG_SYSTEM |
| `mockLocation` | ALLOW_MOCK_LOCATION or AppOps mock location grant |
| `networkProxy` | HTTP/HTTPS proxy configured on device |
| `accessibilityService` | User-installed (non-system) accessibility services |

### iOS (7 fields)

| Field | Signal |
|-------|--------|
| `jailbroken` | `fork()` succeeds (palera1n), jailbreak paths (`stat()` + NSFileManager), sandbox escape write, dyld image scan (MobileSubstrate, Cydia, ElleKit, Frida) |
| `hookedProcess` | Frida port 27042, dyld scan |
| `emulator` | `TARGET_OS_SIMULATOR`, UIDevice model/env vars |
| `tampered` | dyld scan for MobileSubstrate/SubstrateLoader/TweakInject |
| `debuggerAttached` | `sysctl` KERN_PROC `P_TRACED` flag |
| `screenCapture` | `UIScreen.mainScreen.isCaptured` (AirPlay/ReplayKit) |
| `overlayActive` | `UIAccessibilityIsAssistiveTouchRunning()` |

---

## Pre-bridge early gate (before WebView starts)

Both platforms gate BLOCK-tier signals BEFORE Capacitor initialises:

- **Android**: `RaspIntegrityPlugin.Companion.earlyCheck(context)` called in `MainActivity.onCreate()` before `super.onCreate()` and `registerPlugin()`. On BLOCK: native AlertDialog shown, `finishAffinity()` called, bridge never starts.
- **iOS**: `[RaspIntegrityPlugin earlyCheck]` called in `AppDelegate.application:didFinishLaunchingWithOptions:`. On BLOCK: bridge never initialises.

BLOCK-tier early signals: `hookedProcess` + `tampered` + `screenCapture`. Root and emulator are WARN-tier — handled post-launch by the JS presign gate.

Additionally: `PR_SET_DUMPABLE=0` (Android) / `ptrace(PT_DENY_ATTACH)` (iOS) are called at earlyCheck time to harden against memory-dump and ptrace-attach.

---

## Hardware KEK integration (Android)

`HardwareKekPlugin.getHardwareFactor()` calls `RaspIntegrityPlugin.Companion.isBlockTier(context)` before returning the hardware KEK factor H. This provides defense-in-depth at the native layer: a JS-level presignGate bypass cannot reach the hardware key if the device is BLOCK-tier.

---

## Install

```bash
npm install @veyrnox/capacitor-rasp-integrity
npx cap sync
```

### Android setup

In `MainActivity.java` (before `super.onCreate`):
```java
import com.veyrnox.raspplugin.RaspIntegrityPlugin;

@Override
public void onCreate(Bundle savedInstanceState) {
    // Early gate — must be before super.onCreate and registerPlugin
    if (RaspIntegrityPlugin.Companion.earlyCheck(this)) {
        super.onCreate(null);
        // Show block screen, call finishAffinity()
        return;
    }
    super.onCreate(savedInstanceState);
    init(savedInstanceState);
}
```

Register the plugin:
```java
add(RaspIntegrityPlugin.class);
```

Set your release cert fingerprint in `gradle.properties`:
```
RELEASE_CERT_SHA256=AA:BB:CC:...  # your release keystore SHA-256
```

Or in `build.gradle`:
```groovy
buildConfigField 'String', 'RELEASE_CERT_SHA256', "\"${RELEASE_CERT_SHA256 ?: ''}\""
```

### iOS setup

In `AppDelegate.swift`:
```swift
import Capacitor

func application(_ application: UIApplication, didFinishLaunchingWithOptions ...) -> Bool {
    RaspIntegrityPlugin.earlyCheck() // blocks HOOKED/TAMPERED before bridge starts
    ...
}
```

---

## API

### `RaspIntegrity.checkIntegrity()`

Returns a `RaspVerdict` with all detection fields. Each field is `true` only when actively detected. Throws if the native plugin is unavailable.

### `getFreshRaspArtifact()`

Fresh probe at sign time. Runs native + browser probes in parallel with a 1500ms fail-closed timeout. Returns a `RaspArtifact`.

```ts
import { getFreshRaspArtifact, TIER } from '@veyrnox/capacitor-rasp-integrity';

const artifact = await getFreshRaspArtifact();
if (artifact.tier === TIER.BLOCK) {
  throw new Error(artifact.sentence);
}
if (artifact.requiresConfirmation) {
  // show acknowledgement checkbox
}
```

### `isSensitiveActionBlocked(artifact, action)`

Check whether an action is blocked. Pass `'sign'`, `'seed-reveal'`, `'export'`, or `'import'`.

### `detect(probeSource)` / `degrade(condition)` / `classifyEnvironment(signals)`

Low-level building blocks — see `src/gate.ts` for full JSDoc.

---

## Tier mapping

| Condition | Tier | Sign | Seed-reveal/export/import | Biometric re-confirm |
|-----------|------|------|--------------------------|---------------------|
| CLEAN | ALLOW | ✓ | ✓ | — |
| ELEVATED (soft signals) | WARN | With checkbox | ✓ | ✓ |
| ROOTED / INTEGRITY_UNAVAILABLE | WARN | With checkbox + biometric | Blocked | ✓ |
| EMULATOR | BLOCK | Blocked | Blocked | — |
| HOOKED / TAMPERED / INTEGRITY_FAIL | BLOCK | Blocked | Blocked | — |

---

## Honest gaps and open residuals

- Independent third-party audit: outstanding.
- iOS `detectTamper()` lacks cert-fingerprint comparison (Android has this).
- `RELEASE_CERT_SHA256` in production Gradle build must be set; absent = `tampered:true` (fail-closed, I4 — correct behaviour, production-config dependency).
- `ro.boot.secureboot="0"` can false-positive on some MediaTek ROMs (P3-4 note).
- `checkLocalSocketConnect()` may be SELinux-denied on Android 12+ — fail-open (not fail-closed) for this specific check; `checkDangerousProps()` is the primary Magisk signal.
- Play Integrity verification (`PlayIntegrityPlugin.kt`): never tested against a real production token. ES256 raw→DER transcoder (`EcdsaDerTranscoder.kt`) proven by JS mirror + 10 Vitest cases; JVM binding is source-string-pinned only (`#957` filed for JVM test harness).
- iOS App Attest: `DCAppAttestService.generateAssertion` proves SE key intact, NOT device integrity — server-side verification required for full attestation.
- LOG-1: debug-build Capacitor bridge echoes plugin results to logcat. Production: set `loggingBehavior: "none"` in `capacitor.config.json` (done in Veyrnox 2026-07-17).

---

## Status

BUILT / INTERNAL. Device-verified on specific devices listed above — not independently audited, not independently confirmed as "verified" for any catalogue asset.
