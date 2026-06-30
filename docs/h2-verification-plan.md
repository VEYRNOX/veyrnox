# H2 Verification Plan — Decoy PIN-Only (Option B)

**Owner Decision:** Option B (Decoy WITHOUT second factor)  
**Decided:** 2026-06-30 (revised)  
**Scope:** Verify existing code + document decision  
**Estimate:** 30 minutes  
**Status:** No implementation needed (storage groundwork intentionally unused)  

---

## Decision Rationale

Decoy wallet carries **PIN only** by deliberate design:

- **Frictionless under coercion:** single PIN makes decoy usable when threatened
- **Honest threat model:** a coercer with your PIN already has access to the decoy; second factor doesn't prevent that
- **Core value is deniability:** decoy's protection is "is this real or decoy?", not "unbreakable with two factors"
- **UX simplicity:** no extra prompts, faster send flow

---

## What's Already Done

✅ Storage groundwork (fixed-length container, chaff-length parity) — intentionally NOT used for H2  
✅ Existing code (DuressPin, StealthWallets) — should already be PIN-only (no 2FA prompts)  
✅ twoFactorGate.js — should already skip 2FA for decoy/hidden sessions  

---

## Verification Checklist (30 min, next session)

### 1. Confirm DuressPin.jsx (5 min)
```
File: src/components/security/DuressPin.jsx
Check: After PIN entry, NO "Add Action Password?" prompt appears
Expected: User completes setup with just PIN
Status: Should already be correct (no 2FA UI ever added for decoy)
```

### 2. Confirm StealthWallets.jsx (5 min)
```
File: src/components/security/StealthWallets.jsx
Check: After PIN entry, NO "Add Action Password?" prompt appears
Expected: User completes setup with just PIN
Status: Should already be correct (no 2FA UI ever added for hidden)
```

### 3. Confirm twoFactorGate.js (10 min)
```
File: src/lib/twoFactorGate.js
Check: When decoy/hidden session is active (isDecoy || isHidden),
       2FA gate is SKIPPED (no PIN + password prompts)
Expected: Only primary wallet prompts for 2FA
Current behavior: twoFactorGate.js checks actionPasswordConfigured on
                  PRIMARY set only; decoy/hidden should fall through
Status: Likely already correct, but add a clarifying comment
```

### 4. Add Documentation Comments (10 min)
```
In twoFactorGate.js, add a comment block at the top explaining:
  "H2 Design Decision (2026-06-30, Option B): Decoy and hidden wallets
   carry PIN only by design (no Action Password 2FA parity). Rationale:
   frictionless under coercion. A coercer with PIN already has access;
   second factor adds friction without preventing access."

In DuressPin.jsx, add a comment:
  "Decoy wallet uses PIN only (no Action Password 2FA). See
   docs/h2-verification-plan.md for design rationale."

In StealthWallets.jsx, same comment.
```

---

## Test Scenarios (Write these in vitest, TDD-style)

**File:** `src/lib/__tests__/twoFactorGate.decoy-hidden-no2fa.test.js` (new)

```javascript
describe('H2 — Decoy/Hidden wallets carry PIN only (Option B)', () => {
  it('primary wallet WITH Action Password prompts for 2FA', () => {
    // existing behavior, regression test
  });

  it('decoy wallet (any PIN state) skips 2FA gate', () => {
    // even if container could hold Action Password, gate ignores it
  });

  it('hidden wallet (any PIN state) skips 2FA gate', () => {
    // same as decoy
  });

  it('DuressPin setup shows NO "Add Action Password?" prompt', () => {
    // component should render PIN-only flow
  });

  it('StealthWallets setup shows NO "Add Action Password?" prompt', () => {
    // component should render PIN-only flow
  });
});
```

---

## Post-Verification Checklist

- [ ] Code review: DuressPin, StealthWallets, twoFactorGate confirmed PIN-only
- [ ] Comments added to all three files explaining H2 Option B rationale
- [ ] Tests written + passing (5 scenarios above)
- [ ] Feature-Status.md reflects "HONEST-DISABLED BY DESIGN" status
- [ ] `npm test` passes (all 1933+ tests)
- [ ] Commit message references owner decision + verification date

---

## Summary

**What you're verifying, not building:**
- Existing code already matches the H2 design (PIN-only for decoy/hidden)
- Documentation is clear about why (frictionless under coercion)
- Tests confirm the behavior

**Storage groundwork (chaff-length, fixed-length container):**
- Remains intact for potential future use
- Intentionally NOT activated for H2 in this decision
- If design changes later, the foundations are ready

---

## How to Start (Next Session)

```bash
git checkout chore/cut-social-recovery-inheritance

# Write failing tests first (TDD)
cat > src/lib/__tests__/twoFactorGate.decoy-hidden-no2fa.test.js << 'EOF'
// Copy test scenarios from section above
EOF

npm test -- src/lib/__tests__/twoFactorGate.decoy-hidden-no2fa.test.js
# Tests should pass immediately (code already correct)

# Add clarifying comments to the three files
# Commit the changes

git add -A && git commit -m "docs: H2 verification — Option B (decoy PIN-only by design)

Verify existing code matches H2 Option B design:
- DuressPin, StealthWallets: PIN-only setup (no 2FA prompt)
- twoFactorGate: skip 2FA for decoy/hidden sessions
- Tests: confirm behavior via 5 scenarios

Added comments explaining H2 rationale (frictionless under coercion).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

Done in 30 minutes. 🎯
