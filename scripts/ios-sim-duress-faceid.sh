#!/usr/bin/env bash
# scripts/ios-sim-duress-faceid.sh
#
# iOS Simulator automation: Face-ID-to-decoy APP-LAYER routing, no human touch
# during the run (build/install/enroll/Face-ID-match/screenshot are all
# scripted). Uses idb + simctl + osascript exactly per the conventions recorded
# in memory (mobile-sim-uat-tooling).
#
# HONEST SCOPE (read before trusting this as "hardware-verified"):
#   - The iOS Simulator has NO Secure Enclave (`kSecAttrTokenIDSecureEnclave`
#     does not exist there). This script can NEVER close iOS-F9 / H-2/iOS-F11 /
#     iOS-F5 / iOS-F3 (docs/Feature-Status.md) — those need a physical iPhone
#     and a real face, which no script can substitute for by design.
#   - What THIS script legitimately proves: the APP-LAYER routing logic —
#     "Face ID (opt-in) -> decoy wallet, never the real one" (DuressPin.jsx
#     header comment) — using the Simulator's scriptable Face ID matcher
#     (Hardware/Features -> Face ID -> Enrolled / Matching Face / Non-matching
#     Face), which is a software toggle, not a claim about SE hardware.
#   - Coordinate taps below are placeholders: idb has no bridged accessibility
#     tree for the WKWebView (`idb ui describe-all` returns empty — see
#     mobile-sim-uat-tooling memory), so tap targets must be read off a
#     screenshot once per UI version and hardcoded. Run with STEP=screenshot
#     first, inspect build/sim-screenshots/*.png, fill in the TAP_* coordinates
#     below, then run with STEP=all. This mirrors the PIL brightness-band
#     approach already used in this repo's UAT tooling, not a new limitation.
#
# Requires: Xcode + iOS Simulator, idb (fb-idb, Python 3.9 venv — see memory),
# a booted simulator UDID.
#
# Usage:
#   xcrun simctl list devices | grep Booted        # find/boot a simulator first
#   UDID=<booted-udid> ./scripts/ios-sim-duress-faceid.sh screenshot
#   # ... fill in TAP_* below from the screenshot ...
#   UDID=<booted-udid> ./scripts/ios-sim-duress-faceid.sh all

set -euo pipefail

UDID="${UDID:?Set UDID to a booted Simulator device id (xcrun simctl list devices)}"
APP_BUNDLE_ID="com.veyrnox.app.debug"
OUT_DIR="build/sim-screenshots"
STEP="${1:-all}"

# Fixed demo credentials — DuressPin.jsx's own "Live demonstration" panel
# (DEMO-gated) exercises the REAL unlock path with these, so this script reuses
# them rather than re-deriving new ones. Never used outside this demonstration.
DEMO_REAL_PW="real-pin-2468"
DEMO_DURESS_PW="duress-pin-1357"

# ── TAP COORDINATES (fill in after `screenshot`, per screen — see header) ───
# Format: "x,y". Left as empty placeholders; the script refuses to tap-driven
# steps until these are set, rather than guessing and silently mis-tapping.
TAP_SETTINGS_NAV="${TAP_SETTINGS_NAV:-}"
TAP_DURESS_MENU_ITEM="${TAP_DURESS_MENU_ITEM:-}"
TAP_DEMO_SETUP_BUTTON="${TAP_DEMO_SETUP_BUTTON:-}"          # "1. Set up real + funded hidden wallet"
TAP_DECOY_BIOMETRIC_OPTIN_CHECKBOX="${TAP_DECOY_BIOMETRIC_OPTIN_CHECKBOX:-}"
TAP_LOCK_BUTTON="${TAP_LOCK_BUTTON:-}"
TAP_FACEID_UNLOCK_BUTTON="${TAP_FACEID_UNLOCK_BUTTON:-}"

log() { echo "[ios-sim-duress-faceid] $*"; }

require_coords() {
  for name in "$@"; do
    if [ -z "${!name}" ]; then
      echo "✗ $name is not set. Run '$0 screenshot' first, read the coordinate off" >&2
      echo "  build/sim-screenshots/*.png, then re-run with $name=x,y (or export it)." >&2
      exit 1
    fi
  done
}

tap() {
  local coords="$1"
  local x="${coords%%,*}"
  local y="${coords##*,}"
  idb ui tap --udid "$UDID" "$x" "$y"
  sleep 1
}

screenshot() {
  mkdir -p "$OUT_DIR"
  local name="$OUT_DIR/$(date -u +%Y%m%dT%H%M%SZ 2>/dev/null || echo now)-$1.png"
  xcrun simctl io "$UDID" screenshot "$name"
  log "screenshot: $name"
}

step_build_install_launch() {
  log "Building demo iOS app (VITE_DEMO_MODE=1 — needed for DuressPin's Live demonstration panel)"
  VITE_DEMO_MODE=1 npx vite build
  npx cap sync ios
  xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
    -sdk iphonesimulator -destination "id=$UDID" -derivedDataPath build/ios-sim build
  local app_path
  app_path="$(find build/ios-sim -maxdepth 6 -name 'App.app' -path '*Debug-iphonesimulator*' | head -1)"
  [ -n "$app_path" ] || { echo "✗ App.app not found under build/ios-sim" >&2; exit 1; }

  log "Erasing simulator for a clean vault state (Keychain persists across uninstall, not erase)"
  xcrun simctl erase "$UDID"
  xcrun simctl boot "$UDID" 2>/dev/null || true
  sleep 5

  log "Installing + launching $app_path"
  xcrun simctl install "$UDID" "$app_path"
  xcrun simctl launch "$UDID" "$APP_BUNDLE_ID"
  sleep 5
  screenshot "01-launched"
}

step_enroll_faceid() {
  # Simulator Face ID is a SOFTWARE toggle (Simulator menu, GUI-scriptable via
  # osascript) — proves app-layer routing, NOT Secure Enclave hardware. See
  # header. Requires the Simulator.app window to be frontmost.
  log "Enrolling Face ID on the Simulator (Features -> Face ID -> Enrolled)"
  osascript -e 'tell application "Simulator" to activate' \
    -e 'delay 1' \
    -e 'tell application "System Events" to tell process "Simulator"' \
    -e '  click menu item "Enrolled" of menu "Face ID" of menu item "Face ID" of menu "Features" of menu bar 1' \
    -e 'end tell'
  sleep 1
  screenshot "02-faceid-enrolled"
}

step_setup_duress_with_faceid_optin() {
  require_coords TAP_SETTINGS_NAV TAP_DURESS_MENU_ITEM TAP_DECOY_BIOMETRIC_OPTIN_CHECKBOX TAP_DEMO_SETUP_BUTTON TAP_LOCK_BUTTON

  log "Navigating to Settings -> Emergency PIN / Hidden Wallet (/duress-pin)"
  tap "$TAP_SETTINGS_NAV"
  screenshot "03-settings"
  tap "$TAP_DURESS_MENU_ITEM"
  screenshot "04-duress-pin-page"

  log "Opting in to 'Face ID opens the decoy' BEFORE running the demo setup"
  # This is the checkbox at data-testid="decoy-biometric-optin" in DuressPin.jsx
  # — a plain <input type=checkbox>, which (unlike the Radix <Select> asset
  # switcher) DOES respond to idb synthetic taps per the known WKWebView gotcha.
  tap "$TAP_DECOY_BIOMETRIC_OPTIN_CHECKBOX"
  screenshot "05-faceid-optin-checked"

  log "Running the Live demonstration setup (creates real+decoy vault, seeds decoy balance, locks)"
  tap "$TAP_DEMO_SETUP_BUTTON"
  sleep 3
  screenshot "06-demo-setup-done-locked"
}

step_verify_faceid_routes_to_decoy() {
  require_coords TAP_FACEID_UNLOCK_BUTTON

  log "Satisfying the upcoming Face ID prompt with a MATCHING face (scripted, no human)"
  osascript -e 'tell application "Simulator" to activate' \
    -e 'delay 1' \
    -e 'tell application "System Events" to tell process "Simulator"' \
    -e '  click menu item "Matching Face" of menu "Face ID" of menu item "Face ID" of menu "Features" of menu bar 1' \
    -e 'end tell'

  tap "$TAP_FACEID_UNLOCK_BUTTON"
  sleep 3
  screenshot "07-after-faceid-unlock"

  log "MANUAL CHECK (until OCR is wired): confirm build/sim-screenshots/07-after-faceid-unlock.png"
  log "shows the 'HIDDEN WALLET' badge, NOT 'REAL WALLET'. This is the app-layer claim"
  log "DuressPin.jsx documents: 'Face ID (opt-in) -> decoy wallet, NEVER the real one.'"
}

case "$STEP" in
  screenshot) step_build_install_launch ;;
  build) step_build_install_launch ;;
  enroll) step_enroll_faceid ;;
  setup) step_setup_duress_with_faceid_optin ;;
  verify) step_verify_faceid_routes_to_decoy ;;
  all)
    step_build_install_launch
    step_enroll_faceid
    step_setup_duress_with_faceid_optin
    step_verify_faceid_routes_to_decoy
    ;;
  *)
    echo "Usage: $0 {screenshot|build|enroll|setup|verify|all}" >&2
    exit 1
    ;;
esac
