# H2 Implementation Plan — Decoy 2FA Parity (Option A)

**Owner Decision:** Option A (Decoy WITH second factor)  
**Decided:** 2026-06-30  
**Scope:** UI + enforcement wiring + tests  
**Estimate:** 2–3 hours  
**Prerequisite:** All H2 storage groundwork is landed (chaff-length parity, fixed-length container)  

---

## What's Already Done

✅ Storage shape (fixed-length multi-vault container)  
✅ Chaff-length parity (`makeChaff` sizing)  
✅ Action Password record schema (`actionPasswordRecord` in container)  
✅ Per-set storage APIs (`setDuressVault`, `stealth.setHiddenActionPasswordRecord`)  
✅ Decoding/verification in `twoFactorGate.js` (primary-set logic exists)  

---

## Three Things to Build (in order)

### 1. UI: Decoy Setup Collects Action Password (60 min)

**File:** `src/components/security/DuressPin.jsx`

**Current behavior:**
- User sets a PIN for the decoy
- Decoy is stored (PIN only)

**New behavior:**
- After PIN setup, prompt: "Decoy security — would you like to add an Action Password for extra protection?"
- If yes: show password input field (same UX as primary-set Action Password in Settings)
- Generate `actionPasswordRecord` and pass to `setDuressVault`

**Implementation:**
- Mirror the logic from `src/components/security/TwoFactorSettings.jsx` (where primary Action Password is collected)
- Use the same password validation (≥12 chars)
- Call `setDuressVault({ ..., actionPasswordRecord: newRecord })` with the password

**Test needed:**
- Duress PIN setup renders "Add Action Password?" prompt
- If selected, password input appears
- Empty password is rejected (≥12 chars enforced)
- Valid password generates record

---

### 2. UI: Hidden Wallet Setup Collects Action Password (60 min)

**File:** `src/components/security/StealthWallets.jsx`

**Current behavior:**
- User creates a hidden wallet (just PIN, no second factor UI)

**New behavior:**
- After PIN setup, same prompt: "Hidden wallet security — add an Action Password?"
- Same UX as decoy setup
- Call `stealth.setHiddenActionPasswordRecord(walletId, actionPasswordRecord)`

**Implementation:**
- Same pattern as DuressPin.jsx
- Mirror from `TwoFactorSettings.jsx` validation

**Test needed:**
- Hidden wallet setup prompts for optional Action Password
- Password validation works (≥12 chars)
- Record is stored correctly

---

### 3. Enforcement: Verify Action Password in `twoFactorGate.js` (45 min)

**File:** `src/lib/twoFactorGate.js`

**Current behavior:**
- `twoFactorGate()` is called before send/reveal-seed/etc.
- It checks `actionPasswordConfigured` on the PRIMARY set only
- If yes, prompts for PIN + Action Password
- If no, gate is skipped (only PIN required)

**New behavior:**
- When a decoy/hidden session is active (`isDecoy` or `isHidden` flag from WalletProvider)
- Fetch the per-set Action Password record from the unlocked container
- If the record exists: prompt PIN + Action Password
- If no record: gate skipped (only PIN required)

**Implementation:**
- Add a helper: `async function getActionPasswordRecord(session)` that reads from the unlocked container
  - If session is decoy: read from `vault.duressSlot.container.actionPasswordRecord`
  - If session is hidden: read from `vault.hiddenSlots[hiddenId].container.actionPasswordRecord`
  - If session is primary: use existing logic
- In `runGate()`, before prompting, call `getActionPasswordRecord()` and check if one exists
- If yes: render the Action Password prompt (same as primary)
- If no: skip (only PIN required)

**Test needed:**
- Decoy session WITH Action Password prompts for both PIN + password
- Decoy session WITHOUT Action Password prompts for PIN only
- Hidden session WITH Action Password prompts for both PIN + password
- Hidden session WITHOUT Action Password prompts for PIN only
- Primary session behaves unchanged

---

## Testing Strategy (TDD: fail first, then implement)

**File:** `src/lib/__tests__/twoFactorGate.decoy-hidden-2fa.test.js` (new)

**Scenarios to test:**

1. **Decoy with 2FA**
   - User unlocked decoy (PIN correct)
   - Action Password record exists in decoy container
   - Send action triggered → `twoFactorGate()` called
   - Gate prompts PIN + Action Password
   - Both entered correctly → gate passes

2. **Decoy without 2FA**
   - User unlocked decoy (PIN correct)
   - No Action Password record in decoy container
   - Send action triggered
   - Gate skips (PIN was already verified at unlock)

3. **Hidden with 2FA**
   - Same as decoy with 2FA, but for hidden wallet

4. **Hidden without 2FA**
   - Same as decoy without 2FA, but for hidden wallet

5. **Primary with 2FA (regression test)**
   - Behavior unchanged from before

6. **Edge cases**
   - Container is corrupted (no Action Password record key)
   - Session flag is wrong (isDecoy but trying to read primary)
   - Fail-closed on any read error

---

## Files to Edit

1. `src/components/security/DuressPin.jsx` — Add Action Password collection UI
2. `src/components/security/StealthWallets.jsx` — Add Action Password collection UI
3. `src/lib/twoFactorGate.js` — Add decoy/hidden enforcement logic
4. `src/lib/__tests__/twoFactorGate.decoy-hidden-2fa.test.js` — New test file

---

## Files NOT to Edit

- `src/wallet-core/multiVault.js` — Storage schema already in place
- `src/components/security/TwoFactorSettings.jsx` — Primary-set logic (no change needed)
- `src/lib/duress.js` / `src/lib/stealth.js` — Storage APIs already there

---

## Rollback / Revert Plan

If issues arise during implementation:
- This is a per-feature-branch change (no backward compat concern)
- Revert to the last known good commit before implementation started
- The storage groundwork (chaff-length, container) stays (it's tested and solid)

---

## Post-Implementation Checklist

- [ ] All 4 test scenarios above pass
- [ ] No regression in primary-set 2FA (DuressPin + StealthWallets unchanged for users without setting Action Password)
- [ ] `npm test` passes (1933 + new tests)
- [ ] Feature-Status.md updated: H2 → BUILT
- [ ] Commit message references owner decision + implementation date

---

## How to Start

Next session:

```bash
git checkout chore/cut-social-recovery-inheritance
git pull origin chore/cut-social-recovery-inheritance

# Create a feature branch off this one
git checkout -b feat/h2-decoy-hidden-2fa

# Start with TDD: write failing tests first
cat > src/lib/__tests__/twoFactorGate.decoy-hidden-2fa.test.js << 'EOF'
// Copy from the "Testing Strategy" section above
EOF

npm test -- src/lib/__tests__/twoFactorGate.decoy-hidden-2fa.test.js
# Tests fail (red phase)

# Then implement the three pieces above (DuressPin, StealthWallets, twoFactorGate)
# Run tests again until all pass (green phase)

# Commit and merge back to chore/cut-social-recovery-inheritance
```

---

## Sanity Check

Before shipping:
- Create a test decoy/hidden wallet with Action Password
- Go through Send flow
- Confirm gate prompts PIN + Action Password
- Confirm send broadcasts correctly
- Confirm without Action Password, gate only prompts PIN
