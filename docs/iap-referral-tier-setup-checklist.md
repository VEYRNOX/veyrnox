# Referral Tier IAP Setup Checklist

Creates the 4 tier-based referral offerings so referred subscribers see discounted
prices that scale with the influencer's tier. All 8 products grant the **same**
`safety_plus` entitlement — the tier controls the price, not the feature set.

## Price table

| Tier     | Discount | Monthly (full $5.99) | Annual (full $49.99) |
|----------|----------|---------------------|----------------------|
| Bronze   | 2.5%     | $5.84 → **$5.49**   | $48.74 → **$48.99**  |
| Silver   | 5%       | $5.69 → **$5.49**   | $47.49 → **$47.49**  |
| Gold     | 10%      | $5.39 → **$4.99**   | $44.99 → **$44.99**  |
| Platinum | 15%      | $5.09 → **$4.99**   | $42.49 → **$42.49**  |

Prices rounded to the nearest available store price point. The influencer earns the
face-value discount (e.g. Gold annual: $49.99 - $44.99 = $5.00 per subscriber per year).

## Product identifiers

| Tier     | Monthly product ID              | Annual product ID              |
|----------|---------------------------------|--------------------------------|
| Bronze   | `safety_plus_monthly_bronze`    | `safety_plus_annual_bronze`    |
| Silver   | `safety_plus_monthly_silver`    | `safety_plus_annual_silver`    |
| Gold     | `safety_plus_monthly_gold`      | `safety_plus_annual_gold`      |
| Platinum | `safety_plus_monthly_platinum`  | `safety_plus_annual_platinum`  |

These must match `TIER_OFFERING_ID` in `src/lib/referral.js` and the `TIERS` array in
`scripts/setup-referral-offerings.mjs`.

---

## Task 1: App Store Connect (8 products)

All 8 products go in the **same subscription group** as `safety_plus_monthly` and
`safety_plus_annual` (the "Safety Plus" group). Same subscription level — a swap between
any two is a crossgrade.

For each row in the product table above:

- [ ] Go to App Store Connect → Subscriptions → Safety Plus group
- [ ] Click "+" to create a new auto-renewing subscription
- [ ] Set the **Reference Name** (e.g. `Safety Plus Monthly Bronze`)
- [ ] Set the **Product ID** to the exact identifier from the table
- [ ] Set the **Subscription Duration** (1 Month or 1 Year)
- [ ] Set the **Price** to the value in the price table
- [ ] Add English localization:
  - Display Name: e.g. `Safety Plus (Bronze)`
  - Description: e.g. `Advanced Security & Features. 2.5% referral discount.`
- [ ] Set subscription level = same as existing monthly/annual
- [ ] Save → status should be "Ready to Submit"

**Repeat for all 8 products** (4 tiers × 2 periods).

Checklist:
- [ ] `safety_plus_monthly_bronze` created at $5.49/mo
- [ ] `safety_plus_annual_bronze` created at $48.99/yr
- [ ] `safety_plus_monthly_silver` created at $5.49/mo
- [ ] `safety_plus_annual_silver` created at $47.49/yr
- [ ] `safety_plus_monthly_gold` created at $4.99/mo
- [ ] `safety_plus_annual_gold` created at $44.99/yr
- [ ] `safety_plus_monthly_platinum` created at $4.99/mo
- [ ] `safety_plus_annual_platinum` created at $42.49/yr

---

## Task 2: Google Play Console (8 products)

For each row in the product table:

- [ ] Go to Play Console → Monetize → Subscriptions
- [ ] Create subscription with the exact product ID from the table
- [ ] Add a base plan (auto-renewing, 1 month or 1 year billing period)
- [ ] Set the price to the value in the price table
- [ ] Mark as backwards-compatible
- [ ] Save

Checklist:
- [ ] `safety_plus_monthly_bronze` created at $5.49/mo
- [ ] `safety_plus_annual_bronze` created at $48.99/yr
- [ ] `safety_plus_monthly_silver` created at $5.49/mo
- [ ] `safety_plus_annual_silver` created at $47.49/yr
- [ ] `safety_plus_monthly_gold` created at $4.99/mo
- [ ] `safety_plus_annual_gold` created at $44.99/yr
- [ ] `safety_plus_monthly_platinum` created at $4.99/mo
- [ ] `safety_plus_annual_platinum` created at $42.49/yr

---

## Task 3: RevenueCat dashboard (4 offerings)

This can be done either manually in the dashboard or via the automation script.

### Option A: Automation script (recommended)

```bash
REVENUECAT_V2_SECRET_KEY=sk_xxx REVENUECAT_PROJECT_ID=proj_xxx \
  node scripts/setup-referral-offerings.mjs
```

The script creates 4 offerings (`referral-bronze`, `referral-silver`, `referral-gold`,
`referral-platinum`), each with `$rc_monthly` and `$rc_annual` packages, and attaches
the tier-specific store products to each package.

Prerequisites: Tasks 1 & 2 complete + products synced into RevenueCat.

### Option B: Manual dashboard setup

For each tier:

- [ ] Go to RevenueCat → Project → Offerings
- [ ] Create offering with identifier `referral-{tier}` (e.g. `referral-bronze`)
- [ ] Display name: e.g. `Referral Bronze (2.5% off)`
- [ ] Do NOT mark as "Current" (the `default` offering stays current)
- [ ] Add package `$rc_monthly` → attach the tier's monthly Apple + Google products
- [ ] Add package `$rc_annual` → attach the tier's annual Apple + Google products

### Entitlement attachments

All 8 tier products must be attached to the **`safety_plus` entitlement**:

- [ ] Go to RevenueCat → Entitlements → `safety_plus`
- [ ] Attach all 8 tier products (4 monthly + 4 annual, Apple + Google = 16 attachments)

Checklist:
- [ ] Offering `referral-bronze` created with 2 packages
- [ ] Offering `referral-silver` created with 2 packages
- [ ] Offering `referral-gold` created with 2 packages
- [ ] Offering `referral-platinum` created with 2 packages
- [ ] All 8 tier products attached to `safety_plus` entitlement

---

## Task 4: Supabase migration

Add `discount_cents` column to the `referral_attributions` table:

```sql
ALTER TABLE referral_attributions
  ADD COLUMN IF NOT EXISTS discount_cents integer NOT NULL DEFAULT 0;
```

Run via Supabase dashboard SQL editor or CLI:

```bash
supabase db push
```

See `sql/add-discount-cents.sql` for the migration file.

- [ ] `discount_cents` column added to `referral_attributions`
- [ ] Existing rows have default value 0 (legacy attributions before tier model)

---

## Task 5: Verification

- [ ] Run `npm run check:iap-preflight` with API keys — all checks pass
- [ ] Run `node scripts/setup-referral-offerings.mjs` — all 4 offerings configured
- [ ] Sandbox purchase with a referral code at Gold tier — subscriber sees $44.99/yr
- [ ] After purchase, `referral_attributions` row has `discount_cents = 500`
- [ ] Referrer's earnings page shows the discount amount
- [ ] Non-referred purchase shows default $49.99/yr pricing (no discount)
