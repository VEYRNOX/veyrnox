#!/usr/bin/env bash
# Runs inside reactivecircus/android-emulator-runner's `script:` — the emulator
# is already booted and adb is connected when this starts.
#
# Exit code: non-zero only on INFRASTRUCTURE failure (APK install, Appium
# startup). Individual suites are non-blocking — some (hardware-kek,
# biometric-unlock) require real hardware and are expected to fail on an
# emulator. Real per-suite results are written to
# test-results/suite-results.txt; nothing is fabricated (I4).
set -euo pipefail

cd "$(dirname "$0")/../.."
# Let Appium discover the lockfile-installed driver from this npm project.
unset APPIUM_HOME

mkdir -p test-results

APK_PATH="android/app/build/outputs/apk/google/debug/app-google-debug.apk"
export APPIUM_APP="$PWD/$APK_PATH"
echo "=== Installing APK: $APK_PATH ==="
adb install -r "$APK_PATH"
adb shell pm list packages | grep veyrnox

echo "=== Starting Appium ==="
npx --no-install appium --address 127.0.0.1 --port 4723 --use-drivers uiautomator2 --log-no-colors --log-level debug > test-results/appium.log 2>&1 &
appium_pid=$!
trap 'kill "$appium_pid" 2>/dev/null || true; wait "$appium_pid" 2>/dev/null || true' EXIT

appium_up=0
for _ in $(seq 1 30); do
  if ! kill -0 "$appium_pid" 2>/dev/null; then
    break
  fi
  if curl -fsS http://127.0.0.1:4723/status > /dev/null 2>&1 &&
      grep -q 'AndroidUiautomator2Driver has been successfully loaded' test-results/appium.log; then
    appium_up=1
    break
  fi
  sleep 2
done
if [ "$appium_up" -ne 1 ]; then
  echo "ERROR: Appium did not become ready on :4723" >&2
  cat test-results/appium.log >&2 || true
  exit 1
fi
echo "Appium is ready"

SUITES="vault send send-scenarios hardware-kek biometric-unlock hidden-wallet panic-pin"
for suite in $SUITES; do
  echo ""
  echo "=== Suite: $suite ==="
  if npm run "android:test:$suite"; then
    echo "$suite: PASS" >> test-results/suite-results.txt
  else
    echo "$suite: FAIL" >> test-results/suite-results.txt
  fi
done

echo ""
echo "=== Suite results ==="
cat test-results/suite-results.txt

adb logcat -d > test-results/logcat.log || true
