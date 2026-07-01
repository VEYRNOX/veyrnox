# Phase 2 Infrastructure Checklist

**Target Completion:** 2026-07-01  
**Scope:** Parallel to Phase 1 UAT (does not block ship)

---

## 1. Hardware Device Ordering

**Objective:** Acquire physical iOS and Android devices for real-device verification.

### iPhone (Face ID + Secure Enclave)

- [ ] Target: iPhone 12 or newer (Face ID + A-series SE)
- [ ] Preferred vendor: Apple Refurbished (fast), Best Buy (overnight), Amazon Fresh
- [ ] Expedited shipping (target delivery: 2026-07-02 or 2026-07-03)
- [ ] Specs to verify:
  - [ ] Face ID present (checked on product listing)
  - [ ] Secure Enclave present (all A-series chips have SE)
  - [ ] iOS ≥16 (SE HMAC binding available in all iOS 16+)
- [ ] **Logged:**
  - [ ] Order date: ___________
  - [ ] Vendor: ___________
  - [ ] Model: ___________
  - [ ] Expected arrival: ___________
  - [ ] Order #: ___________

### Android (Fingerprint + StrongBox)

- [ ] Target: Pixel 3+ or Samsung Galaxy S9+ (both have StrongBox)
- [ ] Preferred vendor: Best Buy, Amazon (overnight), Decluttr
- [ ] Expedited shipping (target delivery: 2026-07-02 or 2026-07-03)
- [ ] Specs to verify:
  - [ ] Fingerprint sensor present (all Pixel 3+ have fingerprint)
  - [ ] StrongBox (Pixel 3+ certified; verify in device settings: Settings → Security → Keystore)
  - [ ] Android ≥9 (StrongBox API available in API 28+)
- [ ] **Logged:**
  - [ ] Order date: ___________
  - [ ] Vendor: ___________
  - [ ] Model: ___________
  - [ ] Expected arrival: ___________
  - [ ] Order #: ___________

### Fallback Plan (if expedited delivery unavailable)

- [ ] eBay used (expedited shipping, check seller rating ≥4.8 stars)
- [ ] Device rental service (Anrdoid emulator only; not suitable for Secure Enclave)
- [ ] Contact team members for device lending (temporary)

---

## 2. Testnet Funding Setup

**Objective:** Approve or configure 8-week testnet fund allocation for Phase 2 verification.

### Sepolia ETH Allocation

- [ ] Amount: 10 ETH (covers ~10,000 test sends @ 0.001 ETH each + gas)
- [ ] Route: DevOps drip (preferred) OR public faucets (fallback)
- [ ] Wallet address: `0x90f9f1db8b6e4e4b7c90d7e8b5f6a7b8c9d0e1f2` (TBD; update after Phase 1)
- [ ] **Logged:**
  - [ ] Drip approved date: ___________
  - [ ] Drip allocation: ___________
  - [ ] Wallet address: ___________
  - [ ] Point of contact: ___________

### Bitcoin Testnet Allocation

- [ ] Amount: 1 BTC (covers ~1000 test sends @ 0.001 BTC each + fees)
- [ ] Route: DevOps drip OR bitcoin-testnet-faucet.herokuapp.com (fallback)
- [ ] Wallet address: (BTC address; TBD after Phase 1)
- [ ] **Logged:**
  - [ ] Drip approved date: ___________
  - [ ] Drip allocation: ___________
  - [ ] Wallet address: ___________

### Solana Devnet Allocation

- [ ] Amount: 100 SOL (covers ~10,000 test sends + rent deposits)
- [ ] Route: Solana CLI devnet faucet (`solana airdrop 100`) OR DevOps drip
- [ ] Wallet address: (SOL public key; TBD after Phase 1)
- [ ] **Logged:**
  - [ ] Faucet/drip approved date: ___________
  - [ ] Allocation: ___________
  - [ ] Wallet address: ___________

---

## 3. Build Environment Verification

**Objective:** Confirm Xcode, Android Studio, and simulator/emulator are installed and compatible.

### macOS Build Tools

- [ ] Command: `xcode-select --version`
- [ ] Expected output: Xcode 15.3 or later
- [ ] If missing: `xcode-select --install` (automatic) OR install via App Store
- [ ] **Logged:** Xcode version ___________

### iOS Simulator

- [ ] Command: `xcrun simctl list devices | grep "iPhone 15"`
- [ ] Expected: At least 1 simulator device listed
- [ ] If none: `xcrun simctl create "iPhone 15 Pro" com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro com.apple.CoreSimulator.SimRuntime.iOS-17-5`
- [ ] Verify booting: `xcrun simctl boot <UDID>`
- [ ] **Logged:**
  - [ ] iPhone simulator model: ___________
  - [ ] UDID: ___________

### Android SDK / Android Studio

- [ ] Install Android Studio if not present: https://developer.android.com/studio
- [ ] Verify Android SDK: Settings → Languages & Frameworks → Android SDK
- [ ] Confirm API 35 installed: `cat $ANDROID_SDK_ROOT/system-images/android-35/google_apis/arm64-v8a/build.prop`
- [ ] If missing API 35: SDK Manager → Platforms → Download "Android 15 (API 35)"
- [ ] Verify emulator: `emulator -list-avds` (should show at least 1 AVD)
- [ ] **Logged:**
  - [ ] Android Studio version: ___________
  - [ ] Android SDK API level: ___________
  - [ ] Emulator AVD name: ___________

### TypeScript & Build Tools

- [ ] Confirm Node.js version: `node --version` (expect ≥18)
- [ ] Confirm npm/pnpm: `npm --version`
- [ ] Verify Capacitor: `npm list @capacitor/core` (expect ≥5.x)
- [ ] Test full build: `npm run build` (confirm no errors)
- [ ] **Logged:** Build status: ✅ green

---

## 4. Git Worktree Isolation Setup

**Objective:** Create hermetic Phase 2 development environment isolated from main.

### Create Isolation Script

- [ ] Create file: `/scripts/setup-phase2-worktree.sh`
- [ ] Content (bash script):
  ```bash
  #!/bin/bash
  # Phase 2 Secure Enclave + StrongBox development — isolated worktree
  # Usage: ./setup-phase2-worktree.sh
  
  set -e
  
  BRANCH="feat/phase-2-hardware-kek-native"
  WORKTREE_PATH="/tmp/veyrnox-phase-2"
  
  echo "Setting up Phase 2 isolated worktree..."
  echo "Branch: $BRANCH"
  echo "Path: $WORKTREE_PATH"
  
  # Ensure origin is fetched
  git fetch origin
  
  # Create worktree (or reuse if exists)
  if [ -d "$WORKTREE_PATH" ]; then
    echo "Worktree already exists; skipping creation."
  else
    git worktree add "$WORKTREE_PATH" "origin/$BRANCH"
    echo "Worktree created."
  fi
  
  cd "$WORKTREE_PATH"
  
  # Install dependencies
  npm ci
  
  # Build iOS + Android
  echo "Building iOS and Android..."
  npm run build:ios 2>&1 || echo "iOS build skipped (requires Xcode + Mac)"
  npm run build:android 2>&1 || echo "Android build skipped (requires Android Studio)"
  
  echo ""
  echo "Phase 2 worktree ready at $WORKTREE_PATH"
  echo "To continue: cd $WORKTREE_PATH && npm run dev"
  ```
- [ ] Make executable: `chmod +x /scripts/setup-phase2-worktree.sh`
- [ ] Test script: `bash /scripts/setup-phase2-worktree.sh`
- [ ] Expected output: Worktree created, dependencies installed, build status logged
- [ ] **Logged:**
  - [ ] Script path: /scripts/setup-phase2-worktree.sh
  - [ ] Worktree path: /tmp/veyrnox-phase-2
  - [ ] Status: ✅ Created and tested

### Document in CLAUDE.md

- [ ] Locate: `/CLAUDE.md` section "Working pattern"
- [ ] Add subsection:
  ```markdown
  ### Phase 2 Isolation (Concurrent Session Safety)
  
  All Phase 2 work (native plugins, real-device verification) runs in a separate
  git worktree to prevent concurrent commit conflicts and maintain hermetic test
  isolation per session.
  
  Setup: `bash ./scripts/setup-phase2-worktree.sh`
  
  This creates `/tmp/veyrnox-phase-2` with:
  - Branch: `feat/phase-2-hardware-kek-native`
  - Fresh node_modules (no cross-pollination with main session)
  - Independent build artifacts (iOS/Android separate from main)
  - Safe to run in parallel with Phase 1 UAT
  ```
- [ ] **Logged:** CLAUDE.md updated: ✅

---

## 5. GitHub Project Board Setup

**Objective:** Create and populate GitHub Project for Phase 2 week-by-week planning.

### Create Project

- [ ] Navigate to: https://github.com/VEYRNOX/veyrnox/projects
- [ ] Click "New Project"
- [ ] Title: "Veyrnox Phase 2 Hardware KEK (Weeks 1–8)"
- [ ] Template: Blank
- [ ] Description:
  ```
  Native Hardware KEK phase: iOS Secure Enclave + Android StrongBox binding.
  
  Weeks 1–4: Device setup + biometric enrollment + testnet sends
  Weeks 5–8: Integration + audit refresh + findings resolution
  
  Verification gate: Real-device sends on Sepolia (iPhone + Pixel)
  ```
- [ ] **Logged:** Project URL: ___________

### Add Columns

- [ ] Column 1: Backlog
- [ ] Column 2: Week 1 (Device setup)
- [ ] Column 3: Week 2 (Biometric enrollment)
- [ ] Column 4: Week 3 (iOS Face ID + Android Fingerprint)
- [ ] Column 5: Week 4 (iOS testnet send)
- [ ] Column 6: Week 5 (Android testnet send + integration)
- [ ] Column 7: Week 6 (Feature flag + backward-compat)
- [ ] Column 8: Week 7 (Audit submission prep)
- [ ] Column 9: Week 8 (Findings resolution)

### Import Issues

- [ ] Open: `/docs/PHASE-2-KICKOFF-PLAN.md`
- [ ] Copy each week's task list (§Week-by-week roadmap)
- [ ] Create GitHub Issues (one per task)
- [ ] Add to Backlog column
- [ ] Assign initial milestone: "Phase 2" or "Q3 2026"
- [ ] Link issues to the project
- [ ] **Logged:**
  - [ ] Total issues created: ___________
  - [ ] Project link: ___________

---

## 6. Audit Planning (Informational)

**Objective:** Prepare audit scope document for Phase 2 findings.

### Audit Scope Refresh

- [ ] Create: `/docs/phase2-audit-scope.md`
- [ ] Sections:
  - [ ] Hardware binding (iOS SE HMAC, Android StrongBox HMAC)
  - [ ] Biometric ACL (kSecAttrAccessControl on iOS, setUserAuthenticationRequired on Android)
  - [ ] Key material zeroing (post-use cleanup in native code)
  - [ ] OS-level enforcement verification (adversarial test: OS refuses decrypt without biometric)
  - [ ] Backward-compat (password fallback still works after ACL invalidation)
  - [ ] Device-gating (feature disabled on simulator/emulator, enabled only on real SE/StrongBox)

### Pre-Audit Readiness Checklist

- [ ] Native plugin code (Swift + Kotlin) ready for review
- [ ] Real-device verification complete (at least 1 iPhone + 1 Pixel)
- [ ] Test on-chain txids captured (Sepolia sends from real devices)
- [ ] Feature flag gating in place (HARDWARE_KEK_NATIVE_ENABLED gates native code)
- [ ] Password fallback verified (vault still recoverable via password after ACL changes)

---

## Success Criteria

**Phase 2 Infrastructure Ready IF:**
- [ ] iPhone 12+ ordered (receipt captured, expected delivery ≤2 days)
- [ ] Pixel 3+ ordered (receipt captured, expected delivery ≤2 days)
- [ ] Testnet funds approved (10 ETH + 1 BTC + 100 SOL allocated or confirmed via faucet)
- [ ] Xcode 15.3+ installed and verified
- [ ] Android Studio installed with API 35 simulator
- [ ] Phase 2 worktree isolation script created and tested
- [ ] GitHub project board created with Week 1–8 columns + 20+ issues imported
- [ ] `/CLAUDE.md` updated with Phase 2 isolation workflow
- [ ] `/docs/phase2-audit-scope.md` drafted (for future audit submission)

---

## Timeline

| Task | Duration | Assignee | Status |
|------|----------|----------|--------|
| Device ordering | 15 min | Owner/Ops | ⏳ |
| Testnet fund request | 15 min | Owner/DevOps | ⏳ |
| Build tool verification | 15 min | Dev | ⏳ |
| Worktree script | 15 min | Dev | ⏳ |
| GitHub project setup | 15 min | DevOps/Owner | ⏳ |
| **Total** | **75 min** | **Parallel** | ⏳ |

---

## Rollback Plan (If Phase 2 is delayed)

- Phase 1 ships independently (no dependency on Phase 2 hardware)
- Phase 2 devices can arrive later; week 1 kick-off delayed until devices in hand
- GitHub project remains open; team can begin planning work offline
- Native code can be stubbed + feature-flagged OFF until devices arrive

---

**Prepared by:** Claude Haiku Act Agent  
**Date:** 2026-07-01  
**Status:** Ready for execution in parallel with Phase 1 UAT
