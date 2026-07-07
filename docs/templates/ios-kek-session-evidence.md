# iOS KEK Device Session — Evidence Record

**Date:** 2026-07-07
**Device:** iPhone 17 Pro Max (iOS 26)
**Build:** `main` commit `f6e5fee73` (debug, Xcode 26.5)
**Operator:** Al Jobson

---

## P1 — iOS-F9: SE-unlock trace + correlated Sepolia send

### Unlock trace (captured via Console.app on Mac, filtered: subsystem "com.veyrnox")
```
21:13:56.796792+0100  App  [VEYRNOX-KEK] getHardwareFactor: loaded ciphertext 113 bytes, retrieving SE key…
21:13:56.809185+0100  App  [VEYRNOX-KEK] getHardwareFactor: SE key retrieved, decrypting (Face ID prompt now)…
21:13:59.567253+0100  App  [VEYRNOX-KEK] getHardwareFactor: SUCCESS — Face ID passed, H recovered (32 bytes)
```

### Daemon correlation
Not separately captured — Console.app was filtered to VEYRNOX-KEK only. The ~2.76s gap
between "decrypting (Face ID prompt now)" and "SUCCESS" is the Face ID biometric
evaluation time, consistent with prior coreauthd/biometrickitd evidence (2026-07-02
session). Daemon correlation was already established in `docs/verified-evidence.json`
`_ios_kek_se_operation_os_evidence` (txid `0x5116e7bc…`, block 11185985).

### KEK-gated Sepolia send
- **txid:** `0x8b8f70e71a776b75d30d8664d2065d40c893c1ad16eb5384dc6b75c6788ebe8d`
- **Block:** 11224674
- **Explorer:** https://sepolia.etherscan.io/tx/0x8b8f70e71a776b75d30d8664d2065d40c893c1ad16eb5384dc6b75c6788ebe8d
- **Time correlation:** unlock trace at 21:13:56 BST, send confirmed at 21:18 BST (20:18 UTC)
- **Second txid (same session, pre-Console):** `0x391269845b35d96b8c65a7c675af329a8f3e71155465e39a34f154454f5af9e3`, block 11224594, 20:01 UTC

### Cold-restart repeat
- [x] Unlocked after cold restart — same trace pattern confirmed
- Timestamp: 21:19:13–21:19:16 BST
- Trace:
```
21:19:13.518894+0100  App  [VEYRNOX-KEK] getHardwareFactor: loaded ciphertext 113 bytes, retrieving SE key…
21:19:13.527205+0100  App  [VEYRNOX-KEK] getHardwareFactor: SE key retrieved, decrypting (Face ID prompt now)…
21:19:16.323434+0100  App  [VEYRNOX-KEK] getHardwareFactor: SUCCESS — Face ID passed, H recovered (32 bytes)
```

### Negative check (Face ID cancel)
- [ ] DECRYPT FAILED Console line — not captured (Console buffer rotated between 21:21 and 21:24)
- [x] No unlock, no fallback — confirmed via phone screenshot at 21:21
- Phone displayed "Your passkey could not be used." error banner, app remained on PIN entry screen
- Timestamp: 21:21 BST

**P1 result:** PASS

---

## P2 — iOS-F5: NSMutableData heap zeroing (device)

- [x] Build clean of F5 — `HardwareKekPlugin.o` compiled (CI-verified PR #705 + local Xcode build 2026-07-07)
- [x] Enroll/unlock/unenroll cycle works end-to-end on new build (proven by P1 unlock traces)
- [x] Source sign-off: `resetBytesInRange` present on all paths in the compiled binary's source
  - Enroll path: `memset(hBytes, 0, sizeof(hBytes))` at line 179 (stack buffer)
  - getHardwareFactor path: `[h resetBytesInRange:NSMakeRange(0, h.length)]` at line 321 (heap NSMutableData)
  - CFData `pt` (raw SE decrypt output): `CFRelease(pt)` at line 322 (immediate after copy)
- [x] Honest scope recorded: base64 bridge residue is architecturally unzeroable (LOW-MEDIUM)
  - `NSString *hB64` (line 318) is immutable — cannot be zeroed
  - JS-side string from `[call resolve:@{@"h": hB64}]` (line 328) — bridge copy, cannot be zeroed
  - This is inherent to the Capacitor bridge architecture, not a code defect
  - Heap dump verification out of scope per runbook — source + build level sign-off only

**P2 result:** PASS

---

## P3 — iOS-F3: LAContext (device runtime)

- [x] Build clean — zero `kSecUseOperationPrompt` deprecation warnings (CI-verified PR #705 + local build)
- [x] Face ID prompt renders on unlock — observable biometric prompt (21:13 BST)
- [x] Two back-to-back unlocks both prompt (no grace-period reuse — `reuseDuration=0`)
  - First unlock: 21:13:56 BST (warm)
  - Second unlock: 21:19:13 BST (cold restart)
  - Both prompted Face ID independently
- [x] No runtime deprecation warning in device console (Console.app showed only [VEYRNOX-KEK] lines, no deprecation warnings from App process)

**P3 result:** PASS

---

## P4 — H-2/iOS-F11: Biometric re-enrollment invalidation

**Phase 0 gate:**
- [x] Biometric enrollment restriction lifted
- Method used: Different device — iPhone 8 Plus (iOS 16.7.16, Touch ID, unrestricted, no MDM).
  The iPhone 17 Pro Max (MDM-registered) could not run this test (confirmed 2026-07-07).
  The iPhone 8 Plus was used instead (2026-07-08). Both use the same `kSecAccessControlBiometryCurrentSet` ACL.

### Test
- [x] Baseline: KEK vault unlocks with Touch ID + PIN (iPhone 8 Plus, KEK enrolled with Touch ID)
- [x] Touch ID re-enrollment performed (method: Settings → Touch ID & Passcode → Add a Fingerprint)
- [x] Unlock attempt FAILED CLOSED — SE key invalidated
  - Error observed: "Incorrect PIN. Try again" (the KEK-wrapped vault cannot be unwrapped — PIN alone is insufficient without a valid H factor)
  - [x] No unlock, no silent bare fallback
- [ ] Recovery: seed phrase restore not performed this session (app remained on lock screen — user moved on)
- [x] Touch ID state: new fingerprint remains enrolled (test device is throwaway)

**P4 result:** PASS

---

## Overall

| Item | Result | Status language |
|---|---|---|
| P1 (F9) | PASS | iOS-F9 CLOSED (prospective, INTERNAL, 2026-07-07) |
| P2 (F5) | PASS | iOS-F5 device-verified (INTERNAL, source+build, not heap dump) |
| P3 (F3) | PASS | iOS-F3 device-verified (INTERNAL) |
| P4 (H-2) | PASS | H-2/iOS-F11 iOS RESOLVED / device-verified (INTERNAL, 2026-07-08, iPhone 8 Plus Touch ID) |

**iOS headline:** device-verified **FULL** — P1 AND P4 both PASS. P1 (2026-07-07, iPhone 17 Pro Max, Face ID) + P4 (2026-07-08, iPhone 8 Plus, Touch ID). Runbook condition met.

**Evidence artifacts:**
- [x] Console.app traces (2x unlock: 21:13 + 21:19, 3 [VEYRNOX-KEK] lines each)
- [ ] `daemons.log` — not separately captured (prior daemon evidence reused)
- [x] Sepolia txid confirmed on explorer (block 11224674)
- [x] Phone screenshot of negative check (fail-closed, "Your passkey could not be used")
- [x] Xcode build — zero F3 deprecation warnings (CI PR #705 + local)
- [x] This file filled in and committed

**Honesty:** Everything INTERNAL. Independent audit unaffected. The two historical iOS sends (2026-07-01/02) remain META/non-promoting evidence — not retro-promoted by this session.
