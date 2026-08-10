---
story_id: 1.1
story_key: 1-1-stand-up-closed-testing-track
epic: 1
status: ready-for-dev
created: 2026-08-09
---

# Story 1.1 — Stand up closed-testing track

## User story

**As** the owner
**I want** a Play Console closed-testing track with a public opt-in URL and a signed AAB published to it
**So that** ≥12 testers can enroll and the 14-day Play gate starts ticking

## Why this exists

Play's 12-tester / 14-day closed-testing rule gates PRODUCTION for personal developer accounts. **Internal testing does NOT count.** Until a closed-testing release exists AND ≥12 opted-in active testers pass 14 continuous days, Production submission is impossible regardless of code readiness.

This story is on the critical path. Every day it slips = 1 day slip on E1 (14-day gate) = 1 day slip on the whole Production launch.

## Acceptance criteria

### AC-1 — Closed-testing track exists in Play Console

- Play Console → Testing → **Closed testing** → create a new track (distinct from internal)
- Track name: `veyrnox-closed`
- Countries/regions: same set intended for Production (documented in FR-8 later — for now, worldwide minus any known crypto-restricted jurisdictions; owner confirms list before this AC signs off)

### AC-2 — Signed AAB published to closed track

- Fresh signed `app-release.aab` built from `main` at green pipeline HEAD. The internal-testing AAB is versionCode 5 and cannot be reused — closed testing requires a distinct versionCode, and `build.gradle` is already at 6.
- versionCode ≥6 (5 consumed on internal)
- `BuildConfig.RELEASE_CERT_SHA256` = Google's app-signing cert (`D8:99:69:D5…6C:B9`)
- Full pipeline green (verify, unit-tests, mainnet-flag-gate, staging-gate, release-cert-guard) on the SHA that produced the AAB — no `--admin` overrides
- Release notes written (English + `document_output_language`) describing what testers are receiving

### AC-3 — Tester eligibility list + opt-in URL

Play closed-testing opt-in URLs are NOT public join links — an account must be on an eligible-tester list (email list or Google Group) to opt in and download. Both parts required:

- Create the tester list first. Two options:
  - Google Group (recommended: `veyrnox-closed-testers@googlegroups.com` — persistent, easier to add/remove testers without a Play deploy) OR
  - Email list uploaded via Play Console → Testing → Closed testing → `veyrnox-closed` → Testers tab → **Create email list**
- Assign the list to the `veyrnox-closed` track (Testers tab → select list)
- Generate the **opt-in URL** on the same page
- Web opt-in enabled so eligible testers self-serve after joining the group / being added to the list
- URL + tester-list mechanism (Group address or email list name) documented in `docs/play-launch/closed-testing.md`

### AC-4 — Documentation

- Create `docs/play-launch/closed-testing.md` covering:
  - Opt-in URL
  - Tester-list mechanism (Google Group address or email-list name) and how testers install (join list → opt-in URL → Play link)
  - **Day-0 timestamp = the date the 12th eligible tester opts in AND has installed**, NOT the publish date. Play's 14-day rule counts "days with ≥12 opted-in active testers"; recording publish/first-tester as day 0 will overstate readiness and cause a premature Production submission.
  - Publish date recorded separately (for audit trail), clearly labelled as pre-count.
  - Tester count snapshot template (fill at day 7 and day 14 after the 12-tester threshold is met — tracked by S1.2)
  - Halt criteria: any versionCode regression, any listing change that Play treats as a new review, or dropping below 12 active testers resets the counter (day 0 is redefined when the count next hits 12)

### AC-5 — First tester enrolled on publish day (day 0 recorded later)

- Owner (or a nominated first tester) opts in via the URL and installs the build on **publish day** (this proves the pipeline works end-to-end; it is NOT day 0 of the 14-day count — see AC-4)
- Screenshot of the install in Play Store logged to `docs/play-launch/closed-testing.md`
- Recruitment of the other 11 testers is S1.2; day 0 of the 14-day count is stamped when the 12th tester opts in

## Out of scope

- Recruiting the other 11+ testers (that is S1.2)
- Any code change — this story is Play Console configuration
- Any listing / Data Safety / declarations work (Epic 2)

## Files to touch

**NEW:** `docs/play-launch/closed-testing.md`

**READ (context only):** existing `docs/play-launch/` docs — reuse format, use the same section conventions.

## Developer context

### The 14-day counter is deceptively strict

- Play counts **days with ≥12 opted-in active testers**. A day where only 11 are active does not count.
- "Active" = opted in AND has opened the app at least once during the window (per Google's public docs; the exact definition is opaque, so buffer with ≥15 testers).
- A lower versionCode publish resets the tester count. Never regress versionCode on this track. If you need to roll back, publish a HIGHER versionCode with the older behavior.
- Changing the listing (title / screenshots / description) can trigger a re-review and reset. Do all listing changes as part of Epic 2 stories, not here.

### Do NOT block on the 14-day clock

- Kick this story off day 0 and move on. S1.2 tracks the wall-clock.
- Meanwhile Epic 2 (release artifact + listing + declarations) and Epic 3 (RC webhook — S3.3 done — + IAP + referral E2E on production) all parallelize on the same 14-day window.

### Reuse the existing internal-testing AAB if possible

- The internal-testing release is already device-verified (RASP clean on Pixel 10, IAP sandbox-verified).
- Reusing that AAB avoids a fresh build variance risk.
- If `main` has moved since, take the fresh build — do not ship stale.

## Verification (owner-facing)

- [ ] Closed track `veyrnox-closed` visible in Play Console
- [ ] AAB published, versionCode ≥6 (actual: ___), SHA: ___
- [ ] Tester list created (Google Group address / email-list name): ___
- [ ] Opt-in URL: ___
- [ ] `docs/play-launch/closed-testing.md` created
- [ ] Publish date: ___ (NOT day 0)
- [ ] First tester installed on publish day
- [ ] Day 0 recorded separately when 12th tester opts in (tracked by S1.2)

## Risks

- **Data Safety mismatch.** If Play flags the closed release for Data Safety questions the internal release passed, the 14-day counter may not start. Pre-empt by confirming the closed release's Data Safety is inherited unchanged from internal.
- **Crypto Assets policy re-questionnaire.** Closed testing may trigger the Crypto Assets policy questionnaire independently of internal. Answer identically to what Epic 2 S2.4 will lock in for Production.
- **Personal account limits.** A personal developer account has stricter defaults than an organization. Verify closed-testing IS enabled for personal accounts (per Play docs, it is — but confirm before assuming).

## Status

`ready-for-dev` — 5 ACs, no code, mostly Play Console + one doc.
