# 🚀 Mobile APK Build — Ready for Production

**Status:** ✅ **ALL FIXES INTEGRATED** — Ready to build and deploy

---

## What's Included

### UI/UX Fixes (All on main)
- ✅ **Light mode heading visibility** (cb6f8dbe) — dApp Connector readable in light mode
- ✅ **Biometric unlock user-controlled** (530b9924) — forced-on toggle removed; enabling is a deliberate two-step action via the NF-2 confirm panel
- ✅ **Biometric unlock section honest on native** (PR #542 / fa76570c) — PasskeyUnlockSettings renders on all platforms; on native it routes through OS biometrics and is labeled "Biometric unlock", never "Passkey"
- ✅ **Wallet Passkeys hidden on mobile** (b2912b6f) — per-wallet passkey registration stays web-only
- ✅ **Hardware KEK status updated** (757fa827) — provisional warning removed

### Documentation & Build Tools
- ✅ `docs/mobile-apk-build-checklist.md` — Validation checklist before shipping
- ✅ `scripts/build-mobile-apk.sh` — Automated build script with verification
- ✅ `PR #540` — Complete PR documentation with all changes

---

## Quick Start: Build APK

### Prerequisites
```bash
# Ensure you have:
- Node.js 16+ 
- npm or yarn
- Android SDK (for Android APK)
- Xcode 13+ (for iOS, Mac only)
- Capacitor CLI
```

### Build Steps

#### 1. Update to Latest Main
```bash
git checkout main
git pull origin main
```

#### 2. Run Automated Build Script
```bash
chmod +x scripts/build-mobile-apk.sh
./scripts/build-mobile-apk.sh
```

This script will:
- ✅ Verify all UI/UX fixes are in place
- ✅ Check Git status
- ✅ Build web assets
- ✅ Build Android APK
- ✅ Guide iOS build process

#### 3. Manual Capacitor Build (if needed)

**Android:**
```bash
npm install --legacy-peer-deps
npm run build
npx cap sync android
npx cap open android
# In Android Studio: Build > Build Bundle(s) / APK(s)
```

**iOS:**
```bash
npm install --legacy-peer-deps
npm run build
npx cap sync ios
npx cap open ios
# In Xcode: Product > Build / Archive
```

---

## Testing Checklist

### Before Shipping, Verify on Test Device:

#### Settings Page → Security Settings
- [ ] **Biometric Unlock section:**
  - [ ] Toggle is **USER-CONTROLLED** (not forced on, not grayed out)
  - [ ] Flipping the toggle ON does NOT enable immediately — the NF-2 **confirm panel** appears ("Confirm trade-off") and enabling requires the explicit confirm button
  - [ ] Turning the toggle OFF is immediate (fail-safe direction, no confirm)

- [ ] **"Biometric unlock" section IS visible** (PasskeyUnlockSettings, per PR #542)
  - [ ] On native, it is labeled "Biometric unlock" — the word "Passkey" must NOT appear (honest labels: "Enroll biometric unlock", "Require biometric unlock", "Preview biometric prompt")
  - [ ] On web, the same section reads "Unlock with Passkey" (real WebAuthn path)

- [ ] **NO "Wallet Passkeys" section** (should be completely hidden on native)
  - [ ] Confirm no per-wallet passkey registration UI appears

- [ ] **Hardware KEK Settings:**
  - [ ] No "UNAUDITED-PROVISIONAL" warning banner
  - [ ] Clean status showing current certification tier

#### dApp Connector / Alerts (Light Mode)
- [ ] In **light mode**, headings are **readable** (dark text on light background)
- [ ] No invisible text or low-contrast headings

---

## Git Commits Included

All fixes are on `main`. Key commits:

```
2eb765ca — Latest on main (includes all mobile fixes)
b2912b6f — fix: hide Wallet Passkeys section on mobile app
757fa827 — ui: remove UNAUDITED-PROVISIONAL warning from Hardware Protection settings
e7fb5995 — docs: update iOS SE KEK status language
cb6f8dbe — fix: light mode heading visibility with media query overrides
```

**Minimum commit for full mobile fix:** `b2912b6f` (2026-07-02)

---

## Build Troubleshooting

### Gradle/Android Build Issues
```bash
# Clear cache and retry
cd android
./gradlew clean
./gradlew assembleRelease
```

### Xcode/iOS Issues
```bash
# Sync latest
npx cap sync ios
# Clear Xcode cache
rm -rf ~/Library/Developer/Xcode/DerivedData/*
# Rebuild in Xcode
```

### "Module not found" Errors
```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps
```

---

## Post-Build

### 1. Sign APK (Android)
```bash
jarsigner -verbose -sigalg SHA1withRSA -digestalg SHA1 \
  -keystore your-keystore.jks \
  app/build/outputs/apk/release/app-release-unsigned.apk \
  your-key-alias
```

### 2. Align APK
```bash
zipalign -v 4 app-release-unsigned.apk app-release.apk
```

### 3. Upload to Play Store / App Store
- Use Google Play Console (Android)
- Use App Store Connect (iOS)
- Reference PR #540 in release notes

---

## Documentation References

- **Full PR:** https://github.com/VEYRNOX/veyrnox/pull/540
- **Build Checklist:** `docs/mobile-apk-build-checklist.md`
- **Build Script:** `scripts/build-mobile-apk.sh`
- **Security Review:** `docs/SECURITY_SELFREVIEW_FINDINGS.md` (Finding F-3)
- **Feature Status:** `docs/Feature-Status.md`

---

## Summary

✅ **Code is clean and ready for production mobile builds**

- All UI/UX fixes integrated on main
- Biometric unlock toggle is user-controlled with the NF-2 confirm panel (forced-on removed in 530b9924)
- "Biometric unlock" section renders on native with honest labels (PR #542); Wallet Passkeys stays web-only
- Automated build script with verification
- Complete documentation and checklist

**Next step:** Run `./scripts/build-mobile-apk.sh` and deploy to app stores.

---

**Last Updated:** 2026-07-06  
**Build Status:** 🟢 READY FOR PRODUCTION
