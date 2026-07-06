# Mainnet Shipping Execution Plan (2026-07-06)

**Status:** Ready to deploy. Three features shipping-approved + automated verification in place.

**Timeline:** Execute in parallel; ship mainnet once tests pass (est. 2-4 hours total).

---

## ✅ PRE-SHIP CHECKLIST (DONE)

- [x] Three features shipping-approved (PR #640 merged 2026-07-06)
- [x] Internal audit passed (2026-07-05)
- [x] All 10 assets verified on-chain (testnet + mainnet)
- [x] Critical gating mechanisms verified (KEK, 2FA, biometric)
- [x] Automated verification tests written (Tasks 2 & 3)
- [x] Documentation complete (runbook, troubleshooting, CI examples)

---

## 🚀 EXECUTION PHASE (NOW)

### **PARALLEL: Run Automated Tests**

#### **1. Web Phase 1 KEK Sepolia Send (30 min)**
```bash
# Local test (for validation)
npm install -D @playwright/test
npx playwright install chromium
npm run dev &  # Start dev server
RUN_SUPERVISED_E2E=1 npx playwright test e2e/webauthn-prf-sepolia-verified.spec.js --headed

# OR add to CI (GitHub Actions)
# - Will run automatically on next push
# - Captures txid + verifies on-chain
```

**Exit criteria:**
- ✅ Test passes
- ✅ Sepolia txid captured: `0x...`
- ✅ RPC confirms status: SUCCESS

**Action:** Record txid in verified-evidence.json

---

#### **2. Android KEK Residuals (10 min total runtime, 60 min setup)**
```bash
# Option A: BrowserStack (cloud, CI-friendly)
BROWSERSTACK_USERNAME=<user> \
BROWSERSTACK_ACCESS_KEY=<key> \
npm test -- tests/android/hardware-kek-residuals-automated.spec.js

# Option B: Local Appium + Pixel device
APK_PATH=/path/to/app-debug.apk \
APK_V2_PATH=/path/to/app-v2-debug.apk \
npm test -- tests/android/hardware-kek-residuals-automated.spec.js
```

**Exit criteria:**
- ✅ T1 (v2→v3 migration) test passes
  - Sepolia txid from migrated vault captured
  - Logcat shows: `hardwareKekVersion: 2 → 3`
- ✅ T3 (salt distinctness) test passes
  - 4 unique salts verified
  - Collision count: 0

**Action:** Record Sepolia txid + logcat excerpts in verified-evidence.json

---

### **SEQUENTIAL: Update Documentation & Deploy**

#### **3. Update verified-evidence.json** (10 min)
Add two new entries under `evidence`:

```json
"Web Phase 1 KEK (Sepolia, automated)": {
  "chain": "sepolia",
  "txid": "0x...",  // from Web KEK test
  "from": "0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729",
  "to": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "amount": "0.001 ETH",
  "verified_onchain": "eth_getTransactionReceipt, chainId 11155111, status SUCCESS",
  "automation": "Playwright + CDP virtual authenticator (webauthn-prf-sepolia-verified.spec.js)",
  "date": "2026-07-0X"
},

"Android KEK v3 Migration (Sepolia, automated)": {
  "chain": "sepolia",
  "txid": "0x...",  // from Android T1 test
  "from": "0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729",
  "to": "0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045",
  "amount": "0.001 ETH",
  "verified_onchain": "eth_getTransactionReceipt, chainId 11155111, status SUCCESS",
  "device": "Google Pixel 10 Pro XL (via BrowserStack or local Appium)",
  "vault_state": {
    "kdf": "kek-dek",
    "hardwareKekVersion": 3,
    "hasKekSalt": true,
    "kekSaltLength": 44,
    "hasKekWrap": true
  },
  "automation": "Appium (hardware-kek-residuals-automated.spec.js T1)",
  "logcat_notes": "v2→v3 migration triggered on unlock, confirmed via logcat",
  "date": "2026-07-0X"
}
```

#### **4. Create PR for Documentation Update** (10 min)
```bash
git checkout -b docs/shipping-verification-2026-07-06
git add docs/verified-evidence.json
git commit -m "docs: add automated shipping verification txids (Web KEK + Android v3 migration)"
gh pr create --title "docs: shipping verification txids (Web + Android automated tests)"
```

#### **5. Mainnet Deployment** (30 min)
```bash
# Set mainnet gates
# In networks.js:
ALLOW_MAINNET = true
ALLOW_BTC_MAINNET = true
ALLOW_SOL_MAINNET = true

# Build release artifacts
npm run build:web:release
npm run build:android:release
npm run build:ios:release

# Deploy web
npm run deploy:web:production

# Create release on GitHub
gh release create v1.0.0 \
  --title "Mainnet Unlock v1.0.0" \
  --notes "$(cat <<'EOF'
## What's new
- WalletConnect signing hardening (RASP gate, chain binding, step-up re-auth)
- Deniability stack (decoy/hidden sessions, I3 egress fixes)
- dApp security alerts + local backup export/import

## Verified on testnet
- All 10 assets live (ETH, USDC, USDT, BTC, SOL)
- Two-Factor Face ID (iPhone 17 Pro Max)
- Android Hardware KEK v3 (StrongBox, Pixel 10 Pro XL)
- iOS Hardware KEK (Secure Enclave, iPhone 17 Pro Max)
- Web Phase 1 KEK (Windows Hello, automated)

## Audit status
- Internal audit complete (2026-07-05)
- Independent audit deferred (not required per owner decision)

## Known limitations
- iOS biometric re-enroll test device-blocked (deferred)
- RASP OS-level probes Phase 4 (native work)
- Android salt-tamper test remains manual (optional, non-critical)

See docs/Feature-Status.md for full feature catalogue.
EOF
)"
```

#### **6. Monitor Post-Deployment** (ongoing, 24 hrs)
```bash
# Track mainnet txids from real users
# Add to verified-evidence.json as they arrive
# Monitor error logs for any regressions
```

---

## 📋 TASK MATRIX

| Task | Owner | Est. Time | Status | Action |
|------|-------|-----------|--------|--------|
| Web KEK test (Playwright) | CI (parallel) | 5 min | Ready | Run now |
| Android residuals (Appium) | CI (parallel) | 10 min | Ready | Run now |
| Update verified-evidence.json | Manual | 10 min | Pending | After tests pass |
| Create PR + merge | Manual | 10 min | Pending | After docs update |
| Build release artifacts | CI | 15 min | Ready | After PR merged |
| Deploy web to production | Manual | 10 min | Pending | After build succeeds |
| Create GitHub release | Manual | 5 min | Pending | After deploy |
| Monitor mainnet (24h) | Manual | Ongoing | Ready | Post-ship |

---

## ⏱️ TIMELINE

**Est. Total Time: 2-4 hours**

```
T+0min    Start: Run tests (parallel)
          - Web KEK test: npm run test:e2e:web-verified
          - Android tests: npm test -- tests/android/hardware-kek-residuals-automated.spec.js
          
T+15min   Tests complete → Capture txids
          
T+25min   Update verified-evidence.json (manual)
          
T+35min   Create PR + merge (manual)
          
T+45min   Build + deploy (CI automation)
          
T+70min   Create GitHub release (manual)
          
T+75min   ✅ LIVE ON MAINNET
```

---

## 🎯 SUCCESS CRITERIA

### Ship Mainnet When:
- [x] Three features shipping-approved (PR #640 ✅)
- [ ] Web KEK test passing (Sepolia txid captured)
- [ ] Android v2→v3 migration test passing (Sepolia txid captured)
- [ ] Android salt distinctness test passing (4 unique salts confirmed)
- [ ] verified-evidence.json updated with captured txids
- [ ] Mainnet gates set (`ALLOW_MAINNET = true`)
- [ ] Web + Android + iOS binaries built and ready
- [ ] GitHub release created

### Can Defer to Post-Ship:
- Android salt-tamper manual test (optional, non-critical)
- iOS biometric re-enroll test (device-blocked)
- Independent audit (owner deferred)

---

## 🚨 ABORT CRITERIA

Stop and investigate if:
- **Web KEK test fails** — PRF enrollment or unlock path broken
- **Android v2→v3 test fails** — Migration logic not working
- **Android salt distinctness test fails** — Per-enrollment salt binding broken
- **Sepolia txids not on-chain** — Network issue or broadcast failure
- **Mainnet gates can't be set** — Build system issue

---

## 📞 ESCALATION

If tests fail:
1. Check: `docs/automated-shipping-verification-runbook.md` § Troubleshooting
2. Review: logcat excerpts (Android) or console logs (Web)
3. Re-run failed test in isolation with `--headed` flag
4. If issue unresolved: Roll back automation, run Task 2 manually (Windows Hello)

---

## 🎊 POST-SHIP

Once mainnet is live:
1. Monitor error logs (first 24 hours)
2. Collect real mainnet txids from users
3. Add to verified-evidence.json as received
4. Schedule independent audit (optional, when budget available)
5. Plan Phase 2 native hardware KEK (Q3 2026)

---

## Sign-Off

**Owner decision:** Internal audit sufficient (independent audit not required)
**PR:** #640 (shipping approval)
**Status:** ✅ Ready to deploy
**Date:** 2026-07-06

Execute when ready.
