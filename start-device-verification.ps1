# Veyrnox Device Verification Script (PowerShell)
# Run this to start automated E2E testing on Pixel 10 Pro XL

Write-Host "================================" -ForegroundColor Cyan
Write-Host "Veyrnox Device Verification" -ForegroundColor Cyan
Write-Host "================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check device connection
Write-Host "[1/7] Checking device connection..." -ForegroundColor Yellow
$devices = & adb devices
if ($devices -notmatch "device$") {
    Write-Host "❌ ERROR: No device detected" -ForegroundColor Red
    Write-Host "   - Check USB cable"
    Write-Host "   - Enable USB debugging on device"
    Write-Host "   - Run: adb kill-server && adb devices"
    exit 1
}
Write-Host "✅ Device connected" -ForegroundColor Green
Write-Host ""

# Step 2: Verify APK installed
Write-Host "[2/7] Verifying APK installation..." -ForegroundColor Yellow
$packages = & adb shell pm list packages
if ($packages -notmatch "veyrnox") {
    Write-Host "❌ ERROR: Veyrnox app not installed" -ForegroundColor Red
    Write-Host "   - Run: npm run android:sync"
    exit 1
}
Write-Host "✅ APK installed (com.veyrnox.app.debug)" -ForegroundColor Green
Write-Host ""

# Step 3: Check Appium server
Write-Host "[3/7] Checking Appium server (port 4723)..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:4723/wd/hub/status" -UseBasicParsing -ErrorAction SilentlyContinue
    if ($response.Content -match "ready") {
        Write-Host "✅ Appium server ready" -ForegroundColor Green
    } else {
        throw "Appium not responding"
    }
} catch {
    Write-Host "❌ ERROR: Appium not running on port 4723" -ForegroundColor Red
    Write-Host "   - Start Appium in a separate PowerShell terminal:"
    Write-Host "   - appium --port 4723"
    exit 1
}
Write-Host ""

# Step 4-7: Run test suites in order
Write-Host "[4/7] Running Vault Tests (8/8, ~2 min)..." -ForegroundColor Yellow
& npm run android:test:vault
Write-Host ""

Write-Host "[5/7] Running Hardware KEK Tests (5/5, ~5 min)..." -ForegroundColor Yellow
& npm run android:test:hardware-kek
Write-Host ""

Write-Host "[6/7] Running Biometric Unlock Tests (8/8, ~6 min)..." -ForegroundColor Yellow
& npm run android:test:biometric-unlock
Write-Host ""

Write-Host "[7/7] Running Send Scenarios Tests (10/10, ~8 min)..." -ForegroundColor Yellow
Write-Host "⚠️  Watch for on-chain TXIDs in output below" -ForegroundColor Yellow
& npm run android:test:send-scenarios
Write-Host ""

Write-Host "================================" -ForegroundColor Green
Write-Host "✅ Device Verification Complete" -ForegroundColor Green
Write-Host "================================" -ForegroundColor Green
Write-Host ""
Write-Host "Next Steps:" -ForegroundColor Cyan
Write-Host "1. Check test results above"
Write-Host "2. If send-scenarios passed, verify on-chain:"
Write-Host "   - Sepolia: https://sepolia.etherscan.io"
Write-Host "   - Bitcoin testnet: https://mempool.space/testnet"
Write-Host "   - Solana devnet: https://explorer.solana.com?cluster=devnet"
Write-Host "3. Record TXIDs in docs/DEVICE_VERIFICATION.md"
Write-Host "4. Report results"
Write-Host ""
