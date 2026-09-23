# Veyrnox 1.0.2 — release notes and submission state

Owner: Al Jobson. Last updated: 2026-09-23.

**PLAY: LIVE 2026-09-23 — versionCode 57 at 100%. APPLE: NOT SUBMITTED.**
Google approved versionCode 57 and the owner published it the same day; it is
in front of the entire Play install base. **versionCode 56 never shipped** — it
was submitted on 2026-09-22, then withdrawn from review on 2026-09-23 and
replaced, because it predated fixes that reach Android. The full sequence is in
"Play release record" below, and it is recorded rather than smoothed over,
because a reader who sees only "1.0.2 shipped" would reasonably assume 56 was
what shipped.

Apple has no 1.0.2 version record yet; every row in "Outstanding before Apple
submission" still stands. Every status tag below follows `CLAUDE.md`: BUILT (in
code, tests green), TARGET, PLANNED, HONEST-DISABLED. Still not **verified** in
this release: no on-chain txid and no independent audit. The owner's
stock-device golden-path walkthrough was done on versionCode 57 and is
owner-reported, not instrumented. Android Vitals has returned EMPTY on every
read to date, so there is no crash telemetry behind this release.

---

## Version numbers

| | 1.0.1 (live) | 1.0.2 (this train) |
|---|---|---|
| Apple `MARKETING_VERSION` | 1.0.1 | 1.0.2 |
| Apple `CURRENT_PROJECT_VERSION` | 59 (live) | 8 |
| Play `versionName` | 1.0.1 | 1.0.2 |
| Play `versionCode` | 48 (was production) | **57 (live)** |

Pinned by `src/__tests__/staging-mobile-release.test.js` — mutation-checked
2026-09-19 (reverting any one value turns the pin red; re-checked on the 56→57
bump in #2754). The 1.0.2 column was 50 / 62 when this file was written on
2026-09-19. Since then: Play took seven further bumps (50→57, per
`android/app/build.gradle` commit history). Apple's 62 was NOT incremented —
the counter was restarted at 1 for the 1.0.2 train and is now at 8 (see "Apple
build numbers restart per train" below). This table has gone stale twice now;
the pin tracks the repo, so read the pin, not this table, if they disagree.

Apple build numbers restart per train, so 1.0.2's build 6 is not behind 1.0.1's
build 59. Play's live production versionCode is **48**, not 49 — read from the
Play Developer API on 2026-09-22. 49 reached the `alpha` track only, which is
what the 2026-09-19 draft of this file could not distinguish from a public page
read.

## Baseline — what 1.0.1 actually is

Read from App Store Connect on 2026-09-19, not from this repo's notes:

- App `6790188660`, version `1.0.1`, `appStoreState: READY_FOR_SALE`. It is the
  live version.
- Live build is **59**, uploaded 2026-09-11, from review submission
  `3ca728bd` (submitted 2026-09-11T19:07Z, `COMPLETE`).
- Builds 60 and 61 exist in this repo only. Neither was ever attached to a store
  version.
- Play: **the app is published**, not merely in testing. The public listing at
  `play.google.com/store/apps/details?id=com.veyrnox.app` returns 200 in US and
  GB and reads "Updated on Sep 11, 2026"; a bogus package id on the same host
  returns 404, and a draft or closed-testing-only app has no public listing.
  This is a read of the public page, **not** of the Play Developer API, so
  which `versionCode` is live in production is unconfirmed — `versionCode 49`
  reached Closed testing (`alpha`) on 2026-09-13, which is a different track.
  CI's Play upload step gates on a versionCode change, so every merge to `main`
  since has skipped the upload.

**So the 1.0.2 diff baseline is iOS build 59 = commit `bf77471f`, not build 57.**
Two fixes that earlier drafts of this file listed as new to 1.0.2 — the
blank-page-on-launch guard (`bf68a1be`, build 58) and the non-blank `/buy`
fallback (`bf77471f`, build 59) — are already live in 1.0.1 and are **not** part
of this release.

Prior record correction: `CLAUDE.md` and
`docs/RELEASE-v1.0.1-APPLE-SUBMISSION.md` both stop at "rejected twice,
2026-09-08". Apple approved the 2026-09-11 resubmission and 1.0.1 shipped.
Those files have not been amended; treat this section as the current reading.

## Scope of the change

`bf77471f..main` — 89 commits, 45 touching shipping code, 223 files,
+8,574 / −1,318.

### Security and deniability

- **Seven shared-store pages leaked across session types** (`6042722e`,
  `cc9efadb`, #2537). OnChainAnalytics, AnomalyDetection, FraudDetection,
  BudgetLimits, RecurringPayments, SavingsGoals, InvoiceGenerator and
  SendCrypto read and wrote the shared `veyrnox-appdata` IndexedDB with no
  session gate, so a decoy session could list the real user's transaction
  history and mutate the real user's budgets, recurring payments, savings goals
  and invoices. Now two-chokepoint gated (`enabled: !deniable` on every query,
  `DENIABILITY_BLOCKED` as the first statement of every mutation), matching the
  PriceAlerts / AddressBook / Settings shape. 14 reintroduced defects each turn
  the suite red. **BUILT, INTERNAL — not exercised in a real decoy session on a
  device** (a simulator cannot; see `CLAUDE.md`).
- **Eight findings from the 2026-09-16 surface audit** (`ead82be8`, #2580).
  Highest-impact: `functions/api/edge/[fn].js` dropped `X-Rc-User-Id`, so
  tip-chat's entitlement gate never saw an id and returned `403
  entitlement_required` to every subscriber on that route — the Advisor only
  worked via the legacy Supabase-direct URL the proxy exists to replace, and not
  at all on a native build with no legacy URL. The header is now copied **by
  name**, never passed through, because a blanket passthrough on a proxy that
  injects `SUPABASE_ANON_KEY` server-side would let a caller override
  `Authorization`/`apikey`.
- **Panic wipe missed two biometric markers** (`c3f14f7f`). Same class as the
  first-run-tour residue finding: presence is the tell.
- **CORS reflected the Vite dev origin in production** (`4b40daf8`).
- **Unbounded upstream calls** on Pages Functions and the tip-chat entitlement
  lookup now carry a timeout and a response-size cap (`f6459374`, `038663df`).
- **CI secret gate** and a pin on the tracked-`.env` invariant (`52ffb2cb`).

### Theft Protection (new, BUILT)

- `29e6c0a9` — optional OS biometric step-up on unlock, on top of PIN + KEK.
  Reuses `verifyBiometric2fa`; no new native plugin, no face templates stored.
  iOS is face-strict (post-check `BiometryType.faceId`); a Touch-ID-only device
  is rejected with `requires-face`. Android accepts any Class-3
  (`BIOMETRIC_STRONG`) — **face-only cannot be enforced there, no public API
  exists**, and the UI copy states the asymmetry rather than hiding it. Fails
  closed on every branch (RASP throw, probe throw, verify throw, verify false,
  unknown biometry type). Gated on `isPrimary`, so decoy and hidden unlocks
  never see the prompt.
- `4ba80bbf` — a send that breaches the per-transaction or daily spend cap now
  runs the same fresh RASP + biometric gate instead of a silent checkbox
  acknowledgement. Consumed as a one-shot token, so an earlier pass cannot reach
  a later signer. Mirrored on the WalletConnect signer, which previously
  hard-rejected every over-limit request with no acknowledgement affordance.
- `c8c72fc8` — a Theft Protection refusal is no longer counted as a wrong PIN.
- `61fa71e8` — panic wipe clears the Theft Protection opt-in marker.

**Not device-verified. No independent audit.**

### Over-the-air web bundle updates (new, BUILT — and armed for the first time)

- `a00fbaae` — signed OTA updates for the web bundle. Every trust decision is
  native and fails closed: ECDSA P-256 signature against a key pinned in the
  store binary, per-file sha256 with no extra files permitted, re-verified on
  every cold start, monotonic version floor, channel and `minNativeApi` checks,
  rollback plus permanent block of a bundle that never reports ready. A store
  binary newer than the OTA bundle wins. The JS half only moves bytes. Also
  closes a pre-existing gap: Capacitor loaded its persisted `serverBasePath`
  with no verification — `DisableDeploy` is now set and the path cleared on
  every launch.
- `64c61512` — two hardware signing keys pinned, either accepted. Each lives on
  its own YubiKey 5C NFC (PIV slot 9c, P-256, generated on-token, touch required
  per signature) and cannot be extracted, so it cannot be backed up; pinning
  both means losing a token costs nothing. Keys provisioned 2026-09-18, tokens
  A `39744850` and B `39744871`, both proved end to end against a real
  1066-file bundle.

**OTA is ARMED for 1.0.2 (owner decision, 2026-09-19).** Both keys are pinned,
so 1.0.2 is the first store build that can apply an over-the-air update. This
reverses the #2627 disarm, which merged earlier the same day.

**1.0.2 is the carrier release, and it still needs a store submission.** OTA is
how JS-level fixes reach users *after* this build — it cannot deliver this one.
Every install in the field has an empty key list (1.0.1 build 59 and Play
versionCode 49 predate #2612), so none of them will ever accept an OTA bundle;
1.0.2 changes native Swift and Kotlin, which never ships over the air; and Apple
2.5.2 / DPLA 3.3.1(B) limit downloaded code to bug and security fixes, while
1.0.2 carries features. So: submit once, then JS-only fixes go over the air.

**The privacy disclosure that arming required is in this release.** Privacy
section 12, "Security Update Checks", in `src/pages/TermsLegal.jsx`: what the
check sends (nothing from the wallet), what the server sees anyway (IP and
time), that it is not optional, and that it runs identically in decoy and demo
sessions — with the reason stated rather than glossed. Sections 0 and 11 amended
so neither contradicts it.

**The I3 ruling is still open**, and arming went ahead without it. `docs/ota-updates.md`
carries the argument both ways plus a suggested restatement. I2 was the binding
constraint and is addressed by the disclosure; I3 is a wording question about an
invariant and is the owner's to settle.

Runbook, residual risks and the open question: `docs/ota-updates.md`. **Not
device-verified.**

### Referrals

- `133ded16` — `/r/<code>` share links claimed as universal / verified app
  links, so the code is captured in the app rather than in a browser the app
  never sees.
- `f3f764a5` — a code now survives a store install: Play Install Referrer on
  Android, a user-initiated clipboard handoff on iOS. No third-party attribution
  SDK. All paths go through `captureReferralFromUrl`, so validation, the I3 gate
  and telemetry stay in one place.
- `230637fd` — `get_referral_tier` RPC and partner tier lock.
- `69fbd29c`, `7e61d42b` — the share links are served by a Worker on the zone,
  path match following live Pages routing.
- `535f5dd1` — iOS native allowlist lets the referral universal links through.
- `2803732c` — the Create Wallet invite field routed through the shared capture
  path.

### Paywall

`81eae844`, `63ee8e08`, `5120eea9`, `338f2dad`. Found by reading production
data, not code: of 2,139 devices that ever emitted `session_start` on prod
`public.events`, 2,114 (98.8%) did so on exactly one calendar day, 18 on two,
and **seven have ever reached three** — which was the day-3 nudge threshold.
`paywall_shown` had fired twice in eight weeks against 2,304 `wallet_ready`
devices. Threshold lowered to 1, the constant exported so the boundary tests
derive from it, plus a separate pin on the value so raising it goes red and
sends the reader back to the data. `/plans` now emits its own impression event —
RevenueCat cannot fill that gap, because every offering in the project has
`paywall_id: null` (the screen is custom), so RC paywall encounters are zero by
construction. Also: per-period CTA verdict, focus-safe retry, honest threshold
note, and one billing toggle instead of two drifted copies.

### UX and accessibility

- `1a103891` — whole-app audit of 81 pages against 20 UX principles, 40 findings
  fixed. Two worth naming: the Send review screen carried a **dead**
  risk-acknowledgement checkbox (`TransactionIntelligencePanel` rendered without
  `acknowledged`/`onAcknowledge`, so on a WARN/RISK send the user saw two "I
  understand the risk" checkboxes under one header, one live and one inert); and
  nothing anywhere in the send flow said a transfer is irreversible —
  `irreversible`, `cannot be undone` and `unrecoverable` had zero hits in
  `SendCrypto.jsx` and `en/wallet.json`.
- `e5aa427f`, `62b46df2` — every Button call site raised to the 44px touch-target
  floor.
- `aa353218`, `b37cfef8`, `c25f287a` — nav groups collapsed, 12px text floor,
  EmptyState migration across pages.
- `1755b04c`, `5c6ba351`, `7fb6cb6e` — dead public-surface links, landing/404
  mobile layout, print palette and reduced-motion handling.
- `7e489ece`, `f2167d12`, `47305600` — Vigil, the Veyrnox mascot, on paywall
  surfaces and RiskShield; deliberately kept out of toasts.

### Dependencies

`777dda87` (23-package npm minor/patch group), `78e290f6` (ESLint 10 with
react-plugin compatibility fixes), `3c21fd54` (`@capacitor/cli` 8.5.1),
`435f52b4` (`Package.resolved` regenerated for purchases-capacitor 13.5.1).

---

## Store-facing "What's New"

English is the source of truth (`store-metadata/en.json`, `apple.whatsNew`).
**The 44 sibling locales still read "Initial release."** — they were never
updated for 1.0.1 either, and they are not updated here. Translating them is a
separate pass through the existing machine-translation convention described in
`store-metadata/README.md`.

`store-metadata/_schema.json` has **no `play.releaseNotes` key**, so Play's
"What's new" has no home in this repo and is console-only until the schema gains
one.

## Play release record — 56 submitted and withdrawn, 57 live

Two production submissions happened in two days. Only the second shipped.

### Final state, read from the Play Developer API on 2026-09-23

Read back after publishing, not from the console UI alone:

```
production  1.0.2  codes ['57']  status completed  userFraction None
internal    1.0.2  codes ['57']  status completed
alpha       1.0.1  codes ['49']  status completed
```

`status completed` with no `userFraction` is what 100% looks like. The public
listing returned HTTP 200 in GB at the same time, and the console moved "Last
published" from September 22 to September 23.

**48 is gone from the production track.** Under a staged rollout the previous
release stays `completed` and serves the remainder; at 100% it is replaced
outright. So there is no release underneath 57 to fall back to, and no rollout
percentage to dial down — reversing means a new versionCode and another review.

### Timeline

| When | What |
|---|---|
| 2026-09-22 | **56 submitted** to production review, 20% staged. Promotion only — 56 was already on `internal` (sha256 `6d8859cf…`), nothing rebuilt. |
| 2026-09-22 | Quick checks passed; Google review began. |
| 2026-09-23 | #2751 and #2753 merged. Both change shared `src/`, so both reach Android; 56 predates them. |
| 2026-09-23 | **56 withdrawn** from review (#2754 bumped `versionCode` to 57). Its draft was discarded; 56's versionCode is permanently consumed and can never be re-uploaded. |
| 2026-09-23 | 57 built by CI from `a4559997` and uploaded to `internal`. |
| 2026-09-23 | Owner walked the golden path on 57 from Internal on a stock device. |
| 2026-09-23 | **57 submitted** at 100%, approved by Google the same day, and published by the owner. |

### Why 56 was replaced rather than left to ship

56 predated two merges that change shared `src/` and therefore reach Android:

- **#2751** — sidebar overflow and input boundary caps. (The UIScene half of
  that PR fixes an iOS 1.0.2 build 6 launch crash and is iOS-only; the `src/`
  half is not.)
- **#2753** — adjustable Theft Protection spend limit, and removal of the
  user-facing "Built" badge.

Withdrawing cost 56 its place in the review queue and burned its versionCode.
That was accepted deliberately: shipping a build known to be missing fixes, to
100% of users, is the worse trade.

### Rollout: 20% → 100%, and what that gave up

56 was staged at 20% on the reasoning that Vitals is empty and the owner
walkthrough was the only evidence, so a halt lever was worth having. 57 was
submitted at **100%** at the owner's direction. The trade is stated plainly
rather than implied: at 100% there is no halt lever, no staged ramp, and no
previous release serving the remainder.

**Managed publishing is ON**, and it did its job here — Google's approval parked
the release in "ready to publish" and a human pressed Publish. Submitted is not
approved, and approved is not live.

### Release notes as actually submitted

The English notes were written for Apple at 1084 characters. **Play caps
`releaseNotes` at 500**, so the submitted Play text is a 486-character rewrite,
not the Apple copy:

> Theft Protection (optional)
> An extra biometric check on unlock, on a send over your spend limit, and to
> loosen or turn off that limit. Android accepts any strong biometric; no API
> can require face alone, so we do not claim it does.
>
> Clearer approvals
> A WalletConnect spend approval now names the token, the spender and whether
> the amount is unlimited.
>
> Also: referral codes survive install, Redeem Code and Manage Subscription
> open, and the send screen says a transfer cannot be undone.

Two deliberate cuts. The iOS referral instructions ("Copy code & get it on the
App Store") are gone: Android captures the code through Play Install Referrer
with no user steps, and naming another app store inside a Play listing is a
policy risk. The Android biometric asymmetry is kept in full, because dropping
it for length would have turned an honest limitation into an implied claim.

The 44 sibling locales are untouched and still read "Initial release." Play's
"What's new" still has no home in `store-metadata/_schema.json`; these notes
were entered in the console by hand.

### Evidence behind the live release, and what it is not

- **The owner's stock-device walkthrough on versionCode 57 is the entire
  evidence base.** Owner-reported, not instrumented. It is what the 100%
  rollout rests on.
- **Android Vitals: EMPTY on every read — 2026-09-19, 2026-09-22, 2026-09-23.**
  Crash rate, ANR rate and error issues all return zero rows via
  `scripts/play-vitals.sh`. That is unmeasured, not clean, and it contributed
  no signal to any decision in this release. With 57 now in front of the whole
  install base, Vitals starting to return rows is the first real signal
  available; an empty read tomorrow still means unmeasured.
- Play raised one warning on 57: download size 35.3 MB, up 9.08 MB on the
  previous release. Informational, not blocking. (The same warning on 56 read
  9.06 MB.)
- Play also raised three advisory recommendations against this train, none of
  them review blockers: edge-to-edge (#2749, two of the three) and R8
  optimization (#2750). #2749 records that `MainActivity` already calls
  `EdgeToEdge.enable()` and Play flags it anyway, which falsifies the claim in
  that call's own code comment.
- A store-listing change (app name → "Veyrnox: Self-Custody Wallet") published
  on 2026-09-22, separately from either release submission — Play keeps the two
  queues apart. Who or what pressed Publish was not established.

### Why this went through the console

`android/fastlane/Fastfile` has no production lane. The service account
`github-actions-testlab@veyrnox-wallet.iam.gserviceaccount.com` can open an
edit and stage a production release over the API, but `edits:validate` and
`edits:commit` return `403 PERMISSION_DENIED` — it holds upload and testing
rights, not "Release to production". Granting that scope, or keeping production
a deliberate console-only gate, is an owner decision that has not been made.

A second gate sits earlier in the same path: CI's `android-release` and
`publish-to-play-internal` jobs both run under the `Production` GitHub
environment, which requires a human approval before the AAB is even built. Both
approvals were given by the owner for the 57 build. Worth knowing because the
run sits silently in `waiting` until someone acts, and it looks like a stall.

## Outstanding before Apple submission

Play is done — **shipped and live at 100%**, see "Play release record" above;
every item below is Apple-only unless noted.

1. **The pre-submission checklist in `CLAUDE.md` applies in full.** It was not
   retired after the 1.0.1 submission; it is the standard for the next
   submission of any build to either store.
2. **Owner stock-device walkthrough (row 3) is the sole automated-gate
   substitute.** *(Play: done on versionCode 56 on 2026-09-22 and again on
   versionCode 57 on 2026-09-23, both owner-reported. The 56 attestation was
   NOT carried over to 57 — 57 is a different binary, so it was walked on its
   own.)* Play Pre-launch report was waived 2026-09-04 (#1960) and the
   Firebase Test Lab Robo substitute was waived 2026-09-10 as accepted residual.
   FTL runs are advisory only.

   **Android Vitals: EMPTY on all three reads.** 2026-09-19 covered 2026-07-01
   → 2026-09-18; 2026-09-22 and 2026-09-23 covered 2026-08-24 → 2026-09-22/23
   (see "Evidence behind the live release" above). Every Reporting API metric
   set — crash rate, ANR rate, error counts, error issues — returned zero rows
   every time. That is
   not a clean bill of health; Vitals fills only from installs that opted into
   Usage & diagnostics, and Play suppresses below-threshold metrics. So Vitals
   has contributed **no signal** to any 1.0.2 decision, and row 3 remains the
   only real evidence. Re-run `PLAY_VITALS_ACCOUNT=<sa> scripts/play-vitals.sh`
   before any future submission; if it is still empty, say so rather than
   recording a pass.
3. **iOS: rebuild the webview payload before archiving.** `npm run build && npx
   cap sync ios`. `ios/App/App/public` is gitignored, so whatever a previous
   local run left there is what Xcode packages.
4. **Byte-check the `.ipa`** — must print nothing:
   ```
   unzip -p App.ipa 'Payload/App.app/public/assets/index-*.js' \
     | grep -oE 'VITE_(BYPASS_RASP|DEV_UNGATE_SEND|DEMO_MODE):"1"'
   ```
5. **Create the ASC 1.0.2 version record.** None exists. The current draft
   submission `2af87adc` errors `STATE_NOT_SUITABLE_TO_SUBMIT` because it is
   attached to the live 1.0.1.
6. **OTA decision — MADE 2026-09-19: ships ARMED.** Reverses the disarm that
   merged earlier the same day. Store notification remains unnecessary: Apple
   permits downloaded interpreted code for bug and security fixes (Guideline
   2.5.2 / DPLA 3.3.1(B)) and Play permits JS that runs in a WebView, so neither
   store requires a declaration. The privacy disclosure prerequisite is met in
   this release; the I3 ruling remains open and is tracked in
   `docs/ota-updates.md`.
7. **Translate `apple.whatsNew`** into the 44 sibling locales, or accept an
   English-only "What's New" with the rest reading "Initial release."
8. **Amend the remaining stale records.** `src/lib/featureCatalogue.js` was
   fixed in this change — the iOS entry had claimed "TestFlight 1.0.1 Build 11,
   READY_FOR_BETA_TESTING … no App Store review submission made" and the Android
   entry had claimed the app was "not yet publicly listed on Play". Both are
   corrected and now carry pins. Still stale and **not** touched here:
   `CLAUDE.md` (its App Store section stops at the two 2026-09-08 rejections and
   its Play section describes a `Draft` app) and
   `docs/RELEASE-v1.0.1-APPLE-SUBMISSION.md` (header still reads "REJECTED
   TWICE, REPLIED … awaiting Apple's response").

   Worth recording as a process result: the Android catalogue entry carried four
   honesty pins and stayed broadly honest for months; the iOS entry beside it
   carried none and had rotted through two false statements. **Absence of a pin
   is not neutrality.** One of the Android pins — `does not let "submitted" read
   as approved, published, or listed` — had itself gone false and was enforcing
   it, which is the tripwire working as designed: it named the honesty property,
   so a reader could tell it needed flipping rather than deleting.
