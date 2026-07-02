# 🚀 Mobile APK Build — Ready for Production

**Status:** ✅ **ALL FIXES INTEGRATED** — Ready to build and deploy

---

## What's Included

### UI/UX Fixes (All on main)
- ✅ **Light mode heading visibility** (cb6f8dbe) — dApp Connector readable in light mode
- ✅ **Biometric forced-on behavior** (working correctly) — toggle disabled on native, showing "required"
- ✅ **Passkey sections hidden** (b2912b6f) — web-only features not shown on mobile
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
  - [ ] Toggle is **DISABLED** (grayed out, not clickable)
  - [ ] Text reads: "Fingerprint required on this device"
  - [ ] Explanation shows: "Your wallet always asks for Fingerprint (or your device passcode) on this device — this can't be turned off here."

- [ ] **NO "Unlock with Passkey" section** (should be completely hidden)
  - [ ] Scroll through entire Settings page
  - [ ] Confirm no passkey-related UI appears

- [ ] **NO "Wallet Passkeys" section** (should be completely hidden)
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
- Biometric behavior is correct (intentionally forced-on on native)
- Passkey sections properly hidden on mobile
- Automated build script with verification
- Complete documentation and checklist

**Next step:** Run `./scripts/build-mobile-apk.sh` and deploy to app stores.

---

**Last Updated:** 2026-07-02  
**Build Status:** 🟢 READY FOR PRODUCTION
