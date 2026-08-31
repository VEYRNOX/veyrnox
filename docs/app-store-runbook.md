# App Store Runbook — Veyrnox

Single operational reference for every store Veyrnox targets and how RevenueCat sits behind them. Deep-dives live elsewhere (`docs/iap-*.md`, `docs/play-launch/`) — this page is the map.

**Last verified live: 2026-08-31 evening** (ASC + RevenueCat via API + Samsung Seller Portal via browser).

---

## 1. Snapshot

| Store | App | Sub products | Ready to ship |
|---|---|---|---|
| **Apple App Store** | `1.0` — LIVE / READY_FOR_SALE. `1.0.1` — **READY_FOR_REVIEW** (build 41 attached, all metadata complete, App Privacy published). Draft submission bundle prepared, not submitted. | Safety Plus M/A: APPROVED ✓. **AI SP Annual: READY_TO_SUBMIT ✓.** **AI SP Monthly: READY_TO_SUBMIT ✓** (was MISSING_METADATA — screenshot uploaded 2026-08-31). Both auto-attach on 1.0.1 submit. | Owner clicks Submit for Review on draft bundle `7899aa06-5abc-4368-a062-3e8c6c9df058`. |
| **Google Play** | Internal testing only (Release 5, versionCode 30-ish). **No production submission yet.** | Products defined in Play Console; RC linked to `_v2:monthly` / `_v2:annual` shape | Complete pre-launch report + Vitals watch → promote to Production track |
| **Samsung Galaxy Store** | Applications (0). **Commercial Seller Status: request SUBMITTED 2026-08-31** (VEYRNOX LTD, Corporate, Tide/ClearBank banking). Samsung review 3–10 business days. | none (blocked on CSS approval) | CSS approval email → Add New App → RC Galaxy app linkage |
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
| `ai_security_protection` | `$rc_monthly` | `ai_security_protection_monthly_2` (2026-08-31 evening: recreated in own group; state MISSING_METADATA per Apple, backend cache lag — 175 territories + 175 prices + screenshot + review notes all set) | `ai_security_protection_monthly_v2:monthly` |
| `ai_security_protection` | `$rc_annual` | `ai_security_protection_annual_2` (same as above) | `ai_security_protection_annual_v2:annual` |

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

**Subscriptions — one group per service (mandatory)**

- **Safety Plus** group `22228392` — Safety Plus M (`safety_plus_monthly_v2`) + Safety Plus A (`safety_plus_annual`). Both APPROVED.
- **AI Security Protection** group `22348777` — AI SP M (`ai_security_protection_monthly_2`) + AI SP A (`ai_security_protection_annual_2`). Both MISSING_METADATA (Apple backend cache lag; all fields set).

**Standing rule (all stores)**: one subscription group per SERVICE, not per pricing tier. Users can only hold ONE sub per group at a time, so Safety Plus and AI Security Protection MUST be separate groups if a user is meant to hold both — which the "AI SP sits on top of Safety Plus" model requires.

**Apple gotchas discovered 2026-08-31 while restructuring**:
- `PATCH subscriptions/{id}/relationships/group` returns 403 "no allowed operations". **Group assignment is locked at subscription creation**; existing subs cannot be moved between groups via API. Fix path: create fresh subs in the correct group with new productIds (we appended `_2`), copy metadata/prices/screenshot/reviewNote, relink RevenueCat, delete originals from the wrong group.
- Sub `name` is unique per app — reuse triggers 409 `INVALID.DUPLICATE`. Distinguish new subs (`AI Security Protection Monthly 2`, etc.).
- **New sub state stays `MISSING_METADATA` until Apple's backend recomputes** — 15+ minutes observed. Every field can be populated and the sub still shows the old state. Do not interpret this as a real gap without waiting.
- Old-sub deletion via API: works on `READY_TO_SUBMIT` subs (204). Apple lets you free a wrong-group sub.
- Subscriptions do NOT attach as items on `reviewSubmissions` — Apple has no `subscription` relationship. When an app version submits, all its READY_TO_SUBMIT subs auto-ride the same review.

**Pricing API (Apple) — the trap**:
- `POST /v1/subscriptionPrices` with a US base pricePoint returns generic 409 `An error occurred while processing the pricing information` UNLESS availability is set FIRST. Order matters:
  1. `POST /v1/subscriptionAvailabilities` with the full 175-territory list on the create body (`availableTerritories` relationship). Adding territories later via `/relationships/availableTerritories` returns 403 — must be part of the create call.
  2. `POST /v1/subscriptionPrices` with US base pricePoint.
  3. `GET /v1/subscriptionPricePoints/{us_base}/equalizations?limit=200` → paginate → 174 equalized pricePoint IDs (one per non-US territory).
  4. `POST /v1/subscriptionPrices` for each equalized pricePoint. That gives the sub 175 prices matching the US base's equalization ladder.
- The ASC UI wraps all of this in one "Set Base Price + Equalize" button. Via API it's 175+ calls.

**Promoted-purchase artwork (2026-08-31 evening, both new AI SP subs)**:
- Spec: 1024×1024 JPG or PNG, 72 DPI, RGB, flattened, no rounded corners.
- 4-iteration API discovery — endpoint names matter:
  1. Create `promotedPurchases` (attributes: `enabled: true`, `visibleForAllUsers: true` — BOTH required; relationships: `subscription` + `app` — BOTH required; `visibleForDistribution` is NOT valid).
  2. Upload image via `subscriptionImages` (NOT `promotedPurchaseImages` — that doesn't exist; NOT `images` / `promotionImages` / `artwork` — none of those exist as relationships on `promotedPurchases`). `subscriptionImages` POST → PUT bytes to upload operations → PATCH `uploaded: true` + MD5 checksum.
- Uploaded via `/tmp/asc-upload-promoted.mjs` + `/tmp/asc-try-si.mjs`. Both new AI SP subs got the black-background variant of their respective paywall image, center-cropped and re-scaled to 1024×1024 with `sips`.
- Promoted-purchase is OPTIONAL — SP monthly is APPROVED without one — so populating it does NOT unblock `MISSING_METADATA`.

**Promotional offers (referral/retention discounts) — deferred**:
- `subscriptionPromotionalOffers` endpoint requires attributes `duration`, `numberOfPeriods`, `offerMode`, `targetSubscriptionPlanType`, and a `prices` relationship pointing at 175 `subscriptionPromotionalOfferPrices` (one per territory, each with its own discount pricePoint). Total: 10 offers × 176 calls each = 1,760 calls to mirror Safety Plus's referral+retention on AI SP. **Not yet done — leave for UI or a dedicated batch script.** AI SP paywall works today at base price; discounts don't apply until promotional offers are populated.

**Historical fix pattern (2026-08-31)**: `ai_security_protection_monthly` initially shipped in the Safety Plus group. Fixed by splitting into a dedicated `AI Security Protection` group per the standing rule above. See the "Apple gotchas" bullet above for the exact recovery.

**1.0.1 submission state (2026-08-31 evening — PREP ONLY, not submitted)**
- Version state: `READY_FOR_REVIEW` ✓
- Build 41 attached (`26228a83-0fd2-48b7-9e72-becb96a965b7`, uploaded 2026-08-30 12:28 PDT, VALID)
- `usesIdfa`: `false` (no ad SDKs)
- Age rating: `FOUR_PLUS` (already on appInfo, all content categories NONE)
- Draft review-submission bundle: `7899aa06-5abc-4368-a062-3e8c6c9df058` (contains appStoreVersion item; AI SP M+A auto-attach on submit)
- **App Privacy: republished 2026-08-31 evening** — Financial Info removed (was over-declared; code sends zero financial info), Other Diagnostic Data added (for TAMPER_SIGNAL / KEK_UNWRAP_FAILED / CRYPTO_DIAGNOSTICS; Not Linked; purposes Analytics + App Functionality; no tracking). Current published declarations: Linked = Identifiers (User ID, Device ID via RC) + Purchases; Not Linked = Identifiers (veyrnox-device-id) + Usage Data (Product Interaction) + Diagnostics (Other Diagnostic Data). Matches privacy policy §9 and code egress in `src/api/trackEvent.js`.
- **Submit for Review NOT clicked.** Owner clicks when ready via ASC bottom-right "Draft Submissions (1)" → Submit for Review.

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

**Account state (verified 2026-08-31 evening in Seller Portal)**
- Signed in as **VEYRNOX LTD** ✓
- **Applications: 0** — no Veyrnox app registered.
- **Type of Sales: "Commercial Distribution Request in Progress"** — Corporate Commercial Distribution Seller request SUBMITTED 2026-08-31. Awaiting Samsung review (typically 3–10 business days). Request is a resubmission after earlier rejections; comment field notes updated corporate details, website alignment, and verified business info to satisfy prior feedback.
- Path lesson: the request form at `/member/getContractSeller.as?isCorpCommReq=Y` renders the same fields as `?isCorpCommReq=N` — VEYRNOX LTD is Corporate at the account level, so the URL param is cosmetic and does NOT toggle tier. Prior "wrong tier" analysis was wrong; both URLs post as Corporate Commercial Distribution Seller for a Corporate-registered account.

**Banking on file** (Tide Current Account, underlying institution ClearBank Ltd — set 2026-08-31):
- Account: `32416941` / Sort code `04-06-05`
- IBAN `GB39 CLRB 0406 0532 4169 41` / SWIFT `CLRBGB22`
- Account holder must match `VEYRNOX LTD` exactly (Samsung validator strict-compares against Company Name field on file — a trailing `.` or `LIMITED` vs `LTD` triggers "account holder and company do not match").

**Do next (after CSS approval email arrives)**
1. **Add New App → Android.** Upload signed `samsung`-flavor AAB. Store listing copy, screenshots, content rating, privacy URL, export compliance (encryption **exempt** — matches Apple's stance). Reuse iOS App Privacy content type declarations (RC + veyrnox-device-id + product interaction + diagnostic data; no financial info).
2. **Create subscription items** matching RC SKUs above (`safety_plus_monthly_v2`, `safety_plus_annual`, `ai_security_protection_monthly`, `ai_security_protection_annual`). Reuse Safety Plus + AI SP paywall screenshots per SKU.
3. **Add Samsung Galaxy Store app in RC** (currently absent — see §4). RC uses store type `galaxy` via `purchases-store-galaxy:10.16.2` (already on classpath).

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
- Old Apple AI SP products (`prod9ceaf29360` = `ai_security_protection_monthly`, `prodc5373e4523` = `ai_security_protection_annual`) archived 2026-08-31 after replacement by `_2` variants. Still listed on `ai_security_protection` entitlement (RC MCP scope for `detach-products-from-entitlement` = read-only). Inert (archived), but cosmetic cleanup needed in RC dashboard.

### RC MCP scope caveats (discovered 2026-08-31)
- `attach-products-to-entitlement` / `detach-products-from-entitlement` → **403** on the current MCP token (needs `project_configuration:entitlements:read_write`).
- `attach-products-to-package` / `detach-products-from-package` / `archive-product` → works.
- Consequence: entitlement-level attach/detach must be done in the RC dashboard; package swaps and archives can be scripted. When onboarding a new store product, add via package attach (that's the customer-facing surface) — the entitlement attach is only needed for direct grants and is dashboard-only from here.

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
