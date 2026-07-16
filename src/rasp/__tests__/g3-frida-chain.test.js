// src/rasp/__tests__/g3-frida-chain.test.js
//
// G3 — Frida/Xposed hostile-process detection: structural regression pins.
//
// All 15 tests are GREEN-from-start: they pin code already present in the RASP
// native plugins and JS layers. Their purpose is to make a future accidental
// removal of any detection link immediately visible in CI.
//
// No new detection logic is added by these tests.
// BUILT · structural pins only · NOT device-verified.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';
import { CONDITION, TIER } from '../conditions.js';
import { classifyEnvironment } from '../detect.js';
import { degrade } from '../degrade.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../../');
const kt   = readFileSync(resolve(root, 'android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt'), 'utf8');
const objc = readFileSync(resolve(root, 'ios/App/App/RaspIntegrityPlugin.m'), 'utf8');
const nativeProbe = readFileSync(resolve(root, 'src/rasp/nativeProbe.js'), 'utf8');

// ── Android (Kotlin) structural pins ────────────────────────────────────────

describe('G3 Android structural pins', () => {
  it('Kotlin: checkFridaPort function exists', () => {
    expect(kt).toContain('checkFridaPort');
  });
  it('Kotlin: port 27042 is the Frida default port', () => {
    expect(kt).toContain('27042');
  });
  it('Kotlin: /proc/self/maps is scanned for hook libraries', () => {
    expect(kt).toContain('/proc/self/maps');
  });
  it('Kotlin: "frida" string present in maps scan list', () => {
    expect(kt).toContain('"frida"');
  });
  it('Kotlin: "xposed" string present in maps scan list', () => {
    expect(kt).toContain('"xposed"');
  });
  it('Kotlin: de.robv.android.xposed.installer is in the Xposed package list', () => {
    expect(kt).toContain('de.robv.android.xposed.installer');
  });
  it('Kotlin: detectHook() returns hookedProcess', () => {
    expect(kt).toContain('hookedProcess');
  });
});

// ── iOS (ObjC) structural pins ───────────────────────────────────────────────

describe('G3 iOS structural pins', () => {
  it('ObjC: checkFridaPort method exists', () => {
    expect(objc).toContain('checkFridaPort');
  });
  it('ObjC: port 27042 is the Frida default port', () => {
    expect(objc).toContain('27042');
  });
  it('ObjC: _dyld_get_image_name is used to walk dyld image list', () => {
    expect(objc).toContain('_dyld_get_image_name');
  });
  it('ObjC: "frida" string present in dyld scan', () => {
    expect(objc).toContain('"frida"');
  });
});

// ── JS layer structural pins ─────────────────────────────────────────────────

describe('G3 JS nativeProbe structural pins', () => {
  it('nativeProbe.js maps hookedProcess to signals.hooked', () => {
    expect(nativeProbe).toContain('hooked: verdict.hookedProcess === true');
  });
});

// ── Functional chain: hooked → CONDITION.HOOKED → TIER.BLOCK ────────────────

describe('G3 functional chain', () => {
  it('classifyEnvironment({hooked:true}) === CONDITION.HOOKED', () => {
    expect(classifyEnvironment({ hooked: true })).toBe(CONDITION.HOOKED);
  });

  it('degrade(CONDITION.HOOKED) → TIER.BLOCK', () => {
    const artifact = degrade(CONDITION.HOOKED);
    expect(artifact.tier).toBe(TIER.BLOCK);
  });

  it('degrade(CONDITION.HOOKED) sentence mentions "inspecting"', () => {
    const artifact = degrade(CONDITION.HOOKED);
    expect(artifact.sentence).toMatch(/inspecting/i);
  });

  it('degrade(CONDITION.HOOKED) blocks "sign" action', () => {
    const artifact = degrade(CONDITION.HOOKED);
    expect(artifact.blockedActions).toContain('sign');
  });
});
