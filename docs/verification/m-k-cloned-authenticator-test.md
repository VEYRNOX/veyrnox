# M-K — WebAuthn Cloned Authenticator Detection: Device Verification Package

**Finding ID:** M-K  
**Status:** BUILT — tests passing, awaiting real-device clone attempt  
**Source files:** `src/lib/passkey.js` (`verifyPasskeyAssertion`, `PasskeyClonedError`, `getPasskeySignCount`, `setPasskeySignCount`)  
**Test file:** `src/lib/__tests__/passkey.test.js` — describe block "M-K — signCount validation (cloned authenticator detection)" (9 scenarios, all green)  
**Date prepared:** 2026-06-30  

---

## What the code actually does

`verifyPasskeyAssertion()` extracts a big-endian uint32 signCount from `authenticatorData` bytes 33–36 (the FIDO2-specified position). After a successful WebAuthn `get`, it compares the returned signCount to the last value stored in localStorage under key `veyrnox-passkey-signcount`.

Detection rule (from source, not from docs):

- If `newSignCount <= oldSignCount` AND the old count was non-zero: throws `PasskeyClonedError` with `code = 'authenticator_cloned'`, `oldSignCount`, `newSignCount`.
- If both old and new are 0: no-op. The authenticator has the counter disabled; no clone signal, no false positive. This is a documented gap.
- If `newSignCount > oldSignCount`: `setPasskeySignCount(newSignCount)` is called and the gate passes.
- If signCount is absent from the assertion response (authenticatorData too short or missing): the check is skipped and the gate passes. This is a documented gap for authenticators that omit the field.

Fail-closed (I4): a rejected (cloned) assertion does NOT advance the stored counter. The gate surfaces clone detection as an advisory warning, not a hard lockout, consistent with the wallet's warn-not-block posture and the honest limitations documented in the code.

---

## What this test cannot verify by code alone

- Whether a real platform authenticator (Touch ID, Face ID, Windows Hello) actually increments its signCount between assertions. Many modern platform authenticators report signCount = 0 on every assertion for privacy. If the test authenticator always reports 0, the clone detection is inert for that device; document this.
- Whether a soft authenticator exported to another device retains its counter at the old value.

Confirm which authenticator you will test against and check whether it increments signCount before running the full procedure.

---

## Hardware and tools required

- A web server running the Veyrnox dev build: `npm run dev` (no special `.env.local` flags needed for this test).
- Browser DevTools (Application tab > Local Storage, Console).
- One of the following authenticator setups:
  - **Option A (preferred — real signal):** A FIDO2 roaming authenticator that increments signCount (e.g. YubiKey Security Key), plus a CTAP2 debug harness (e.g. SoloKeys `ctap-test`, a custom CTAP2 simulator, or a Chromium fork with CDP counter override) that can inject an assertion with a stale signCount.
  - **Option B (browser-layer simulation):** Chrome DevTools WebAuthn virtual authenticator panel (More tools > WebAuthn). CDP virtual authenticators support signCount editing per credential after assertion.
  - **Option C (sync-based):** Two Chromium profiles sharing a Google-synced passkey. Advance the counter on Profile A, then attempt assertion from Profile B before sync propagates the new count. Less reliable — depends on sync timing.

---

## Step-by-step procedure

### Setup

1. Confirm you are NOT in demo mode. Visit `/?demo=0` and reload at `http://localhost:5173/`.
2. Create or import a wallet. ETH Sepolia balance is not required — this test does not send a transaction.
3. Navigate to Settings > Security > Passkey Unlock.
4. Register a passkey using a real WebAuthn call (not demo mode). Confirm in the console: `JSON.parse(localStorage.getItem('veyrnox-passkey-cred')).simulated` must be `false`.
5. Note: `veyrnox-passkey-signcount` will be absent from localStorage at this point. The counter is recorded only on the first assertion.

### Baseline: legitimate assertions

6. Lock the wallet (Settings > Lock).
7. Unlock with PIN. When the passkey gate triggers, complete the WebAuthn assertion.
8. In DevTools Application > Local Storage, record the `veyrnox-passkey-signcount` value (e.g. `1`).
9. Repeat steps 6–8 two more times. The counter must advance each time (1 → 2 → 3).
10. If the counter stays at `0` across all three assertions, the authenticator does not increment signCount. Stop here; M-K detection is inert for this authenticator. Document the authenticator model, note the signCount = 0 limitation, and do not mark PASS or FAIL for M-K.

### Clone attempt: stale signCount assertion

The goal is to present an assertion whose signCount equals or is less than the stored value (simulating a cloned authenticator replaying old state).

**Using Option B (CDP virtual authenticator — recommended for reliability):**

11. Open Chrome DevTools > More tools > WebAuthn. Enable virtual authenticators. Add a new authenticator: CTAP2 protocol, Internal transport, `hasUserVerification: true`, `hasResidentKey: true`.
12. Register the passkey through the Veyrnox UI using this virtual authenticator. The CDP authenticator starts with signCount 1 and auto-increments each assertion.
13. Perform two legitimate assertions (lock → unlock) to advance the stored counter (e.g. to `3`).
14. In the WebAuthn panel, select the registered credential and edit its signCount back to `1` (CDP allows this for virtual authenticators).
15. Lock the wallet and trigger the passkey gate again.

**Using Option A (roaming authenticator + CTAP2 tool):**

11. Advance the counter by performing three legitimate assertions on Device A. Record the stored counter value.
12. Using your CTAP2 debug tool or a forked simulator, craft an assertion whose `authenticatorData` encodes a signCount equal to or less than the stored value at bytes 33–36 (big-endian uint32).
13. Intercept the `navigator.credentials.get()` call at the browser level (CDP override, Service Worker, or a local proxy) and substitute your crafted assertion response.
14. Lock the wallet and trigger the passkey gate.

### Observe and record

16. Observe the UI response. A toast or modal should appear indicating a possible cloned authenticator. At minimum, open the console and confirm the thrown error: `error.code === 'authenticator_cloned'`.
17. Check DevTools > Local Storage > `veyrnox-passkey-signcount`. It must remain at the pre-attempt value (unchanged). A cloned assertion must not advance the counter.
18. Verify the wallet session did not transition to unlocked.

### Confirm recovery

19. Perform a fresh legitimate assertion (counter exceeds stored value). This must succeed. The gate must not be permanently locked by a clone detection event.

---

## Pass criteria

All of the following must be true for a PASS:

1. Baseline assertions advance `veyrnox-passkey-signcount` monotonically. (If the authenticator reports 0 on every assertion, stop and document the limitation instead of marking PASS/FAIL.)
2. A stale or replayed signCount (equal to or less than stored) causes the gate to throw with `error.code === 'authenticator_cloned'`, `error.oldSignCount` matching the stored value, and `error.newSignCount` matching the stale value.
3. After the cloned assertion, `veyrnox-passkey-signcount` is unchanged in localStorage (fail-closed, I4).
4. The wallet did not unlock after the cloned assertion.
5. The UI surfaces an advisory warning visible to the user.
6. A subsequent legitimate assertion (fresh, counter exceeds stored value) succeeds normally. The gate is not permanently blocked.

---

## Evidence to capture

- Console log: `PasskeyClonedError` object with `code`, `oldSignCount`, `newSignCount`, `authenticatorCloned: true`.
- DevTools screenshots: `veyrnox-passkey-signcount` value (a) before clone attempt, (b) immediately after rejected clone attempt (must match (a)), (c) after a subsequent successful assertion (must be higher than (a)).
- UI screenshot: the warning displayed to the user after the cloned assertion.
- Record of authenticator type used and whether it increments signCount.

---

## Known limitations (document in evidence, not as findings)

These are scope boundaries already documented in `passkey.js`, not defects:

- signCount = 0 authenticators: detection is inert. Most Apple platform passkeys and many Android passkeys disable the counter for privacy. This is the expected behaviour on most iOS and macOS devices.
- localStorage is device-local and best-effort. Clearing storage resets the counter. The next legitimate assertion re-seeds from whatever signCount it receives with no false positive.
- No remote attestation: this is client-side advisory detection, not prevention. The FIDO2 specification acknowledges that hardware-backed authenticators that never export private key material cannot be meaningfully cloned; the signCount mechanism is designed for software/exportable credentials.
