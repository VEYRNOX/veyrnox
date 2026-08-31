# App Store Runbook — Veyrnox

Single operational reference for every store Veyrnox targets and how RevenueCat sits behind them. Deep-dives live elsewhere (`docs/iap-*.md`, `docs/play-launch/`) — this page is the map.

**Last verified live: 2026-08-31** (ASC + RevenueCat via API).

---

## 1. Snapshot

| Store | App | Sub products | Ready to ship |
|---|---|---|---|
| **Apple App Store** | `1.0` — LIVE / READY_FOR_SALE. `1.0.1` — PREPARE_FOR_SUBMISSION (draft) | Safety Plus M/A: APPROVED ✓. AI SP Annual: READY_TO_SUBMIT. **AI SP Monthly: MISSING_METADATA ⚠️** | Fix AI monthly metadata → submit AI M+A with 1.0.1 binary |
| **Google Play** | Internal testing only (Release 5, versionCode 30-ish). **No production submission yet.** | Products defined in Play Console; RC linked to `_v2:monthly` / `_v2:annual` shape | Complete pre-launch report + Vitals watch → promote to Production track |
| **Samsung Galaxy Store** | Applications (0) — no app registered. Free Distribution Seller, **Commercial Seller Status not requested** | none | Request Commercial Seller Status (KYB) → Add New App → RC Galaxy app linkage |
| **Huawei AppGallery** | Nothing configured. HMS IAP SDK wired in `huawei` flavor (PR #2172) but no AGConnect app | none (RC does not support Huawei — direct HMS IAP) | AGConnect app setup + `agconnect-services.json` + backend HMS receipt verifier |
| **F-Droid** | Not planned this release. Flavor exists (`fdroid`), no IAP by design | n/a | n/a |

**All monetisation code paths go through RevenueCat** (RC project `proj82381f44` "Veyrnox Wallet"), except Huawei — Huawei bypasses RC and talks HMS directly ([src/lib/purchases/huaweiPurchases.js](src/lib/purchases/huaweiPurchases.js)).

---

## 2. Master IDs

Change these ONLY with matching updates across code, RC, and the store consoles. Code source of truth: [src/lib/purchases/shared.js](src/lib/purchases/shared.js).

### Entitlements (RC lookup keys — used in every SDK call)
- `safety_plus` — the paid tier
- `ai_security_protection` — the AI advisor add-on

### Package identifiers (RC — used in Subscription.jsx)
- `$rc_monthly`
- `$rc_annual`

### Offering identifiers (RC lookup keys)
- `default` (is_current) — Safety Plus base
- `retention` — cancel-save 50% off Safety Plus
- `referral-bronze` / `-silver` / `-gold` / `-platinum` — Safety Plus 2.5 / 5 / 10 / 15% off
- `ai-security-protection` — AI SP base
- `ai-retention` — cancel-save 50% off AI SP
- `ai-referral-bronze` / `-silver` / `-gold` / `-platinum` — AI SP tiered

### Store product IDs — current linked state in RC

| Entitlement | Package | Apple SKU | Play SKU (basePlan) |
|---|---|---|---|
| `safety_plus` | `$rc_monthly` (default offering) | `safety_plus_monthly_v2` (APPROVED) | `safety_plus_monthly:monthly` |
| `safety_plus` | `$rc_annual` (default offering) | `safety_plus_annual` (APPROVED) | `safety_plus_annual:annual` |
| `ai_security_protection` | `$rc_monthly` | `ai_security_protection_monthly` (**MISSING_METADATA**) | `ai_security_protection_monthly_v2:monthly` |
| `ai_security_protection` | `$rc_annual` | `ai_security_protection_annual` (READY_TO_SUBMIT) | `ai_security_protection_annual_v2:annual` |

Referral tiers on Apple use SIGNED PROMOTIONAL OFFERS keyed by identifier (`APPLE_OFFER_IDS` in `shared.js`); on Play they are OFFER TAGS on the base plan (`referral-bronze` etc. tag string). Both map through the same `$rc_monthly`/`$rc_annual` packages.

---

## 3. Per-store lanes

### 3a. Apple App Store

**Account**
- Team `R54268MWFV` (Veyrnox LTD Organization) — Guideline 3.1.5(b) satisfied.
- ASC API key: `~/.appstoreconnect/private_keys/AuthKey_JPG8Z9ADUY.p8`, Issuer `2d4c5bd7-1de3-4953-b203-a92e788c2d7c`. App Manager role. Sufficient for uploads and manual profile provisioning; **not sufficient for xcodebuild "cloud signing"** — use `signingStyle: manual` in `ExportOptions.plist` (already pinned).

**Build**
- Rebuild web bundle before every archive: `npm run build && npx cap sync ios` (`ios/App/App/public` is gitignored — stale bundle risk, see CLAUDE.md).
- Verify no dev flags in bundle:
  ```bash
  unzip -p App.ipa 'Payload/App.app/public/assets/index-*.js' \
    | grep -oE 'VITE_(BYPASS_RASP|DEV_UNGATE_SEND|DEMO_MODE):"1"'
  ```
- Upload with `xcrun altool --upload-app` after `xcodebuild archive` + `-exportArchive`.

**Subscriptions**
- Group: **Safety Plus** (id `22228392`). One group; all sub SKUs live in it.
- **Blocker: `ai_security_protection_monthly` is `MISSING_METADATA`.** Cannot be added to a submission until metadata (localizations, review screenshot, review notes) is filled. `ai_security_protection_annual` is `READY_TO_SUBMIT`.
- Submit AI SP M+A with the next build's version (attach to 1.0.1 in "In-App Purchases and Subscriptions" panel of 1.0.1 version).

**Pre-submission verification**
- TestFlight on a physical iPhone the dev machine has never paired (see CLAUDE.md "iOS mandatory" checklist).
- Xcode Organizer → Metrics → Hangs after install — zero required.

**Deep-dive**: [docs/iap-safety-plus-setup-checklist.md](docs/iap-safety-plus-setup-checklist.md), [docs/iap-ai-security-protection-setup-checklist.md](docs/iap-ai-security-protection-setup-checklist.md), [docs/iap-referral-tier-setup-checklist.md](docs/iap-referral-tier-setup-checklist.md).

### 3b. Google Play

**Account**
- Personal developer account. 12-tester/14-day rule gates production only.
- Upload keystore `veyrnox-upload.jks`, SHA-1 `97:5A:05:8E…:BA:B2:F3`. App-signing cert (Google's) SHA-256 in CLAUDE.md.

**Build**
- `google` flavor. Current versionCode 39 on `main`; next Play upload is 1.0.1 versionCode 33 per CLAUDE.md history (Codes 1–11 consumed, 12–32 available).
- `android-release` job in `ci.yml` is the SINGLE upload path — do not add a second uploader (previous Firebase job silently consumed versionCodes).

**Subscriptions**
- All products defined in Play Console → In-app products / Subscriptions.
- Base plan + offer model: base plan `monthly` / `annual`; offer tags for referral/retention (`referral-bronze`, `referral-silver`, `referral-gold`, `referral-platinum`, `retention_50`).
- Products for `ai_security_protection_*_v2` created; not yet product-verified via a real Play purchase.

**Pre-submission verification (mandatory)**
- Upload AAB to Internal testing.
- **Pre-launch report** must be Overview: clean. If Overview says "Upload artifacts to generate pre-launch reports" after ~30 min, enable auto-run in Pre-launch report → Settings.
- **Android Vitals** — Crashes & ANRs for the new versionCode must be zero across the internal window. Testers must enable "Settings → Google → Usage & diagnostics → ON".
- Data Safety form: Analytics purpose added 2026-07-23; consent flow described in `TelemetryConsent.jsx`.

**Reason to hold**: 1.0.1 pre-submission gate (both stores) is owner-locked per CLAUDE.md after Play rejected build 5 under Broken Functionality — Create Wallet failed on a stock device due to KEK/RASP fail-closed on hardware never tested. **Golden path on a device the dev machine has never paired must pass before any submission.**

**Deep-dive**: [docs/play-launch/](docs/play-launch/), [docs/play-launch/launch-day-checklist.md](docs/play-launch/launch-day-checklist.md), [docs/play-launch/data-safety-form.md](docs/play-launch/data-safety-form.md).

### 3c. Samsung Galaxy Store

**Account state (verified 2026-08-31 in Seller Portal)**
- Signed in as **VEYRNOX LTD** ✓
- **Applications: 0** — no Veyrnox app registered.
- Corporate Seller: **Free Distribution Seller** — Commercial Seller Status not requested. Galaxy Store does NOT permit paid content or subscriptions under Free Distribution; Commercial Seller is a hard prerequisite.

**Do first (in order)**
1. **Request Commercial Seller Status.** KYB — business docs, tax ID, W-8BEN-E, bank details. Samsung review typically 3–10 business days.
2. **Add New App → Android.** Upload signed `samsung`-flavor AAB. Store listing copy, screenshots, content rating, privacy URL, export compliance (encryption **exempt** — matches Apple's stance).
3. **Create subscription items** matching RC SKUs above (`safety_plus_monthly_v2`, `safety_plus_annual`, `ai_security_protection_monthly`, `ai_security_protection_annual`).
4. **Add Samsung Galaxy Store app in RC** (currently absent — see §4). RC uses store type `galaxy` via `purchases-store-galaxy:10.16.2` (already on classpath).

**Notes**
- Samsung IAP is handled by RC — no separate adapter, no separate native plugin (deleted in PR #2174).
- Galaxy Store IAP does **not** support signed per-user promotional offers. Referral tiers and retention discounts on Samsung are constrained; treat as flat-price monthly/annual initially.
- `VITE_REVENUECAT_SAMSUNG_API_KEY` env var must be set at build time for the `samsung` flavor.

**Deep-dive**: [docs/iap-samsung-setup-checklist.md](docs/iap-samsung-setup-checklist.md).

### 3d. Huawei AppGallery

**Account**
- Nothing set up. AGConnect console requires a HUAWEI Developer account (not covered by any existing Samsung/Apple/Google credential).

**Do first**
1. Register at [developer.huawei.com](https://developer.huawei.com), create Company account (KYB).
2. Create app in AGConnect, download `agconnect-services.json` → place at `android/app/src/huawei/agconnect-services.json`.
3. Configure HMS IAP subscription products in AGConnect Console → In-app products, matching SKU IDs from the master table.
4. Set env vars for the `huawei` build: `VITE_HUAWEI_SAFETY_PLUS_MONTHLY_PRODUCT_ID`, `VITE_HUAWEI_SAFETY_PLUS_ANNUAL_PRODUCT_ID`, `VITE_HUAWEI_AI_SECURITY_PROTECTION_MONTHLY_PRODUCT_ID`, `VITE_HUAWEI_AI_SECURITY_PROTECTION_ANNUAL_PRODUCT_ID`.
5. **Backend HMS receipt verification** — HMS `InAppPurchaseData` payloads must be RSA-verified server-side against the AGConnect public key before entitlement is granted. **Not built yet.** Required before Huawei can ship to production.
6. Subscription review + AppGallery listing.

**Notes**
- Huawei is NOT wired through RevenueCat. Direct HMS bridge lives at [android/app/src/huawei/java/com/veyrnox/app/HuaweiIapPlugin.kt](android/app/src/huawei/java/com/veyrnox/app/HuaweiIapPlugin.kt).
- Huawei IAP has no promotional-offer / referral / retention concept — the JS adapter throws `OFFER_UNAVAILABLE` for any `offerTag`. Referral tiers are Play/App Store only.
- Play Integrity + Firebase are excluded from the `huawei` flavor. RASP still runs (native probes are HMS-independent).

### 3e. F-Droid

Reserved. `fdroid` flavor has `applicationIdSuffix ".fdroid"`, no IAP, no proprietary deps. Not part of the current commercial release plan.

---

## 4. RevenueCat — single source of truth

**Project**: `proj82381f44` — "Veyrnox Wallet".

### Apps in RC (verified 2026-08-31)
| App | RC ID | Store | Bundle/Package | Status |
|---|---|---|---|---|
| Veyrnox Wallet (App Store) | `app93202fa633` | `app_store` | `com.veyrnox.app` | ASC API key + Subscription key configured ✓ |
| Veyrnox Wallet (Play Store) | `appab40f41589` | `play_store` | `com.veyrnox.app` | Configured ✓ |
| Test Store | `appbd6b1942f3` | `test_store` | — | Sandbox/dev only |
| **Samsung Galaxy Store** | — | — | — | **NOT YET ADDED** — required before samsung flavor works |
| **Huawei** | — | — | — | N/A — Huawei bypasses RC by design |

### Entitlements (2, both `active`)
- `safety_plus` (id `entlf563332478`)
- `ai_security_protection` (id `entl262ea1e9d4`)

### Offerings (12, all `active`)
`default` (is_current) · `retention` · `referral-bronze` · `referral-silver` · `referral-gold` · `referral-platinum` · `ai-security-protection` · `ai-retention` · `ai-referral-bronze` · `ai-referral-silver` · `ai-referral-gold` · `ai-referral-platinum`

Every non-default offering carries two packages: `$rc_monthly` and `$rc_annual`, each pointing at the correct Apple + Play product IDs.

### RC config drift (worth checking during next audit)
- Older Apple `safety_plus_monthly` product (RC id `prod25ba133209`) is still attached to the `safety_plus` entitlement. It is NOT in any offering — offerings all point at `safety_plus_monthly_v2`. Consider archiving to remove the stale link; low urgency (no path reaches it).
- Multiple RC products carry `display_name: null` on the Play-store side of newer entries (`ai_security_protection_monthly_v2:monthly`, `_annual_v2:annual`). Not user-visible (product name comes from Play), but tidy up for the audit trail.

### API access
Ask via RevenueCat MCP tools (`mcp__…__list-*`, `get-*`, `create-*`, `attach-products-to-entitlement`, `attach-products-to-package`, `create-experiment`, etc.). Do not hand-drive the dashboard for reversible changes when the API can do it.

---

## 5. Cross-cutting rules

- **Locked infra**: `src/lib/purchases.js` is on the CLAUDE.md lock list. All RC surface changes go through helpers or dispatch layer, not this file.
- **Purchase gates**: every purchase flow goes through `presignGateOrReject` / `purchasePackage` in `Subscription.jsx`. Fail-closed on `OFFER_UNAVAILABLE` (I4).
- **Deniability (I3)**: `getOfferings` / `getTierOffering` return null in decoy/demo sessions. New offering fetches must respect this at the chokepoint, not per callsite.
- **Referral binding**: `bindOwnReferralCode` writes the RC subscriber attribute at app start. Attribution is server-authored via the RC webhook (`rc-webhook` Edge Function, DEPLOYED but currently INERT — see CLAUDE.md issues #1703 P0, #1704 P1).
- **Idempotency**: any receipt-processing backend (HMS receipt verifier when built) must be idempotent per `orderId` / `purchaseToken`.

---

## 6. Open items (priority order)

1. **Apple**: fill in `ai_security_protection_monthly` metadata → attach AI M+A to 1.0.1 → submit for review. (Unblocks AI SP on iOS.)
2. **Google Play**: complete 1.0.1 pre-submission verification per CLAUDE.md; promote to production track.
3. **Referral webhook**: land fixes for #1703 (wrong-recipient) and #1704 (attribute-name mismatch) in one release. Chain deployed but inert until both land.
4. **Samsung**: submit Commercial Seller Status KYB.
5. **Samsung**: add Galaxy Store app in RC once approved (needed even before AAB upload — the RC app can pre-exist).
6. **Huawei**: HUAWEI Developer account + AGConnect app + backend HMS receipt verifier.
7. **RC hygiene**: archive stale Apple `safety_plus_monthly` product; set display names on Play `_v2` variants.
