#!/usr/bin/env bash
# android-device-session-prep.sh — Pre-flight for the Android KEK residuals session
#
# Run before the device session. Builds APK-NEW (current main) and validates all
# prerequisites. APK-OLD must be built separately (see the runbook for the checkout).
#
# Usage:  ./scripts/android-device-session-prep.sh
# Prereq: Android SDK, adb, Node.js, npm. Run from the repo root.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; FAILED=1; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
FAILED=0

echo "═══════════════════════════════════════════════════════════"
echo "  Android Device Session Pre-Flight"
echo "  runbook-android-kek-residuals.md"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 1. Environment ──────────────────────────────────────────────
echo "── Environment ──"

if ! command -v node &>/dev/null; then fail "Node.js not found"; else pass "Node.js $(node -v)"; fi
if ! command -v npm &>/dev/null; then fail "npm not found"; else pass "npm $(npm -v)"; fi

if ! command -v adb &>/dev/null; then
  fail "adb not found — install Android SDK platform-tools"
else
  pass "adb found"
fi

# Check for connected device
if adb devices 2>/dev/null | grep -q "device$"; then
  DEVICE=$(adb devices | grep "device$" | head -1 | cut -f1)
  MODEL=$(adb -s "$DEVICE" shell getprop ro.product.model 2>/dev/null || echo "unknown")
  API=$(adb -s "$DEVICE" shell getprop ro.build.version.sdk 2>/dev/null || echo "?")
  pass "Device connected: $MODEL (API $API) [$DEVICE]"

  # Check biometric enrollment
  if adb -s "$DEVICE" shell pm list features 2>/dev/null | grep -q "fingerprint\|face"; then
    pass "Biometric hardware available"
  else
    warn "No biometric hardware features detected"
  fi
else
  warn "No Android device connected — plug in the Pixel before the session"
fi

echo ""

# ── 2. Dependencies ─────────────────────────────────────────────
echo "── Dependencies ──"

if [ ! -d node_modules ]; then
  echo "Installing npm dependencies..."
  npm install --legacy-peer-deps
fi
pass "node_modules present"

# Verify LOG-1 redaction patch
if node scripts/check-log-redaction-patch.mjs 2>/dev/null; then
  pass "LOG-1 redaction patch verified"
else
  fail "LOG-1 redaction patch MISSING — run npm install"
fi

echo ""

# ── 3. Build APK-NEW ───────────────────────────────────────────
echo "── Build APK-NEW (current main) ──"

echo "Building web assets..."
npm run build
pass "Web build complete"

echo "Syncing Capacitor Android..."
npx cap sync android
pass "Capacitor sync complete"

echo "Building debug APK..."
cd android
./gradlew clean assembleDebug 2>&1 | tail -5
APK_NEW="app/build/outputs/apk/debug/app-debug.apk"
if [ -f "$APK_NEW" ]; then
  APK_SIZE=$(du -h "$APK_NEW" | cut -f1)
  pass "APK-NEW built: $APK_NEW ($APK_SIZE)"

  # Record signing info for keystore match verification
  if command -v apksigner &>/dev/null; then
    SIGN_INFO=$(apksigner verify --print-certs "$APK_NEW" 2>/dev/null | head -3 || echo "apksigner failed")
    echo "  Signing: $SIGN_INFO"
  elif command -v keytool &>/dev/null; then
    echo "  (Use apksigner or jarsigner to verify signing matches APK-OLD)"
  fi
else
  fail "APK-NEW not found at $APK_NEW"
fi
cd ..

echo ""

# ── 4. APK-OLD reminder ────────────────────────────────────────
echo "── APK-OLD (manual step) ──"
warn "APK-OLD must be built SEPARATELY from the pre-PR#568 commit."
warn "  git checkout f611bd42^"
warn "  npm ci && npm run build && npx cap sync android"
warn "  cd android && ./gradlew clean assembleDebug && cd .."
warn "  Copy the APK somewhere safe, then: git checkout main"
warn ""
warn "Both APKs MUST be signed with the same debug keystore."
warn "The default ~/.android/debug.keystore is used automatically by Gradle."

echo ""

# ── 5. Tooling check ───────────────────────────────────────────
echo "── Session Tooling ──"

if command -v adb &>/dev/null; then
  pass "adb (logcat, install, shell)"
fi

# Check if Chrome DevTools is reachable (CDP for vault read-back)
warn "MANUAL: open chrome://inspect in Chrome to verify WebView debugging is available"
warn "MANUAL: have a scratch note ready for device-local timestamps"

echo ""

# ── 6. Summary ─────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════"
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}Pre-flight passed.${NC} APK-NEW is ready."
  echo ""
  echo "Remaining manual steps before the session:"
  echo "  1. Build APK-OLD (see instructions above)"
  echo "  2. Verify both APKs share the same debug keystore signature"
  echo "  3. Plug in Pixel 10 Pro XL, enable USB debugging"
  echo "  4. Open two terminals for logcat (tagged + full)"
  echo "  5. Follow runbook-android-kek-residuals.md T1→T2→T3→LOG-1"
else
  echo -e "${RED}Some checks failed.${NC} Fix blockers before the session."
fi
echo "═══════════════════════════════════════════════════════════"

exit $FAILED
