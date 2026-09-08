# Veyrnox 1.0.1 — Google Play Console Submission State

Owner: Al Jobson. Last updated: 2026-09-08 (session-rebuilt after prior scratchpad was lost).

**Submission HOLD:** in effect. Owner locks lifted only when the CLAUDE.md pre-submission gate below is fully green. This is the same owner-lock imposed on Apple 1.0.1; the two stores are independent.

---

## App identity

| Field | Value | Notes |
|---|---|---|
| Package | `com.veyrnox.app` | app is `Draft` on Play — never gone through app review |
| Temp name | `com.veyrnox.app (unreviewed)` | this is why Play still suggests Closed testing for the Pre-launch report |
| Signing scheme | Google Play App Signing | reset approved 2026-07-22 |
| Upload cert SHA-1 | `97:5A:05:8E:…:BA:B2:F3` (keystore `veyrnox-upload.jks`) | GitHub Secrets updated 2026-07-22 |
| App-signing cert SHA-256 | `D8:99:69:D5:C4:9F:39:50:A8:CA:20:03:13:C5:0E:B1:09:37:E3:9B:62:4B:38:64:3F:B3:A0:4F:63:44:6C:B9` | Google's cert; baked into `BuildConfig.RELEASE_CERT_SHA256` |

## Build

| Field | Value | Verified |
|---|---|---|
| versionCode target | 1.0.1 (40) or later — see note | `android/app/build.gradle:25` on origin/main |
| Latest bump on main | 44 → 45 (#2397, `74755b7a`) | git log 2026-09-07 |
| Publish path | `ci.yml → publish-to-play-internal` | single Play upload path — Firebase Test Lab duplicate removed in #1980 |
| Release build verified | 2026-07-23 INTERNAL | signed AAB, jarsigner verified, `BuildConfig.RELEASE_CERT_SHA256` matches |
| Release-cert guard | fail-closed | PRs #1386 + #1391; regression test now runs on PRs |

## Current console state (READ IN CONSOLE — inference is unreliable here)

Do NOT infer Play state from Apple state. Apple is LIVE (v1.0 shipped 2026-07-28, `READY_FOR_SALE`, one real production purchase). Play is DRAFT and has never had a declaration reviewed.

Verified in the Play Console 2026-09-01 and again 2026-09-04:
- **NO pre-launch report exists** for versionCode 40, 41, or any of the ~39 bundles uploaded to date.
- Overview page reads the empty "Upload artifacts to generate pre-launch reports" state.
- App content declarations (10 total) all sit at "Ready to send for review".

**#1960 closed 2026-09-04** as accepted residual. Firebase Test Lab (Robo) provides equivalent crash/ANR data on the same infrastructure and is the primary automated gate. Play Pre-launch's empty state is left open until Closed-testing + review, which is blocked on the 2026-08-12 rejection risk pattern.

## Data safety declaration

Updates landed 2026-09-07 via console CSV import (`~/Downloads/data_safety_remove_other_financial.csv`):
- **"Other financial info" — REMOVED** for symmetry with Apple, which does not declare it either.
- Data collected: device or other IDs (Analytics), plus what the app actually needs to function.
- Not shared with third parties.
- Purpose: App functionality + Analytics (added 2026-07-23).
- All 9 owner-decisions resolved (`docs/play-launch/data-safety-form.md`).

Verify by re-opening the Data safety form in the console before pressing Send for review — CSV import writes silently and does not surface a diff.

## Pre-submission gate (MANDATORY — CLAUDE.md)

Every check must pass on the new versionCode before promoting to Play review. Play build 5 was rejected under Broken Functionality when reviewer hit the untested KEK/RASP fail-closed path on a stock device.

| # | Check | State |
|---|---|---|
| 1 | Upload AAB to Internal testing | done for #40; will need to re-do for whatever versionCode you promote |
| 2 | **Play Pre-launch report exists for the new versionCode** | **NEVER GENERATED — for any bundle ever uploaded** |
| 3 | Zero crashes / ANRs / error dialogs in the report | N/A until (2) generates |
| 4 | **Android Vitals: 0 crashes + 0 ANRs on the new versionCode** | needs internal testers with usage & diagnostics sharing ON |
| 5 | Stock-Android golden-path walkthrough (Create Wallet + Import Seed + Send/Receive) on a device the developer has never touched with a debug build | **owner action** |

Where (2) is impossible in the current console state, Firebase Test Lab Robo output on the same versionCode is the accepted substitute — but you must actually READ it before promoting.

## In-app purchases (Play Billing)

All 10 offerings mirrored from Apple, verified live in RevenueCat this session:

| Tier | Safety Plus (Play) | AI Security (Play) |
|---|---|---|
| Bronze 2.5% | `referral-bronze` | `ai-referral-bronze` |
| Silver 5% | `referral-silver` | `ai-referral-silver` |
| Gold 10% | `referral-gold` | `ai-referral-gold` |
| Platinum 15% | `referral-platinum` | `ai-referral-platinum` |
| Retention 50% | `retention` | `ai-retention` |

Play uses per-offer TAG matching (`rc-ignore-offer` on every offer) so a discount only applies when the app names it — the correct fail-closed shape.

Device-verified: Play Billing on internal track 2026-07-22.

## Referral chain (shared with Apple state)

Same infrastructure serves both stores. Code state per this session:
- Bug #1703 (P0 wrong-recipient) — FIXED.
- Bug #1704 (P1 attribute-name mismatch) — FIXED.
- CLAUDE.md corrected — PR #2415 merged as `1e75ca7f` on 2026-09-07.

Owner gates blocking end-to-end activation (do NOT block Play submission itself):
1. Set `REVENUECAT_WEBHOOK_AUTHORIZATION` on both Supabase projects (prod `jwstkrtslotnjyerzzsi`, staging `nszlbcmcysftwyudthjz`) — same value.
2. Configure RC webhook (project `proj82381f44` — webhook list verified EMPTY 2026-09-08):
   - URL: `https://jwstkrtslotnjyerzzsi.supabase.co/functions/v1/rc-webhook`
   - Auth header: value from step 1
   - Events: `INITIAL_PURCHASE`, `NON_RENEWING_PURCHASE`
3. Real sandbox trip via Play Billing to prove the chain fires.

## Remaining Play blockers before Submit

| # | Task | Owner | State |
|---|---|---|---|
| A | Confirm the versionCode you actually want to promote (main is at 45; more bumps land almost daily) | Owner | verify at moment of press |
| B | Upload matching AAB to Internal testing | Owner | needs manual push OR run `ci.yml` |
| C | Fresh Firebase Test Lab Robo run on that versionCode | Owner + CI | mandatory gate |
| D | Stock-Android walkthrough | Owner | mandatory gate |
| E | Android Vitals clean over the test window | Owner watches | mandatory gate |
| F | Re-check Data safety form in-console (CSV writes silently) | Owner | pre-Send verification |

## Confidence to send for review

- **Below 60%** while (2) has never generated for any bundle and (C) has not been run on the promotion candidate.
- Pattern to avoid: another single-review-cycle rejection under Broken Functionality — Google's reviewer WILL tap Create Wallet on a stock Pixel, and the RASP/KEK gate WILL fail closed on a device we have not shaken out.

## What is NOT in scope of this submission

- Apple 1.0.1 — separate `RELEASE-v1.0.1-APPLE-SUBMISSION.md`.
- Referral chain end-to-end verification (owner action; does not block Play Send).
- Independent third-party audit — remains outstanding.
- Play production release rollout (12-tester / 14-day rule applies to production only; internal testing is unaffected).

## Session PR trail relevant to Play (2026-09-07 → 2026-09-08)

Nothing merged this session specifically shipped Play-side code. Play state above reflects earlier work (data safety CSV import, referral parity, keystore reset, Firebase Test Lab pipeline) plus this session's RC/webhook audit.
