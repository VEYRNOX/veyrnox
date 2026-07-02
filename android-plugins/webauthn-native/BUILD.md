# WebAuthn Native Plugin Build Guide

This plugin provides native WebAuthn support on Capacitor via Secure Enclave (iOS) and Android Keystore.

## Installation

### 1. Add to package.json

```json
{
  "dependencies": {
    "@veyrnox/webauthn-native": "file:./android-plugins/webauthn-native"
  }
}
```

Then run:
```bash
npm install
npx cap add android
npx cap add ios
```

### 2. Android Setup

Add to `android/app/build.gradle`:

```gradle
dependencies {
    implementation 'androidx.biometric:biometric:1.1.0'
    implementation 'com.google.android.gms:play-services-identity:17.1.0'
}
```

### 3. iOS Setup

The plugin requires no additional configuration beyond the Capacitor bridge.

## Usage

The plugin is automatically loaded on app startup via the polyfill in `src/main.jsx`.

### Web (fallback to native WebAuthn)
```typescript
const credential = await navigator.credentials.create({
  publicKey: {
    challenge: new Uint8Array(...),
    rp: { name: "Veyrnox" },
    user: { id: new Uint8Array(...), name: "user@example.com" },
    pubKeyCredParams: [{ alg: -7, type: "public-key" }]
  }
});
```

### Mobile (uses Secure Enclave/Keystore)
Same API — the polyfill automatically routes to native implementation.

## Key Features

- **iOS**: Secure Enclave ECDSA signing with biometric ACL
- **Android**: Android Keystore AES encryption with biometric gate
- **Biometric Required**: Every operation requires device biometric/passcode
- **Hardware-backed**: Keys never leave the secure element

## Testing

1. **On iOS**: Run in simulator or device with biometric
2. **On Android**: Run on device with configured fingerprint/face recognition

## Security Notes

- Keys are stored in hardware-backed keystores
- Biometric enrollment is required before use
- Keys are tied to device and cannot be exported
- All signing/encryption operations require biometric confirmation
