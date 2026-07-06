# iOS biometric re-enrollment invalidation — capture cheat-sheet (H-2/iOS-F11)

> One-page command reference for the **last open iOS hardware-KEK gate**: prove that
> re-enrolling Face ID invalidates the Secure Enclave key so a KEK-wrapped vault fails
> closed to PIN recovery (I6). Distilled from the full procedure in
> `docs/hardware-kek-ios-device-verification.md` (Test A) + the iOS-F9 capture method.
> The Android half already PASSED (Pixel 10 Pro XL, PR #516/#518); **iOS is the only gap.**

## ⚠️ Hard preconditions (why it's been blocked)
- **An UNRESTRICTED physical iPhone** with Secure Enclave. The prior test device (iPhone 17
  Pro Max) had **Face ID enrollment restricted by MDM** — you cannot Reset/Set-Up Face ID,
  so the test literally cannot run there. Use a personal/unmanaged iPhone.
- Mac + Xcode; the phone has Face ID enrolled **and a device passcode set**.
- A **DEBUG build** (the `[VEYRNOX-KEK] …` `os_log` lines are `#if DEBUG`-gated — a release
  build emits nothing, so you'd see no trace).
- The Simulator is useless here — no Secure Enclave.

## Step 1 — build + install (DEBUG, from Xcode)
```bash
npm run ios          # = cap sync ios && cap open ios  (preios regenerates the icon)
# In Xcode: select the physical device, Product ▸ Run (Debug scheme). Leave it attached.
```

## Step 2 — start the log capture (THE method that works on iOS 26)
```bash
# pymobiledevice3's os_trace relay is the ONLY thing that captures a third-party app's
# os_log on iOS 26. idevicesyslog, `log stream --device`, and `log collect` all show
# ZERO VEYRNOX-KEK lines on iOS 26 — do not waste time on them.
pymobiledevice3 syslog live | grep -E 'VEYRNOX-KEK|DECRYPT_FAILED|SE_KEY_MISSING'
```

## Step 3 — enroll the KEK (baseline)
- In-app: **Settings ▸ Security ▸ Hardware Protection ▸ enroll** → badge shows
  **"Hardware Protection ON"**. (Optionally do one normal cold Face ID unlock first and
  confirm the log shows `getHardwareFactor: SUCCESS — Face ID passed, H recovered (32 bytes)`
  — that's the healthy baseline before you invalidate.)

## Step 4 — invalidate (the actual test)
1. **Force-quit** the app (swipe up).
2. **Settings ▸ Face ID & Passcode ▸ Reset Face ID**, then **Set Up Face ID** again (full
   reset + re-enroll is the least ambiguous "current set" change).
3. **DO NOT remove the device passcode.** The SE item is `WhenPasscodeSetThisDeviceOnly`,
   so removing the passcode destroys the key for a *different* reason and muddies the
   result. This test must isolate the biometric-set change.
4. **Cold-launch** the app from Xcode and attempt to **unlock**.

## Step 5 — PASS / FAIL criteria
**PASS** (all of):
- The capture shows the SE decrypt rejecting: **`DECRYPT_FAILED`** (or `SE_KEY_MISSING` if
  the OS dropped the key) surfaced through `getHardwareFactor`.
- The app **refuses the hardware unlock** and routes to the **PIN/password recovery** path
  — it must NOT silently unlock, and must NOT downgrade the vault to bare without user action.
- Entering the correct **PIN/password still recovers the vault** (no fund-loss footgun).
- Re-enrolling the KEK afterward produces a **new** SE key (badge back to ON).

**FAIL** if the app unlocks anyway (invalidation not enforced), bricks with no PIN
recovery, or silently converts the vault to bare without telling the user.

## Step 6 — evidence pack (the "txid-equivalent" — required before recording)
Capture and keep:
- [ ] The **`pymobiledevice3` log line(s)** showing the reject code (`DECRYPT_FAILED` / `SE_KEY_MISSING`).
- [ ] A **screen recording** of the refuse → PIN-recovery flow, and the exact **user-facing error text**.
- [ ] The **Console.app BiometricKit** line showing the re-enrollment (the OS-side corroboration).
- [ ] **Device model + iOS version + the build git commit** + pass/fail per criterion.

## Step 7 — record honestly (do NOT over-promote)
- [ ] Add an **iOS** entry to `docs/verified-evidence.json` as the **META** key
  `_hardware_kek_biometric_reenroll_invalidation` (mirror the existing Android entry — it's a
  protection test, NOT a txid, so it stays OUT of the txid-gated `evidence{}` set and promotes
  nothing to catalogue-`verified`).
- [ ] Reconcile `docs/Feature-Status.md` **H-2/iOS-F11** — flip the **iOS half** from
  "DEFERRED (device-blocked)" to PASSED, keeping "iOS overall device-verified PARTIAL until
  independent audit." Do **not** write "verified" unless every Step 5 criterion passed on a
  real device **with no workaround**; if anything needed a workaround, record it as PARTIAL
  with the specific gap named.
- [ ] (If you drove it via the WDIO scaffold `tests/ios/specs/biometric-reenroll-e2e.spec.js`,
  set `REENROLL_DONE=1` so the human-gated assertions run.)

---
**Related:** full procedure `docs/hardware-kek-ios-device-verification.md` (Test A) ·
runbook `docs/runbook-ios-kek-session.md` · handoff `docs/hardware-audit-handoff.md` ·
Android precedent `verified-evidence.json` → `_hardware_kek_biometric_reenroll_invalidation`.
