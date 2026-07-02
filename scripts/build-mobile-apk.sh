#!/bin/bash
# Mobile APK Build Script for Veyrnox
# Builds Android and iOS apps with all UI/UX fixes from commits b2912b6f+

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "🚀 Veyrnox Mobile APK Build"
echo "================================="
echo ""

# Verify we're on the right branch with all fixes
echo "📋 Verification Checklist"
echo "========================"

# Check Git state
echo -n "✓ Git status... "
if [ -z "$(git -C "$PROJECT_ROOT" status --porcelain)" ]; then
  echo "CLEAN"
else
  echo "⚠️  Uncommitted changes detected"
  git -C "$PROJECT_ROOT" status --short
fi

# Verify key commits are on main
echo -n "✓ Light mode fix (cb6f8dbe)... "
if git -C "$PROJECT_ROOT" log main | grep -q cb6f8dbe; then
  echo "✅ Found"
else
  echo "❌ MISSING"
  exit 1
fi

echo -n "✓ Passkey hide fix (b2912b6f)... "
if git -C "$PROJECT_ROOT" log main | grep -q b2912b6f; then
  echo "✅ Found"
else
  echo "❌ MISSING"
  exit 1
fi

echo -n "✓ Biometric behavior (native forced-on)... "
if grep -q "disabled={forcedOnDevice}" "$PROJECT_ROOT/src/components/security/BiometricUnlockSettings.jsx"; then
  echo "✅ Correct"
else
  echo "❌ BROKEN"
  exit 1
fi

echo -n "✓ Passkey hidden on mobile (!isNative)... "
if grep -q "{!isNative && <PasskeyUnlockSettings" "$PROJECT_ROOT/src/pages/Settings.jsx"; then
  echo "✅ Correct"
else
  echo "❌ BROKEN"
  exit 1
fi

echo -n "✓ Wallet Passkeys hidden on mobile... "
if grep -q "{!isNative && (" "$PROJECT_ROOT/src/pages/Settings.jsx" | grep -q "Wallet Passkeys"; then
  echo "✅ Correct"
else
  echo "⚠️  Check manually"
fi

echo ""
echo "🏗️  Building APK"
echo "================="

# Install dependencies
echo "Installing dependencies..."
cd "$PROJECT_ROOT"
npm install --legacy-peer-deps

# Build web assets
echo "Building web assets..."
npm run build

# Android APK Build
echo ""
echo "Building Android APK..."
if [ -d "android" ]; then
  cd android
  ./gradlew clean
  ./gradlew assembleRelease
  APK_PATH="app/build/outputs/apk/release/app-release.apk"
  if [ -f "$APK_PATH" ]; then
    echo "✅ Android APK: $APK_PATH"
    ls -lh "$APK_PATH"
  fi
  cd ..
else
  echo "⚠️  Android directory not found. Use Capacitor to generate:"
  echo "   npx cap add android"
  echo "   npx cap copy android"
fi

# iOS Build
echo ""
echo "Building iOS..."
if [ -d "ios" ]; then
  echo "⚠️  iOS build requires Xcode (Mac only)"
  echo "   Follow standard Capacitor iOS build: npx cap open ios"
  echo "   Then build via Xcode or:"
  echo "   xcodebuild -workspace ios/App/App.xcworkspace -scheme App -configuration Release"
else
  echo "⚠️  iOS directory not found. Use Capacitor to generate:"
  echo "   npx cap add ios"
  echo "   npx cap copy ios"
fi

echo ""
echo "✅ Build Ready!"
echo "================"
echo ""
echo "📱 Next Steps:"
echo "1. Verify APK on test device"
echo "2. Check Settings page:"
echo "   - Biometric toggle is DISABLED and reads 'Fingerprint required on this device'"
echo "   - NO 'Unlock with Passkey' section visible"
echo "   - NO 'Wallet Passkeys' section visible"
echo "3. Submit to Google Play / App Store"
echo ""
echo "📚 Documentation: docs/mobile-apk-build-checklist.md"
echo ""
