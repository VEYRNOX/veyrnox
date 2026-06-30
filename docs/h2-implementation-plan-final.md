# H2 Implementation Plan — Duress PIN + Face ID Redirect

**Owner Decision:** CONFIRMED 2026-06-30  
**Design Locked:** User sets fake PIN. Both fake PIN and Face ID → Decoy. Correct PIN → Real wallet only.  
**Estimate:** 2-3 hours  
**TDD:** Write failing tests first, then implement  

---

## Design (Confirmed)

### Default (No Duress PIN)
```
Unlock methods:
  - PIN → Real wallet
  - Face ID → Real wallet
  
User chooses preferred method
```

### After Enabling Duress PIN
```
Real wallet: CORRECT PIN only
Decoy wallet: FAKE PIN or Face ID

Unlock flow:
  Enter PIN
    ├─ Correct PIN → Real wallet (funds safe)
    └─ Wrong PIN (fake/duress) → Decoy wallet ($0)
  
  Or Face ID → Decoy wallet ($0)

Under coercion:
  Option 1: Use Face ID → Shows decoy
  Option 2: Use fake PIN → Shows decoy
  (User keeps correct PIN secret)
```

---

## Three Files to Edit

### 1. DuressPin.jsx (60 min)

**Current:** User enters PIN for duress setup  
**Change:** Collect TWO pins + explain the redirect

```
Setup flow:
  1. "Set a fake PIN for your decoy wallet"
     └─ [Enter fake PIN] → [Confirm]
  
  2. Show explanation:
     "This fake PIN will unlock your Decoy wallet.
      Face ID will also unlock your Decoy wallet.
      Your REAL wallet requires your CORRECT PIN."
  
  3. Warning:
     ⚠️ "Once enabled, you can only access your real wallet
          with your CORRECT PIN. Face ID will unlock Decoy."
  
  4. Confirm toggle: [Enable Duress PIN]
     └─ Calls setDuressVault(fakePin, ...)
```

**Implementation:**
- Add input field for fake PIN (≥6 digits, different from real PIN)
- Validation: fake PIN ≠ real PIN
- Store fake PIN in duress vault
- Show trade-off clearly

---

### 2. WalletProvider.js — Unlock Logic (60 min)

**Current:** PIN/password unlock decrypts vault  
**Change:** Route based on which PIN matched

```javascript
// Pseudocode
async function unlockWallet(enteredPin) {
  
  // Try REAL PIN first
  try {
    const vault = await decryptVault(enteredPin, password)
    return {
      wallet: vault.realWallet,
      isDecoy: false,
      isDuressEnabled: vault.isDuressEnabled
    }
  } catch {
    // Real PIN failed
  }
  
  // If Duress is enabled, try FAKE PIN
  if (vault.isDuressEnabled) {
    try {
      const decoyVault = await decryptVault(fakePin, password)
      return {
        wallet: decoyVault.decoyWallet,
        isDecoy: true
      }
    } catch {
      // Duress PIN also failed
      // Increment wrong-attempt counter
      // 10 attempts → wipe vault
    }
  }
  
  throw new Error('PIN incorrect')
}

// Face ID route
async function unlockWithFaceID() {
  if (isDuressEnabled) {
    return unlockWallet(fakePin) // Face ID acts as fake PIN
  } else {
    return unlockWallet(realPin) // Face ID acts as real PIN
  }
}
```

**Key points:**
- Duress PIN attempts count toward wipe counter (10 wrong = wipe)
- Face ID uses fake PIN path if duress enabled
- Settings show current mode: "Duress: ON/OFF"

---

### 3. Tests (45 min)

**File:** `src/lib/__tests__/duressPin.test.js` (new)

**TDD Scenarios:**

```javascript
describe('H2 — Duress PIN + Face ID Redirect', () => {
  
  it('unlocks real wallet with correct PIN', () => {
    // Setup: duress disabled
    // Enter: correct PIN
    // Expect: real wallet opens
  })
  
  it('unlocks decoy with wrong PIN when duress disabled', () => {
    // Setup: duress disabled
    // Enter: any wrong PIN
    // Expect: error (not decoy)
  })
  
  it('unlocks real wallet with correct PIN when duress enabled', () => {
    // Setup: duress enabled, fake PIN = 999999
    // Enter: correct PIN (e.g., 111111)
    // Expect: real wallet opens
  })
  
  it('unlocks decoy with fake PIN when duress enabled', () => {
    // Setup: duress enabled, fake PIN = 999999
    // Enter: 999999 (fake PIN)
    // Expect: decoy wallet opens ($0)
  })
  
  it('Face ID unlocks real wallet when duress disabled', () => {
    // Setup: duress disabled
    // Trigger: Face ID
    // Expect: real wallet opens
  })
  
  it('Face ID unlocks decoy when duress enabled', () => {
    // Setup: duress enabled
    // Trigger: Face ID
    // Expect: decoy wallet opens
  })
  
  it('10 wrong PIN attempts wipes vault (duress or real)', () => {
    // Setup: duress enabled
    // Action: enter wrong PIN 10 times
    // Expect: vault wiped
  })
  
  it('rejects fake PIN = real PIN (validation)', () => {
    // During setup: try to set fake PIN = real PIN
    // Expect: error "Choose a different PIN"
  })
  
  it('shows correct wallet state in Settings', () => {
    // Setup: duress enabled
    // Check: Settings page
    // Expect: "Duress: ON | Face ID → Decoy"
  })
});
```

---

## Implementation Order (TDD)

**Step 1: Tests (Write failing first)**
```bash
npm test -- src/lib/__tests__/duressPin.test.js
# All tests fail (red phase)
```

**Step 2: DuressPin.jsx**
- Add fake PIN input
- Validation (≠ real PIN)
- Explanation UI
- Call setDuressVault()

**Step 3: WalletProvider**
- unlockWallet(): route by PIN
- unlockWithFaceID(): check duress state
- setDuressVault() API already exists (from storage groundwork)

**Step 4: Tests pass**
```bash
npm test -- src/lib/__tests__/duressPin.test.js
# All tests pass (green phase)
```

**Step 5: Full test suite**
```bash
npm test
# No regressions
```

**Step 6: Commit**
```
git commit -m "feat: H2 duress PIN + Face ID redirect

Implement confirmed H2 design:
- DuressPin.jsx: setup flow for fake PIN
- WalletProvider: route unlock based on PIN + Face ID
- Tests: 9 scenarios covering all paths
- Settings: show 'Duress: ON | Face ID → Decoy'

TDD: all tests passing, zero regressions.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

---

## Files to Edit

1. `src/components/security/DuressPin.jsx` — UI for fake PIN setup
2. `src/lib/WalletProvider.jsx` — Unlock routing logic
3. `src/lib/__tests__/duressPin.test.js` — New test file (9 scenarios)

---

## How to Start (Next Session)

```bash
git checkout chore/cut-social-recovery-inheritance

# Step 1: Write failing tests first
cat > src/lib/__tests__/duressPin.test.js << 'EOF'
[Copy test scenarios from section above]
EOF

npm test -- src/lib/__tests__/duressPin.test.js
# Tests fail (red phase)

# Step 2-3: Implement DuressPin + WalletProvider
# [Implement to make tests pass]

npm test -- src/lib/__tests__/duressPin.test.js
# Tests pass (green phase)

# Step 4: Full suite
npm test
# All 1933+ tests passing, zero regressions

# Step 5: Commit
git add -A && git commit -m "..."
```

---

## Sanity Check (Before Shipping)

1. ✅ Create duress wallet with fake PIN
2. ✅ Unlock with fake PIN → Decoy ($0)
3. ✅ Unlock with correct PIN → Real (funds safe)
4. ✅ Unlock with Face ID → Decoy (when duress enabled)
5. ✅ Settings show "Duress: ON | Face ID → Decoy"
6. ✅ 10 wrong PIN attempts → Vault wiped
7. ✅ Disable duress → Face ID goes back to real wallet

---

**H2 is now locked and ready to build. 🎯**
