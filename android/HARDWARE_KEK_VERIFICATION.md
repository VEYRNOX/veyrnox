# Android HardwareKek — On-Device Verification Required

**STATUS: TARGET (audit-gated)** — Changes H15 and H16 cannot be verified by JS/vitest.
On-device verification on a real Android device is required before these findings can be
closed. This note describes what to test and what pass/fail looks like.

---

## H15 — StrongBox preference with TEE fallback

**What changed:** `enroll()` now calls `setIsStrongBoxBacked(true)` first. If
`StrongBoxUnavailableException` is thrown the key is re-generated without StrongBox (TEE).
`enroll()` now returns `{ keyTier: "StrongBox" | "TEE" }`.

**How to verify on-device:**

1. Install a debug build on a device with StrongBox (e.g. Pixel 6+).
2. Call `HardwareKek.enroll()` and confirm the resolved value includes `keyTier: "StrongBox"`.
3. Check logcat for: `HardwareKek: enroll: key generated in StrongBox`.
4. Install on a device WITHOUT StrongBox (e.g. most pre-2021 phones).
5. Call `enroll()` and confirm `keyTier: "TEE"` and logcat shows the fallback warning.
6. After enroll, call `getHardwareFactor()` on both devices and confirm a valid base64
   HMAC is returned (same length: 44 chars, base64url of 32 bytes).

**Pass criteria:** StrongBox devices enroll in StrongBox; non-StrongBox devices fall back
to TEE without error; `getHardwareFactor()` succeeds on both.

---

## H16 — AUTH_DEVICE_CREDENTIAL removed

**What changed:** `setUserAuthenticationParameters` now passes only
`AUTH_BIOMETRIC_STRONG`. `PromptInfo` uses `setAllowedAuthenticators(BIOMETRIC_STRONG)`
only and includes `setNegativeButtonText("Cancel")`. The PIN/pattern fallback is gone.

**How to verify on-device:**

1. Enroll on a device that has a PIN set and at least one enrolled fingerprint/face.
2. Call `getHardwareFactor()`. A biometric prompt should appear.
3. Confirm there is NO option to "Use PIN / Pattern / Password" in the prompt.
4. Cancel via the "Cancel" button. Confirm `getHardwareFactor()` rejects with "User cancelled".
5. Authenticate with a valid fingerprint/face. Confirm `{ h: "<base64>" }` is returned.
6. Attempt to authenticate with an invalid biometric 5× to trigger lockout, then confirm
   the prompt does NOT fall back to PIN — it should error out.

**Pass criteria:** The biometric prompt shows no device-credential fallback; only biometric
authenticates; cancellation returns "User cancelled"; success returns a valid `h`.

---

## Notes

- These tests require a physical Android device; the emulator does not reliably simulate
  StrongBox or biometric CryptoObject flows.
- On Android 11+, `setAllowedAuthenticators(BIOMETRIC_STRONG)` without
  `DEVICE_CREDENTIAL` requires the device to have a class 3 (Strong) biometric enrolled;
  the app should gracefully handle devices that do not.
- All changes are flagged TARGET / audit-gated. Do not promote to VERIFIED without the
  independent third-party audit sign-off.
