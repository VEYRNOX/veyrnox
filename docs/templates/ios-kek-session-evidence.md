# iOS KEK Device Session — Evidence Record

**Date:** 2026-07-__
**Device:** iPhone 17 Pro Max (iOS __.__)
**Build:** `main` commit `________` (debug, Xcode __.__)
**Operator:** ________

---

## P1 — iOS-F9: SE-unlock trace + correlated Sepolia send

### Unlock trace (copy [VEYRNOX-KEK] lines from veyrnox-kek.log)
```
[timestamp] [VEYRNOX-KEK] getHardwareFactor: loaded ciphertext ___ bytes, retrieving SE key…
[timestamp] [VEYRNOX-KEK] getHardwareFactor: SE key retrieved, decrypting (Face ID prompt now)…
[timestamp] [VEYRNOX-KEK] getHardwareFactor: SUCCESS — Face ID passed, H recovered (32 bytes)
```

### Daemon correlation (coreauthd/biometrickitd lines between "retrieving" and "SUCCESS")
```
[paste relevant daemon lines here — timestamps must interleave with the above]
```

### KEK-gated Sepolia send
- **txid:** `0x________`
- **Block:** ________
- **Explorer:** https://sepolia.etherscan.io/tx/0x________
- **Time correlation:** unlock trace at __:__:__, send confirmed at __:__:__

### Cold-restart repeat
- [ ] Unlocked after cold restart — same trace pattern confirmed
- Timestamp: __:__:__

### Negative check (Face ID cancel)
- [ ] DECRYPT FAILED line observed
- [ ] No unlock, no fallback
- Timestamp: __:__:__

**P1 result:** PASS / FAIL

---

## P2 — iOS-F5: NSMutableData heap zeroing (device)

- [ ] Build clean of F5 — `HardwareKekPlugin.o` compiled (already CI-verified PR #705)
- [ ] Enroll/unlock/unenroll cycle works end-to-end on new build
- [ ] Source sign-off: `resetBytesInRange` present on all paths in the compiled binary's source
- [ ] Honest scope recorded: base64 bridge residue is architecturally unzeroable (LOW–MEDIUM)

**P2 result:** PASS / FAIL

---

## P3 — iOS-F3: LAContext (device runtime)

- [ ] Build clean — zero `kSecUseOperationPrompt` deprecation warnings (already CI-verified PR #705)
- [ ] Face ID prompt renders on unlock — observable biometric prompt
- [ ] Two back-to-back unlocks both prompt (no grace-period reuse — `reuseDuration=0`)
- [ ] No runtime deprecation warning in device console

**P3 result:** PASS / FAIL

---

## P4 — H-2/iOS-F11: Biometric re-enrollment invalidation

**Phase 0 gate:**
- [ ] Face ID enrollment restriction lifted (Settings → Screen Time → Content & Privacy)
- Method used: Screen Time lift / unrestricted device / other: ________

### Test
- [ ] Baseline: KEK vault unlocks with Face ID + PIN
- [ ] Face ID re-enrollment performed (method: Set Up Alternate Appearance / Reset + re-enroll)
- [ ] Unlock attempt FAILED CLOSED — SE key invalidated
  - Error observed: ________
  - [ ] No unlock, no silent bare fallback
- [ ] Recovery: seed phrase restore → fresh KEK enrollment → unlock works
- [ ] Face ID state restored

**P4 result:** PASS / FAIL

---

## Overall

| Item | Result | Status language |
|---|---|---|
| P1 (F9) | PASS / FAIL | iOS-F9 CLOSED (prospective, INTERNAL) |
| P2 (F5) | PASS / FAIL | iOS-F5 device-verified (INTERNAL, PARTIAL heap zeroing) |
| P3 (F3) | PASS / FAIL | iOS-F3 device-verified (INTERNAL) |
| P4 (H-2) | PASS / FAIL | H-2/iOS-F11 iOS RESOLVED / device-verified (INTERNAL) |

**iOS headline:** device-verified PARTIAL → device-verified (full) ONLY if P1 AND P4 both PASS.

**Evidence artifacts:**
- [ ] `veyrnox-kek.log` (app traces)
- [ ] `daemons.log` (coreauthd/biometrickitd)
- [ ] Sepolia txid confirmed on explorer
- [ ] Xcode build settings screenshot (P3 warning check)
- [ ] This file filled in and committed

**Honesty:** Everything INTERNAL. Independent audit unaffected. The two historical iOS sends remain META/non-promoting evidence.
