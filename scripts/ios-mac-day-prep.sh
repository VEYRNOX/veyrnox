#!/usr/bin/env bash
# ios-mac-day-prep.sh — Pre-flight for the iOS KEK device session (Mac day)
#
# Run this ON THE MAC before plugging in the iPhone. It validates every
# prerequisite that can be checked without the device, so the session itself
# is pure execution. Exits non-zero on any blocker.
#
# Usage:  ./scripts/ios-mac-day-prep.sh
# Prereq: run from the repo root on a Mac with Xcode installed.

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[0;33m'; NC='\033[0m'
pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; FAILED=1; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
FAILED=0

echo "═══════════════════════════════════════════════════════════"
echo "  iOS Mac Day Pre-Flight — runbook-ios-kek-session.md"
echo "═══════════════════════════════════════════════════════════"
echo ""

# ── 1. Environment ──────────────────────────────────────────────
echo "── Environment ──"

if ! command -v xcodebuild &>/dev/null; then
  fail "Xcode not found — install Xcode from the App Store"
else
  XCODE_VER=$(xcodebuild -version | head -1)
  pass "Xcode found: $XCODE_VER"
fi

if ! command -v node &>/dev/null; then
  fail "Node.js not found"
else
  pass "Node.js $(node -v)"
fi

if ! command -v npm &>/dev/null; then
  fail "npm not found"
else
  pass "npm $(npm -v)"
fi

# Check for pymobiledevice3 (needed for log capture if idevicesyslog isn't available)
if command -v pymobiledevice3 &>/dev/null; then
  pass "pymobiledevice3 found (for syslog capture)"
elif command -v idevicesyslog &>/dev/null; then
  pass "idevicesyslog found (for syslog capture)"
else
  warn "Neither pymobiledevice3 nor idevicesyslog found — install one for log capture"
  warn "  pip3 install pymobiledevice3   OR   brew install libimobiledevice"
fi

echo ""

# ── 2. Dependencies ─────────────────────────────────────────────
echo "── Dependencies ──"

if [ ! -d node_modules ]; then
  echo "Installing npm dependencies..."
  npm install --legacy-peer-deps
fi
pass "node_modules present"

echo ""

# ── 3. Web build + Capacitor sync ──────────────────────────────
echo "── Build + Sync ──"

echo "Building web assets..."
npm run build
pass "Web build complete"

echo "Syncing Capacitor iOS..."
npx cap sync ios
pass "Capacitor sync complete"

echo ""

# ── 4. Xcode build (compile check) ─────────────────────────────
echo "── Xcode Compile Check (F3/F5) ──"

cd ios/App

# Resolve SPM packages
echo "Resolving Swift packages..."
xcodebuild -resolvePackageDependencies -project App.xcodeproj -scheme App 2>&1 | tail -3
pass "SPM packages resolved"

# Compile — unsigned, simulator destination (no certs needed for compile check)
echo "Compiling (unsigned, simulator target)..."
BUILD_LOG="/tmp/ios-mac-day-build.log"
xcodebuild \
  -project App.xcodeproj \
  -scheme App \
  -configuration Debug \
  -destination 'generic/platform=iOS Simulator' \
  CODE_SIGN_IDENTITY="" \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGNING_ALLOWED=NO \
  ONLY_ACTIVE_ARCH=NO \
  2>&1 | tee "$BUILD_LOG"

if grep -q "\*\* BUILD SUCCEEDED \*\*" "$BUILD_LOG"; then
  pass "BUILD SUCCEEDED"
else
  fail "BUILD FAILED — check $BUILD_LOG"
fi

# F3: no kSecUseOperationPrompt deprecation
if grep -qi "kSecUseOperationPrompt" "$BUILD_LOG"; then
  fail "iOS-F3: kSecUseOperationPrompt deprecation warning found"
else
  pass "iOS-F3: zero kSecUseOperationPrompt warnings"
fi

# F5: HardwareKekPlugin.o compiled
OBJ=$(find ~/Library/Developer/Xcode/DerivedData -name "HardwareKekPlugin.o" 2>/dev/null | head -1)
if [ -n "$OBJ" ]; then
  pass "iOS-F5: HardwareKekPlugin.o found at $OBJ"
else
  fail "iOS-F5: HardwareKekPlugin.o not found"
fi

cd ../..
echo ""

# ── 5. Signing check ───────────────────────────────────────────
echo "── Signing ──"
TEAM_COUNT=$(security find-identity -v -p codesigning 2>/dev/null | grep -c "valid identities found" || echo "0")
if security find-identity -v -p codesigning 2>/dev/null | grep -q "iPhone Developer\|Apple Development\|iOS Development"; then
  pass "iOS signing identity found"
else
  warn "No iOS signing identity detected — you may need to open Xcode and sign in to your developer account"
fi

echo ""

# ── 6. Device detection ────────────────────────────────────────
echo "── Device ──"
if command -v xcrun &>/dev/null && xcrun xctrace list devices 2>/dev/null | grep -qi "iPhone"; then
  DEVICE=$(xcrun xctrace list devices 2>/dev/null | grep -i "iPhone" | head -1)
  pass "iPhone detected: $DEVICE"
else
  warn "No iPhone detected — plug it in and trust this Mac before the session"
fi

echo ""

# ── 7. Testnet funding check ───────────────────────────────────
echo "── Testnet Funding ──"
warn "MANUAL CHECK: ensure the iOS test vault's Sepolia address has testnet ETH"
warn "  (needed for P1 correlated send — check on sepolia.etherscan.io)"

echo ""

# ── 8. Summary ─────────────────────────────────────────────────
echo "═══════════════════════════════════════════════════════════"
if [ "$FAILED" -eq 0 ]; then
  echo -e "${GREEN}All pre-flight checks passed.${NC} Ready for device session."
  echo ""
  echo "Next: plug in iPhone, open Xcode, build with real signing (Debug),"
  echo "install over existing app, then follow runbook-ios-kek-session.md Phase 2–4."
else
  echo -e "${RED}Some checks failed.${NC} Fix blockers before the device session."
fi
echo "═══════════════════════════════════════════════════════════"
echo "Build log: $BUILD_LOG"

exit $FAILED
