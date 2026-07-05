# Mobile APK Build Checklist

## UI/UX Requirements for iOS & Android Builds

### Biometric Unlock Behavior (user-controlled since 530b9924)
- ✅ Toggle is **USER-CONTROLLED** on native (the old forced-on `disabled={forcedOnDevice}` pattern is removed)
- ✅ Flipping the toggle ON does NOT persist immediately — the NF-2 **confirm panel** ("Confirm trade-off") appears and enabling requires the explicit confirm button
- ✅ Turning the toggle OFF is immediate (fail-safe direction, no confirm)
- ✅ Implementation: `src/components/security/BiometricUnlockSettings.jsx` (`data-testid="biometric-enable-confirm"`, `confirmEnable()`)

### Biometric Unlock Section (PasskeyUnlockSettings — visible on ALL platforms per PR #542 / fa76570c)
- ✅ Renders unconditionally — NOT gated behind `!isNative`
- ✅ On native, honestly labeled **"Biometric unlock"** (routes through OS biometrics via BiometricAuth; the Capacitor app ships NO WebAuthn plugin) — the word "Passkey" must NOT appear
- ✅ On web, the same section reads **"Unlock with Passkey"** (real WebAuthn path)
- ✅ Implementation: `src/pages/Settings.jsx:160` (`<PasskeyUnlockSettings />`) + `src/components/security/PasskeyUnlockSettings.jsx` (`nativeBio ? 'Biometric unlock' : 'Unlock with Passkey'`)

### Web-Only Features (MUST be Hidden on Mobile)

#### Wallet Passkeys (per-wallet)
- ✅ Entire section hidden on native
- ✅ Implementation: `src/pages/Settings.jsx:168`
- ✅ Code: `{!isNative && ( <div className="space-y-3"> {/* Wallet Passkeys */} </div> )}`

## Build Requirements
- Minimum commit: **fa76570c** (PR #542) — includes the honest native biometric relabel and unconditional PasskeyUnlockSettings render
- Preferred: Latest `main` branch
- Capacitor native platform detection uses: `Capacitor.isNativePlatform()`

## Validation
Before shipping mobile APK, verify:
1. Biometric unlock toggle is user-controlled; enabling shows the NF-2 confirm panel before anything persists
2. "Biometric unlock" section IS visible in Settings on native, with no "Passkey" wording
3. No "Wallet Passkeys" section visible in Settings on native

## Related PRs
- PR #542 — Honest native biometric relabel; PasskeyUnlockSettings renders on all platforms (fa76570c); forced-on biometric toggle removed (530b9924, NF-2 confirm panel)
- PR #540 — Mobile UI fixes: light mode, Hardware KEK status, and Wallet Passkeys
- Commits: cb6f8dbe, e7fb5995, 757fa827, b2912b6f, 530b9924, fa76570c

---
**Last Updated:** 2026-07-06
