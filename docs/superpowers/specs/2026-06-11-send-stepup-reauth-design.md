# Send-time step-up re-auth — design

**Status:** UNAUDITED-PROVISIONAL. Replaces a broken send-authorization gate with a
working, honest one. Testnet-only repo; nothing here unblocks mainnet or touches the
audit-gated hardening surface (§24) beyond a flagged review item. No security control is
mocked.

**Date:** 2026-06-11

---

## Problem (root cause)

In the local build (`BACKEND='local'`), the Send screen's "Verify your identity" 2FA gate
is **structurally unsatisfiable for a real (vault) wallet**, so no real wallet can authorize
any send through the UI — ETH included, not just BTC/SOL.

- `src/pages/SendCrypto.jsx` gates `sendTx.mutate()` behind a 2FA picker: a **Passkey**
  button that renders only if `selectedWallet?.passkey_registered && window.PublicKeyCredential`,
  and an **Email OTP** button disabled when `!EMAIL_AVAILABLE`.
- `src/lib/sendWalletSource.js` — `buildSendWallet()` returns only
  `{ id, name, currency, address, balance }`; it **never carries `passkey_registered`**, so
  for a live vault wallet that field is always `undefined` and the passkey button can never
  render. (The file header documents the sibling bug: Send used to read the empty
  `base44.entities.Wallet` store; `passkey_registered` is the field the earlier fix dropped.)
- `src/pages/Settings.jsx` — the per-wallet passkey registration UI reads
  `base44.entities.Wallet.list()` (empty in a live PIN-cohort build) and updates that entity
  store, disconnected from the WalletProvider vault wallet the Send screen uses.
- `src/api/base44Client.js` — `EMAIL_AVAILABLE = BACKEND !== 'local'` → `false` in the local
  build (no mail server), so Email OTP is permanently disabled.

The 2FA gate was designed for the removed hosted/base44 era and is now stranded.

## Decision

The vault is already unlocked by the user's real key (PIN/password, Argon2id) before a send.
Replace the stranded 2FA picker with a **step-up re-auth**: before signing, re-enter the
device's existing vault credential, verified against the **active session**. This re-confirms
the holder at signing time (meaningful because idle/background auto-lock can leave a session
unlocked while the user stepped away) without introducing any new factor, mail server, or
audit-gated hardware.

## Design

### Components

1. **Per-session credential verifier (WalletProvider + keystore helper).**
   - At a successful `unlock()` — on ANY path that opens a session (primary, duress/decoy,
     hidden, or the PIN-cohort deterministic fallback) — capture a verifier for the credential
     that opened *this* session: `verifier = { salt, hash }` where
     `hash = argon2id(enteredCredential, salt)` and `salt` is a fresh CSPRNG per-session salt.
     The entered credential is the `password` argument to `unlock()`, which is exactly what
     opened the session regardless of which path matched.
   - Held in a ref for the session lifetime; **cleared in `lock()`** alongside the other
     in-memory secrets.
   - Rationale for a salted hash over the raw secret: a memory scrape yields only a salted
     hash. (A 6-digit PIN is still brute-forceable, but the decrypted mnemonic is already in
     memory while unlocked, so this is a modest, disclosed increment — not a new at-rest
     exposure.)

2. **`verifyActiveCredential(entered): Promise<boolean>` (WalletProvider).**
   - Re-derives `argon2id(entered, verifier.salt)` and **constant-time compares** to
     `verifier.hash`. Returns match/no-match.
   - **No side effects:** never calls `keyStore.unlock()` / `resolveDeniabilityUnlock()` —
     so it can NEVER trigger panic-wipe, a duress/decoy switch, or any session mutation.
     This is the load-bearing safety property.
   - Constant-work (fixed Argon2id params, single derivation) → no timing oracle and no
     "is this the real wallet?" oracle.
   - Returns `false` (not throw) if no session/verifier exists (fail closed).

3. **Send verify-step UI (SendCrypto.jsx).**
   - Replace the 2FA picker (`twoFAMethod`, passkey block, OTP block) with a single step-up
     prompt: a `PinPad` for the PIN cohort or a password `Input` for the password cohort,
     selected by `getAuthModel()`.
   - "Authorize & Send" calls `verifyActiveCredential(entered)`:
     - `true` → `sendTx.mutate()` (the existing dispatch; unchanged).
     - `false` → clear the entry, show "Incorrect — try again", increment an attempt counter.
   - **Attempt cap = 5.** Exhausting it calls `lock()` (fail closed → returns to the unlock
     gate), matching the unlock surface. No new lockout state machine.
   - Remove `verifyPasskey`, `sendOTP`, `verifyOTP`, the `otp*`/`twoFAMethod`/`passkey*`
     state, and the now-unused `EMAIL_AVAILABLE` import (if unused elsewhere in the file).

### Deniability (must-hold invariant)

Verification is against **whatever credential opened the active session**, so it behaves
identically in a real session and in a decoy/duress/Option-A session: the decoy holder
re-enters the decoy credential and the decoy sends normally. A rejected alternative —
re-decrypting the *primary* container — would fail in a decoy session (the duress credential
can't open the primary), so the decoy couldn't send → a deniability tell. That approach is
explicitly **not** used.

### Demo & cohorts

- **Demo** (`BACKEND='demo'`, fake-send tour, no real vault): step-up is **skipped** — demo
  keeps its existing simulated send. Step-up applies only when `WALLET_AUTH` (local build).
- **Cohorts:** PIN cohort → `PinPad`; password cohort → password field. Driven by
  `getAuthModel()`.

### What is NOT changed

- Vault-level passkey / biometric **unlock** (S1 / M2b) — untouched.
- The deniability/duress/panic/hidden machinery in `unlock()` / `resolveDeniabilityUnlock` —
  untouched (the verify primitive deliberately does not call it).
- `buildSendWallet` shape — unchanged; we simply stop reading `passkey_registered`.
- The send **dispatch** itself (`signAndBroadcast*`, `toBaseUnits`, etc.) — unchanged.

## Testing

Pure-logic unit tests (the codebase pattern — extract verify logic so it needs no React):

1. Verifier match: correct credential → `true`; wrong → `false`.
2. Constant-time compare is used (no early-exit on first differing byte).
3. `verifyActiveCredential` has **no side effects**: a wrong entry never invokes
   unlock/panic/decoy and never mutates session state.
4. Decoy-session parity: a session opened by a decoy credential verifies against that decoy
   credential (not the primary) — asserted without leaking which session is which.
5. Attempt cap: the 5th wrong entry calls `lock()`.
6. A live (`buildSendWallet`-sourced) wallet reaches an authorize-able state in the verify
   step (regression test for the original bug).

No mocked security controls. No real-send broadcast in these tests (dispatch is already
covered elsewhere).

## Audit note (§24)

This replaces a broken gate with a working, honest one and adds **no** new
hardware/attestation/network surface. It does touch the unlock/verify path and retains a
per-session credential verifier (salted hash) in memory, so the change is tagged
**UNAUDITED-PROVISIONAL** and listed for independent audit review. It does not unblock
mainnet; `ALLOW_MAINNET` stays `false`.

## Out of scope

- Reworking per-wallet passkey registration to bind to the vault wallet (a separate, larger
  change; the passkey *send* factor is removed here, not rewired).
- Any change to demo's fake-send behavior.
- A local Email-OTP stand-in.
