# Android KEK Residuals Session — Evidence Record

**Date:** 2026-07-__
**Device:** Pixel 10 Pro XL, Android 16 / API 36, `com.veyrnox.app.debug`
**APK-OLD commit:** `f611bd42^` (pre-PR#568, stamps v2 with fixed salt)
**APK-NEW commit:** `________` (current main)
**Operator:** ________

---

## T1 — v2→v3 upgrade via changePassword (device-exercised)

### Step 2 — APK-OLD enrollment
- [ ] `enroll: key stored — tier=STRONGBOX (securityLevel=2)` in logcat
- [ ] `salt-source: v1-fixed` at enroll-time (confirms the bug)
- Timestamp: __:__:__

### Step 3 — CDP read-back (v2 vault)
- `hardwareKekVersion`: __
- `saltLen`: __
- `kekSalt SHA-256 (SALT-A)`: `________`

### Step 5 — APK-NEW unlock (v2 path, no auto-migration)
- [ ] `salt-source: v1-fixed` in logcat (v2 unlock — no upgrade)
- [ ] Exactly 2 biometric prompts (not 3)
- [ ] CDP: still `hardwareKekVersion: 2`, salt unchanged = SALT-A
- Timestamp: __:__:__

### Step 6 — Consented upgrade (Settings → "Upgrade protection")
- [ ] "Upgrade protection" card visible in Settings → Security
- [ ] `salt-source: v1-fixed` → `salt-source: v2-bound` logcat sequence
- [ ] CDP: `hardwareKekVersion: 3`, salt SHA-256 **changed**
- `kekSalt SHA-256 (SALT-B)`: `________`
- Timestamp: __:__:__

### Step 7 — Cold restart + unlock (v3 path)
- [ ] Exactly 2 biometric prompts
- [ ] `salt-source: v2-bound` only in logcat
- [ ] CDP: still v3, salt SHA-256 = SALT-B
- Timestamp: __:__:__

**T1 result:** PASS / FAIL

---

## T2 — Salt-tamper negative test (fail-closed)

### 2a — Plugin-level probes (CDP)
```js
await HK.getHardwareFactor({ kekSalt: '' });        // expect reject
await HK.getHardwareFactor({ kekSalt: '!!notb64' }); // expect reject
await HK.getHardwareFactor({ kekSalt: 12345 });      // expect reject
```
- [ ] All 3 rejected — no `salt-source: v1-fixed` fallback in logcat
- Timestamp: __:__:__

### 2b — Wrong-salt vault swap
- [ ] CDP: replaced `kekSalt` with a different valid 44-char base64 value
- [ ] Unlock with correct PIN + biometric FAILED (`KEK_ERR.UNWRAP_FAILED`)
- [ ] Logcat: `salt-source: v2-bound` (plugin USED the tampered salt)
- [ ] Restored original blob → unlock succeeds
- Timestamp: __:__:__

### 2c — Malformed-salt vault (empty string)
- [ ] Set `kekSalt` to `""` via CDP
- [ ] Unlock attempt → `MALFORMED_VAULT` error BEFORE biometric prompt
- [ ] No `salt-source` logcat line at all
- [ ] Restored original blob → unlock succeeds
- Timestamp: __:__:__

**T2 result:** PASS / FAIL

---

## T3 — Per-enrollment salt distinctness

- SALT-B (from T1): `________`
- [ ] Unenroll → re-enroll → CDP read-back
  - `kekSalt SHA-256 (SALT-C)`: `________`
  - [ ] Logcat: `salt-source: v2-bound` on enroll
- [ ] Unenroll → re-enroll → CDP read-back
  - `kekSalt SHA-256 (SALT-D)`: `________`
- [ ] All 4 salts pairwise distinct: SALT-A ≠ SALT-B ≠ SALT-C ≠ SALT-D
- [ ] Final vault unlocks clean (cold restart, 2 prompts, `v2-bound`)
- Timestamp: __:__:__

**T3 result:** PASS / FAIL

---

## LOG-1 — Device spot-check (PR #572 redaction)

Sweep `full-session.log` for:
- [ ] Zero JSON `"h"` fields carrying a 44-char base64 value
- [ ] Zero `Capacitor/Console` lines with a long base64 run (vault blob)
- Match count: __ (must be 0)

**LOG-1 result:** PASS / FAIL

---

## Optional Bonus (not a gate)

- [ ] KEK-gated Sepolia send from the final T3 vault
- txid: `0x________`
- Explorer: https://sepolia.etherscan.io/tx/0x________

---

## Overall

| Item | Result | Status language |
|---|---|---|
| T1 (v2→v3) | PASS / FAIL | v2→v3 upgrade device-exercised (INTERNAL) via changePassword path |
| T2 (salt-tamper) | PASS / FAIL | Salt-tamper negative test device-exercised (INTERNAL) |
| T3 (salt distinctness) | PASS / FAIL | Per-enrollment salt distinctness device-proven (4 salts, INTERNAL) |
| LOG-1 | PASS / FAIL | LOG-1 remediation device-verified (debug build, INTERNAL) |

**Evidence artifacts:**
- [ ] `full-session.log` (redacted per LOG-1 rules — counts only, never paste matched lines)
- [ ] Tagged logcat excerpts (HardwareKek:V)
- [ ] Salt SHA-256 table (SALT-A through SALT-D)
- [ ] CDP read-back JSON (version + saltLen + digest only)
- [ ] This file filled in and committed

**Honesty:** Everything INTERNAL. Independent audit unaffected. No catalogue status promotions. "Device-exercised" replaces "unit-tested only".
