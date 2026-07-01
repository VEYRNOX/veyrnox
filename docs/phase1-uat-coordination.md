# Phase 1 UAT Execution — Coordination Log

**Date Started:** 2026-07-01  
**Option:** Option C (Phase 1 UAT + Phase 2 prep in parallel)

---

## Executive Summary

Phase 1 (Web WebAuthn PRF Hardware KEK) is code-complete and test-green (1973/1973). The hard gate for VERIFIED status is 3 real Sepolia testnet send txids:
1. Chrome ≥99 (full WebAuthn PRF)
2. Firefox ≥108 (full WebAuthn PRF)
3. Safari (password-only fallback)

Phase 2 infrastructure prep runs in parallel; does not block Phase 1 ship.

---

## Pre-UAT Checklist

- [x] Code complete: `src/wallet-core/keystore/web.js` + `kek.js` (200+ LOC)
- [x] Tests pass: 1973/1973 (running at 2026-07-01 07:43 AM)
- [x] Security invariants designed to satisfy I1–I6 (documented in web.js + kek.js; NOT on-chain/device verified)
- [x] Feature detection wired: `isPrfSupported()` distinguishes Chrome/Firefox (✅ PRF) from Safari (❌ fallback)
- [x] Password minimum enforced: `validateWebVaultPassword()` ≥12 chars on mainnet
- [x] Zeroing controls: H, C, DEK all zeroed in `try/finally` (web.js unlock)

**Pre-flight Result:** ✅ READY TO UAT

---

## Track 1: Phase 1 Browser UAT (Sequential, ~60 min)

### Chrome Sepolia Send (15–20 min)

**Browser & Network:**
- [ ] Browser: Google Chrome (latest, ≥99)
- [ ] URL: http://localhost:5173
- [ ] Network: Sepolia testnet (check RPC in Settings)
- [ ] Dev server status: Running (confirm via `npm run dev` in separate terminal)

**Wallet Creation & Setup:**
- [ ] Click "Create New Wallet" on homepage
- [ ] Generate seed → note recovery phrase (testnet-safe screenshot)
- [ ] Vault password: TestVault1234!@# (≥12 chars, memorable)
- [ ] Confirm password
- [ ] Vault created → toast "Vault created"

**Unlock & Balance:**
- [ ] Reload page → Unlock screen appears
- [ ] Enter password "TestVault1234!@#" → unlock successful
- [ ] Navigate to Assets / Dashboard → confirm balances load (0.0 ETH initially)

**Claim Sepolia ETH:**
- [ ] Open https://sepoliafaucet.com (or Alchemy Sepolia faucet)
- [ ] Paste wallet address (from Settings → My Wallets or Dashboard)
- [ ] Claim 0.5 ETH → wait 1–2 min for confirmation
- [ ] Dashboard refreshes: 0.5 ETH now visible

**Send Transaction:**
- [ ] Click Send → Asset: Ethereum
- [ ] Amount: 0.001 ETH
- [ ] Recipient: `0xd8dA6BF26964aF9D7eEd9e03E53415D37AA96045` (test burn; or your secondary wallet)
- [ ] Click "Verify & Sign"
- [ ] **Hardware Factor Prompt (KEY OBSERVATION):**
  - [ ] Browser shows WebAuthn/platform authenticator prompt
  - [ ] Chrome may auto-trigger Touch ID or security key dialog
  - [ ] Complete the gesture (Touch ID, Windows Hello, security key, etc.)
  - [ ] Prompt closes → transaction ready
- [ ] Click "Confirm & Send" → "Transaction submitted" message
- [ ] Copy **TXID from the UI** (should appear in transaction details or history)

**Verify On-Chain:**
- [ ] Open https://sepolia.etherscan.io
- [ ] Paste TXID in search box
- [ ] Confirm: Status = **SUCCESS**, From = your wallet, To = recipient, Value = 0.001 ETH
- [ ] Document: `CHROME_TXID = 0x________________`

**Result:** ✅ Chrome PRF + Send verified

---

### Firefox Sepolia Send (15–20 min)

**Browser & Network:**
- [ ] Browser: Mozilla Firefox (latest, ≥108)
- [ ] URL: http://localhost:5173 (may need to reload to clear Chrome cache)
- [ ] Network: Sepolia testnet

**Wallet Creation (Fresh for Firefox):**
- [ ] Click "Create New Wallet" → Generate seed
- [ ] Vault password: TestFirefox1234! (different from Chrome; ≥12 chars)
- [ ] Vault created

**Claim Sepolia ETH & Send:**
- [ ] Unlock → Claim 0.5 ETH
- [ ] Send 0.001 ETH to the same recipient
- [ ] **Hardware Factor Prompt:**
  - [ ] Firefox WebAuthn dialog appears
  - [ ] Complete platform authenticator gesture
- [ ] "Transaction submitted" → copy TXID

**Verify On-Chain:**
- [ ] https://sepolia.etherscan.io → search TXID
- [ ] Confirm SUCCESS status
- [ ] Document: `FIREFOX_TXID = 0x________________`

**Result:** ✅ Firefox PRF + Send verified

---

### Safari Sepolia Send (15–20 min)

**Browser & Network:**
- [ ] Browser: Apple Safari (latest)
- [ ] URL: http://localhost:5173 (fresh session)
- [ ] Network: Sepolia testnet

**Wallet Creation (Fresh for Safari):**
- [ ] Click "Create New Wallet" → Generate seed
- [ ] Vault password: TestSafari1234!@ (≥12 chars)
- [ ] Vault created

**Unlock & Claim:**
- [ ] Unlock → Claim 0.5 ETH (faucet wait)

**Send Transaction (Password-Only):**
- [ ] Send 0.001 ETH to the same recipient
- [ ] **Key Observation (No PRF):**
  - [ ] NO WebAuthn/platform authenticator prompt appears
  - [ ] Transaction proceeds to Confirm & Send directly
  - [ ] This is the **expected Safari fallback** (password-only)
- [ ] "Transaction submitted" → copy TXID

**Verify On-Chain:**
- [ ] https://sepolia.etherscan.io → search TXID
- [ ] Confirm SUCCESS status
- [ ] Document: `SAFARI_TXID = 0x________________`

**Result:** ✅ Safari password-only fallback + Send verified

---

## Track 2: Phase 2 Infrastructure Prep (Parallel, 1–2 hours)

### Subtask 2a: Device Ordering

- [ ] Contact vendor (Apple Refurbished, Best Buy, Amazon)
- [ ] Order: iPhone 12+ with Face ID, Pixel 3+ with fingerprint
- [ ] Expedited shipping (target: delivery 2026-07-02 or 2026-07-03)
- [ ] Capture receipt emails
- [ ] **Logged:** Device order date, expected arrival, order #

### Subtask 2b: Testnet Fund Drip Setup

- [ ] Contact #devops or #base44-ops channel
- [ ] Request: 10 ETH Sepolia, 1 BTC testnet, 100 SOL devnet (8-week allocation)
- [ ] Fallback: Use public faucets (Alchemy, Bitcoin Core testnet, Solana devnet CLI)
- [ ] **Logged:** Drip approval date, allocation amounts, wallet addresses

### Subtask 2c: Build Environment Verification

- [ ] `xcode-select --version` → Xcode 15.3+
- [ ] `xcrun simctl list devices | grep "iPhone 15"` → at least 1 simulator available
- [ ] `cat $ANDROID_SDK_ROOT/system-images/android-35/google_apis/arm64-v8a/build.prop` → API 35+
- [ ] **Logged:** Xcode version, simulator availability, Android SDK API level

### Subtask 2d: Git Worktree Isolation

- [ ] Create `/scripts/setup-phase2-worktree.sh` (hermetic Phase 2 isolation)
- [ ] Test: `bash ./scripts/setup-phase2-worktree.sh` → confirm worktree created at `/tmp/veyrnox-phase-2`
- [ ] **Logged:** Worktree path, branch, status

### Subtask 2e: GitHub Project Board

- [ ] Create GitHub Project: "Veyrnox Phase 2 Hardware KEK"
- [ ] Create columns: Backlog, Week 1–8 progress
- [ ] Import issues from `/docs/PHASE-2-KICKOFF-PLAN.md`
- [ ] Link to main repo
- [ ] **Logged:** Project URL, column count, issue count

---

## Documentation Updates (Post-UAT)

### After All 3 TXIDs Captured

1. **Update `/docs/PHASE-1-COMPLETION-SUMMARY.md`:**
   - Section 2 (Browser UAT Results)
   - Replace placeholder txids with real values
   - Update status to: "✅ BUILT-VERIFIED (2026-07-01)"

2. **Update `/docs/Feature-Status.md`:**
   - Section 4 (Hardware KEK Phase 1)
   - Change: "🟢 VERIFIED" + date + 3 txids listed
   - No code changes; documentation only

3. **Create commit:**
   ```
   Phase 1 sign-off: WebAuthn PRF browser UAT complete (3 Sepolia txids)
   - Chrome ≥99 Sepolia send: 0x____
   - Firefox ≥108 Sepolia send: 0x____
   - Safari password-only fallback: 0x____
   ```

4. **Create PR (if needed):**
   - Title: "Phase 1 UAT complete — 3 Sepolia testnet sends verified"
   - Merge to main
   - Tag: `v1.0.0-phase-1-verified`

---

## Risk Mitigation

### If Chrome/Firefox fails to show WebAuthn prompt:
- Check browser version (must be ≥99 / ≥108)
- Check browser WebAuthn settings (DevTools → Security & Privacy)
- Confirm platform authenticator is available (Touch ID, Windows Hello, security key)
- If unavailable: use password-only fallback (not a code gap, browser limitation)

### If Safari fails:
- Expected: NO WebAuthn prompt (Safari limitation, not bug)
- If password unlock fails: check password length (must be ≥12 chars)
- If txid doesn't appear: check Sepolia faucet + RPC availability

### If any send doesn't appear on-chain:
- Wait 2–3 min (network confirmation lag)
- Check RPC status (Settings → Network)
- Verify recipient address (correct Sepolia address format)
- Check transaction status on etherscan.io for any errors

---

## Success Criteria (Gate)

**Phase 1 Verified IF:**
- [ ] Chrome TXID appears on sepolia.etherscan.io with status SUCCESS
- [ ] Firefox TXID appears on sepolia.etherscan.io with status SUCCESS
- [ ] Safari TXID appears on sepolia.etherscan.io with status SUCCESS
- [ ] All 3 txids documented in PHASE-1-COMPLETION-SUMMARY.md
- [ ] Feature-Status.md §4 updated with verified date + txids
- [ ] PR created, reviewed, merged to main
- [ ] Tag `v1.0.0-phase-1-verified` created

**Phase 2 Ready IF:**
- [ ] Devices ordered (receipts captured)
- [ ] Testnet funds approved or confirmed
- [ ] Build tools checked (Xcode 15.3+, Android API 35+)
- [ ] Git worktree script created + tested
- [ ] GitHub project board created + populated

---

## Timeline (Wall-Clock)

| Task | Duration | Start | End | Status |
|------|----------|-------|-----|--------|
| Chrome UAT | 20 min | Now | +20 | ⏳ |
| Firefox UAT | 20 min | +20 | +40 | ⏳ |
| Safari UAT | 20 min | +40 | +60 | ⏳ |
| Docs Update | 10 min | +60 | +70 | ⏳ |
| Phase 1 Total | 70 min | Now | +70 | ⏳ |
| Phase 2 Prep (parallel) | 60 min | Now | +60 | ⏳ |
| **Overall** | **70 min** | Now | +70 | ⏳ |

---

## Execution Notes

- Start Phase 1 UAT now (Chrome first)
- Phase 2 prep can run in parallel in separate terminal/window
- **DO NOT commit until all 3 txids are verified on-chain**
- Safari txid must show password-only path (no PRF prompt) to confirm graceful fallback
- After merge: post to #releases channel with link to feature

---

**Prepared by:** Claude Haiku Act Agent  
**Date:** 2026-07-01 07:45 AM  
**Next Step:** Start Chrome UAT
