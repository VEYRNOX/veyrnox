#!/bin/bash

# Veyrnox Device Verification Script
# Run this to start automated E2E testing on Pixel 10 Pro XL

set -e

echo "================================"
echo "Veyrnox Device Verification"
echo "================================"
echo ""

# Step 1: Check device connection
echo "[1/7] Checking device connection..."
if ! adb devices | grep -q "device$"; then
    echo "❌ ERROR: No device detected"
    echo "   - Check USB cable"
    echo "   - Enable USB debugging on device"
    echo "   - Run: adb kill-server && adb devices"
    exit 1
fi
echo "✅ Device connected"
echo ""

# Step 2: Verify APK installed
echo "[2/7] Verifying APK installation..."
if ! adb shell pm list packages | grep -q "veyrnox"; then
    echo "❌ ERROR: Veyrnox app not installed"
    echo "   - Run: npm run android:sync"
    exit 1
fi
echo "✅ APK installed (com.veyrnox.app.debug)"
echo ""

# Step 3: Check Appium server
echo "[3/7] Checking Appium server (port 4723)..."
if ! curl -s http://localhost:4723/wd/hub/status | grep -q "ready"; then
    echo "❌ ERROR: Appium not running on port 4723"
    echo "   - Start Appium in a separate terminal:"
    echo "   - appium --port 4723"
    exit 1
fi
echo "✅ Appium server ready"
echo ""

# Step 4-7: Run test suites in order
echo "[4/7] Running Vault Tests (8/8, ~2 min)..."
npm run android:test:vault || true
echo ""

echo "[5/7] Running Hardware KEK Tests (5/5, ~5 min)..."
npm run android:test:hardware-kek || true
echo ""

echo "[6/7] Running Biometric Unlock Tests (8/8, ~6 min)..."
npm run android:test:biometric-unlock || true
echo ""

echo "[7/7] Running Send Scenarios Tests (10/10, ~8 min)..."
echo "⚠️  Watch for on-chain TXIDs in output below"
npm run android:test:send-scenarios || true
echo ""

echo "================================"
echo "✅ Device Verification Complete"
echo "================================"
echo ""
echo "Next Steps:"
echo "1. Check test results above"
echo "2. If send-scenarios passed, verify on-chain:"
echo "   - Sepolia: https://sepolia.etherscan.io"
echo "   - Bitcoin testnet: https://mempool.space/testnet"
echo "   - Solana devnet: https://explorer.solana.com?cluster=devnet"
echo "3. Record TXIDs in docs/DEVICE_VERIFICATION.md"
echo "4. Report results"
echo ""
