# IAP Review Notes — App Store Connect

Per-subscription review notes pasted into ASC → Monetization → Subscriptions → `<sku>` → **App Review Information** → **Review Notes**.

Kept in sync with the copy in ASC. When ASC copy changes, update this file so the git history reflects what a reviewer was told.

App-level review notes (different surface) live in [`app-store-submission-copy.md`](./app-store-submission-copy.md).

---

## Safety Plus (`safety_plus_monthly_v2`, `safety_plus_annual`)

```
Veyrnox is a self-custody crypto wallet. No account, login, or demo credentials are required to review the app or test this subscription.

To reach the Safety Plus subscription:
1. Launch the app and tap "Create or import" to set up a local wallet (choose any PIN; no personal data is collected).
2. Open the menu and tap "Plans".
3. The Safety Plus paywall shows Monthly ($5.99) and Annual ($49.99) options. Tap "Upgrade to Safety Plus" to begin the StoreKit purchase.

Safety Plus unlocks advanced on-device security and analytics features. The entitlement is verified via RevenueCat; no wallet address, balance, or private key material is ever transmitted. This is a non-custodial wallet, so some features (e.g. Duress PIN) are privacy/safety tools rather than account functionality.
```

---

## AI Security Protection (`ai_security_protection_monthly_2`, `ai_security_protection_annual_2`)

```
Veyrnox is a self-custody crypto wallet. No account, login, or demo credentials are required to review the app or test this subscription.

To reach the AI Security Protection subscription:
1. Launch the app and tap "Create or import" to set up a local wallet (choose any PIN; no personal data is collected).
2. Open the menu and tap "Plans".
3. Scroll to the AI Security Protection card (below Safety Plus). Monthly and Annual options are shown. Tap "Subscribe" to begin the StoreKit purchase.

AI Security Protection unlocks Vigil, Veyrnox's live online AI security advisor, plus every feature in the Safety Plus tier. Vigil answers security questions in real time via our Threat Intelligence Platform (TIP); without this subscription (or Safety Plus) the Vigil drawer answers from a local, offline knowledge base only. The entitlement is verified via RevenueCat; no wallet address, balance, or private key material is ever transmitted. This is a non-custodial wallet, so some features (e.g. Duress PIN, panic wipe) are privacy/safety tools rather than account functionality.
```
