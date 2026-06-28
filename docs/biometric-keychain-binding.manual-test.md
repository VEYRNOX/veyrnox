# Manual iOS-simulator test — biometric-unlock cache hardening

Branch: `fix/biometric-keychain-binding`
Scope: `src/lib/biometricUnlock.js` (chokepoint) + `src/lib/WalletProvider.jsx`
(`unlockWithBiometric` error mapping). **No wallet-core / vault crypto touched.**

## What changed (and what you're confirming)

The cached vault password (Keychain item `veyrnox_bio_unlock_secret`) is now
released **only** after a fresh OS biometric match. `retrieveUnlockSecret()` is
the single chokepoint: on native it calls `BiometricAuth.authenticate()` FIRST
and reads the item SECOND; a cancel/failure throws and the item is never read.

> **Honest caveat about the OS gate (read first).** This is an **OS-enforced
> biometric authenticate() in code**, not a Keychain item *bound* to biometry
> (the `@aparajita/capacitor-secure-storage` plugin can't set
> `kSecAccessControlBiometryCurrentSet`). Practically: the Face ID/Touch ID
> sheet is real and the secret is unreadable without passing it — but the
> "invalidate the item if a fingerprint is added" property of `biometryCurrentSet`
> is NOT present (that needs the native shim noted at the end).
>
> **Simulator note:** the iOS Simulator can fake Face ID matches/non-matches
> (Features ▸ Face ID ▸ Enrolled / Matching Face / Non-matching Face), which is
> enough to verify the gate fires and fails closed. The *Keychain-binding*
> nuance above is only observable on a **real device** and only matters for the
> follow-up shim — there is nothing extra to see for it in the simulator.

## Setup

1. `npm install && npm run build`
2. `npx cap sync ios`
3. `npx cap open ios` → run on an iOS Simulator (e.g. iPhone 15).
4. In the Simulator: **Features ▸ Face ID ▸ Enrolled** (tick it).
5. Make sure the build is the **native** build, not the demo web build — the
   demo path uses a clearly-labelled *simulated* prompt, not the OS sheet.

## Test 1 — Happy path: one-tap Face ID → dashboard

1. First run: create or import a wallet; when offered, **enable Face ID unlock**
   and set a vault password you'll remember.
2. Lock the app (or fully relaunch from the app switcher).
3. On the entry screen you should see the **one-tap Face ID** button (no
   password typed yet). Tap it.
4. **Features ▸ Face ID ▸ Matching Face.**
5. ✅ Expect: you reach the dashboard.
   - You will see the OS Face ID sheet **twice** in quick succession (once to
     release the cached password, once inside the vault decrypt). Both should be
     satisfied by "Matching Face". This double sheet is **expected and disclosed**
     — it's the cost of OS-enforcing the cache without touching vault crypto.
     Choose "Matching Face" before each, or it will fail (see Test 2).

## Test 2 — Failure/cancel → password fallback, NO secret released, NO PIN

1. Lock / relaunch. Tap the one-tap Face ID button.
2. When the sheet appears: **Features ▸ Face ID ▸ Non-matching Face** (or tap
   **Cancel** on the sheet).
3. ✅ Expect:
   - You do **not** reach the dashboard.
   - The screen falls back to the **vault password field** with a message like
     "Biometric… cancelled. Unlock with your vault password below."
   - There is **no numeric PIN** and no other weaker path offered — the only
     way in is the real vault password.
4. Type the correct vault password → ✅ you reach the dashboard (the password is
   and always was the real key).
5. Type a wrong password → ✅ it is rejected exactly as before.

> What this proves: the cached password was **not** handed out when the
> biometric was refused — retrieval threw before the read. (Code-level: the unit
> test `biometricUnlock-native.test.js` asserts the store read never happens on a
> failed match; this manual step is the on-device confirmation.)

## Test 3 — Disable Face ID → cached secret is gone

1. Unlock → **Settings ▸ Security** → turn **Face ID unlock OFF**.
2. Lock / relaunch.
3. ✅ Expect: **no** one-tap Face ID button on the entry screen — only the vault
   password field. The cached secret was wiped on disable; nothing to release.

## Test 4 — Change password → stale secret cannot unlock

> **Password-cohort wallets only.** This test applies when the wallet was created
> with a **vault password** (not a PIN). For **PIN-cohort** wallets
> (`authModel = 'pin'`), `shouldCacheUnlockSecret()` returns `false` — the real
> PIN is never stored behind biometrics (by design; `WalletProvider.jsx:1226`),
> so one-tap Face ID does not unlock the real wallet and the one-tap button will
> not appear for it. PIN-cohort users who enabled biometric via `enableDecoyBiometricUnlock`
> will see Face ID route to the **decoy** wallet only — the real wallet is reachable
> by typing the real PIN. If you are testing with a PIN-cohort wallet and find the
> one-tap button absent after setup, that is correct behaviour, not a bug.

1. Re-enable Face ID unlock (Settings ▸ Security), confirm one-tap works (Test 1).
2. **Settings ▸ Security ▸ Change vault password** → set a new password.
3. Lock / relaunch → one-tap Face ID → Matching Face.
4. ✅ Expect: you reach the dashboard, and the wallet is the **same** wallet
   (same addresses). The cache now holds the NEW password; the old one is gone.
5. (Optional) Use the password fallback with the OLD password → ✅ rejected.

## Test 5 — Panic / reset → cached secret destroyed

1. With Face ID unlock enabled, trigger the **panic** path (panic PIN at unlock,
   or the in-app guarded wipe) — or do a full reset.
2. ✅ Expect after wipe: the one-tap Face ID button is gone; the cached password
   is no longer present (it is cleared on panic/reset alongside the key material).

## Pass criteria

- [ ] One-tap Face ID reaches the dashboard (Matching Face), showing the OS sheet
      (expected twice).
- [ ] A non-matching / cancelled biometric **never** unlocks and **never** reveals
      a way in other than the real vault password — no PIN, no weaker path.
- [ ] Disable / change-password / panic / reset each leave **no** releasable
      cached secret (no one-tap button; old secret unusable).
- [ ] The vault password always works as the fallback and remains the real key.

## Follow-up (out of scope for this PR)

True Keychain-level binding — `kSecAccessControlBiometryCurrentSet` on iOS and
`setUserAuthenticationRequired(true)` on Android Keystore — would make the item
*cryptographically* unreleasable by the OS itself (and auto-invalidate on
biometric enrolment changes). That requires a small native shim (the plugin
does not expose access-control flags) and a real-device test. See
`docs/M2cd.native-acl-plan.md`. This PR delivers the OS-enforced authenticate()
chokepoint, which is verifiable here and in unit tests today.
