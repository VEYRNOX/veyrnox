// G4 — Android FLAG_SECURE regression pin.
//
// MainActivity.java sets FLAG_SECURE on the whole app window in onCreate().
// This pin asserts the control is still present and in the correct unconditional
// form — any refactor that accidentally removes or conditions the flag fails here.
//
// Status: BUILT (code present in MainActivity.java). NOT device-verified (M13).
// The Appium device-verification spec:
//   tests/android/specs/flag-secure-screenshot-e2e.spec.js
//   Run: DEVICE_VERIFY=1 npm run android:test:flag-secure

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../../..');

describe('G4 — Android FLAG_SECURE (MainActivity.java regression pin)', () => {
  let src;

  beforeAll(() => {
    src = readFileSync(
      path.join(root, 'android/app/src/main/java/com/veyrnox/app/MainActivity.java'),
      'utf8',
    );
  });

  it('MainActivity.java imports WindowManager', () => {
    expect(src).toContain('import android.view.WindowManager');
  });

  it('setFlags(FLAG_SECURE) is called in onCreate', () => {
    expect(src).toContain('FLAG_SECURE');
    expect(src).toContain('setFlags');
  });

  it('FLAG_SECURE is set unconditionally — not inside the DEBUG if-block', () => {
    // The flag must cover release AND debug builds (threat model: seized device).
    // Verify setFlags appears before the `if (!BuildConfig.DEBUG)` CDP-disable block.
    const setFlagsIdx = src.indexOf('setFlags');
    const debugIfIdx = src.indexOf('if (!BuildConfig.DEBUG)');
    expect(setFlagsIdx).toBeGreaterThan(0);
    expect(debugIfIdx).toBeGreaterThan(0);
    expect(setFlagsIdx).toBeLessThan(debugIfIdx);
  });

  it('FLAG_SECURE uses the double-arg setFlags(FLAG_SECURE, FLAG_SECURE) idiom', () => {
    // setFlags(flags, mask): both args must be FLAG_SECURE.
    // setFlags(FLAG_SECURE, 0) would be a no-op (mask=0 means "change nothing").
    const match = src.match(/setFlags\s*\([^)]*FLAG_SECURE[^)]*FLAG_SECURE[^)]*\)/s);
    expect(match).not.toBeNull();
  });

  it('setFilterTouchesWhenObscured(true) is called on the WebView', () => {
    // Blocks overlay-phishing: refuses tap events when another app's
    // TYPE_APPLICATION_OVERLAY window is above the Capacitor WebView.
    expect(src).toContain('setFilterTouchesWhenObscured(true)');
  });

  it('setFilterTouchesWhenObscured is called on getBridge().getWebView() — not a no-op Activity call', () => {
    // Must be applied to the WebView, not Activity.setFilterTouchesWhenObscured()
    // (which only guards the Activity root view, not the embedded WebView).
    const match = src.match(/getWebView\s*\(\s*\)\s*\.\s*setFilterTouchesWhenObscured\s*\(\s*true\s*\)/);
    expect(match).not.toBeNull();
  });

  it('WebView CDP debugging is disabled in release builds', () => {
    expect(src).toContain('setWebContentsDebuggingEnabled(false)');
    expect(src).toContain('if (!BuildConfig.DEBUG)');
  });
});
