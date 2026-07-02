# Mobile APK Build Checklist

## UI/UX Requirements for iOS & Android Builds

### Biometric Unlock Behavior
- ✅ Toggle is **DISABLED** on native (not togglable)
- ✅ Text shows: "Fingerprint required on this device"
- ✅ Explanation: "Your wallet always asks for Fingerprint (or your device passcode) on this device — this can't be turned off here."
- ✅ Implementation: `src/components/security/BiometricUnlockSettings.jsx:149-151`

### Web-Only Features (MUST be Hidden on Mobile)

#### 1. Passkey Unlock Settings
- ✅ Entire section should be hidden
- ✅ Implementation: `src/pages/Settings.jsx:154`
- ✅ Code: `{!isNative && <PasskeyUnlockSettings />}`

#### 2. Wallet Passkeys (per-wallet)
- ✅ Entire section should be hidden
- ✅ Implementation: `src/pages/Settings.jsx:162-184`
- ✅ Code: `{!isNative && ( <div className="space-y-3"> {/* Wallet Passkeys */} </div> )}`

## Build Requirements
- Minimum commit: **b2912b6f** (2026-07-02)
- Preferred: Latest `main` branch
- Capacitor native platform detection uses: `Capacitor.isNativePlatform()`

## Validation
Before shipping mobile APK, verify:
1. Biometric toggle is visually disabled (grayed out)
2. No "Unlock with Passkey" section visible in Settings
3. No "Wallet Passkeys" section visible in Settings

## Related PRs
- PR #540 — Mobile UI fixes: light mode, Hardware KEK status, and Wallet Passkeys
- Commits: cb6f8dbe, e7fb5995, 757fa827, b2912b6f

---
**Last Updated:** 2026-07-02
