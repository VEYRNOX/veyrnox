# Veyrnox 1.0.2 — release notes and submission state

Owner: Al Jobson. Last updated: 2026-09-19.

**NOT SUBMITTED.** This file is written at the point the version numbers were
bumped. Nothing here has been archived, uploaded, or reviewed. Every status tag
below follows `CLAUDE.md`: BUILT (in code, tests green), TARGET, PLANNED,
HONEST-DISABLED. Nothing in this release is **verified** — no on-chain txid, no
real-device walkthrough of the 1.0.2 build, no independent audit.

---

## Version numbers

| | 1.0.1 (live) | 1.0.2 (this train) |
|---|---|---|
| Apple `MARKETING_VERSION` | 1.0.1 | 1.0.2 |
| Apple `CURRENT_PROJECT_VERSION` | 59 (live) / 61 (repo) | 62 |
| Play `versionName` | 1.0.1 | 1.0.2 |
| Play `versionCode` | 49 | 50 |

Pinned by `src/__tests__/staging-mobile-release.test.js` — mutation-checked
2026-09-19 (reverting any one value turns the pin red).

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

**This is the material change for 1.0.2 and it deserves stating plainly:** the
pinned key list is non-empty on both platforms (`OtaConfig.PUBLIC_KEYS_SPKI_B64`,
`VeyrnoxOta.publicKeysSpkiB64`), so **1.0.2 is the first store build in which
OTA is capable of applying an update**. On 1.0.1 and every install already in the
field the list was empty and OTA was inert. Every prior release could only change
by store review; this one can change without it. Runbook and residual risks:
`docs/ota-updates.md`. **Not device-verified.**

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

## Outstanding before submission

1. **The pre-submission checklist in `CLAUDE.md` applies in full.** It was not
   retired after the 1.0.1 submission; it is the standard for the next
   submission of any build to either store.
2. **Owner stock-device walkthrough (row 5) is the sole automated-gate
   substitute.** Play Pre-launch report was waived 2026-09-04 (#1960) and the
   Firebase Test Lab Robo substitute was waived 2026-09-10 as accepted residual.
   FTL runs are advisory only.
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
6. **OTA decision.** 1.0.2 is the first build where OTA can apply an update.
   Decide deliberately whether it ships armed, and whether Apple and Google need
   telling — both stores have rules about downloading executable code. This is
   an owner decision, not a build detail.
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
