# Veyrnox 1.0.1 — Apple App Store Submission State

Owner: Al Jobson. Last updated: 2026-09-08 (session-rebuilt after prior scratchpad was lost).

**Submission HOLD:** in effect. Owner clicks Submit for Review only when tasks 21 + 22 (below) both go green.

---

## Version core

| Field | Value | Source |
|---|---|---|
| App | Veyrnox (`6790188660`, bundle `com.veyrnox.app`) | ASC API |
| Version | 1.0.1 | `appStoreVersions/eaeb97ea-…` |
| State | READY_FOR_REVIEW | ASC API |
| releaseType | MANUAL | ASC API |
| Phased release | INACTIVE (armed for post-approval) | `appStoreVersionPhasedRelease` |
| Copyright | Veyrnox Limited | ASC |
| Downloadable | true | ASC |
| Team | Veyrnox LTD (Organization, `R54268MWFV`) | Guideline 3.1.5(b) satisfied |
| Encryption | `ITSAppUsesNonExemptEncryption=false` in Info.plist | source + built binary |

## Build

| Field | Value | Verified |
|---|---|---|
| Version code | 1.0.1 (57) | ASC + local pbxproj bump merged as PR #2434 (`c39bf87`) |
| Build id | `c1be9db4-7bc0-464c-a940-1d56e02ca66f` | ASC API |
| Delivery UUID | `c1be9db4-7bc0-464c-a940-1d56e02ca66f` | altool upload 2026-09-07 23:49 UTC |
| Processing state | VALID | ASC API |
| Uploaded from | `/tmp/veyrnox-ios-57` worktree cut from `origin/main aba21e0f` | fresh cut, `--no-track` |
| Signing (archive) | Automatic + Admin API key `4YG883H874` | Team `R54268MWFV` |
| Signing (export) | Manual, profile `Veyrnox App Store (API)` | pinned `ExportOptions.plist` (PR #1639) |
| Cert | `Apple Distribution: Veyrnox LTD (R54268MWFV)` | keychain identity |
| Profile expiry | 2027-08-08 | `security cms -D` on `~/Library/MobileDevice/Provisioning Profiles` |

### Pre-submission gate results (source-side)

| Check | Result | Notes |
|---|---|---|
| Env flags clean on main | PASS | No `VITE_BYPASS_RASP` / `VITE_DEV_UNGATE_SEND` / `VITE_DEMO_MODE` set in `.env*` committed on main |
| `.env.production.local` present locally | PASS | All flags = 0; wins over `.env.local` at production build time |
| iOS entitlements per-config | PASS | Debug=development, Release=production (#2282 fix intact) |
| Info.plist submission fields | PASS | Bundle id, marketing version, `ITSAppUsesNonExemptEncryption=false` |
| `CURRENT_PROJECT_VERSION` | 57 | bumped via `agvtool new-version -all 57`, PR #2434 |

### Byte-check of exported .ipa (task 20 — the mandatory pre-submission check)

```
unzip -p /tmp/veyrnox-ios-57-out/export/App.ipa \
  'Payload/App.app/public/assets/index-*.js' \
  | grep -oE 'VITE_(BYPASS_RASP|DEV_UNGATE_SEND|DEMO_MODE):"1"'
```

Result: **no matches** — bundle is clean.

Embedded entitlements:
```
com.apple.developer.devicecheck.appattest-environment = production
```

## Store listing (en-US locale — only locale)

| Field | Length | Cap | State |
|---|---|---|---|
| whatsNew | 3990 chars | 4000 | Updated 2026-09-08 — expanded from 2707 |
| promotionalText | 162 chars | 170 | in place |
| Description | verified fixed 2026-09-07 | — | eight networks, Android bullet removed, Safety Plus paragraph rewritten |
| Keywords | swapped 2026-09-07 | — | keyword swap applied |
| Support URL | live | — | verified in browser this session |
| Marketing URL | live | — | verified in browser this session |
| Age Rating | 4+ / declaration complete | — | verified |

### Screenshot sets (5 sets, en-US)

| Display class | Set id | State |
|---|---|---|
| `APP_IPHONE_65` (6.5") | `1a2050b4` | populated |
| `APP_IPHONE_55` (5.5") | `8b499b1a` | populated |
| `APP_IPHONE_67` (6.7") | `75f83a53` | populated (covers 6.9" via fallback) |
| `APP_IPAD_PRO_129` | `b0d59700` | populated |
| `APP_IPAD_PRO_3GEN_129` | `c67d2543` | populated |

Subscription review screenshots for Monthly 2 + Annual 2 replaced with native-res simulator captures (1206×2622) 2026-09-07 — the earlier submission's blanks were the blocker Apple would have flagged; now fixed.

App Preview videos: skipped by decision (screenshots-only listing).

Game Center: clarified as "not used" — no capability declared in entitlements.

## In-app purchases

| Product | Group | State | Attached to review submission |
|---|---|---|---|
| `safety_plus_monthly_v2` | Safety Plus | APPROVED | not needed (already live) |
| `safety_plus_annual` | Safety Plus | APPROVED | not needed (already live) |
| `ai_security_protection_monthly_2` | AI Security Protection | READY_TO_SUBMIT | attached (submission item `|18|…`) |
| `ai_security_protection_annual_2` | AI Security Protection | READY_TO_SUBMIT | attached (submission item `|18|…`) |

Review submission `0babae55-…` currently holds 4 items, all `state: READY_FOR_REVIEW`:
- 1 × appStoreVersion (1.0.1, id `eaeb97ea-…`)
- 2 × subscriptions (both AI Security Protection subs)
- 1 × subscription-group-level artifact (`|19|…`, non-blocking)

Verify by inspection in the ASC UI's Submit-for-Review preview screen before pressing Submit.

## Promotional offers — 10 total, wired end-to-end

All 10 offerings verified live in RevenueCat this session:

| Tier | Safety Plus offering | AI Security offering |
|---|---|---|
| Bronze 2.5% | `referral-bronze` | `ai-referral-bronze` |
| Silver 5% | `referral-silver` | `ai-referral-silver` |
| Gold 10% | `referral-gold` | `ai-referral-gold` |
| Platinum 15% | `referral-platinum` | `ai-referral-platinum` |
| Retention 50% | `retention` | `ai-retention` |

Each offering resolves to both monthly + annual packages (`$rc_monthly` + `$rc_annual`) bound to the correct product per family — no cross-family bleed. Apple's per-subscription uniqueness rule lets both families reuse the same 5 Apple promotional-offer identifiers (`referral_bronze_m2`, `referral_bronze_annual`, etc.), which is why the client `APPLE_OFFER_IDS` map (PR #2412, merged) points every `ai-*` key at the same Apple id as its Safety Plus twin.

**Honest caveat retained:** no promotional-offer path has ever been exercised by a real purchase — full-price sandbox and one full-price production purchase only. Store setup complete, resolution code verified, but the signing / identifier-matching / `offerPriceInfo` chain remains code-verified until an actual offer purchase clears.

## Anonymous telemetry

- Consent screen at first entry + Settings → Privacy toggle (PR #1410) — verified live in the shipped 1.0 already.
- Declining transmits nothing, mints no device id.
- App Privacy declarations in ASC: Analytics purpose added 2026-07-23. Still open, tracked separately: Apple's "Usage Data → Product Interaction" is undeclared — decide before next major.

## Referral chain — code green, one owner gate remains

- Bug #1703 (P0 wrong-recipient) — FIXED in `src/lib/purchases.js:328` (writes subscriber's OWN code as RC attribute).
- Bug #1704 (P1 attribute-name mismatch) — FIXED (both ends use `veyrnox_referral_code`).
- CLAUDE.md corrected accordingly: PR #2415 merged as `1e75ca7f` on 2026-09-07.

Remaining chain gates (do NOT block 1.0.1 submission, but referral tiers stay INERT until closed):
1. Set `REVENUECAT_WEBHOOK_AUTHORIZATION` on both Supabase projects (production `jwstkrtslotnjyerzzsi`, staging `nszlbcmcysftwyudthjz`) — same value on both.
2. Configure RC webhook (project `proj82381f44` — verified 2026-09-08 that the webhook list is EMPTY):
   - URL: `https://jwstkrtslotnjyerzzsi.supabase.co/functions/v1/rc-webhook`
   - Auth header: value from step 1
   - Events: `INITIAL_PURCHASE`, `NON_RENEWING_PURCHASE`
3. Real sandbox trip: referrer generates code → referee purchases with code → RC fires `INITIAL_PURCHASE` → `rc-webhook` writes attribution row + grants bonus.

## Remaining pre-Submit gate items

| # | Task | Owner | State |
|---|---|---|---|
| 21 | Stock-iPhone golden-path walkthrough | Owner (physical device, not the dev iPhone) | **PENDING** |
| 22 | TestFlight Crashes + Xcode Organizer Hangs = 0 on build 57 | Owner watches during TF window | **PENDING** |

Both are the mandatory CLAUDE.md pre-submission gate — Play build 5 was rejected under the same failure mode (KEK/RASP fail-closed on untested device), and iOS review will treat an unresponsive Create Wallet path the same way.

## Confidence to Submit

- **~70%** if we run tasks 21 + 22.
- **~55%** if we skip them.
- **~85%** with both green.

## What is NOT in scope of this submission

- Referral chain end-to-end verification (owner action; does not block Submit).
- Independent third-party audit of the full stack (S1–S4 + crypto + KEK + RASP) — remains outstanding.
- Play Store submission (separate HOLD, tracked in `RELEASE-v1.0.1-PLAY-SUBMISSION.md`).

## Session PR trail (2026-09-07 → 2026-09-08)

- **#2412** (merged, `e10dbde6`) — extend `APPLE_OFFER_IDS` map with the 5 `ai-*` referral keys.
- **#2415** (merged, `1e75ca7f`) — CLAUDE.md correction for referral bugs #1703 + #1704 marked FIXED.
- **#2434** (merged, `c39bf87`) — iOS versionCode bump 56 → 57 + iOS SPM sync (Capacitor 8.5.1 + purchases-hybrid-common 18.33.1 pinned to what shipped).
- **#2414** (closed, wrong head branch) — first attempt at #2415 hit the release worktree branch; superseded.
