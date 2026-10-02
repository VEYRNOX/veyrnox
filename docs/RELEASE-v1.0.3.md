# Veyrnox 1.0.3 — release notes and submission state

Owner: Al Jobson. Last updated: 2026-10-02.

**STATE: IN PREPARATION. Not built, not uploaded, not submitted to either store.**
Both stores are still on 1.0.2 (Play versionCode 57, App Store build 8). Update this
header in the session that learns each outcome; "submitted" has an outcome.

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
| 5 | Android release `.aab`, versionCode 59 | build | not started |
| 6 | Owner's golden-path walkthrough on a stock device never touched by a debug build: Create Wallet, Import Seed, Send/Receive, plus Buy, the paywall and Settings › Web bundle | owner | not started |
| 7 | `bash scripts/asc-crashes.sh` — only `CLEAN` passes | build | not started |
| 8 | `scripts/play-vitals.sh` — an empty result is not a pass | build | not started |
| 9 | Read the tester feedback comments | owner | not started |
| 10 | Submit both; manual release on both so they go live together | owner | not started |

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

The empty draft review submission `41183a06…` (no items) predates 1.0.3 and was left alone.

## Play release record

None yet.
