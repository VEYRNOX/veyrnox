# Subscription entitlement matrix

Status: **BUILT** (unit-tested). Nothing here is device-verified; the checklist at the end
still needs real StoreKit / Play Billing runs. Written 2026-09-30 against `origin/main` c33e523a.

Tier resolution: `src/lib/entitlement.js:resolveTier()` returns `free | safety_plus |
ai_security_protection`. Web, deniability and demo sessions always resolve to `free`. Any
resolver error resolves to `free` (fail closed for premium features only).

## What never depends on the subscription

| Capability | Evidence |
|---|---|
| Unlock, view balances, receive, sign, send | No `useTier` in `WalletProvider.jsx`; `presignGate` takes the RASP tier, not the subscription tier (`SendCrypto.jsx`) |
| Restore from 2 valid Shamir shares (onboarding) | `/onboarding/restore-shares` is outside `FeatureGate`; `RestoreFromShares.jsx` has no tier reference |
| Restore from an existing encrypted backup file | `RestoreFromFile.jsx` has no tier reference; also the in-app Restore tab |
| Using an existing Emergency PIN / decoy at unlock | Unlock path has no tier check |
| Removing an Emergency PIN | Route no longer gated; removal card renders on every tier |
| KEK, RASP, WalletConnect, biometrics, baseline anti-phishing | Free tier |

## Per state

Lifecycle states are read from RevenueCat customer info by `src/lib/subscriptionState.js`
and shown on /plans and in Settings. They are DISPLAY ONLY; gating is unchanged.

| Capability | Free | Safety Plus | AI Security Protection | Cancelled, until period end | Billing retry / grace | Expired |
|---|---|---|---|---|---|---|
| Wallet, balances, receive, send | yes | yes | yes | yes | yes | yes |
| Restore from existing shares / backup file | yes | yes | yes | yes | yes | yes |
| Create Shamir shares | no | yes | yes | yes (tier still active) | store-dependent | no |
| Create new encrypted backup file | no | yes | yes | yes | store-dependent | no |
| Set / change Emergency PIN, decoy | no | yes | yes | yes | store-dependent | no |
| Remove Emergency PIN | yes | yes | yes | yes | yes | yes |
| Use already-configured Emergency PIN / decoy | yes | yes | yes | yes | yes | yes |
| Stealth wallets, panic wipe, hardware wallet, budget, audit log, anomaly, analytics | no | yes | yes | yes | store-dependent | no |
| Live threat intel, AI advisor, trust score, suspicious-asset screening | no | no | yes | yes (if AI) | store-dependent | no |

Status rules: `billingIssueDetectedAt` set = billing retry; else `willRenew === false` =
cancelled; else active; nothing active but a previously paid record = expired. "Store-dependent"
means RevenueCat keeps the entitlement active while the store retries, so the gate follows
whatever RevenueCat reports.

## Known gaps (tracked, not hidden)

1. **Panic wipe stays Safety Plus after expiry.** It is a premium action, not existing
   recovery material, so it was not un-gated. A lapsed user loses it. Owner decision needed
   if this should be free (it is a safety capability).
2. **No persisted last-known tier for gating, on purpose.** A self-editable local value that
   keeps premium features on is a self-upgrade hole. If the store lookup throws, gated screens
   show the paywall until it recovers; wallet access is unaffected. Continuity offline is
   RevenueCat's own SDK cache (not verified on device). Only a display-only record (last paid
   tier + expiry, key `veyrnox-last-paid-sub`) is kept, to word the "expired" message; it is
   never written in deniability/demo and is in panic.js `ALL_RESIDUE_KEYS`.
3. **A store outage is never shown as "expired".** Expired needs RevenueCat to answer with
   nothing active.
4. **No intro-offer eligibility check exists**, so no intro-offer copy is shown.
5. **Four Safety Plus features are advertised but not gated** (calldata decode, address-poisoning
   warnings, risk scoring, transaction simulation): they live inside Send (`tier.js` header).
   The comparison table deliberately does not list them.
6. The app calls the file backup "Encrypted Personal Backup"; the handover's "Personal Vault"
   wording is not used in the UI. Copy uses "Personal Backup".
7. Paywall strings are hard-coded English (not in the i18n catalogue), as before.

## Verification still owed (real devices)

The 14-point list in the handover (purchase, cancel, expiry, billing retry, restore on a new
device, store unavailable, recovery after expiry, localised price, screen reader) has not been
run. Until it is, everything above is BUILT, not verified.
