# Veyrnox 1.0.1 — Google Play Console Submission State

Owner: Al Jobson. Last updated: 2026-09-08.

**SUBMITTED for review — 2026-09-08 (14 changes queued in Publishing overview, quick checks passed, Submit clicked).** Managed publishing = ON — on approval, changes stage until owner presses Publish.

**Cross-reference — Apple 1.0.1 status (unrelated to Play, but the fiat on-ramp story is shared):** Apple rejected the same-day iOS 1.0.1 submission twice on 2026-09-08. Rejection 1 was on the AI Security Protection promoted-IAP images (2.3.2 metadata) — resolved by disabling both promoted purchases and deleting the images. Rejection 2 was Guideline 2.1 → 3.1.5(iii) asking for cryptocurrency-exchange licensing evidence on the Buy → Transak flow — a Path B reply (third-party partnership with Transak Ltd, FCA FRN 928910) has been sent to Apple, with §3a documenting the in-app UK geo-suppression (`isUkBuyBlocked()`, s.21 FSMA 2000). Full record in `RELEASE-v1.0.1-APPLE-SUBMISSION.md` under "Rejection cycle (2026-09-08)". Play reviewers have not (to date) asked for equivalent licensing evidence on the same Buy flow — if that changes, the same reply applies verbatim, and the UK geo-suppression is device-side so it fires on Android identically.

---

## App identity

| Field | Value | Notes |
|---|---|---|
| Package | `com.veyrnox.app` | still `Draft` on Play until this review completes |
| Temp name | `com.veyrnox.app (unreviewed)` | replaced with the real "Veyrnox" name after Google approves the store listing |
| Signing scheme | Google Play App Signing | upload-key reset approved 2026-07-22 |
| Upload cert SHA-1 | `97:5A:05:8E:…:BA:B2:F3` (keystore `veyrnox-upload.jks`) | GitHub Secrets updated 2026-07-22 |
| App-signing cert SHA-256 | `D8:99:69:D5:C4:9F:39:50:A8:CA:20:03:13:C5:0E:B1:09:37:E3:9B:62:4B:38:64:3F:B3:A0:4F:63:44:6C:B9` | Google's cert; baked into `BuildConfig.RELEASE_CERT_SHA256` |

## Build

| Field | Value | Verified |
|---|---|---|
| versionCode submitted | 48 | `android/app/build.gradle:25` on origin/main |
| versionName | 1.0.1 | Play Console (Closed testing - Alpha, Internal testing) |
| Track submitted from | Closed testing - Alpha (promoted from Internal testing during session) | Play Console showed Closed testing was 4/5 complete, needed only Send-for-review |
| Publish path | `ci.yml → publish-to-play-internal` | single upload path — Firebase Test Lab duplicate removed in #1980 |
| Release build verified | 2026-07-23 INTERNAL, re-verified 2026-09-08 by promotion | signed AAB, jarsigner verified, `BuildConfig.RELEASE_CERT_SHA256` matches |
| Release-cert guard | fail-closed | PRs #1386 + #1391; regression test runs on every PR |

## Prior rejection (addressed this session)

**Aug 12, 2026 — Broken Functionality policy violation.** Google's exact wording, retrieved from Policy status details this session:

> Your app has the following functionality issue(s): **Unresponsive UI elements, such as buttons or icons**.
>
> How to fix:
> - Fix all broken experiences within your app that are listed above, as well as any other issues identified via user feedback.
> - Utilize Android Vitals and Test Tracks: Use Android Vitals to diagnose stability and quality issues. Make use of test tracks to thoroughly test the app's functionality before submission.
> - Resubmit: After fixing all issues, submit a new version of the app for review through your Play Developer Console.

That matches the KEK/RASP fail-closed pattern documented in CLAUDE.md — reviewer tapped Create Wallet on a stock device, wallet setup screen appeared frozen. Play Console banner on Policy status now reads *"You've made changes that may fix some of these violations."* — Google's own state acknowledges the intent to fix.

Verified addressed in versionCode 48 by the stock-Android golden-path walkthrough (see below).

## Pre-submission gate — 2 of 5 met, 3 carried as waived or weak

Same mandatory gate as before, applied to versionCode 48. **This heading read
"all green" until 2026-09-09, while three of its five rows were already ⚠ or
resting on evidence from another build.** Rows 1 and 5 are met outright; 2 and 4
are waived on recorded reasoning; 3 is met only weakly. Read the rows, not the
heading.

| # | Check | Result |
|---|---|---|
| 1 | AAB uploaded to Internal + Closed testing | ✓ Internal 48 (Sep 8 12:56 AM); promoted to Closed testing - Alpha in-session |
| 2 | Play Pre-launch report exists | ⚠ Never generated for any bundle — accepted residual per #1960; Firebase Test Lab substitutes |
| 3 | Firebase Test Lab Robo output on 48 (substitute for #2) | ⚠ **No Robo run exists for versionCode 48.** The only clean crawl is Sep 4 matrix `matrix-1delt54g28ira` against versionCode **~44** — 267 UI actions on Pixel 8, no app crash. The fresh dispatch on 2026-09-08 **failed** on a CI-artifact dep (workflow needs a CI-built AAB for the main SHA); that failure is infrastructure, not an app crash, but it also means 48 was never crawled. The four bumps 44→48 are bump-only (`build.gradle` + `staging-mobile-release.test.js`), **but the AAB also packages the web bundle and 48 non-test `src/` commits landed in between** — among them `0dc4f673` *fix(send): shim `process.version` so Send chunk doesn't blank on cold parse*, which is exactly the class of failure a Robo crawl exists to catch, plus `3424de6f` (RASP hard-signal latch + WC tier gate). This row was marked ✓ at submission; corrected to ⚠ on 2026-09-09. Tracked as F-2 in `docs/security-diffs/diff-2026-09-09.md`. **Closing it needs a Robo run against the versionCode actually submitted — not a re-reading of the ~44 result.** Row 5 (owner walkthrough on 48) is separate, stronger evidence and is unaffected. |
| 4 | Android Vitals crashes + ANRs = 0 | ⚠ Vacuous on Draft state — Vitals only populates from Production/Open/Closed testing installs where testers share usage & diagnostics; fills post-Publish |
| 5 | **Stock-Android golden-path walkthrough** on a device the developer has never touched with a debug build | ✓ Owner tested + confirmed 2026-09-08 (Create Wallet + Import Seed + Send/Receive testnet + WalletConnect on Sepolia; no RASP/KEK fail-closed screen, no unresponsive Create Wallet) |

## Store listing (Default — English, United States)

All updated this session before Send-for-review:

| Field | State | Details |
|---|---|---|
| App name | ✓ 7/30 | `Veyrnox` |
| Short description | ✓ 78/80 | `Self-custody crypto wallet. Your keys stay on your device. Coercion-resistant.` (swapped from "high-stakes situations" phrasing to match store-listing.md draft) |
| Full description | ✓ 3917/4000 | Rewritten as a Play-adapted mirror of Apple's whatsNew — Play-specific swaps applied: "Apple Pay" → "Google Pay", "Face ID" → "Biometric unlock", "iPhones" → "Android devices", "Secure Enclave" → "StrongBox or TEE", Apple EULA line removed. New `TWO OPTIONAL SUBSCRIPTIONS` block near the top explicitly names Safety Plus ($5.99/mo, $49.99/yr) and AI Security Protection ($19.99/mo, $159.99/yr) — Google has not seen either subscription before, so both are new-to-review. `AI SECURITY ADVISOR` section renamed `AI SECURITY PROTECTION (SUBSCRIPTION)`. `COERCION-RESISTANT DESIGN` header clarified as `SAFETY PLUS SUBSCRIPTION`. "seven networks" → "eight networks" (matches Apple correction). |
| Icon | ✓ | Populated |
| Feature graphic | ✓ | Populated |
| Phone screenshots | ✓ 8/8 | "60+ tools, one wallet" (overclaim) removed; replaced with `Phone 1440×2560/09.png` — "A full security toolkit — Every security feature the wallet ships with, in one grid" (honest replacement showing the real feature grid) |
| 7-inch tablet screenshots | ✓ 8/8 | Same overclaim removed; replaced with `Tablet 7″ (1200×1920)/09.png` (same headline) |
| 10-inch tablet screenshots | ✓ 8/8 | Same overclaim removed; replaced with `Tablet 10″ (1600×2560)/09.png` (same headline) |
| Chromebook screenshots | – | Not populated (optional; wallet is phone-first) |
| Android XR screenshots | – | Not populated (optional) |
| Video | – | Not populated (optional) |

Source library for all screenshots: `~/Documents/GitHub/veyrnox-marketing/stores/Google/` — 5 aspect-specific folders (`Phone 1080×1920`, `Phone 1440×2560`, `Phone HD 1080×2400` (NOT Play-compatible 9:20), `Tablet 7″ (1200×1920)`, `Tablet 10″ (1600×2560)`), each with 10 numbered designs. We used the `1440×2560` and matching tablet folders.

Closed testing release 48 also carries a Play-shape release notes block (497 inner chars) mirroring the Apple whatsNew tier-summary. Play validates language-tag format `<en-US>…</en-US>`; the tag must be on its own line — a `<en-US>NEW IN 1.0.1` opener on the same line fails validation with *"Line 1: text outside language tags"*.

## Store settings

| Field | Value | Notes |
|---|---|---|
| Type | App | ✓ |
| Category | **Finance** | matches `docs/play-launch/store-listing.md §Field 4` |
| Tags | **Cryptocurrency, Finance, Personal finance** | added this session (Wallet, Bitcoin, Blockchain not in Play's tag taxonomy) |
| Email | support@veyrnox.com | ✓ |
| Phone | (blank) | optional; skipped |
| Website | https://veyrnox.com | ✓ |
| External marketing | ON | ✓ |

## App content declarations

All 11 declarations sit at "Ready to send for review". Actioned this session where changes were needed:

| Declaration | State | Notes |
|---|---|---|
| **Content ratings (IARC)** | ✓ Re-questionnaire submitted 2026-09-08 | Category = **All Other App Types**; 5 sections × Q's all NO; result: **Brazil ClassInd = All ages · North America ESRB = Everyone · Europe PEGI = PEGI 3 · Germany USK = All ages · IARC Generic = Rated for 3+ · Russia Google Play = Rated for 3+ · South Korea Google Play = Rated for 3+** (South Korea GRAC warning only applies to games — N/A for a wallet). |
| **Target audience** | ✓ Verified | 18+ only; **minors restricted from search/download AND from IAP + subscription sign-ups/renewals**. |
| **Privacy policy** | ✓ Updated | `https://veyrnox.com/privacy/` (trailing-slash — skips the 308 redirect, lands 200 direct). |
| **Financial features** | ✓ Kept | **Cryptocurrency wallet only** — MD `docs/play-launch/store-listing.md §Field 8` explicitly says: Cryptocurrency exchange = No, Cryptocurrency wallet (non-custodial) = Yes. Adding Cryptocurrency exchange would trigger stricter Play crypto policy (KYC/AML licensing evidence) — deliberately not selected. Transak in-app buy is a partner integration (their KYC, their exchange operation) — Veyrnox is not the counterparty. See `src/pages/BuyCrypto.jsx`: `createBuySession` returns Transak's own widget URL loaded via Capacitor Browser / iframe. |
| **Data safety** | ✓ | "Other financial info" removed for symmetry with Apple (CSV import 2026-09-07). Verified in the Actioned tab: last edited Sep 6, 2026. |
| Foreground service permissions | ✓ | Actioned |
| Sign in details | ✓ | All or some functionality restricted |
| Advertising ID | ✓ | Actioned |
| Ads | ✓ | Actioned |
| Health apps | ✓ | Actioned (N/A) |
| Government apps | ✓ | Actioned (N/A) |

## In-app purchases (Play Billing)

Play Console → Monetize → Subscriptions state (verified this session):

**Active (4):**

| Product ID | Base plans | Offers | Last updated |
|---|---|---|---|
| `safety_plus_monthly` | 1 | 5 | Jul 23, 2026 |
| `safety_plus_annual` | 1 | 5 | Jul 23, 2026 |
| `ai_security_protection_monthly_v2` | 1 | 5 | Aug 30, 2026 |
| `ai_security_protection_annual_v2` | 1 | 5 | Aug 30, 2026 |

**Deprecated (8, kept in place, 0 active base plans):** `safety_plus_annual_bronze/gold/platinum/silver`, `safety_plus_monthly_bronze/gold/platinum/silver` — old tier-per-sub structure, superseded by single-sub + 5-offer-tag structure.

Play uses per-offer TAG matching (`rc-ignore-offer` on every offer) so a discount only applies when the app names it — correct fail-closed shape.

### RC ↔ Play wiring (verified this session)

RC project `proj82381f44`, Play Store app `appab40f41589`:
- `play_service_account_credentials_configured: true` ✓ — RC receives Play Billing verifications
- All 4 active Play subs map cleanly to RC products, one per base plan:

| Play sub | RC store_identifier | RC app |
|---|---|---|
| `safety_plus_monthly` | `safety_plus_monthly:monthly` | Veyrnox Wallet (Play Store) ✓ |
| `safety_plus_annual` | `safety_plus_annual:annual` | Veyrnox Wallet (Play Store) ✓ |
| `ai_security_protection_monthly_v2` | `ai_security_protection_monthly_v2:monthly` | Veyrnox Wallet (Play Store) ✓ |
| `ai_security_protection_annual_v2` | `ai_security_protection_annual_v2:annual` | Veyrnox Wallet (Play Store) ✓ |

## Referral chain (shared with Apple state)

Same infrastructure serves both stores. Code state per this session:
- Bug #1703 (P0 wrong-recipient) — FIXED in `src/lib/purchases.js:328` (writes subscriber's OWN referral code).
- Bug #1704 (P1 attribute-name mismatch) — FIXED (both ends use `veyrnox_referral_code`).
- CLAUDE.md corrected — PR #2415 merged as `1e75ca7f` on 2026-09-07.
- **Prod `increment_referral` rename applied** (was staging-only for six weeks; 3560 prod referral rows sat at `count=0`).
- **RC webhooks armed** — `rc-webhook` redeployed with `verify_jwt: false` on both Supabase projects, `REVENUECAT_WEBHOOK_AUTHORIZATION` set on both, two environment-scoped RC webhooks in project `proj82381f44` (`whintgrb0a8102c4b` → prod, `whintgr6d9a9977bc` → sandbox).
- **Synthetic end-to-end test on staging** — minted a test code, POSTed a synthetic `INITIAL_PURCHASE`, `rc_user_id` written correctly. Test row cleaned up.
- Full record in the Apple MD's "Referral chain — code green" section.

Play-side reminders:
- Play Billing test purchases fire RC's `sandbox` environment. Sandbox webhook routes to staging Supabase, not prod.
- Play `-Beta` / license testers are RC sandbox — no rows in prod DB from Internal testing purchase.

Only remaining gate: real Play Billing sandbox trip through the client flow → `Subscription.jsx` calls `first-referral-bonus` → `first_bonus_granted_at` lands. Every other leg exercised.

## Submission itself

Managed publishing was flipped from OFF → **ON** this session before Submit — approved changes now stage until owner presses Publish. Prevents an immediate live rollout on approval.

Publishing overview showed **14 changes** across:

1. Production availability — 176 countries + "rest of world" (cannot be `Save for later`-deferred: Play tooltip *"Save for later is unavailable. This may be because you have changes that affect your whole app, or because there are issues that affect all of your changes."* — the whole submission moves together)
2. Closed testing - Alpha — Release 48 (1.0.1) start full rollout, resume track, tester email list, feedback channel
3. Store listings — English (US) default listing (name, short/full description, screenshots, icon, feature graphic)
4. App content — Content Rating (new questionnaire), Target audience 18+, Privacy policy URL, Ads declaration, Data safety, Health apps
5. Store settings — App category Finance

Plus five informational items not published but included for reviewer context: Sign-in details, Advertising ID, Government apps, Financial features, Foreground services.

Play ran **automated quick checks** (up to 14 minutes) before Submit was clickable. Checks passed clean; Submit button enabled. Owner clicked Submit.

## What is NOT in scope of this submission

- Apple 1.0.1 — separate `RELEASE-v1.0.1-APPLE-SUBMISSION.md` (submitted 2026-09-08 06:53 UTC).
- Huawei AppGallery and Samsung Galaxy Store — separate storefronts, not addressed in this pass.
- Referral chain end-to-end verification via a real sandbox purchase (armed but unexercised).
- Independent third-party audit — remains outstanding.

## Session PR trail relevant to Play (2026-09-07 → 2026-09-08)

Nothing merged in this session specifically shipped Play-side APP code — versionCode 48 was already on main (bumped by #2433 the day before). All Play work this session was **console-side** (store listing, screenshots, tags, declarations, subscriptions verification, Send-for-review click). Doc-side PRs from this session that affect Play:

- **#2415** (merged, `1e75ca7f`) — CLAUDE.md referral-bug correction (shared with Apple).
- **#2436** (merged, `43557d5`) — first-cut of these MD deliverables to `docs/`.
- **#2437** (merged, `9cce848`) — CLAUDE.md sync to referral chain armed state.
- **#2439** (merged, `8f5b624`) — release MDs synced to chain-armed state.
