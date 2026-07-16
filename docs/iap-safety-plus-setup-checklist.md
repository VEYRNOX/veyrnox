# Safety Plus IAP — external account setup checklist (Phase A)

> Standalone, do-this-first checklist for wiring the Safety Plus in-app subscription
> to real stores. No code — this configures Apple / Google / RevenueCat to use the
> **exact identifiers the shipped code already expects**. Extracted from
> `docs/superpowers/plans/2026-07-06-iap-subscription-stitching.md` (Phase A) so it
> isn't buried in the plan. When these three tasks are done, the device-verification
> runbook (that plan's **Task 15**) can be run to move the feature from **BUILT** to
> **device-verified**.
>
> Status of the feature today: **BUILT / unit-tested only — NOT device-verified.** The
> code is fail-closed with no keys (everyone resolves `free`); nothing here is live until
> this setup + a real sandbox purchase is done on a device.

## ⚠️ Identifiers that MUST match the code exactly

A single character of drift here means "the purchase succeeds but nothing unlocks." These are hard-coded in the app — configure the dashboards to match, do **not** change the code:

| Thing | Value (exact) | Where the code reads it |
|---|---|---|
| Entitlement identifier | `safety_plus` | `src/lib/purchases.js` `SAFETY_PLUS_ENTITLEMENT`; checked in `src/lib/entitlement.js` (`entitlements.active['safety_plus']`) |
| Monthly product identifier (both stores) | `safety_plus_monthly` | attached to the entitlement + the current offering |
| Annual product identifier (both stores) | `safety_plus_annual` | attached to the SAME `safety_plus` entitlement + the current offering |
| Offering | `default`, marked **current** | `getOfferings().current` (`src/lib/purchases.js`) |
| Monthly package | `$rc_monthly` | RevenueCat standard monthly package; `SAFETY_PLUS_MONTHLY_PACKAGE` in `purchases.js` |
| Annual package | `$rc_annual` | RevenueCat standard annual package; `SAFETY_PLUS_ANNUAL_PACKAGE` in `purchases.js` |
| Bundle / package id | `com.veyrnox.app` | `capacitor.config.ts` `appId` |
| iOS public SDK key | env `VITE_REVENUECAT_APPLE_API_KEY` | `apiKeyForPlatform()` (`purchases.js`) |
| Android public SDK key | env `VITE_REVENUECAT_GOOGLE_API_KEY` | `apiKeyForPlatform()` (`purchases.js`) |
| Monthly price | $5.99/mo | store-set; `priceString` returned by RevenueCat is the source of truth in the UI |
| Annual price | $49.99/yr (~30% off; ~$4.17/mo effective, "4 months free") | store-set; `priceString` returned by RevenueCat is the source of truth in the UI |
| Safety Plus display description | *"Advanced analytics and premium insights — go deeper on your portfolio."* | current tagline, `src/lib/tier.js` (Safety Plus now gates **analytics only** — all safety/anti-fraud controls are FREE, per PR #672) |

> **Keys are public, not secret.** The `VITE_REVENUECAT_*` app-specific keys are safe to
> ship in the client bundle (RevenueCat treats them as public). The **secret/server** key
> must never appear in `.env.local`, `.env.example`, or anywhere in this repo. Apple's
> Shared Secret is also NOT needed (RevenueCat does server-side receipt validation via its
> own App Store Connect API key).

## Order of operations

Do them in order — Task 3 (RevenueCat) needs artifacts produced by Tasks 1 and 2.

1. **App Store Connect** — create the subscription product (Task 1)
2. **Google Play Console** — create the subscription product (Task 2)
3. **RevenueCat** — project, entitlement, offering, keys (Task 3)

---

## Task 1 — App Store Connect (Apple)

- [ ] Open the Veyrnox app record in [App Store Connect](https://appstoreconnect.apple.com) (create it with bundle id `com.veyrnox.app` if it doesn't exist).
- [ ] **Features → In-App Purchases and Subscriptions** → create a **Subscription Group** named `Safety Plus`.
- [ ] Inside the group, create the **monthly auto-renewable subscription**:
  - Product ID: **`safety_plus_monthly`** (exact — hard-coded).
  - Reference name: `Safety Plus Monthly`.
  - Duration: 1 month.
  - Price: $5.99 USD (Apple auto-generates localized tiers).
  - Add ≥1 localization (English): display name `Safety Plus`, description *"Advanced analytics and premium insights — go deeper on your portfolio."*
- [ ] Inside the SAME subscription group, create the **annual auto-renewable subscription**:
  - Product ID: **`safety_plus_annual`** (exact — hard-coded).
  - Reference name: `Safety Plus Annual`.
  - Duration: 1 year.
  - Price: $49.99 USD (~30% off equivalent 12 × monthly; effective ~$4.17/mo).
  - Add ≥1 localization (English): display name `Safety Plus (Annual)`, description *"Advanced analytics and premium insights — 4 months free vs. monthly."*
  - Keeping monthly and annual in the SAME subscription group lets Apple show them as the two rungs of a single subscription and lets users upgrade/downgrade without cancelling first.
- [ ] Leave both in "Ready to Submit" / "Missing Metadata" — they do **not** need to be live to work in sandbox.
- [ ] Do **not** record an Apple Shared Secret anywhere in the repo (not needed).

## Task 2 — Google Play Console (Google)

- [ ] Open the Veyrnox app in [Google Play Console](https://play.google.com/console) (package `com.veyrnox.app`; create the listing if needed).
- [ ] **Monetize → Products → Subscriptions** → create the **monthly** subscription:
  - Product ID: **`safety_plus_monthly`** (exact — same as Apple).
  - Name: `Safety Plus Monthly`.
  - Add a **Base plan**: auto-renewing, 1-month billing period, $5.99 USD.
  - Activate the base plan (may stay on an internal/closed testing track during dev).
- [ ] Create the **annual** subscription (separate product, same Play Console screen):
  - Product ID: **`safety_plus_annual`** (exact — same as Apple).
  - Name: `Safety Plus Annual`.
  - Add a **Base plan**: auto-renewing, 1-year billing period, $49.99 USD.
  - Activate the base plan on the same testing track as monthly.
  - Note: Play Console models monthly and annual as two distinct subscription products (each with its own base plan). RevenueCat's `default` offering will carry both, and the entitlement grant is unified server-side.
- [ ] **Setup → API access** → link to a Google Cloud project and grant RevenueCat's service account **Financial data** + **Manage orders and subscriptions** (RevenueCat's dashboard, Task 3, gives you the exact service-account email/permissions).

## Task 3 — RevenueCat dashboard

> Produces `.env.local` (git-ignored — never commit it).

- [ ] Create a free [RevenueCat](https://app.revenuecat.com) account + project `Veyrnox`.
- [ ] Add two Apps under the project:
  - iOS: bundle `com.veyrnox.app`, upload the App Store Connect API key (RC's wizard walks through App Store Connect → Users and Access → Integrations → App Store Connect API).
  - Android: package `com.veyrnox.app`, upload the Google Play service-account JSON (from Task 2).
- [ ] Create one **Entitlement**: identifier **`safety_plus`** (exact — hard-coded). Attach BOTH products to it (both stores):
  - `safety_plus_monthly`
  - `safety_plus_annual`
  - The entitlement is deliberately shared across both products — annual and monthly grant the same feature set; a user on either resolves to `safety_plus` in `entitlement.js`.
- [ ] Create one **Offering**: identifier `default`, marked **current**, containing TWO packages:
  - `$rc_monthly` → `safety_plus_monthly` on both stores.
  - `$rc_annual` → `safety_plus_annual` on both stores.
  - `Subscription.jsx` reads both from the offering's `availablePackages`; the annual/monthly toggle in the UI is driven by which packages are present. If `$rc_annual` is missing (staged rollout), the toggle hides and the page shows monthly-only — fail-honest, never a broken button (I4).
- [ ] **Project Settings → API keys** → copy the two **Public** app-specific keys (iOS + Android — NOT the secret/server key). Put them in `.env.local` (copy `.env.example` first if needed):

```
VITE_REVENUECAT_APPLE_API_KEY=<paste iOS public API key>
VITE_REVENUECAT_GOOGLE_API_KEY=<paste Android public API key>
```

> The committed `.env.example` already carries the empty placeholders for these — no repo change is needed here (that was done when the feature landed). **Only ever commit `.env.example`, never `.env.local`.**

---

## When Phase A is done → device-verify

Rebuild the app **after** `.env.local` has the keys (Vite inlines `import.meta.env` at build time — a key added after the build is not in the binary). Then run the device-verification runbook: **Task 15** in `docs/superpowers/plans/2026-07-06-iap-subscription-stitching.md`. Its **Step 0** re-checks every identifier in the table above; **Step 6** is the security-critical I3 deniability capture (zero RevenueCat egress in decoy/hidden sessions); **Step 9** is the evidence pack (the "txid-equivalent") required before anything may be recorded as device-verified.

Do **not** write "verified" anywhere until every step passes on a real device with no workaround — per this repo's verify-don't-assert rule, a sandbox purchase is recorded as **non-promoting META evidence** (it verifies the IAP unlock flow, not a per-asset on-chain status).
