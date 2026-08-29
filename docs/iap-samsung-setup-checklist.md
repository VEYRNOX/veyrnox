# Samsung Galaxy Store IAP — Safety Plus + AI Security Protection checklist

> Standalone checklist for wiring the Samsung flavor of Veyrnox to real Galaxy
> Store subscriptions through RevenueCat Samsung billing.
>
> Scope of this checklist:
> - Safety Plus base subscription
> - AI Security Protection base subscription
> - RevenueCat Samsung app / offerings / entitlements
> - Samsung coupon / promotion setup for testers and launch discounts
> - Samsung store-listing asset reuse from Google Play where format/policy allows
> - Samsung-flavor build config needed for device testing
>
> Out of scope on purpose:
> - AI referral tiers
> - Safety Plus referral tiers
> - Samsung cancel-save / retention offers wired through app `offerTag`
>
> Honest status on August 22, 2026:
> - Samsung Galaxy Store billing is **BUILT** in the repo.
> - The Samsung flavor uses RevenueCat's Galaxy store module and its own public SDK key.
> - Base Safety Plus / AI offerings can be wired through RevenueCat.
> - Samsung tagged offers are still **fail-closed in code** today: `src/lib/purchases/samsungPurchases.js`
>   rejects `offerTag` purchases with `OFFER_UNAVAILABLE`, so referral and retention
>   pricing should not be treated as live on Samsung yet.
> - Nothing here is device-verified until a real Samsung-flavor build completes a
>   sandbox-style purchase + restore on a physical Galaxy device.

## Exact values the code already expects

| Thing | Value / rule | Where the code reads it |
|---|---|---|
| Samsung public SDK key | `VITE_REVENUECAT_SAMSUNG_API_KEY` | `src/lib/purchases/samsungPurchases.js` |
| Samsung flavor selector | `VITE_STORE_FLAVOR=samsung` | `src/lib/purchases.js` |
| Samsung billing mode | `VITE_SAMSUNG_BILLING_MODE` optional override | `src/lib/purchases/samsungPurchases.js` |
| Safety Plus entitlement | `safety_plus` | `src/lib/purchases/shared.js`, `src/lib/entitlement.js` |
| AI entitlement | `ai_security_protection` | `src/lib/purchases/shared.js`, `src/lib/entitlement.js` |
| Safety Plus current offering | `default` marked current | `getOfferings().current` |
| Safety Plus monthly package | `$rc_monthly` | `src/lib/purchases/shared.js` |
| Safety Plus annual package | `$rc_annual` | `src/lib/purchases/shared.js` |
| AI offering id | env `VITE_RC_AI_SECURITY_PROTECTION_OFFERING_ID` | `getAiSecurityProtectionOfferingId()` |
| Bundle / package id | `com.veyrnox.app` | native app id |

## Recommended Samsung product naming

The Samsung code path does not hard-code product ids the way Huawei does, but
keeping the Galaxy Store products aligned with Play / AI naming reduces dashboard
drift and makes RevenueCat wiring much easier to audit.

- Safety Plus monthly: `safety_plus_monthly`
- Safety Plus annual: `safety_plus_annual`
- AI monthly: `ai_security_protection_monthly`
- AI annual: `ai_security_protection_annual`

## Important honesty boundary

Samsung base subscriptions can mirror Apple / Google at the RevenueCat offering
level, but Samsung **offer-tag** purchases are not live yet:

- `purchasePackage(pkg, { offerTag })` in [samsungPurchases.js](/Users/aljobson/Documents/GitHub/veyrnox/src/lib/purchases/samsungPurchases.js:1)
  intentionally throws `OFFER_UNAVAILABLE`
- that means no Samsung referral-tier or retention checkout should be called "set up"
  from code's point of view yet

So for Samsung, the safe target today is:

- Safety Plus monthly + annual base subscriptions
- AI Security Protection monthly + annual base subscriptions
- matching entitlements + offerings in RevenueCat
- store-level coupons / subscription discounts managed by Galaxy Store itself

## Samsung "promo code" equivalent

Samsung's equivalent to Apple / Google promo-code style distribution is **Galaxy
Store coupons**, issued from Seller Portal.

Based on Samsung's current docs:

- Seller Portal's **Promotion** area supports **discounts** and **coupons**
- Galaxy Store users can register coupons under **Coupons and gift cards**
- registered coupons can be used on **paid app and in-app item purchases**
- subscription products also support **Introductory Price** / discounted periods
  in the subscription setup flow

For Veyrnox that means:

- use **coupons** when you want manually distributed tester / campaign codes
- use **subscription introductory pricing / discount periods** when you want a
  store-managed discounted subscription offer

It is not the same product surface name as Apple offer codes or Google promo
codes, so write it down as **Samsung coupons / subscription discounts**, not as
"promo codes" if you want the team to find the right Seller Portal screens.

## Order of operations

1. Samsung Seller Portal / Galaxy Store products
2. Samsung store-listing assets
3. RevenueCat Samsung app + entitlements + offerings
4. Local Samsung-flavor env and rebuild
5. Physical Samsung device verification

## Task 1 — Samsung Seller Portal / Galaxy Store

- [ ] Open the Samsung Seller Portal / Galaxy Store app record for package `com.veyrnox.app`
- [ ] Create the Safety Plus monthly subscription product
  - Product ID: `safety_plus_monthly`
  - Customer-facing name: `Safety Plus Monthly`
  - Billing period: 1 month
  - Price: real chosen monthly price
- [ ] Create the Safety Plus annual subscription product
  - Product ID: `safety_plus_annual`
  - Customer-facing name: `Safety Plus Annual`
  - Billing period: 1 year
  - Price: real chosen annual price
- [ ] Create the AI Security Protection monthly subscription product
  - Product ID: `ai_security_protection_monthly`
  - Customer-facing name: `AI Security Protection Monthly`
  - Billing period: 1 month
  - Price: real chosen monthly price
- [ ] Create the AI Security Protection annual subscription product
  - Product ID: `ai_security_protection_annual`
  - Customer-facing name: `AI Security Protection Annual`
  - Billing period: 1 year
  - Price: real chosen annual price
- [ ] Keep a written record of the final Galaxy Store product ids if Samsung forces any divergence
- [ ] For each subscription, decide whether you also need:
  - standard paid pricing only
  - an introductory discounted subscription price
  - coupon-driven tester / campaign distribution

## Task 1b — Samsung coupons and subscription promotions

- [ ] In Seller Portal, open **Promotion**
- [ ] Create **coupons** for paid content if you want Samsung's tester-facing
  promo-code equivalent
- [ ] Record the exact campaign/coupon names, discount values, eligible products,
  start date, and expiry date
- [ ] If you want a subscription-specific discounted period instead of a coupon,
  configure it inside the subscription's **Price** flow using Samsung's
  **Introductory Price** option
- [ ] Keep a written mapping of which coupon / discount applies to:
  - `safety_plus_monthly`
  - `safety_plus_annual`
  - `ai_security_protection_monthly`
  - `ai_security_protection_annual`
- [ ] If Korea is in scope, add an in-app note for discounted subscription offers:
  Samsung's 2025 policy says users must consent to automatic recurring payments
  before the discounted/free period ends

## Task 1c — Reuse the Google Play photos on Samsung

- [ ] Use the same screenshots / photos already approved for Google Play as the
  default Samsung Galaxy Store visuals
- [ ] Source the approved copy/metadata from:
  - [docs/play-launch/store-listing.md](/Users/aljobson/Documents/GitHub/veyrnox/docs/play-launch/store-listing.md:1)
  - [store-metadata](/Users/aljobson/Documents/GitHub/veyrnox/store-metadata)
- [ ] Keep the same visual ordering and plan messaging for Samsung unless Samsung
  rejects a size, crop, or policy detail
- [ ] If Samsung requires different dimensions, export resized versions from the
  same Google-approved source images rather than introducing new creative
- [ ] Re-check the screenshots for UK financial-promotion compliance before upload
  so no Samsung listing asset implies UK users can buy crypto if the in-app buy
  path remains geo-blocked there
- [ ] Record any Samsung-only asset deviation in this checklist so Apple / Google /
  Samsung do not silently drift apart

## Task 2 — RevenueCat Samsung setup

- [ ] Open the existing Veyrnox RevenueCat project
- [ ] Confirm there is a Samsung / Galaxy app configured for package `com.veyrnox.app`
- [ ] Copy the Samsung public SDK key into `VITE_REVENUECAT_SAMSUNG_API_KEY`
- [ ] Confirm Safety Plus entitlement exists as `safety_plus`
- [ ] Attach Samsung `safety_plus_monthly` and `safety_plus_annual` to `safety_plus`
- [ ] Confirm the current `default` offering contains:
  - `$rc_monthly` → Samsung Safety Plus monthly product
  - `$rc_annual` → Samsung Safety Plus annual product
- [ ] Confirm AI entitlement exists as `ai_security_protection`
- [ ] Attach Samsung `ai_security_protection_monthly` and `ai_security_protection_annual` to `ai_security_protection`
- [ ] Create or confirm the base AI offering whose identifier exactly matches `VITE_RC_AI_SECURITY_PROTECTION_OFFERING_ID`
- [ ] Confirm the AI offering contains:
  - `$rc_monthly` → Samsung AI monthly product
  - `$rc_annual` → Samsung AI annual product

## Task 3 — Samsung-flavor env and build

- [ ] Set Samsung flavor env in `.env.local`

```bash
VITE_STORE_FLAVOR=samsung
VITE_REVENUECAT_SAMSUNG_API_KEY=<samsung_public_sdk_key>
VITE_RC_AI_SECURITY_PROTECTION_OFFERING_ID=<exact_ai_offering_id>
```

- [ ] Optional during pre-release validation: set `VITE_SAMSUNG_BILLING_MODE=TEST`
- [ ] Rebuild the Samsung flavor after changing env vars

## Task 4 — Physical Samsung verification

- [ ] Install a Samsung-flavor build on a physical Samsung device
- [ ] Safety Plus monthly purchase succeeds and resolves tier `safety_plus`
- [ ] Safety Plus annual purchase succeeds and resolves tier `safety_plus`
- [ ] AI monthly purchase succeeds and resolves tier `ai_security_protection`
- [ ] AI annual purchase succeeds and resolves tier `ai_security_protection`
- [ ] Restore purchases works for both paid tiers
- [ ] AI tier still unlocks all Safety Plus features
- [ ] Manage subscription opens `https://galaxystore.samsung.com/mypage/subscriptions`
- [ ] A Samsung-issued coupon can actually be registered and applied in Galaxy Store checkout
- [ ] If introductory subscription pricing is configured, the discounted checkout
  path appears on device and still resolves the correct entitlement afterward
- [ ] Deniability / demo sessions still suppress paid-tier resolution and purchase egress as designed

## Do not mark Samsung complete if any of these are still true

- `VITE_STORE_FLAVOR` is not `samsung` in the build under test
- `VITE_REVENUECAT_SAMSUNG_API_KEY` is blank in the build under test
- the AI offering id is blank, so the AI card stays honest-disabled
- a Samsung store purchase succeeds but `refreshTier()` still resolves `free`
- restore works for Safety Plus but not AI, or vice versa
- any referral-tier or retention purchase path is claimed live on Samsung
  while `offerTag` still fails closed in `samsungPurchases.js`

## Related docs

- [Safety Plus checklist](/Users/aljobson/Documents/GitHub/veyrnox/docs/iap-safety-plus-setup-checklist.md:1)
- [AI Security Protection checklist](/Users/aljobson/Documents/GitHub/veyrnox/docs/iap-ai-security-protection-setup-checklist.md:1)
- [Referral-tier checklist](/Users/aljobson/Documents/GitHub/veyrnox/docs/iap-referral-tier-setup-checklist.md:1)

## Source notes

Samsung sources used for this checklist:

- Samsung Seller Portal overview: Promotion supports discounts and coupons
- Samsung support article: registered coupons can be used on paid app and in-app item purchases
- Samsung subscription guide: subscription setup includes Introductory Price and discounted periods
- Samsung 2025 subscription notice: discounted/free subscription offers in Korea require
  automatic-payment consent before the offer ends
