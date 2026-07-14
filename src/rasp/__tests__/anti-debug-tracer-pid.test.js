// src/rasp/__tests__/anti-debug-tracer-pid.test.js
//
// Structural regression pins for anti-debug improvements and the pre-WebView
// native RASP gate:
//   1. Android checkTracerPid() — /proc/self/status TracerPid read; detects
//      adb/gdb/LLDB/Frida-server debugger attach.
//   2. iOS PT_DENY_ATTACH — ptrace(PT_DENY_ATTACH,0,0,0) in checkIntegrity:;
//      preventive control, blocks future debugger-attach attempts at OS level.
//   3. ProGuard fix — @CapacitorPlugin keep rule drops { *; } so R8 can rename
//      private detection methods (detectRoot, checkGadgetThreads, etc.) in
//      the release binary.
//   4. Pre-WebView native gate — earlyCheck() companion/class method runs
//      before the Capacitor bridge initialises on both Android and iOS.
//
// Tests start RED when the implementation is absent; turn GREEN once the
// code lands. Do NOT skip — RED = required gate.

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../../');

const kt = readFileSync(
  resolve(root, 'android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt'),
  'utf8',
);
const iosM = readFileSync(
  resolve(root, 'ios/App/App/RaspIntegrityPlugin.m'),
  'utf8',
);
const proguard = readFileSync(
  resolve(root, 'android/app/proguard-rules.pro'),
  'utf8',
);
const playKt = readFileSync(
  resolve(root, 'android/app/src/main/java/com/veyrnox/app/PlayIntegrityPlugin.kt'),
  'utf8',
);
const appAttestM = readFileSync(
  resolve(root, 'ios/App/App/AppAttestPlugin.m'),
  'utf8',
);
const pbxproj = readFileSync(
  resolve(root, 'ios/App/App.xcodeproj/project.pbxproj'),
  'utf8',
);
const entitlementsPath = resolve(root, 'ios/App/App/App.entitlements');
const buildGradle = readFileSync(
  resolve(root, 'android/app/build.gradle'),
  'utf8',
);
const cFilePath     = resolve(root, 'android/app/src/main/cpp/rasp_early.c');
const cmakePath     = resolve(root, 'android/app/src/main/cpp/CMakeLists.txt');
const hwKekM        = readFileSync(resolve(root, 'ios/App/App/HardwareKekPlugin.m'), 'utf8');

// ── 1. Android: checkTracerPid ────────────────────────────────────────────────

describe('Anti-debug — Android checkTracerPid', () => {
  it('checkTracerPid function is defined in RaspIntegrityPlugin.kt', () => {
    expect(kt).toContain('checkTracerPid');
  });

  it('checkTracerPid reads /proc/self/status', () => {
    expect(kt).toContain('/proc/self/status');
  });

  it('checkTracerPid looks for TracerPid: line', () => {
    expect(kt).toContain('TracerPid:');
  });

  it('checkTracerPid compares to zero (non-zero = debugger attached)', () => {
    // The check returns true when TracerPid != 0
    expect(kt).toMatch(/0L|!= 0/);
  });

  it('checkTracerPid is wired into detectHook()', () => {
    // Find detectHook() body and confirm checkTracerPid is called there
    const hookFn = kt.slice(kt.indexOf('private fun detectHook()'));
    const hookBody = hookFn.slice(0, hookFn.indexOf('\n    }') + 6);
    expect(hookBody).toContain('checkTracerPid');
  });

  it('checkTracerPid fails closed (getOrDefault(false))', () => {
    expect(kt).toContain('getOrDefault(false)');
  });
});

// ── 2. iOS: PT_DENY_ATTACH ───────────────────────────────────────────────────

describe('Anti-debug — iOS PT_DENY_ATTACH', () => {
  it('sys/ptrace.h is imported', () => {
    expect(iosM).toContain('<sys/ptrace.h>');
  });

  it('PT_DENY_ATTACH is called', () => {
    expect(iosM).toContain('PT_DENY_ATTACH');
    expect(iosM).toContain('ptrace(PT_DENY_ATTACH');
  });

  it('PT_DENY_ATTACH is guarded by dispatch_once (called once per process lifetime)', () => {
    expect(iosM).toContain('dispatch_once');
    // dispatch_once block must contain the ptrace call
    const onceIdx = iosM.indexOf('dispatch_once');
    const onceBlock = iosM.slice(onceIdx, onceIdx + 200);
    expect(onceBlock).toContain('PT_DENY_ATTACH');
  });

  it('PT_DENY_ATTACH is invoked inside checkIntegrity:', () => {
    const checkIntIdx = iosM.indexOf('- (void)checkIntegrity:');
    const nextMethod = iosM.indexOf('\n- (', checkIntIdx + 1);
    const checkIntBody = iosM.slice(checkIntIdx, nextMethod > 0 ? nextMethod : undefined);
    expect(checkIntBody).toContain('PT_DENY_ATTACH');
  });
});

// ── 3. iOS: checkFork promoted as primary jailbreak signal ───────────────────

describe('iOS RASP — checkFork runs first in detectJailbreak', () => {
  it('detectJailbreak calls checkFork before path checks', () => {
    const jbIdx   = iosM.indexOf('- (BOOL)detectJailbreak');
    const nextMeth = iosM.indexOf('\n- (', jbIdx + 1);
    const body = iosM.slice(jbIdx, nextMeth > 0 ? nextMeth : undefined);
    const forkPos = body.indexOf('checkFork');
    const pathPos = body.indexOf('checkJailbreakPaths');
    expect(forkPos).toBeGreaterThan(-1);
    expect(pathPos).toBeGreaterThan(-1);
    expect(forkPos).toBeLessThan(pathPos);
  });
});

// ── 4. Android: checkProcNetUnix gated on API < Q ────────────────────────────

// ── 4. checkProcNetUnix removed — superseded by checkLocalSocketConnect ───────
// (The former gate test is replaced by the item 9 absence tests below.)

describe('Android RASP — checkProcNetUnix superseded (absence confirmed in item 9)', () => {
  it('checkLocalSocketConnect exists as the behavioral replacement', () => {
    expect(kt).toContain('private fun checkLocalSocketConnect(');
  });
});

// ── 5. @JvmSynthetic on all private detection methods ───────────────────────

describe('Android RASP — @JvmSynthetic on all private detection methods', () => {
  // Every private fun should have @JvmSynthetic directly above it so Frida's
  // Java API cannot address them by their readable name.
  const privateFns = [
    // checkProcNetUnix removed (item 9 — superseded by checkLocalSocketConnect)
    // checkSuFromRuntime removed (item 9 — structurally inert on Android 10+)
    'detectRoot', 'checkRootBinaries', 'checkMagiskPaths',
    'checkLocalSocketConnect', 'checkDangerousProps',
    'readSystemPropReflect', 'checkSystemWritable', 'checkBuildTags',
    'detectHook', 'checkTracerPid', 'checkFridaPort', 'checkXposed',
    'checkProcMapsForHook', 'checkGadgetThreads', 'checkFridaPipes',
    'detectEmulator', 'checkBuildProps', 'checkEmulatorFiles', 'detectTamper',
  ];

  for (const fn of privateFns) {
    it(`${fn}() has @JvmSynthetic annotation`, () => {
      const fnIdx = kt.indexOf(`private fun ${fn}(`);
      expect(fnIdx).toBeGreaterThan(-1);
      // Slice a small window before the function signature to find the annotation
      const window = kt.slice(Math.max(0, fnIdx - 60), fnIdx);
      expect(window).toContain('@JvmSynthetic');
    });
  }
});

// ── 6. ProGuard: private method renaming enabled ─────────────────────────────

describe('ProGuard — @CapacitorPlugin keep rule allows private method renaming', () => {
  it('-keep @CapacitorPlugin class * does NOT carry { *; } (would freeze all private members)', () => {
    // The narrow form `-keep @...CapacitorPlugin class *` keeps only the class
    // name; { *; } would prevent R8 from renaming private detection methods.
    // Find the narrow -keep line and confirm no { *; } follows on the same line.
    const line = proguard
      .split('\n')
      .find(l => l.includes('-keep @com.getcapacitor.annotation.CapacitorPlugin class *'));
    expect(line).toBeDefined();
    expect(line).not.toContain('{ *; }');
  });

  it('no-arg constructor is kept for reflection-based plugin instantiation', () => {
    expect(proguard).toContain('public <init>()');
  });

  it('@PluginMethod bridge methods are still kept', () => {
    expect(proguard).toContain('@com.getcapacitor.annotation.PluginMethod public *');
  });
});

// ── 7. Pre-WebView native gate ────────────────────────────────────────────────
//
// earlyCheck() runs BEFORE the Capacitor bridge initialises on both platforms.
// Android: companion object static method; called in MainActivity.onCreate()
//          before registerPlugin() + super.onCreate().
// iOS:     ObjC class method (+earlyCheck); called in AppDelegate before
//          didFinishLaunchingWithOptions returns (WebView not yet visible).
//
// On BLOCK (hookedProcess || tampered): native UI replaces the Capacitor VC
// so the bridge JS never executes — the attacker has no bridge to hook.

const mainActivity = readFileSync(
  resolve(root, 'android/app/src/main/java/com/veyrnox/app/MainActivity.java'),
  'utf8',
);
const iosH = readFileSync(
  resolve(root, 'ios/App/App/RaspIntegrityPlugin.h'),
  'utf8',
);
const appDelegate = readFileSync(
  resolve(root, 'ios/App/App/AppDelegate.swift'),
  'utf8',
);

describe('Pre-WebView native gate — Android companion object', () => {
  it('RaspIntegrityPlugin.kt declares a companion object', () => {
    expect(kt).toContain('companion object');
  });

  it('companion object exposes @JvmStatic earlyCheck(context)', () => {
    expect(kt).toContain('@JvmStatic');
    expect(kt).toContain('fun earlyCheck(');
  });

  it('earlyCheck delegates to earlyDetectHook and earlyDetectTamper', () => {
    expect(kt).toContain('earlyDetectHook()');
    expect(kt).toContain('earlyDetectTamper(');
  });

  it('companion earlyDetectHook covers TracerPid (no Frida server attached)', () => {
    expect(kt).toContain('earlyTracerPid()');
    expect(kt).toContain('TracerPid');
  });

  it('companion earlyDetectTamper checks cert SHA-256 fail-closed (I4)', () => {
    expect(kt).toContain('earlyDetectTamper(');
    expect(kt).toContain('RELEASE_CERT_SHA256');
  });
});

describe('Pre-WebView native gate — Android MainActivity wiring', () => {
  it('MainActivity.onCreate calls earlyCheck before any registerPlugin', () => {
    const onCreateBody = mainActivity.slice(mainActivity.indexOf('public void onCreate'));
    const earlyIdx = onCreateBody.indexOf('earlyCheck(');
    const registerIdx = onCreateBody.indexOf('registerPlugin(');
    expect(earlyIdx).toBeGreaterThan(-1);
    expect(registerIdx).toBeGreaterThan(-1);
    expect(earlyIdx).toBeLessThan(registerIdx);
  });

  it('MainActivity shows a native block screen on BLOCK (no super.onCreate)', () => {
    expect(mainActivity).toContain('showNativeBlockScreen()');
  });

  it('showNativeBlockScreen uses AlertDialog (no Capacitor bridge involved)', () => {
    expect(mainActivity).toContain('AlertDialog');
    expect(mainActivity).toContain('finishAffinity()');
  });
});

describe('Pre-WebView native gate — iOS class method', () => {
  it('RaspIntegrityPlugin.h declares + (BOOL)earlyCheck class method', () => {
    expect(iosH).toContain('+ (BOOL)earlyCheck');
  });

  it('RaspIntegrityPlugin.m implements + (BOOL)earlyCheck', () => {
    expect(iosM).toContain('+ (BOOL)earlyCheck');
  });

  it('iOS earlyCheck checks dynamic libraries (hookedProcess = BLOCK-tier)', () => {
    const implStart = iosM.indexOf('+ (BOOL)earlyCheck');
    expect(implStart).toBeGreaterThan(-1);
    const implBody = iosM.slice(implStart, implStart + 300);
    expect(implBody).toContain('checkDynamicLibraries');
  });
});

describe('Pre-WebView native gate — iOS AppDelegate wiring', () => {
  it('AppDelegate imports RaspIntegrityPlugin (bridging header covers it)', () => {
    // The ObjC plugin is available in Swift via the bridging header — no
    // explicit import needed. Verify the call is present instead.
    expect(appDelegate).toContain('RaspIntegrityPlugin.earlyCheck()');
  });

  it('AppDelegate calls earlyCheck at the top of didFinishLaunchingWithOptions', () => {
    const fnStart = appDelegate.indexOf('didFinishLaunchingWithOptions');
    const fnBody = appDelegate.slice(fnStart, fnStart + 600);
    const earlyIdx = fnBody.indexOf('earlyCheck()');
    // earlyCheck must appear before the keychain cleanup block and before 'return true'
    const returnIdx = fnBody.indexOf('return true');
    expect(earlyIdx).toBeGreaterThan(-1);
    expect(earlyIdx).toBeLessThan(returnIdx);
  });

  it('AppDelegate replaces rootViewController on BLOCK to prevent bridge load', () => {
    expect(appDelegate).toContain('rootViewController');
    expect(appDelegate).toContain('showNativeBlockScreen');
  });
});

// ── 8. Android anti-dump — prctl(PR_SET_DUMPABLE, 0) ────────────────────────
//
// Calling Os.prctl(PR_SET_DUMPABLE, 0) prevents:
//   - /proc/self/mem reads (Frida's memory scanning path when hook detection
//     misses the gadget/thread signals)
//   - core dumps leaking key material
//   - ptrace-based memory inspection
//
// This is NOT a detection check — it's a hardening action. Therefore it must
// be fail-open (runCatching with no else): if prctl is unavailable or denied
// the app must still launch; only hook/tamper detection signals BLOCK.
// earlyAntiDump() runs BEFORE earlyDetectHook() so the memory is locked down
// even if subsequent detection decides to allow the launch.

describe('Android anti-dump — prctl(PR_SET_DUMPABLE, 0)', () => {
  it('companion object defines earlyAntiDump()', () => {
    expect(kt).toContain('fun earlyAntiDump()');
  });

  it('earlyAntiDump calls Os.prctl with PR_SET_DUMPABLE (value 4)', () => {
    const fnStart = kt.indexOf('fun earlyAntiDump()');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = kt.slice(fnStart, fnStart + 300);
    expect(fnBody).toContain('Os.prctl');
    expect(fnBody).toContain('PR_SET_DUMPABLE');
  });

  it('earlyAntiDump wraps prctl in runCatching (fail-open — must not block launch)', () => {
    const fnStart = kt.indexOf('fun earlyAntiDump()');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = kt.slice(fnStart, fnStart + 300);
    expect(fnBody).toContain('runCatching');
  });

  it('earlyCheck calls earlyAntiDump() before earlyDetectHook()', () => {
    const checkStart = kt.indexOf('fun earlyCheck(');
    expect(checkStart).toBeGreaterThan(-1);
    const checkBody = kt.slice(checkStart, checkStart + 400);
    const antiDumpIdx = checkBody.indexOf('earlyAntiDump()');
    const hookIdx = checkBody.indexOf('earlyDetectHook()');
    expect(antiDumpIdx).toBeGreaterThan(-1);
    expect(hookIdx).toBeGreaterThan(-1);
    expect(antiDumpIdx).toBeLessThan(hookIdx);
  });
});

// ── 9. iOS earlyDetectTamper ──────────────────────────────────────────────────
//
// Android earlyDetectTamper checks the APK cert SHA-256 at pre-bridge time.
// iOS parity: +earlyDetectTamper reads the kernel's code-signing status flags
// via csops(CS_OPS_STATUS). If CS_VALID is clear the binary has been tampered
// or re-signed; return YES (BLOCK).
//
// csops is not in the public iOS SDK headers — same pattern as PT_DENY_ATTACH:
// declare the extern prototype and constants manually.

describe('Pre-WebView native gate — iOS earlyDetectTamper', () => {
  it('+earlyCheck delegates to both earlyCheckDynamicLibraries AND earlyDetectTamper', () => {
    const implStart = iosM.indexOf('+ (BOOL)earlyCheck');
    const implBody = iosM.slice(implStart, implStart + 400);
    expect(implBody).toContain('earlyCheckDynamicLibraries');
    expect(implBody).toContain('earlyDetectTamper');
  });

  it('+earlyDetectTamper is implemented as a class method', () => {
    expect(iosM).toContain('+ (BOOL)earlyDetectTamper');
  });

  it('earlyDetectTamper checks CS_VALID code-signing flag (fail-closed, I4)', () => {
    const start = iosM.indexOf('+ (BOOL)earlyDetectTamper');
    expect(start).toBeGreaterThan(-1);
    const body = iosM.slice(start, start + 500);
    expect(body).toContain('CS_VALID');
    expect(body).toContain('csops');
  });

  it('csops extern-declared (not in the public iOS SDK headers)', () => {
    expect(iosM).toContain('extern int csops');
  });
});

// ── 10. Play Integrity root cert SHA-256 pinning (G2-ROOTCERT-PIN) ───────────
//
// The weak root cert issuer check (issuer.contains("Google")) is trivially
// spoofable by any attacker who constructs a self-signed cert with "Google" in
// the subject DN. Replace with SHA-256 fingerprint comparison of the root cert's
// raw DER bytes (cert.encoded) against a set of known Google root CA fingerprints.
//
// Belt-and-suspenders for BUILT-UNVALIDATED state: fingerprint check is primary;
// issuer check is retained as fallback while GOOGLE_ROOT_CA_SHA256 is unconfirmed
// against a real production Play Integrity token.

describe('Play Integrity root cert SHA-256 pinning (G2-ROOTCERT-PIN)', () => {
  it('GOOGLE_ROOT_CA_SHA256 pinset constant is defined', () => {
    expect(playKt).toContain('GOOGLE_ROOT_CA_SHA256');
  });

  it('verifyRootCertFingerprint private method is present', () => {
    expect(playKt).toContain('fun verifyRootCertFingerprint(');
  });

  it('verifyRootCertFingerprint computes SHA-256 of DER bytes via MessageDigest', () => {
    const fnStart = playKt.indexOf('fun verifyRootCertFingerprint(');
    expect(fnStart).toBeGreaterThan(-1);
    const fnBody = playKt.slice(fnStart, fnStart + 500);
    expect(fnBody).toContain('MessageDigest');
    expect(fnBody).toContain('SHA-256');
    expect(fnBody).toContain('cert.encoded');
  });

  it('verifyJwsSignature step 4 calls verifyRootCertFingerprint', () => {
    // "// 4. Root cert" marks step 4 in verifyJwsSignature. The new code must
    // call verifyRootCertFingerprint() alongside the issuer check.
    const step4Idx = playKt.indexOf('// 4. Root cert');
    expect(step4Idx).toBeGreaterThan(-1);
    const step4Block = playKt.slice(step4Idx, step4Idx + 500);
    expect(step4Block).toContain('verifyRootCertFingerprint');
  });

  it('issuer.contains("Google") is retained as belt-and-suspenders fallback', () => {
    // Must not be deleted while GOOGLE_ROOT_CA_SHA256 is BUILT-UNVALIDATED.
    expect(playKt).toContain('.contains("Google"');
  });
});

// ── Item 6 — iOS PT_DENY_ATTACH at pre-bridge time ───────────────────────────
// earlyDenyAttach is a class method called at the START of earlyCheck, before
// any detection runs. This moves the OS-level debugger-attach denial to the
// earliest possible moment (before the Capacitor WebView loads), rather than
// waiting for the first checkIntegrity: plugin call from JS.
// Fail-open: ptrace may be patched on jailbroken devices — this is a hardening
// action, not a detection gate. The existing dispatch_once in checkIntegrity:
// is retained as a belt-and-suspenders fallback for non-earlyCheck paths.
describe('Item 6 — iOS PT_DENY_ATTACH at pre-bridge time', () => {
  it('+ (void)earlyDenyAttach is declared in RaspIntegrityPlugin.h', () => {
    expect(iosH).toContain('+ (void)earlyDenyAttach');
  });

  it('+earlyDenyAttach class method is defined in RaspIntegrityPlugin.m', () => {
    expect(iosM).toContain('+ (void)earlyDenyAttach');
  });

  it('+earlyDenyAttach calls ptrace(PT_DENY_ATTACH, 0, 0, 0)', () => {
    const fnIdx = iosM.indexOf('+ (void)earlyDenyAttach');
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = iosM.slice(fnIdx, fnIdx + 300);
    expect(fnBody).toContain('ptrace(PT_DENY_ATTACH, 0, 0, 0)');
  });

  it('+earlyDenyAttach is wrapped in @try/@catch (fail-open, I4)', () => {
    const fnIdx = iosM.indexOf('+ (void)earlyDenyAttach');
    expect(fnIdx).toBeGreaterThan(-1);
    const fnBody = iosM.slice(fnIdx, fnIdx + 300);
    expect(fnBody).toContain('@try');
    expect(fnBody).toContain('@catch');
  });

  it('+earlyCheck calls [self earlyDenyAttach] before detection', () => {
    const earlyCheckIdx = iosM.indexOf('+ (BOOL)earlyCheck');
    expect(earlyCheckIdx).toBeGreaterThan(-1);
    const earlyCheckBody = iosM.slice(earlyCheckIdx, earlyCheckIdx + 300);
    expect(earlyCheckBody).toContain('[self earlyDenyAttach]');
  });

  it('+earlyDenyAttach fires before earlyCheckDynamicLibraries in earlyCheck body', () => {
    const earlyCheckIdx = iosM.indexOf('+ (BOOL)earlyCheck');
    expect(earlyCheckIdx).toBeGreaterThan(-1);
    const earlyCheckBody = iosM.slice(earlyCheckIdx, earlyCheckIdx + 400);
    const denyIdx   = earlyCheckBody.indexOf('earlyDenyAttach');
    const detectIdx = earlyCheckBody.indexOf('earlyCheckDynamicLibraries');
    expect(denyIdx).toBeGreaterThan(-1);
    expect(detectIdx).toBeGreaterThan(-1);
    expect(denyIdx).toBeLessThan(detectIdx);
  });
});

// ── Item 7 — iOS App Attest entitlement ──────────────────────────────────────
// AppAttestPlugin.m already contains the DCAppAttestService logic, but the
// com.apple.developer.devicecheck.appattest-environment entitlement was missing.
// Without it, DCAppAttestService.isSupported returns NO on every device and the
// plugin always fails closed — the channel is unreachable. These pins verify
// the entitlements file exists and is wired into the Xcode build settings so
// a provisioned build can actually exercise the attest API.
describe('Item 7 — iOS App Attest entitlement', () => {
  it('ios/App/App/App.entitlements file exists', () => {
    expect(existsSync(entitlementsPath)).toBe(true);
  });

  it('App.entitlements contains com.apple.developer.devicecheck.appattest-environment', () => {
    expect(existsSync(entitlementsPath)).toBe(true);
    const content = readFileSync(entitlementsPath, 'utf8');
    expect(content).toContain('com.apple.developer.devicecheck.appattest-environment');
  });

  it('App.entitlements sets environment to development or production', () => {
    expect(existsSync(entitlementsPath)).toBe(true);
    const content = readFileSync(entitlementsPath, 'utf8');
    const hasDev  = content.includes('<string>development</string>');
    const hasProd = content.includes('<string>production</string>');
    expect(hasDev || hasProd).toBe(true);
  });

  it('project.pbxproj references CODE_SIGN_ENTITLEMENTS for both Debug and Release', () => {
    // Both build configurations must carry the entitlements path so signing
    // picks it up in both debug device builds and App Store release builds.
    const matches = pbxproj.match(/CODE_SIGN_ENTITLEMENTS\s*=\s*App\/App\.entitlements/g);
    expect(matches).not.toBeNull();
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it('AppAttestPlugin.m imports DeviceCheck framework', () => {
    expect(appAttestM).toContain('#import <DeviceCheck/DeviceCheck.h>');
  });

  it('AppAttestPlugin.m checks isSupported before any attest call (fail-closed, I4)', () => {
    expect(appAttestM).toContain('isSupported');
    // The only exit on isSupported=NO must resolve available:NO — never fabricate PASS.
    const unsupportedIdx = appAttestM.indexOf('!service.isSupported');
    expect(unsupportedIdx).toBeGreaterThan(-1);
    const block = appAttestM.slice(unsupportedIdx, unsupportedIdx + 200);
    expect(block).toContain('@(NO)');
  });
});

// ── Item 8 — Android preventive ptrace self-attach via JNI ───────────────────
// ptrace(PTRACE_TRACEME, 0, NULL, NULL) claims this process's ptrace slot for
// its parent (Zygote/ActivityManager). This is both:
//   • Preventive hardening: a process with PTRACE_TRACEME set cannot be
//     ptrace-attached by an external process (belt-and-suspenders with
//     PR_SET_DUMPABLE=0 from earlyAntiDump, which already blocks most paths).
//   • Detection: if PTRACE_TRACEME returns -1/EPERM, a debugger was already
//     attached before earlyCheck ran → BLOCK-tier signal.
// ptrace is not accessible from Kotlin without JNI — hence the native library.
describe('Item 8 — Android preventive ptrace self-attach via JNI', () => {
  it('android/app/src/main/cpp/rasp_early.c exists', () => {
    expect(existsSync(cFilePath)).toBe(true);
  });

  it('rasp_early.c includes sys/ptrace.h', () => {
    expect(existsSync(cFilePath)).toBe(true);
    const c = readFileSync(cFilePath, 'utf8');
    expect(c).toContain('#include <sys/ptrace.h>');
  });

  it('rasp_early.c calls ptrace(PTRACE_TRACEME, 0, NULL, NULL)', () => {
    expect(existsSync(cFilePath)).toBe(true);
    const c = readFileSync(cFilePath, 'utf8');
    expect(c).toContain('ptrace(PTRACE_TRACEME, 0, NULL, NULL)');
  });

  it('rasp_early.c declares the correct JNI method name for companion nativeEarlyTraceme', () => {
    expect(existsSync(cFilePath)).toBe(true);
    const c = readFileSync(cFilePath, 'utf8');
    // $Companion mangled as _00024Companion in JNI symbol names
    expect(c).toContain('Java_com_veyrnox_app_RaspIntegrityPlugin_00024Companion_nativeEarlyTraceme');
  });

  it('android/app/src/main/cpp/CMakeLists.txt exists', () => {
    expect(existsSync(cmakePath)).toBe(true);
  });

  it('CMakeLists.txt adds rasp_early as a shared library from rasp_early.c', () => {
    expect(existsSync(cmakePath)).toBe(true);
    const cmake = readFileSync(cmakePath, 'utf8');
    expect(cmake).toContain('rasp_early');
    expect(cmake).toContain('rasp_early.c');
    expect(cmake).toContain('SHARED');
  });

  it('build.gradle has externalNativeBuild block pointing to CMakeLists.txt', () => {
    expect(buildGradle).toContain('externalNativeBuild');
    expect(buildGradle).toContain('CMakeLists.txt');
  });

  it('RaspIntegrityPlugin.kt declares external fun nativeEarlyTraceme in companion', () => {
    expect(kt).toContain('external fun nativeEarlyTraceme');
  });

  it('companion object init block loads rasp_early library (fail-open)', () => {
    // System.loadLibrary inside runCatching so a JVM test or stripped build
    // does not crash — earlyPtraceTraceme() has its own runCatching guard.
    const initIdx = kt.indexOf('System.loadLibrary("rasp_early")');
    expect(initIdx).toBeGreaterThan(-1);
    // The load must be wrapped in runCatching (fail-open, I4)
    const window = kt.slice(Math.max(0, initIdx - 100), initIdx + 50);
    expect(window).toContain('runCatching');
  });

  it('earlyDetectHook chains earlyPtraceTraceme', () => {
    const hookIdx = kt.indexOf('private fun earlyDetectHook()');
    expect(hookIdx).toBeGreaterThan(-1);
    const hookBody = kt.slice(hookIdx, hookIdx + 300);
    expect(hookBody).toContain('earlyPtraceTraceme');
  });

  it('stale "not yet implemented" comment is removed from checkTracerPid context', () => {
    // The comment at the TracerPid check said ptrace self-attachment via JNI is
    // "not yet implemented" — that phrase must not appear within the checkTracerPid
    // block once item 8 lands (a different TODO elsewhere in the file is unrelated).
    const tracerPidIdx = kt.indexOf('private fun checkTracerPid()');
    expect(tracerPidIdx).toBeGreaterThan(-1);
    // Look at the 500-char window before the function (where the comment lives)
    const window = kt.slice(Math.max(0, tracerPidIdx - 500), tracerPidIdx + 50);
    expect(window).not.toContain('not yet implemented');
  });
});

// ── 9. Dead Android checks removed ───────────────────────────────────────────
//
// Two checks documented as structurally inert / superseded are removed:
//
// checkProcNetUnix() — superseded by checkLocalSocketConnect().
//   SELinux denies /proc/net/unix reads for untrusted_app on Android 10+
//   (device-verified 2026-07-14). checkLocalSocketConnect() (behavioral
//   connect probe) achieves the same detection on ALL API levels without
//   needing proc_net read permission.
//
// checkSuFromRuntime() — structurally inert on Android 10+.
//   Runtime.exec of shell utilities is SELinux-blocked for untrusted_app
//   on API 29+ (device-verified 2026-07-14). Adds a 150 ms worst-case
//   timeout to the RASP hot path for no benefit on modern devices.
//   checkDangerousProps() (verifiedbootstate/flash.locked via SystemProperties
//   reflection) is the operative root signal; checkLocalSocketConnect()
//   covers the behavioral aspect.

// ── Item 12 — iOS checkDebugger via sysctl P_TRACED ──────────────────────────
//
// Android checkTracerPid() reads /proc/self/status and inspects the TracerPid
// field to detect a debugger already attached to the process. iOS has no /proc
// filesystem, but the kernel exposes the same information via sysctl:
//
//   int mib[4] = {CTL_KERN, KERN_PROC, KERN_PROC_PID, getpid()};
//   struct kinfo_proc info;
//   sysctl(mib, 4, &info, &size, NULL, 0);
//   return (info.kp_proc.p_flag & P_TRACED) != 0;
//
// P_TRACED is set in the kernel process flags when a debugger is attached.
// This complements PT_DENY_ATTACH (preventive) with detection: if PT_DENY_ATTACH
// is patched on a jailbroken device, a debugger could still attach before
// earlyDenyAttach runs; checkDebugger catches that condition.
//
// Surfaced as @"debuggerAttached" in the checkIntegrity result dict so the JS
// presignGate can fold it into the HOOKED → TIER.BLOCK path.
// Requires #import <sys/sysctl.h> (P_TRACED via <sys/proc.h>, transitively).
// Purely local (I2); fail-closed to NO on any sysctl error (I4).

describe('Item 12 — iOS checkDebugger via sysctl P_TRACED', () => {
  it('sys/sysctl.h imported (provides sysctl, kinfo_proc, P_TRACED)', () => {
    expect(iosM).toContain('#import <sys/sysctl.h>');
  });

  it('defines the -checkDebugger instance method', () => {
    expect(iosM).toMatch(/-\s*\(BOOL\)checkDebugger/);
  });

  it('checkDebugger uses sysctl with CTL_KERN / KERN_PROC / KERN_PROC_PID', () => {
    const start = iosM.indexOf('(BOOL)checkDebugger');
    expect(start).toBeGreaterThan(-1);
    const body = iosM.slice(start, start + 500);
    expect(body).toContain('CTL_KERN');
    expect(body).toContain('KERN_PROC');
    expect(body).toContain('KERN_PROC_PID');
  });

  it('checkDebugger tests the P_TRACED flag in kp_proc.p_flag', () => {
    const start = iosM.indexOf('(BOOL)checkDebugger');
    const body = iosM.slice(start, start + 500);
    expect(body).toContain('P_TRACED');
    expect(body).toContain('kp_proc');
    expect(body).toContain('p_flag');
  });

  it('checkDebugger wraps in @try/@catch (fail-closed to NO on sysctl error, I4)', () => {
    const start = iosM.indexOf('(BOOL)checkDebugger');
    const body = iosM.slice(start, start + 500);
    expect(body).toContain('@try');
    expect(body).toContain('@catch');
  });

  it('adds "debuggerAttached" key to the checkIntegrity result dict', () => {
    expect(iosM).toContain('@"debuggerAttached"');
  });

  it('wires [self checkDebugger] into checkIntegrity', () => {
    expect(iosM).toMatch(/\[self checkDebugger\]/);
  });

  it('existing result keys are preserved (jailbroken, hookedProcess, emulator, tampered)', () => {
    expect(iosM).toContain('@"jailbroken"');
    expect(iosM).toContain('@"hookedProcess"');
    expect(iosM).toContain('@"emulator"');
    expect(iosM).toContain('@"tampered"');
  });
});

// ── Item 11 — iOS HardwareKekPlugin mlock on H-factor key material ───────────
//
// The H factor (decrypted SE HMAC output) lives in an NSMutableData between
// SE decryption and Capacitor bridge serialisation. If the device is under
// memory pressure during that window, the OS could swap those pages to disk
// before resetBytesInRange zeroes them — a disk-level memory dump would then
// contain cleartext key material.
//
// Fix: mlock(h.mutableBytes, h.length) immediately after the NSMutableData is
// allocated pins those pages in physical RAM. munlock(h.mutableBytes, h.length)
// is called AFTER resetBytesInRange so the zeroed pages are unpinned once the
// key bytes are gone. The window is as narrow as possible: allocated → pinned →
// used → zeroed → unpinned.
//
// mlock/munlock are POSIX; available on iOS via <sys/mman.h> without any
// special entitlement. Fail-open: if mlock returns non-zero (ENOMEM, EPERM)
// the program still runs correctly — the bytes are just not guaranteed pinned.

describe('Item 11 — iOS HardwareKekPlugin mlock on H-factor key material', () => {
  it('sys/mman.h imported for mlock/munlock', () => {
    expect(hwKekM).toContain('#import <sys/mman.h>');
  });

  it('mlock called on h.mutableBytes after NSMutableData allocation', () => {
    expect(hwKekM).toContain('mlock(h.mutableBytes');
    const allocIdx  = hwKekM.indexOf('NSMutableData *h = ');
    const mlockIdx  = hwKekM.indexOf('mlock(h.mutableBytes');
    expect(allocIdx).toBeGreaterThan(-1);
    expect(mlockIdx).toBeGreaterThan(-1);
    expect(mlockIdx).toBeGreaterThan(allocIdx);
  });

  it('mlock passes h.length as size (pins exactly the key material pages)', () => {
    const mlockIdx  = hwKekM.indexOf('mlock(h.mutableBytes');
    expect(mlockIdx).toBeGreaterThan(-1);
    const mlockCall = hwKekM.slice(mlockIdx, mlockIdx + 60);
    expect(mlockCall).toContain('h.length');
  });

  it('munlock called on h.mutableBytes after resetBytesInRange zeroing', () => {
    expect(hwKekM).toContain('munlock(h.mutableBytes');
    const resetIdx   = hwKekM.indexOf('[h resetBytesInRange:');
    const munlockIdx = hwKekM.indexOf('munlock(h.mutableBytes');
    expect(resetIdx).toBeGreaterThan(-1);
    expect(munlockIdx).toBeGreaterThan(-1);
    expect(munlockIdx).toBeGreaterThan(resetIdx);
  });

  it('mlock precedes munlock (pin before use, unpin after zero)', () => {
    const mlockIdx   = hwKekM.indexOf('mlock(h.mutableBytes');
    const munlockIdx = hwKekM.indexOf('munlock(h.mutableBytes');
    expect(mlockIdx).toBeGreaterThan(-1);
    expect(munlockIdx).toBeGreaterThan(-1);
    expect(mlockIdx).toBeLessThan(munlockIdx);
  });
});

// ── Item 10 — iOS earlyAntiDump via task_set_exception_ports ─────────────────
//
// Android earlyAntiDump() calls Os.prctl(PR_SET_DUMPABLE, 0) to prevent crash
// reporters and /proc/[pid]/mem reads from non-root processes. iOS has no
// prctl(2). The Mach-level analogue is clearing the task exception ports via
//   task_set_exception_ports(mach_task_self(), EXC_MASK_ALL,
//                            MACH_PORT_NULL, EXCEPTION_DEFAULT, THREAD_STATE_NONE)
// which removes the process's crash-reporter listener so debuggers / crash
// reporters cannot receive exception notifications from our process.
//
// Fail-open: any error leaves exception ports unchanged — the app still runs
// normally (I4). This is a preventive hardening action, not a detection gate.
//
// earlyAntiDump is a class method called at the START of earlyCheck, before
// earlyDenyAttach and earlyCheckDynamicLibraries — same ordering as Android
// where earlyAntiDump runs before earlyDetectHook.
//
// Requires #import <mach/mach.h> (provides task_set_exception_ports,
// mach_task_self, MACH_PORT_NULL, EXC_MASK_ALL, EXCEPTION_DEFAULT,
// THREAD_STATE_NONE — distinct from the already-present <mach-o/dyld.h>).

describe('Item 10 — iOS earlyAntiDump via task_set_exception_ports', () => {
  it('defines the +earlyAntiDump class method', () => {
    expect(iosM).toContain('+ (void)earlyAntiDump');
  });

  it('earlyAntiDump calls task_set_exception_ports', () => {
    const start = iosM.indexOf('+ (void)earlyAntiDump');
    expect(start).toBeGreaterThan(-1);
    const body = iosM.slice(start, start + 500);
    expect(body).toContain('task_set_exception_ports');
  });

  it('earlyAntiDump passes MACH_PORT_NULL to clear the exception port', () => {
    const start = iosM.indexOf('+ (void)earlyAntiDump');
    const body = iosM.slice(start, start + 500);
    expect(body).toContain('MACH_PORT_NULL');
  });

  it('earlyAntiDump uses mach_task_self() (own task — no entitlements required)', () => {
    const start = iosM.indexOf('+ (void)earlyAntiDump');
    const body = iosM.slice(start, start + 500);
    expect(body).toContain('mach_task_self');
  });

  it('earlyAntiDump wraps the call in @try/@catch (fail-open, must not block launch)', () => {
    const start = iosM.indexOf('+ (void)earlyAntiDump');
    const body = iosM.slice(start, start + 500);
    expect(body).toContain('@try');
    expect(body).toContain('@catch');
  });

  it('mach/mach.h is imported (required for task_set_exception_ports + mach_task_self)', () => {
    expect(iosM).toContain('#import <mach/mach.h>');
  });

  it('earlyCheck calls earlyAntiDump before earlyCheckDynamicLibraries', () => {
    const checkStart = iosM.indexOf('+ (BOOL)earlyCheck');
    expect(checkStart).toBeGreaterThan(-1);
    const checkBody = iosM.slice(checkStart, checkStart + 600);
    const antiDumpIdx = checkBody.indexOf('earlyAntiDump');
    const dynLibIdx   = checkBody.indexOf('earlyCheckDynamicLibraries');
    expect(antiDumpIdx).toBeGreaterThan(-1);
    expect(dynLibIdx).toBeGreaterThan(-1);
    expect(antiDumpIdx).toBeLessThan(dynLibIdx);
  });
});

describe('Android RASP — Item 9: Dead checks removed', () => {
  // ── checkProcNetUnix removed ─────────────────────────────────────────────

  it('checkProcNetUnix method is absent — superseded by checkLocalSocketConnect', () => {
    expect(kt).not.toContain('private fun checkProcNetUnix(');
  });

  it('checkProcNetUnix is not called anywhere in detectRoot', () => {
    const rootIdx = kt.indexOf('private fun detectRoot()');
    expect(rootIdx).toBeGreaterThan(-1);
    const rootBody = kt.slice(rootIdx, rootIdx + 700);
    expect(rootBody).not.toContain('checkProcNetUnix');
  });

  it('Build.VERSION.SDK_INT < Q gate for checkProcNetUnix is absent', () => {
    // The gate was only needed while checkProcNetUnix existed.
    // With the method removed, the gate expression is also gone.
    expect(kt).not.toContain('Build.VERSION_CODES.Q && checkProcNetUnix');
  });

  // ── checkSuFromRuntime removed ───────────────────────────────────────────

  it('checkSuFromRuntime method is absent — structurally inert on Android 10+', () => {
    expect(kt).not.toContain('private fun checkSuFromRuntime(');
  });

  it('checkSuFromRuntime is not called anywhere in detectRoot', () => {
    const rootIdx = kt.indexOf('private fun detectRoot()');
    expect(rootIdx).toBeGreaterThan(-1);
    const rootBody = kt.slice(rootIdx, rootIdx + 700);
    expect(rootBody).not.toContain('checkSuFromRuntime');
  });

  // ── surviving root-detection chain still has all operative signals ───────

  it('detectRoot still chains checkDangerousProps (operative root signal)', () => {
    const rootIdx = kt.indexOf('private fun detectRoot()');
    const rootBody = kt.slice(rootIdx, rootIdx + 700);
    expect(rootBody).toContain('checkDangerousProps');
  });

  it('detectRoot still chains checkLocalSocketConnect (behavioral socket probe)', () => {
    const rootIdx = kt.indexOf('private fun detectRoot()');
    const rootBody = kt.slice(rootIdx, rootIdx + 700);
    expect(rootBody).toContain('checkLocalSocketConnect');
  });
});
