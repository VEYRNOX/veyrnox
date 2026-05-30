# Mobile Phase — Capacitor Wrap + Native Secure Storage (DESIGN DOC)

> Goal: ship the wallet as native iOS (App Store) and Android (Play Store) apps
> WHILE keeping the desktop web app, from ONE React codebase.
>
> Approach chosen: **Capacitor** (wrap the existing Vite/React app as native),
> NOT a React Native rewrite — so web + mobile share one UI/codebase. The ONE
> part that must NOT be a naive wrap is key storage: on mobile it moves to the
> hardware-backed Secure Enclave / Android Keystore.
>
> Status gate unchanged: testnet-only, mainnet gated, independent audit before
> real funds. The mobile secure-storage layer is itself security-critical and
> must be in the audit scope.

---

## Why Capacitor (not React Native)

- You already have a working Vite/React app (Phases A–C). Capacitor loads that
  same web build inside a native shell, exposing native APIs via plugins. One
  codebase → web + iOS + Android. A React Native rewrite would fork the UI and
  double maintenance for a small team.
- Trade-off accepted: Capacitor apps run the UI in a webview. That's fine for a
  wallet UI, BUT key material must NOT live in webview/IndexedDB on mobile —
  see secure storage below. The crypto core (BIP-39/derivation/signing) is
  portable JS and runs unchanged; only STORAGE and UNLOCK go native.

---

## The one hard part: native secure key storage

On web, the vault is Argon2id + AES-GCM in IndexedDB (fine for browser). On
mobile, app reviewers and good security practice require hardware-backed
storage. This is also a SECURITY UPGRADE over web.

Requirements:
- **iOS:** store the vault-encryption key (or the vault) in the **Secure
  Enclave / Keychain** with access control; gate unlock with **Face ID / Touch
  ID** (LocalAuthentication). The private key/seed is never written to webview
  storage.
- **Android:** use the **Android Keystore / StrongBox** (hardware-backed where
  available); gate unlock with **BiometricPrompt**.
- **Architecture:** a platform abstraction — `vaultStore` stays the interface;
  swap the implementation per platform:
    - web  → existing IndexedDB + Argon2id (unchanged)
    - native → Keychain/Keystore-backed via a Capacitor secure-storage plugin
      (e.g. a vetted biometric/secure-storage plugin), with biometric gating.
- **Invariant:** seed/private keys never cross into the webview's JS heap longer
  than a signing operation needs, and are never persisted in webview storage on
  native. Signing still happens locally; keys never leave the device.

This abstraction is the bulk of the mobile-specific engineering. Everything
else is wrapping + store plumbing.

---

## Store-policy constraints baked into the plan (verified, both stores)

These shape WHAT ships, not just how. Researched against Apple's App Store
Review Guidelines (3.1.5(b)) and Google Play's Cryptocurrency Exchanges and
Software Wallets policy (enforced from 29 Oct 2025). RE-VERIFY at submission —
both stores have changed these rules recently.

### The single most important finding: stay NON-CUSTODIAL
- **Google Play:** crypto wallet/exchange apps must hold financial licenses in
  ~15+ major markets (US: FinCEN MSB + state money-transmitter licenses; EU:
  MiCA CASP authorisation; UK: FCA; etc.) — BUT **non-custodial (self-custody)
  wallets are EXPLICITLY OUT OF SCOPE / EXEMPT.** Veyrnox is self-custody (keys
  on device, never custodied), so it falls in the exempt lane on Google Play.
- **Apple:** permits wallet storage for ORG-enrolled developers; exchange/
  transmission features require regional licensing (3.1.5(b)(iii)).
- **THE LINE YOU MUST NOT CROSS:** the exemption/approvability holds ONLY while
  the app stays non-custodial and free of exchange/swap/transmission services.
  Adding DEX swap / DeFi / on-ramp / custodial features can pull the app INTO
  the licensed-exchange category on BOTH stores — triggering FinCEN/MiCA/FCA
  licensing (financially and operationally enormous) and, on Apple, the ~40%
  rejection rate. Same boundary as the Phase D caution, now backed by both
  stores' written policies. Defer all of it past v1.
- **NOT legal advice:** "non-custodial = exempt" is the stores' stated position,
  but for a build-to-sell product, have a lawyer confirm the design stays
  outside MSB/MiCA/MTL scope in target markets BEFORE adding anything that
  touches swaps or fund transmission.

### The rest

1. **Organization developer account required (Apple).** Apple permits crypto
   wallets only from developers enrolled as an ORGANIZATION (legal entity /
   D-U-N-S), not an individual account. Non-code blocker: set up the legal
   entity + Apple org enrollment early; it gates iOS submission. (Google's
   licensing exemption for non-custodial removes the equivalent Play blocker,
   but a proper org Play Console account is still advisable.)

2. **Ship STORAGE-ONLY, NON-CUSTODIAL first.** The initial mobile release is
   send / receive / store across the EVM chains — nothing that exchanges,
   swaps, or custodies funds. NO swap/DEX/DeFi/WalletConnect/on-ramp in v1.
   This keeps Google's exemption intact and stays in Apple's approvable lane.
   Higher-risk features come later, separately, with their own legal groundwork.

3. **Be conservative with storefronts/regions.** Only select regions you can
   support. Over-broad region selection invites licensing-evidence rejections
   (Apple) and, if you ever add custodial features, per-market licensing (both).

4. **Subscriptions via store billing, NOT Wix/Stripe, on mobile.** Apple/Google
   require IN-APP PURCHASE for unlocking features/subscriptions; you may not use
   your own payment mechanism, and crypto can't be the payment rail. The tier
   model on mobile must use Apple IAP / Google Play Billing (each takes a cut).
   Web can keep its own billing (Wix/Stripe); mobile cannot. Plan the tier
   system to support both rails. (This answers the earlier Wix question: Wix
   stays for WEB billing; mobile tiers go through store IAP.)

5. **Reviewers look for:** Secure Enclave/Keystore key storage, biometric auth
   for transaction authorisation, clear risk disclosures. The secure-storage
   work above directly satisfies this — and being non-custodial with
   hardware-backed keys is the strongest, most approvable posture on both stores.

---

## Implementation outline

### M1 — Capacitor shell, testnet, storage-only, web vault still
- Add Capacitor to the existing app; produce iOS + Android builds of the current
  web UI. Confirm the EVM send/receive/balance flows run in the native shell on
  a device/simulator (testnet).
- Web build unaffected (Capacitor is additive).

### M2 — Native secure storage + biometrics (the core mobile work)
- Implement the platform `vaultStore` abstraction; wire Keychain/Secure Enclave
  (iOS) and Keystore/StrongBox (Android) with biometric unlock.
- Keep web IndexedDB path unchanged. Tests + manual device verification that
  keys never touch webview storage on native.

### M3 — Store-submission hardening
- Risk disclosures, privacy manifest / data-safety forms, app metadata.
- IAP / Play Billing for the tier subscriptions (mobile rail).
- Conservative storefront/region selection; compliance docs ready.

### M4 — Submit (storage-only v1) → iterate
- Org account submission; expect review back-and-forth (wallets are scrutinised;
  budget 1–2+ weeks and possible rejections).

Each Mn: own branch, own review. M2 is security-critical → in the audit scope.

---

## What explicitly stays OUT of mobile v1
DEX swaps, DeFi, WalletConnect/dApp signing, on/off-ramp, BTC/SOL (unless those
EVM-only phases are done and you choose to include). These add licensing,
review risk, and audit surface — add post-approval, deliberately.

---

## Non-code workstreams to start in parallel (these gate launch as much as code)
- [ ] Legal entity + Apple **organization** Developer enrollment (D-U-N-S).
- [ ] Google Play Console org account.
- [ ] Decide supported regions. NOTE: as a NON-CUSTODIAL wallet you are currently
      exempt from Google's crypto licensing and outside Apple's exchange-licensing
      requirement — so NO MSB/MiCA/FCA licenses needed for v1. Keep a written
      record of the non-custodial design rationale in case a reviewer questions it.
- [ ] Lawyer review confirming the non-custodial design stays outside
      MSB/MiCA/MTL scope in target markets (cheap insurance for build-to-sell;
      becomes essential the moment any swap/transmission feature is considered).
- [ ] IAP/Play Billing plan for the tier subscriptions (vs. web's Wix/Stripe).
- [ ] Risk-disclosure + privacy/data-safety content.
- [ ] Confirm current Apple 3.1.5(b) and Google crypto-wallet policies at submit
      time (policies change — re-verify, do not assume this doc is current).

---

## Verification gates (in addition to the standard checklist)
- [ ] Keys stored ONLY in Secure Enclave/Keychain (iOS) / Keystore (Android) on
      native — never in webview/IndexedDB on device (grep + device inspection).
- [ ] Biometric gate required to unlock / authorise a send.
- [ ] Web vault path unchanged and still passing its tests.
- [ ] Crypto core byte-identical across web/native (same derivation/signing).
- [ ] Storage-only: no swap/DEX/DeFi/WalletConnect in the shipped v1 bundle.
- [ ] Mainnet still gated; testnet build for all pre-audit testing.
- [ ] Mobile secure-storage layer added to the independent-audit scope.
