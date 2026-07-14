// src/rasp/__tests__/anti-debug-tracer-pid.test.js
//
// Structural regression pins for three anti-debug improvements:
//   1. Android checkTracerPid() — /proc/self/status TracerPid read; detects
//      adb/gdb/LLDB/Frida-server debugger attach.
//   2. iOS PT_DENY_ATTACH — ptrace(PT_DENY_ATTACH,0,0,0) in checkIntegrity:;
//      preventive control, blocks future debugger-attach attempts at OS level.
//   3. ProGuard fix — @CapacitorPlugin keep rule drops { *; } so R8 can rename
//      private detection methods (detectRoot, checkGadgetThreads, etc.) in
//      the release binary.
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
