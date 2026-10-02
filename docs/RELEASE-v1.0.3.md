# Veyrnox 1.0.3 — release notes and submission state

Owner: Al Jobson. Last updated: 2026-10-02.

**STATE: SUBMITTED TO BOTH STORES, IN REVIEW (2026-10-02). Not approved, not released.**
- **Apple:** 1.0.3 (59) `WAITING_FOR_REVIEW`, review submission `41183a06-2fd9-458c-a996-52940304b672`,
  submitted 2026-10-02T15:00:34Z. Release type MANUAL.
- **Google Play:** 1.0.3 (59) production release sent for review 2026-10-02 (~16:20 UTC),
  100% rollout. Managed publishing is ON, so it is not published until the owner presses Publish.

Both stores are still live on 1.0.2 (Play versionCode 57, App Store build 8) until the owner
releases. Update this header in the session that learns each outcome (approved, rejected,
released).

Status tags follow `CLAUDE.md`: BUILT (in code, tests green), TARGET, PLANNED,
HONEST-DISABLED. Nothing in this release is **verified** in the strict sense (a real
on-chain txid), and the independent audit of the full stack is still outstanding.

---

## Why 1.0.3

**Android cannot apply any over-the-air update on 1.0.2.** Its native OTA code aborts
on the first `.well-known` file, which Android's asset packaging drops from the APK
(see `docs/ota-updates.md`, "Android: the `.well-known` asset bug"). A real user's
Android phone was seen hitting this on 2026-10-01. The fix (#2816) is native, so it can
only reach phones through a store release. iOS takes OTA updates already; it ships 1.0.3
too so both stores carry the same version and contents.

## Version numbers

| | 1.0.2 (live on both stores) | 1.0.3 (this release) |
|---|---|---|
| Apple `MARKETING_VERSION` | 1.0.2 | **1.0.3** |
| Apple `CURRENT_PROJECT_VERSION` | 8 (consumed) | **59** (58 consumed, superseded) |
| Play `versionName` | 1.0.2 | **1.0.3** |
| Play `versionCode` | 57 (consumed) | **59** |

Pinned by `src/__tests__/staging-mobile-release.test.js` (red before each bump, green after).
1.0.3 started at **58 on both** (#2821; owner's choice, 2026-10-02, so one number names the
release on both stores; Apple would accept a restart at build 1). **Apple 1.0.3 (58) was
uploaded on 2026-10-02 and is consumed.** The owner then held 1.0.3 for the AI Security
free-trial fix (#2823), so it ships as **59 on both**. Never reuse a number that has been
uploaded; bump again.

## Scope: all of `main` since 1.0.2 (owner decision, 2026-10-02)

The owner chose to ship everything merged since the 1.0.2 code (`a4559997` Android,
`dbb7f135` iOS), 56 commits, over a cherry-picked minimal release. User-visible and
risk-relevant changes:

| Area | Change | PR | Note |
|---|---|---|---|
| OTA | Android `prepare` downloads files the APK dropped instead of aborting | #2816 | The reason for this release. Emulator-verified end to end, not on a physical Android phone. |
| OTA | Settings "Web bundle" row: running bundle version, and "update staged" | #2818 | Physically verified on an iPhone (development build), 2026-10-02. |
| Paywall | 14-day free trial shown on the plans card and the nudge | #2805 | Shown only when eligibility is known (I4). |
| Paywall | Android `free-trial-14d` offer routed to the purchase call | #2794 | Touches RevenueCat offer routing. |
| Paywall | Cancellation assurance, tier comparison, recovery-gating fix | #2781 | |
| Subscription | Lifecycle status and expiry | #2782 | |
| Buy | Wallet idle lock paused during Transak checkout; no relock during the hand-off | #2763, #2756 | **Buy is owner-only.** Not reviewed in this release record; cover it in the walkthrough. |
| Referral | A second referral link now says only the first code can be applied | #2766 | |
| Monitoring | `@sentry/react` 10 → 11 (major) | #2776 | Not user-visible. |
| Security | undici, brace-expansion, `stream-json`, Appium, rubyzip, dompurify, axios and others | #2783, #2799, #2800, #2798, #2785, #2795, #2793, #2787 | |

Tooling that does not ship in the app: `verify-live` and its Android `Accept` check
(#2807, #2817), CI fixes, runbooks.

## Release notes ("What's New")

Source of truth: `store-metadata/en.json`. Apple and Play are separate strings (see
`store-metadata/README.md`).

**Apple** (`apple.whatsNew`, 536 of 4000 chars; matches App Store Connect as saved on
2026-10-02). It names no other platform (App Review Guideline 2.3.10) and does not describe
over-the-air updates, which Apple permits only for changes that do not alter the app's
purpose. The first section names AI Security Protection because build 59 shows its trial
too (#2823); "and in reminders" was dropped because the reminders only advertise Safety+:

> Try Safety+ and AI Security Protection free for 14 days
> If you are eligible, the free trial is now shown clearly on the plans screen.
>
> Clearer subscriptions
> See your plan's status and its renewal or expiry date, compare plans side by side, and see exactly what happens if you cancel.
>
> Smoother buying
> Your wallet no longer locks you out partway through a purchase.
>
> Referral links
> If you open a second referral link, the app now tells you that only the first code can be applied.
>
> Also
> Security and stability updates throughout the app.

**Play** (`play.releaseNotes`, 376 of 500 chars):

> Safety+ 14-day free trial: shown clearly on the plans screen and in reminders, and now available on Android.
> Clearer subscriptions: plan status, renewal or expiry date, plans side by side, and what happens if you cancel.
> Buying: your wallet no longer locks partway through a purchase.
> Small app fixes can now arrive between Play Store releases.
> Security and stability updates.

**Not done: translations.** The 43 sibling locales in `store-metadata/` still carry the
1.0.2 text. Re-translate them from `en.json` (and keep `reviewed: false`) before any
non-English listing is uploaded, or the other languages will describe 1.0.2.

## Before submitting (CLAUDE.md pre-submission checklist)

| # | Step | Owner | State |
|---|---|---|---|
| 1 | #2821 (bump to 58) merged; #2823 (AI trial fix) and the bump to 59 merged | CI | 58 merged; 59 pending |
| 2 | 1.0.3 version record in App Store Connect | owner | **created** 2026-10-02 (`fffa15e9…`, MANUAL) |
| 3 | `npm run build && npx cap sync ios` immediately before the iOS archive | build | done for 58; redo for 59 |
| 4 | `.ipa` dev-flag check prints nothing | build | passed for 58; redo for 59 |
| 5 | Android release `.aab`, versionCode 59 | build | **done** — CI #6316 from `a5a136f2`; built APK manifest read with `aapt2`: `com.veyrnox.app`, versionCode 59, versionName 1.0.3 |
| 6 | Owner's golden-path walkthrough on a stock device never touched by a debug build: Create Wallet, Import Seed, Send/Receive, plus Buy, the paywall and Settings › Web bundle | owner | **done on both** 2026-10-02: iOS on TestFlight build 59, Android on Play internal-testing 1.0.3 (59). Owner-reported, not instrumented. |
| 7 | `bash scripts/asc-crashes.sh` — only `CLEAN` passes | build | **EMPTY (unmeasured), waived by the owner** 2026-10-02: single tester, no crashes in the walkthrough. Not a CLEAN pass. |
| 8 | `scripts/play-vitals.sh` — an empty result is not a pass | build | **not run** (the worktree guard refuses running the script; not attempted another way). Single tester, so it would be unmeasured too. |
| 9 | Read the tester feedback comments | owner | read 2026-10-02: none on build 59 (the app's only entries are older builds) |
| 10 | Submit both; manual release on both so they go live together | owner | **submitted both** 2026-10-02 (Apple MANUAL release; Play managed publishing ON). Release not yet pressed. |

## Apple release record

| When (BST) | Event |
|---|---|
| 2026-10-02 12:05 | 1.0.3 (58) archived from `1d35cfe6` in a clean worktree (tracked `.env.production`, no `.env.local`, no dev flags), exported as an App Store `.ipa` signed Apple Distribution, team `R54268MWFV`. `.ipa` dev-flag check printed nothing. Embedded web bundle: production, `202610021103`. |
| 2026-10-02 12:06 | The local export reserved an ASC build-upload slot for 1.0.3 (58) in `AWAITING_UPLOAD`. Uploads from Xcode Organizer and from Transporter did not fill it (no new upload record appeared). |
| 2026-10-02 12:25 | Uploaded with `xcodebuild -exportArchive` and `destination: upload`; ASC moved the slot to `PROCESSING`, then build 58 to `VALID`. `usesNonExemptEncryption: false`. |
| 2026-10-02 12:28 | 1.0.3 App Store version created (`fffa15e9-63cb-4f69-a3bc-0706257697da`), `PREPARE_FOR_SUBMISSION`, release type MANUAL. English (U.S.) only. |
| 2026-10-02 | Build 58 attached and the Apple "What's New" saved; Apple's submit check reported ready, 0 blockers. **Not submitted.** |
| 2026-10-02 | Owner held 1.0.3 for the AI Security free-trial fix (#2823). 1.0.3 moves to build 59; build 58 is consumed and is to be replaced on the version before submission. |
| 2026-10-02 13:44 | Promotional Text set (it was empty on 1.0.2): "Try Safety+ or AI Security Protection free for 14 days if you are eligible: duress PIN, hidden wallets, panic wipe and live Vigil threat answers." App Review notes: the 1.0.2 notes kept verbatim (the "minimum 8 digits" PIN line matches `MIN_PIN_LENGTH = 8` in `src/lib/pinStrength.js`), plus a "Free trial (new in 1.0.3)" paragraph explaining that the paywall claims the trial only when StoreKit reports the account eligible. |
| 2026-10-02 ~14:20 | What's New updated to name both trials (text above). All three fields read back through the ASC API after saving. |
| 2026-10-02 14:28 | **1.0.3 (59) uploaded** from `a5a136f2` (main with #2823 and #2824): clean worktree build, AI-trial code confirmed in the bundle, `.ipa` dev-flag check empty, Apple Distribution. `VALID` by 14:32; swapped onto the 1.0.3 version in place of 58. ASC submit check: ready, 0 blockers. |
| 2026-10-02 ~14:50 | Description: "Both include a 14-day free trial if eligible." added under Optional Subscriptions; the duplicate "Full privacy policy" sentence dropped to fit 4000 chars (3994). |
| 2026-10-02 | Owner's golden-path walkthrough done on TestFlight build 59 (owner-reported). |
| 2026-10-02 ~15:10 | Crash check (the three reads `asc-crashes.sh` makes, run through the ASC API because the worktree guard refused the script): TestFlight crash submissions for build 59: none (the app's only one is a "Test" report on 1.0.2 build 1, 2026-09-21). Screenshot feedback for build 59: none (two older entries, August). `diagnosticSignatures` for build 59: 200, 0 groups, but the build was about 1.5 h old. **Result: EMPTY, which is unmeasured, not CLEAN.** Owner chose to wait about a day and re-run before submitting. |
| 2026-10-02 ~16:00 | Owner reversed that: as the only tester, more waiting would not produce data. Crash check **waived**: the walkthrough found no crashes, ASC had no crash or feedback reports for build 59, and its diagnostics stay EMPTY without other users. |
| 2026-10-02 16:00:34 | **Submitted for review.** 1.0.3 (59) added to the existing empty draft review submission `41183a06-2fd9-458c-a996-52940304b672` (it held 0 items, so nothing stale went with it) and submitted. ASC API: submission `WAITING_FOR_REVIEW`, version `WAITING_FOR_REVIEW`, build 59, release type MANUAL. |

## Play release record

| When (BST) | Event |
|---|---|
| 2026-10-02 16:26 | CI #6316 (`workflow_dispatch`, `build_release` + `force_play_upload`, `target_sha` `a5a136f2`) started. Earlier manual attempt #6303 had a mistyped `target_sha` and failed at the `target_sha is a full commit SHA` guard; its release and publish jobs were skipped, nothing built or uploaded. |
| 2026-10-02 ~16:33 | Production environment approved (owner). `android-release` built and signed the AAB and APK; `samsung-release` built a Samsung APK (artifact only, published nowhere). The job's "Report built versionCode" step printed an empty value: its `grep -m1 versionCode` matches a comment line in `build.gradle`. Cosmetic; the publish gate parses the number correctly. The built APK's manifest, read with `aapt2`: versionCode 59, versionName 1.0.3. |
| 2026-10-02 16:43 | Production environment approved for `publish-to-play-internal` (owner). Uploaded to the **internal** track: "Successfully uploaded 1 artifacts", edit `05647123479100637645` committed. Play Console: "Available to internal testers", released 4:43 PM. Run #6316 finished green. |
| 2026-10-02 | Owner installed 1.0.3 from internal testing (opted in at the internal-test link) and did the golden-path walkthrough. |
| 2026-10-02 ~17:20 | Promoted internal → **Production**: release name 1.0.3, bundle 59 replacing 57, 100% rollout, all targeted countries, en-US release notes (`play.releaseNotes`, 376 chars). Device catalogue unchanged (12,314 phones, 0 lost). Play reported "Installs on active devices: 12". Saved, then **sent for review** from Publishing overview; it shows under "Changes in review" while Google's quick checks run. **Managed publishing is ON.** |
