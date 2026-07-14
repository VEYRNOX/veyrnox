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

import { readFileSync } from 'fs';
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

describe('Android RASP — checkProcNetUnix gated on Android 9 and below', () => {
  it('checkProcNetUnix call is wrapped in a Build.VERSION.SDK_INT < Q check', () => {
    // Device-verified 2026-07-14: SELinux denies /proc/net/unix reads on Android 10+
    // (avc: denied { read } proc_net). The check is structurally inert on modern
    // devices. Gate it to avoid wasted work and false-false confusion in logs.
    const guard = 'Build.VERSION.SDK_INT < Build.VERSION_CODES.Q';
    const idx = kt.indexOf(guard);
    expect(idx).toBeGreaterThan(-1);
    const line = kt.slice(idx, idx + 100);
    expect(line).toContain('checkProcNetUnix');
  });
});

// ── 5. @JvmSynthetic on all private detection methods ───────────────────────

describe('Android RASP — @JvmSynthetic on all private detection methods', () => {
  // Every private fun should have @JvmSynthetic directly above it so Frida's
  // Java API cannot address them by their readable name.
  const privateFns = [
    'detectRoot', 'checkRootBinaries', 'checkMagiskPaths', 'checkProcNetUnix',
    'checkLocalSocketConnect', 'checkSuFromRuntime', 'checkDangerousProps',
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
