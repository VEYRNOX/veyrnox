# H-1 — Passkey/Biometric 2FA at Critical Actions: Device Verification Package

**Finding ID:** H-1  
**Status:** BUILT — partially verified 2026-06-29 on iPhone 17 Pro Max (txid `0xd1c97fa2…`, Sepolia); full package for additional device/session verification  
**Source files:**  
  `src/lib/passkey.js` (`verifyPasskeyAssertion`)  
  `src/components/security/useActionGuard.jsx` (`useActionGuard`, `resolveMethod`, `verify`)  
  `src/lib/send2faMethod.js`  
**Date prepared:** 2026-06-30  

---

## Critical architecture note — read before writing any test procedure

The task brief described "H-1 Passkey 2FA on Real Secure Enclave (iPhone)" as if the wallet uses a WebAuthn FIDO2 passkey backed by the Secure Enclave on iOS. This is NOT what the code does.

From `passkey.js` `verifyPasskeyAssertion()`:

```
if (Capacitor.isNativePlatform()) {
  const { BiometricAuth } = await import('@aparajita/capacitor-biometric-auth');
  await BiometricAuth.authenticate({
    reason: 'Confirm this action',
    allowDeviceCredential: false,
  });
  return true;
}
```

On a native iOS or Android build, `verifyPasskeyAssertion()` does NOT call the WebAuthn API. It routes through the OS biometric (`BiometricAuth.authenticate`). The possession factor on-device is Face ID / Touch ID — a real OS biometric prompt — not a FIDO2 passkey assertion. WebAuthn in a Capacitor WKWebView is unreliable and origin-bound; the code comments this honestly: "HONEST: this is an OS biometric standing in for the possession factor, NOT a FIDO2 passkey."

The gate in `useActionGuard.jsx` `resolveMethod()` further clarifies:

```
if (Capacitor.isNativePlatform() && is2faBiometricEnabled()) return 'biometric';
if (is2faPasskeyEnabled() && isPasskeyRegistered()) return 'passkey';
```

On a real device, if the user has biometric 2FA enabled, the method is `'biometric'`, not `'passkey'`. Biometric 2FA calls `verifyBiometric2fa()` from `biometric.js`, not `verifyPasskeyAssertion()`.

**What H-1 actually tests on a real iPhone:**
- PIN is the first factor (at unlock).
- Face ID / Touch ID is the second factor (OS biometric, via Capacitor BiometricAuth plugin, at the critical action gate).
- The Secure Enclave is engaged implicitly by the OS biometric system — but this is not a FIDO2 signCount-based passkey; it is a standard biometric re-auth.

**What the 2026-06-29 verification confirmed:**
- On iPhone 17 Pro Max, the full Send flow (ETH Sepolia, `0xd1c97fa2…`) completed with PIN unlock + Face ID 2FA gate before signing. This is H-1 in its real native form.

**A separate open finding (H-NEW-D):** The iOS `HardwareKekPlugin.swift` stores the KEK in a standard Keychain item (`kSecClassGenericPassword`), NOT in a Secure Enclave-backed key (`kSecAttrTokenIDSecureEnclave`). This is a distinct open finding tracked in `docs/audit-2026-06-28-internal-static-analysis.md`. It is about the Hardware KEK, not the 2FA gate. Do not conflate these.

---

## What this verification package covers

Re-verification of H-1 (PIN + OS biometric 2FA at Send and other critical actions) on a real native device, with evidence captured in a new session. This is either a second confirmation or a first confirmation on a different device model.

---

## Hardware and tools required

- Real iPhone (Face ID: iPhone X or later; or Touch ID: iPhone SE 2nd/3rd gen) with iOS 16 or later.
- Mac with Xcode 15 or later (required to build and install the native app on a real device).
- Apple Developer account (free tier sufficient for on-device testing with a 7-day cert).
- Sepolia testnet ETH: at minimum 0.001 ETH. Faucet: `sepoliafaucet.com` or `faucet.sepolia.dev`.
- Sepolia block explorer access: `https://sepolia.etherscan.io`.
- Xcode Console or Instruments (to capture iOS logs).

---

## Build instructions

```bash
# From the project root on a Mac:
npm install
npm run build          # builds the web assets Capacitor wraps
npx cap sync ios       # copies web assets into ios/App/App/public
# Open Xcode:
open ios/App/App.xcworkspace
# In Xcode: select your connected iPhone as the run destination, then Run (Cmd+R).
```

If `npm run ios` is available and maps to the above sequence, use it. Check `package.json` first.

---

## Step-by-step procedure

### Device setup

1. Connect the iPhone to the Mac via USB. Trust the computer on the device if prompted.
2. In Xcode, select the iPhone as the run destination. Confirm Team is set under Signing & Capabilities (use your Apple ID).
3. Build and run (`Cmd+R`). Accept any provisioning certificate prompts.
4. Confirm Face ID (or Touch ID) is enrolled on the device. Go to iOS Settings > Face ID & Passcode and confirm at least one face is enrolled.

### Wallet setup

5. Open the Veyrnox app on the device.
6. Confirm the app is not in demo mode: there must be no "Demo Mode" banner. If a demo banner appears, clear it: navigate to `/?demo=0` in the in-app browser if accessible, or reinstall.
7. Create a new wallet or import the testnet-only fixture seed (see `docs/verification/test-fixtures.json` if present; otherwise use any BIP-39 seed you control on testnet only — this seed must NEVER hold real value).
8. Set a PIN (at least 8 characters to satisfy any minimum; do not use the same value as a real wallet).
9. Navigate to Settings > Security > Two-Factor.
10. Enable "Biometric 2FA" (the toggle for biometric second factor at critical actions). On a real device this is the `is2faBiometricEnabled` preference. The UI label may read "Face ID 2FA" or "Biometric second factor".
11. Lock the wallet (Settings > Lock or close and reopen the app).

### Unlock

12. Open the app. Enter the PIN. The wallet should unlock (biometric at unlock is separate from the 2FA gate tested here; at unlock the biometric is the credential check, not the 2FA step).

### Trigger the 2FA gate: Send

13. Navigate to Send. Select ETH (Sepolia).
14. In the "To" field, enter a testnet address you control (your own second Sepolia address, or any burn address).
15. Enter an amount (e.g. 0.0001 ETH).
16. Tap Confirm / Next.
17. The pre-sign review screen should appear (transaction simulation, amount, fee).
18. Tap "Send" or the equivalent final confirm button.
19. The 2FA gate modal must appear BEFORE the transaction is signed or broadcast. The modal should prompt for Face ID (or Touch ID).
20. Approve Face ID when prompted. The OS biometric sheet must appear — this is the iOS system-level Face ID prompt, not an app-drawn overlay.
21. After successful Face ID, the transaction should be broadcast.
22. The confirmation screen should show a transaction hash. Copy it.

### Verify on-chain

23. Open `https://sepolia.etherscan.io` in a browser.
24. Paste the transaction hash. Confirm Status = Success, From = your wallet address, Value = 0.0001 ETH (or the amount sent).

### Trigger the 2FA gate: seed reveal (additional check)

25. Navigate to Settings > Security > View Seed Phrase (or equivalent).
26. Attempt to reveal the seed.
27. The 2FA gate should trigger again — Face ID prompt must appear before the seed is displayed.
28. Approve Face ID. The seed must only appear after successful biometric auth.

### Test fail-closed: cancel Face ID

29. Navigate to Send again with a small amount.
30. When the 2FA gate triggers and the Face ID prompt appears, cancel it (tap Cancel or let it time out).
31. Verify the transaction was NOT broadcast (no transaction hash, no state change). The wallet must not proceed with the send.

---

## Pass criteria

All of the following must be true for a PASS:

1. The 2FA gate modal appears before any signing operation. There is no path to broadcast without the gate triggering.
2. The Face ID prompt is a real iOS system prompt (the system-level Face ID sheet, not an app-drawn button). Identify it by the system animation and the device-level sheet appearance.
3. The transaction is broadcast ONLY after a successful Face ID approval.
4. Cancelling or failing Face ID blocks the send (no transaction is broadcast). This is the I4 fail-closed invariant.
5. The transaction hash appears on Sepolia Etherscan with Status = Success and the correct From / Value.
6. The seed reveal gate also triggers Face ID before displaying the phrase (additional confirmation that the gate applies to all critical actions, not just Send).

---

## Evidence to capture

- Sepolia txid for the Send verification. Paste into `https://sepolia.etherscan.io` and confirm Status = Success. Screenshot the explorer result.
- Screenshots on device: the 2FA gate modal (showing "Confirm with Face ID" or equivalent), the iOS Face ID system prompt, the transaction confirmation screen with hash.
- Xcode Console screenshot: confirm no errors during the biometric call. Look for any `BiometricAuth` or `useActionGuard` log lines. Note absence of errors.
- Screenshot of the failed-cancel test: the wallet in its locked/pending state after Face ID cancel, with no transaction visible.
- Device model and iOS version (Settings > General > About).

---

## What this test does NOT verify

- That the Secure Enclave is backing the biometric key (the OS handles this internally; the app uses the OS biometric API and cannot inspect SE internals from JS).
- The H-NEW-D finding (iOS HardwareKekPlugin uses Keychain not SE-backed key). H-NEW-D is about the Hardware KEK, a separate code path from the 2FA biometric gate. H-NEW-D remains an open finding tracked separately.
- WebAuthn / FIDO2 signCount on-device. On native, the passkey path is bypassed entirely in favour of OS biometric (see architecture note above). The WebAuthn signCount path (M-K) is a web-only code path.
