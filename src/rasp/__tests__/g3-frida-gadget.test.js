// src/rasp/__tests__/g3-frida-gadget.test.js
//
// G3 — Frida Gadget detection: structural regression pins for three new
// detection signals that catch Gadget-mode Frida even when the shared
// library is renamed (port 27042 and a simple "frida" maps string do not
// catch it).
//
// Additions to RaspIntegrityPlugin.kt:
//   1. checkGadgetThreads() — /proc/self/task/*/comm thread-name scan:
//        Frida Gadget spawns "gum-js-loop", "gmain", "gdbus", "pool-frida"
//        threads regardless of the library file name.
//   2. checkFridaPipes() — /proc/self/fd/* symlink scan:
//        Frida creates named pipes / sockets containing "frida" in the fd table.
//   3. Expanded maps markers in checkProcMapsForHook():
//        "frida-agent", "linjector", "frida-gadget" added alongside existing
//        "frida", "xposed", "substrate", "magisk".
//
// Tests start RED (functions/markers absent) and turn GREEN once the Kotlin
// implementation lands. Do NOT flip these to xtest/skip — RED = required gate.
//
// BUILT (structural pins only) · NOT device-verified.

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

// ── 1. Thread-name scan ───────────────────────────────────────────────────────

describe('G3 Frida Gadget — thread-name scan (checkGadgetThreads)', () => {
  it('checkGadgetThreads function is defined', () => {
    expect(kt).toContain('checkGadgetThreads');
  });

  it('/proc/self/task is used to enumerate threads', () => {
    expect(kt).toContain('/proc/self/task');
  });

  it('"gum-js-loop" thread marker is present', () => {
    expect(kt).toContain('gum-js-loop');
  });

  it('"gmain" thread marker is present', () => {
    expect(kt).toContain('"gmain"');
  });

  it('"gdbus" thread marker is present', () => {
    expect(kt).toContain('"gdbus"');
  });

  it('"pool-frida" thread marker is present', () => {
    expect(kt).toContain('pool-frida');
  });

  it('checkGadgetThreads is called from detectHook()', () => {
    const detectHookBlock = kt.slice(
      kt.indexOf('private fun detectHook'),
      kt.indexOf('private fun checkFridaPort'),
    );
    expect(detectHookBlock).toContain('checkGadgetThreads');
  });
});

// ── 2. FD pipe scan ───────────────────────────────────────────────────────────

describe('G3 Frida Gadget — fd pipe scan (checkFridaPipes)', () => {
  it('checkFridaPipes function is defined', () => {
    expect(kt).toContain('checkFridaPipes');
  });

  it('/proc/self/fd is used to enumerate open file descriptors', () => {
    expect(kt).toContain('/proc/self/fd');
  });

  it('checkFridaPipes is called from detectHook()', () => {
    const detectHookBlock = kt.slice(
      kt.indexOf('private fun detectHook'),
      kt.indexOf('private fun checkFridaPort'),
    );
    expect(detectHookBlock).toContain('checkFridaPipes');
  });
});

// ── 3. Expanded maps markers ──────────────────────────────────────────────────

describe('G3 Frida Gadget — expanded /proc/self/maps markers', () => {
  it('"frida-agent" is in the maps scan list', () => {
    expect(kt).toContain('frida-agent');
  });

  it('"linjector" is in the maps scan list (Linux injector used to load Gadget)', () => {
    expect(kt).toContain('linjector');
  });

  it('"frida-gadget" is in the maps scan list (default Gadget .so name)', () => {
    expect(kt).toContain('frida-gadget');
  });
});
