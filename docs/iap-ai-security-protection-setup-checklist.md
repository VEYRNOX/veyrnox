# AI Security Protection IAP — external account setup checklist

> Standalone checklist for wiring the **AI Security Protection** in-app subscription
> to Apple / Google / RevenueCat without guessing identifiers in code. This tier sits
> **above** Safety Plus: users who buy it must keep all Free + Safety Plus access, and
> additionally unlock the live online TIP-backed Vigil chat.
>
> Status of the feature today: **BUILT / unit-tested only — NOT device-verified.** The
> client-side paywall is honest and fail-closed:
>
> - if the AI RevenueCat offering id is unset, the UI says the offering is not configured
> - if the offering exists but has no store packages, the UI says no store package is available
> - only a real active RevenueCat entitlement `ai_security_protection` resolves the paid tier
>
> Nothing here is "verified" until a real sandbox purchase + restore is confirmed on a device.

## ⚠️ Identifiers that MUST match the code exactly

Some values are fixed in code; others are intentionally left configurable because the repo
does not yet contain canonical live AI product ids. Keep the fixed ones exact, then choose
and document the store-side ids you want to standardize on.

| Thing | Value / rule | Where the code reads it |
|---|---|---|
| Entitlement identifier | **`ai_security_protection`** | `src/lib/purchases.js` `AI_SECURITY_PROTECTION_ENTITLEMENT`; checked in `src/lib/entitlement.js` and `src/lib/TierProvider.jsx` |
| RevenueCat offering id | env **`VITE_RC_AI_SECURITY_PROTECTION_OFFERING_ID`** | `src/lib/purchases.js` `getAiSecurityProtectionOfferingId()`; consumed by `src/pages/Subscription.jsx` |
| Monthly package id | **`$rc_monthly`** | standard RevenueCat package id; extracted in `Subscription.jsx` |
| Annual package id | **`$rc_annual`** | standard RevenueCat package id; extracted in `Subscription.jsx` |
| iOS public SDK key | env `VITE_REVENUECAT_APPLE_API_KEY` | `apiKeyForPlatform()` in `src/lib/purchases.js` |
| Android public SDK key | env `VITE_REVENUECAT_GOOGLE_API_KEY` | `apiKeyForPlatform()` in `src/lib/purchases.js` |
| Bundle / package id | `com.veyrnox.app` | native app id already used by the existing Safety Plus IAP setup |

> **Not hard-coded on purpose:** the actual AI monthly / annual product ids are **not**
> fixed in repo code today. Choose them store-side, then keep RevenueCat's AI offering
> pointed at those exact products. The app only requires that the offering named in
> `VITE_RC_AI_SECURITY_PROTECTION_OFFERING_ID` exposes `$rc_monthly` / `$rc_annual`.

## Recommended product naming

The code does not require these exact ids, but using a consistent pair keeps ops simple:

- iOS monthly: `ai_security_protection_monthly`
- iOS annual: `ai_security_protection_annual`
- Play monthly: `ai_security_protection_monthly`
- Play annual: `ai_security_protection_annual`

If Apple and Play must diverge for operational reasons, document the divergence here the
same way Safety Plus documents `safety_plus_monthly_v2` vs `safety_plus_monthly`.

## Subscription-group rule

Put AI Security Protection in the **same subscription group / ladder** as Safety Plus unless
you explicitly want users to manage two independent subscriptions.

Why:

- AI includes every Safety Plus feature
- users should be able to upgrade / downgrade cleanly between Safety Plus and AI
- separate groups risk duplicate subscriptions and confusing restore / manage behavior

If you keep them in separate groups, treat that as an explicit product decision and device-
verify crossgrade / restore behavior carefully before shipping.

## Order of operations

1. **App Store Connect** — create AI subscription products
2. **Google Play Console** — create AI subscription products / base plans
3. **RevenueCat** — create AI entitlement + offering + attach products
4. **Local env / rebuild** — set `VITE_RC_AI_SECURITY_PROTECTION_OFFERING_ID`, rebuild app
5. **Device verification** — sandbox purchase + restore on real devices

---

## Task 1 — App Store Connect (Apple)

- [ ] Open the Veyrnox app record in [App Store Connect](https://appstoreconnect.apple.com).
- [ ] Go to **Features → In-App Purchases and Subscriptions**.
- [ ] Add AI Security Protection to the **same subscription group as Safety Plus** unless a different grouping is a deliberate business decision.
- [ ] Create the **monthly auto-renewable subscription**:
  - Product ID: choose and record the canonical id (recommended `ai_security_protection_monthly`)
  - Reference name: `AI Security Protection Monthly`
  - Duration: 1 month
  - Price: choose the real price point
  - Add ≥1 localization (English) with customer-facing copy that matches the app:
    - Display name: `AI Security Protection`
    - Description: mention that it includes Safety Plus and unlocks live TIP-backed Vigil answers
- [ ] Create the **annual auto-renewable subscription** if annual billing will be offered:
  - Product ID: choose and record the canonical id (recommended `ai_security_protection_annual`)
  - Reference name: `AI Security Protection Annual`
  - Duration: 1 year
  - Price: choose the real annual price point
  - Add localization matching the monthly product
- [ ] Leave them in sandbox-testable state; they do **not** need to be fully live to validate purchases in sandbox.

## Task 2 — Google Play Console (Google)

- [ ] Open the Veyrnox app in [Google Play Console](https://play.google.com/console).
- [ ] Go to **Monetize → Products → Subscriptions**.
- [ ] Create the **monthly** AI subscription:
  - Product ID: choose and record the canonical id (recommended `ai_security_protection_monthly`)
  - Name: `AI Security Protection Monthly`
  - Base plan: auto-renewing, 1 month, real chosen price
- [ ] Create the **annual** AI subscription if annual billing will be offered:
  - Product ID: choose and record the canonical id (recommended `ai_security_protection_annual`)
  - Name: `AI Security Protection Annual`
  - Base plan: auto-renewing, 1 year, real chosen price
- [ ] Keep the AI subscription on the same internal / closed testing track as Safety Plus while validating.
- [ ] Confirm RevenueCat's Play service account already has the required permissions:
  - **Financial data**
  - **Manage orders and subscriptions**

## Task 3 — RevenueCat dashboard

- [ ] Open the existing Veyrnox RevenueCat project.
- [ ] Create one **Entitlement** with identifier **`ai_security_protection`**.
  - This must match code exactly.
- [ ] Attach the AI monthly and annual store products to that entitlement.
- [ ] Create one **Offering** for the AI plan.
  - Choose the offering identifier you want to standardize on, then put that exact string into `VITE_RC_AI_SECURITY_PROTECTION_OFFERING_ID`.
  - Recommended offering id: `ai-security-protection`
- [ ] Add packages to the AI offering:
  - `$rc_monthly` → AI monthly product
  - `$rc_annual` → AI annual product, if annual exists
- [ ] Confirm the offering is visible in RevenueCat's offering list and the packages resolve under that offering.

> The app reads the AI plan via `getTierOffering(aiOfferingId)` rather than `getOfferings().current`.
> That means the AI tier can coexist beside Safety Plus's `default` offering cleanly.

## Task 4 — local env and rebuild

- [ ] Set the RevenueCat public SDK keys in `.env.local` if not already present:

```bash
VITE_REVENUECAT_APPLE_API_KEY=<appl_public_key>
VITE_REVENUECAT_GOOGLE_API_KEY=<goog_public_key>
```

- [ ] Add the AI offering id:

```bash
VITE_RC_AI_SECURITY_PROTECTION_OFFERING_ID=<exact_revenuecat_ai_offering_id>
```

- [ ] Rebuild the native apps **after** setting the env vars.

Why rebuild matters:

- `import.meta.env` is inlined at build time
- setting the env var after the binary is already built will not update the installed app

## Task 5 — device verification

These are the checks needed before the feature can honestly be called device-verified.

- [ ] iOS sandbox monthly AI purchase succeeds and `currentTier` resolves to `ai_security_protection`
- [ ] iOS sandbox annual AI purchase succeeds, if annual exists
- [ ] Android internal-testing monthly AI purchase succeeds and resolves to `ai_security_protection`
- [ ] Android internal-testing annual AI purchase succeeds, if annual exists
- [ ] Restore purchases on both platforms shows **`AI Security Protection restored`**
- [ ] Existing Safety Plus features remain accessible under the AI tier
- [ ] Advisor behavior matches plan rules:
  - Free → local / offline only
  - Safety Plus → local / offline only
  - AI Security Protection → online TIP-backed Vigil chat allowed
- [ ] Deniability / demo sessions still suppress RevenueCat egress and do **not** surface a paid tier
- [ ] Manage subscription opens the correct OS subscriptions surface on both platforms

## Honest launch blockers

Do **not** mark the AI subscription setup complete if any of these are still true:

- `VITE_RC_AI_SECURITY_PROTECTION_OFFERING_ID` is blank in the build under test
- the AI RevenueCat offering exists but has no `$rc_monthly` / `$rc_annual` packages attached
- the store product is purchasable but the entitlement is not `ai_security_protection`
- AI purchase succeeds in the store sheet but `refreshTier()` still resolves `free`
- restore works only for Safety Plus and not for AI on a real device

## Notes on what this checklist does NOT cover

This checklist is intentionally limited to the **subscription / paywall lane**.

It does **not** cover:

- AI-specific referral discounts or referral offerings
- AI plan price cents for referral attribution math
- App Store / Play promotional-offer setup for AI referral tiers

Those belong in the separate **AI Security Protection Referral** task.
