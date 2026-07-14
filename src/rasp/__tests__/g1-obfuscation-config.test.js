// src/rasp/__tests__/g1-obfuscation-config.test.js
//
// G1 — production-build obfuscation config: structural regression pins.
//
// These tests read vite.config.js and proguard-rules.pro to assert that the
// G1 obfuscation config is present and not accidentally removed. All should be
// GREEN immediately after the G1 changes are made in this same PR.
//
// BUILT · structural pins only · NOT device-verified.

import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../../');

const viteConfig = readFileSync(resolve(root, 'vite.config.js'), 'utf8');
const proguard   = readFileSync(resolve(root, 'android/app/proguard-rules.pro'), 'utf8');

describe('G1a ProGuard hardening', () => {
  it('-repackageclasses is present', () => {
    expect(proguard).toContain("-repackageclasses ''");
  });
  it('-allowaccessmodification is present', () => {
    expect(proguard).toContain('-allowaccessmodification');
  });
  it('Capacitor plugin keep-rule still present (safety check)', () => {
    expect(proguard).toContain('@com.getcapacitor.annotation.CapacitorPlugin');
  });
});

describe('G1b Vite obfuscator plugin', () => {
  it('veyrnoxObfuscatorPlugin is defined in vite.config.js', () => {
    expect(viteConfig).toContain('veyrnoxObfuscatorPlugin');
  });
  it('obfuscator plugin is gated on VITE_RELEASE', () => {
    expect(viteConfig).toContain("VITE_RELEASE !== '1'");
  });
  it('stringArray: true is configured', () => {
    expect(viteConfig).toContain('stringArray: true');
  });
  it('controlFlowFlattening: true (G1 upgrade — RASP/wallet-core logic hardening)', () => {
    expect(viteConfig).toContain('controlFlowFlattening: true');
  });
  it('controlFlowFlatteningThreshold ≤ 0.5 (perf guard — only partial flattening)', () => {
    const m = viteConfig.match(/controlFlowFlatteningThreshold:\s*([\d.]+)/);
    expect(m, 'controlFlowFlatteningThreshold must be set').toBeTruthy();
    expect(parseFloat(m[1])).toBeLessThanOrEqual(0.5);
  });
  it('numbersToExpressions: true (numeric constant obfuscation)', () => {
    expect(viteConfig).toContain('numbersToExpressions: true');
  });
  it('splitStrings: true (string chunking — layered with stringArray)', () => {
    expect(viteConfig).toContain('splitStrings: true');
  });
  it('transformObjectKeys: false (Capacitor bridge safety — must never change)', () => {
    expect(viteConfig).toContain('transformObjectKeys: false');
  });
  it('renameGlobals: false (Capacitor window.Capacitor safety)', () => {
    expect(viteConfig).toContain('renameGlobals: false');
  });
  it('selfDefending: false (honest: not claiming tamper-resistance)', () => {
    expect(viteConfig).toContain('selfDefending: false');
  });
  it('javascript-obfuscator is imported', () => {
    expect(viteConfig).toMatch(/import JavaScriptObfuscator from ['"]javascript-obfuscator['"]/);
  });
});

describe('G1 honest scope', () => {
  it('G1b plugin returns early when VITE_RELEASE is not set (dev safety)', () => {
    // The plugin must NOT run in dev/test — check the early return pattern
    expect(viteConfig).toMatch(/VITE_RELEASE.*!==.*'1'.*return/s);
  });
});
