// G4 iOS screen-capture / overlay RASP additions — structural pin tests.
//
// These are BUILT-UNVALIDATED source-structure pins for ObjC that cannot be
// compiled or device-tested on Windows (same pattern as the iOS-F3/F5 pins).
// They assert the new detection methods exist and are wired into checkIntegrity's
// result dict, and that the screenshot-protection method is an HONEST-DISABLED
// placeholder (I4) — it must NOT claim to actually block capture.

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLUGIN_PATH = resolve(
  __dirname,
  '../../../ios/App/App/RaspIntegrityPlugin.m',
);
const src = readFileSync(PLUGIN_PATH, 'utf8');

describe('G4 iOS — checkScreenCapture (UIScreen.isCaptured)', () => {
  it('defines the checkScreenCapture method', () => {
    expect(src).toMatch(/-\s*\(BOOL\)checkScreenCapture/);
  });

  it('references UIScreen.mainScreen and isCaptured', () => {
    expect(src).toContain('mainScreen');
    expect(src).toContain('isCaptured');
  });

  it('guards the API with @available(iOS 11.0, *)', () => {
    // The isCaptured API is iOS 11+.
    expect(src).toMatch(/@available\(iOS 11\.0, \*\)/);
  });

  it('adds the "screenCapture" key to the checkIntegrity result dict', () => {
    expect(src).toContain('@"screenCapture"');
  });

  it('wires checkScreenCapture into checkIntegrity', () => {
    // The BOOL must be produced by a call to the new method.
    expect(src).toMatch(/\[self checkScreenCapture\]/);
  });
});

describe('G4 iOS — checkOverlay (AssistiveTouch / accessibility)', () => {
  it('defines the checkOverlay method', () => {
    expect(src).toMatch(/-\s*\(BOOL\)checkOverlay/);
  });

  it('references UIAccessibilityIsAssistiveTouchRunning', () => {
    expect(src).toContain('UIAccessibilityIsAssistiveTouchRunning');
  });

  it('adds the "overlayActive" key to the checkIntegrity result dict', () => {
    expect(src).toContain('@"overlayActive"');
  });

  it('wires checkOverlay into checkIntegrity', () => {
    expect(src).toMatch(/\[self checkOverlay\]/);
  });
});

describe('G4 iOS — applyScreenshotProtection (HONEST-DISABLED placeholder)', () => {
  it('defines the applyScreenshotProtection method taking a WKWebView', () => {
    expect(src).toMatch(/-\s*\(void\)applyScreenshotProtection:\(WKWebView\s*\*\)/);
  });

  it('carries an honest-gap comment (I4) — no fake capture blocking', () => {
    const mentionsFlagSecure = src.includes('FLAG_SECURE');
    const mentionsNoApi = /no (public )?iOS API/i.test(src);
    const mentionsHonestDisabled = src.includes('HONEST-DISABLED');
    expect(mentionsFlagSecure || mentionsNoApi || mentionsHonestDisabled).toBe(true);
  });

  it('is NOT called from checkIntegrity (placeholder only)', () => {
    expect(src).not.toMatch(/\[self applyScreenshotProtection/);
  });
});

describe('G4 iOS — existing checkIntegrity keys preserved', () => {
  it('keeps the original result keys unchanged', () => {
    expect(src).toContain('@"jailbroken"');
    expect(src).toContain('@"hookedProcess"');
    expect(src).toContain('@"emulator"');
    expect(src).toContain('@"tampered"');
  });
});
