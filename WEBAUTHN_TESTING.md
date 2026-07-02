# WebAuthn Native Plugin - Automated Testing Guide

## Overview

The WebAuthn Native Plugin enables native biometric-protected credentials on mobile (iOS/Android) while maintaining the web's WebAuthn API surface. Testing is fully automated and requires no human biometric interaction except during device manual verification.

## Automated Testing Tiers

### Tier 1: Unit Tests (No Device Required)
**Location:** `src/lib/webauthn-polyfill.test.js`

Validates the JavaScript polyfill without any native code:
- Plugin module loading
- Capacitor platform detection
- Credential transformation (Base64 encoding/decoding)
- API compatibility (navigator.credentials.create/get)
- Error handling and fallback paths

**Run:**
```bash
npm run test -- src/lib/webauthn-polyfill.test.js
```

**What it tests:**
- ✓ Polyfill installs correctly
- ✓ Web fallback works when not on native
- ✓ Credential objects transform correctly
- ✓ API surface matches WebAuthn spec
- ✓ Error cases fail gracefully

### Tier 2: Build Verification (No Device Required)
**What it tests:**
- ✓ TypeScript compiles without errors
- ✓ Android APK builds successfully
- ✓ All dependencies resolve
- ✓ Plugin is bundled correctly

**Run:**
```bash
npm run android:sync
```

### Tier 3: Device Integration Tests (Requires Device)
**Location:** `scripts/test-webauthn-automated.ps1` (Windows) or `scripts/test-webauthn-automated.sh` (Unix)

Automated device testing without requiring physical biometric input during registration:

**Run:**
```powershell
# Windows
.\scripts\test-webauthn-automated.ps1

# Unix
bash scripts/test-webauthn-automated.sh
```

**What it tests:**
- ✓ APK installs on device
- ✓ App launches without crashes
- ✓ Plugin is detected in logs
- ✓ Settings UI is accessible
- ✓ No runtime errors on native platform detection

### Tier 4: Manual Device Verification (Requires Biometric Enrollment)
**The only step requiring human interaction:**

1. Open the Veyrnox app
2. Go to **Settings → Security**
3. Toggle **"Passkey unlock"** to enable
4. Place your finger on the biometric sensor (or complete biometric challenge)
5. Verify the passkey icon appears in the unlock methods list
6. Test unlock: Lock the device, attempt to unlock with biometric
7. Test send: Create a transaction and verify biometric is required at sign time

## Test Results

### Expected Output

```
✓ API compatibility
  - PublicKeyCredential available
  - navigator.credentials available
  - create and get methods exist

✓ Plugin module loading
  - installWebAuthnPolyfill exported
  - WebAuthnNative plugin interface available

✓ Credential flow (mock native)
  - Handles registration without biometric on web
  - Handles authentication without biometric on web
  - Mock credentials transform correctly

✓ Error handling
  - Registration errors handled gracefully
  - Authentication errors handled gracefully
```

## CI/CD Integration

The automated tests are designed to run in CI pipelines without device access:

```yaml
# GitHub Actions example
- name: Build WebAuthn APK
  run: npm run android:sync

- name: Run Unit Tests
  run: npm run test -- src/lib/webauthn-polyfill.test.js

- name: Upload APK
  uses: actions/upload-artifact@v3
  with:
    name: webauthn-apk
    path: android/app/build/outputs/apk/debug/app-debug.apk
```

Device integration tests run in separate CI jobs with connected devices (Pixel 10 Pro XL).

## Troubleshooting

### APK won't install
- Ensure device has space: `adb shell df /data`
- Clear app first: `adb uninstall com.veyrnox.app.debug`
- Check USB debugging: `adb devices`

### Passkey settings don't appear
- Verify Android build includes `@veyrnox/webauthn-native` plugin
- Check `capacitor.config.json` has `WebAuthnNative: { enabled: true }`
- Ensure biometric hardware is available: `adb shell pm list features | grep biometric`

### Tests fail on web
- Polyfill only activates on `Capacitor.isNativePlatform()` true
- Web builds fall back to native WebAuthn API
- Check browser supports WebAuthn

## Test Coverage

| Component | Unit | Integration | Device |
|-----------|------|-------------|--------|
| Polyfill JS | ✓ | ✓ | ✓ |
| API Transform | ✓ | ✓ | ✓ |
| Plugin Loading | ✓ | ✓ | ✓ |
| Android Bridge | - | ✓ | ✓ |
| Biometric Prompt | - | - | ✓* |
| SE/Keystore | - | - | ✓* |

`*` Requires physical biometric enrollment

## Success Criteria

**For Shipping:**
1. ✓ All Tier 1 tests pass (unit tests)
2. ✓ Tier 2 build succeeds (no compilation errors)
3. ✓ Tier 3 device tests pass (app installs and runs)
4. ✓ Tier 4 manual verification complete (biometric unlock works)
5. ✓ Testnet send with hardware KEK confirmed on-chain

**Current Status:** ✅ Tier 1-3 automated; Tier 4 pending device enrollment
