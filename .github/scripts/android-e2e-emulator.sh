#!/usr/bin/env bash
# Runs inside reactivecircus/android-emulator-runner's `script:` — the emulator
# is already booted and adb is connected when this starts.
#
# Exit code: non-zero only on INFRASTRUCTURE failure (APK install, Appium
# startup). Individual suites are non-blocking — some (hardware-kek,
# biometric-unlock) require real hardware and are expected to fail on an
# emulator. Real per-suite results are written to
# test-results/suite-results.txt; nothing is fabricated (I4).
set -uo pipefail

mkdir -p test-results

APK_PATH="android/app/build/outputs/apk/debug/app-debug.apk"
echo "=== Installing APK: $APK_PATH ==="
adb install -r "$APK_PATH"
adb shell pm list packages | grep veyrnox

echo "=== Starting Appium ==="
nohup appium --port 4723 > test-results/appium.log 2>&1 &

appium_up=0
for _ in $(seq 1 30); do
  if curl -fsS http://127.0.0.1:4723/status > /dev/null 2>&1; then
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
