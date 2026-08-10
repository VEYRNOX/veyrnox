---
title: Epics & Stories — Play Store first production submission
project: veyrnox
created: 2026-08-09
updated: 2026-08-09
inputDocuments:
  - _bmad-output/planning-artifacts/prds/prd-veyrnox-2026-08-09/prd.md
  - CLAUDE.md
stepsCompleted: [step-01, step-02, step-03]
---

# Play Store First Production Submission — Epics & Stories

## Requirements Coverage

FRs from PRD → 4 epics, 14 stories. NFRs applied as cross-cutting acceptance criteria on every story.

| FR | Epic | Stories |
|---|---|---|
| FR-1 | E1 | S1.1, S1.2 |
| FR-2 | E2 | S2.1, S2.2 |
| FR-3 | E2 | S2.3 |
| FR-4 | E2 | S2.4 |
| FR-5 | E3 | S3.1, S3.2 |
| FR-6 | E3 | S3.3, S3.4, S3.5 |
| FR-7 | E4 | S4.1 |
| FR-8 | E4 | S4.2 |
| FR-9 | E2 | S2.5 |

---

## Epic E1 — Closed-Testing Gate (12 testers / 14 days)

**Goal:** Satisfy Play's structural gate for personal developer accounts before Production eligibility.

**Value:** Only structural blocker to Production. Without it, Production submission is impossible regardless of code readiness.

### S1.1 — Stand up closed-testing track

**As** the owner
**I want** a Play Console closed-testing track with a public join URL
**So that** ≥12 testers can enroll

**Acceptance criteria**
- Closed-testing track exists in Play Console, distinct from internal
- Latest signed `app-release.aab` (versionCode ≥6, from `main` green pipeline) published to closed
- Public opt-in URL generated + documented in `docs/play-launch/closed-testing.md`
- Release notes populated
- Day-0 timestamp of first closed-track publish recorded in `.memlog.md`

**Dependencies:** none

### S1.2 — Enroll + retain ≥12 active testers for 14 continuous days

**As** the owner
**I want** ≥12 opted-in testers each opening the app at least once during the window
**So that** Play counts them toward the gate

**Acceptance criteria**
- ≥15 testers enrolled (buffer of 3 above the 12 floor)
- Each tester opens the app at least once between day 0 and day 14
- Tester count queried on Play Console at day 7 + day 14 + snapshot to `docs/play-launch/closed-testing.md`
- No versionCode regressions during the window (a lower versionCode restart resets the gate)
- On day 14, Play Console shows the "eligible for Production" state

**Dependencies:** S1.1

---

## Epic E2 — Production Release Artifact + Submission

**Goal:** Produce a signed, verified, policy-compliant release artifact and submit it for Play review.

**Value:** The submission itself.

### S2.1 — Build signed release AAB from `main` green SHA

**As** the release engineer
**I want** a signed `app-release.aab` reproducible from a specific commit
**So that** the release is auditable

**Acceptance criteria**
- versionCode ≥6 (5 consumed on internal)
- `keystore.properties` resolves `storeFile` from the correct base dir (regression from PR #1310→#1313)
- `jarsigner -verify` clean on the AAB
- `BuildConfig.RELEASE_CERT_SHA256` = Google's app-signing cert (`D8:99:69:D5…6C:B9`)
- Full pipeline green (verify, unit-tests, mainnet-flag-gate, staging-gate, release-cert-guard) with **no** `--admin` overrides
- Build SHA + AAB sha256 logged to `docs/play-launch/release-artifact.md`

**Dependencies:** none

### S2.2 — Release-cert guard passes on release AAB

**As** the release engineer
**I want** the debug-cert guard to fail-closed on wrong fingerprints
**So that** a debug-signed release cannot ship (4th regression fixed in #1386/#1391)

**Acceptance criteria**
- `android-release` job green on the release SHA
- Standing test `release-cert-guard` green on the PR that opens the promotion
- Guard's `-PALLOW_MISSING_DEBUG_KEYSTORE` and `-PALLOW_UNREADABLE_UPLOAD_KEYSTORE` escape hatches NOT used
- If red, do not weaken the guard — diagnose

**Dependencies:** S2.1

### S2.3 — Finalize Production store listing

**As** the owner
**I want** listing assets, description, screenshots, and policy declarations finalized in Play Console
**So that** the review has a complete package

**Acceptance criteria**
- App title, short description, full description, feature graphic, ≥4 phone screenshots — screenshots taken from a **Production-signed install** (not internal-testing), no dev banner, no debug watermark
- Category: Finance
- Content rating questionnaire complete
- Privacy Policy URL: `https://veyrnox.com/privacy` (verified by rendering the SPA, not `curl`)
- Contact email + website URL populated
- Listing description contains **no** claim of independent audit (I4)

**Dependencies:** S2.1 (Production-signed build available for screenshot capture)

### S2.4 — Data Safety, Financial Features, and content declarations

**As** the owner
**I want** Data Safety and policy declarations to match shipped behavior
**So that** review does not flag misrepresentation

**Acceptance criteria**
- Data Safety form reflects all 9 owner-decisions from `docs/play-launch/data-safety-form.md`, with Analytics purpose declared (per 2026-07-23 update)
- Financial Features declaration: self-custody crypto wallet, no custody by publisher
- Crypto Assets policy questionnaire answered — if it demands a custody/KYC statement Veyrnox cannot make, halt and route to counsel
- Ads: none
- Target age: 18+
- Family policy: N/A
- Telemetry described matches actual events: `receive_viewed`, `send_completed` (with asset symbol), and the other 5 event types in `api/trackEvent.js`; opt-in default, Settings → Privacy toggle available

**Dependencies:** none

### S2.5 — Submit for review with 1% staged rollout, monitor policy warnings

**As** the release manager
**I want** the AAB submitted to Production at 1% rollout with 24h policy-warning watch
**So that** any Play policy flag is caught inside SLA

**Acceptance criteria**
- Production release created with staged rollout **1%**
- Submitted for review
- Play Console monitored at least once every 12h for the first 72h post-submission
- Any policy warning acknowledged + response drafted within 24h
- Release notes published (English + `document_output_language`)
- Immediate versionCode bump to 7 queued on `main` for the first patch

**Dependencies:** S2.1, S2.3, S2.4, S1.2 (eligible for Production)

---

## Epic E3 — IAP + Referral End-to-End on Production

**Goal:** Prove the whole revenue + growth loop works on a real Production install, once.

**Value:** Sandbox ≠ production. First real revenue event = the only proof.

### S3.1 — Verify Safety Plus purchase on Production install

**As** the release engineer
**I want** one real Production purchase completed end-to-end and refunded
**So that** the IAP path is proven under production signing + Play Billing

**Acceptance criteria**
- Fresh Production install on a real device with a real payment method
- Purchase of `safety_plus` monthly succeeds
- RevenueCat webhook fires, entitlement granted, app enables Safety Plus features within one app resume
- Purchase refunded immediately via Play Console (smoke test only)
- Screenshot + Play Console order ID logged to `docs/play-launch/iap-verification.md`

**Dependencies:** S2.5 (Production release live), FR-5 (all 10 promotional offers active)

### S3.2 — Verify promotional-offer pricing renders from store, not hardcoded

**As** the QA engineer
**I want** the paywall to render store-returned prices for at least 2 of the 4 referral tiers
**So that** Play's FX/rounding cannot silently overcharge (Bronze full-price-in-Albania scenario)

**Acceptance criteria**
- Paywall test on Production install for `referral_bronze` and `referral_gold` tiers
- Prices displayed = `product.priceString` + `offerPriceInfo` derivation, never hardcoded tier %
- Unresolvable offer → paywall shows no price (I4) and blocks purchase with `OFFER_UNAVAILABLE`, never falls through to base price

**Dependencies:** S3.1

### S3.3 — Deploy RC webhook (H-1 server-side rc_user_id binding) — **BLOCKER**

**As** the platform engineer
**I want** the existing `supabase/functions/rc-webhook/` Edge Function deployed and wired to RevenueCat
**So that** the referral bonus chain functions end-to-end

**Note:** Edge Function handler + Deno tests already exist on `main` (see `supabase/functions/rc-webhook/index.ts` and its `__tests__`). This story is deployment + RC dashboard wiring + production proof — NOT re-implementation. Detailed runbook in `_bmad-output/implementation-artifacts/3-3-deploy-rc-webhook-h1-server-side-binding.md`.

**Acceptance criteria**
- `supabase functions deploy rc-webhook --no-verify-jwt` succeeds against production (flag required — RC sends shared secret in `Authorization`, not a Supabase-signed JWT)
- `REVENUECAT_WEBHOOK_AUTHORIZATION` env var set in Supabase Edge Function secrets (shared bearer secret from RC dashboard — NOT `REVENUECAT_V1_SECRET_KEY`, which is the privileged REST API key used only by `first-referral-bonus`)
- SQL setter `sql/referral-rc-webhook.sql` present in production DB (verify via `pg_proc` query in the story runbook)
- RevenueCat dashboard webhook configured: URL points at `/functions/v1/rc-webhook`, Authorization header value = `REVENUECAT_WEBHOOK_AUTHORIZATION`
- Bearer-secret verification test: missing / wrong Authorization returns 401 and writes nothing (existing `supabase/functions/rc-webhook/__tests__/*.test.ts`)
- One real `INITIAL_PURCHASE` event fires end-to-end → `referrals.rc_user_id` populated (owner query result logged to `docs/play-launch/rc-webhook-deploy.md`)
- Client code confirmed no longer sending `rc_user_id` (H-1, already true post-2026-07-28 wave)

**Dependencies:** none, but **blocks** S3.4 and blocks Production submission per PRD Risk 1

### S3.4 — Run production Supabase migrations in documented order

**As** the platform engineer
**I want** the SQL migrations executed in the exact order in CLAUDE.md
**So that** REVOKEs do not land before the service-role key is in place

**Acceptance criteria**
- Ordering: (1) merge PR #1606, (2) set `SUPABASE_SERVICE_ROLE_KEY` on `veyrnox-prod` Pages, (3) verify deployed, (4) run REVOKEs
- SQL executed:
  - `sql/api-security-hardening.sql` (H-2/H-3 batch + `record_attribution` REVOKE)
  - `sql/first-referral-bonus.sql`
  - `sql/check-first-referral-bonus-hardening.sql`
  - `sql/bonus-claim-rate-limit.sql`
  - `sql/definer-search-path-pin.sql` (re-run)
  - `sql/telemetry-events-allowlist.sql` (metadata cap + `SET search_path` pin)
- Post-run smoke: `generate_referral_code` / `register_referral_code` / `track_event` succeed as `anon` via `/api/rpc/*`
- If any RPC returns `permission denied for function <name>`, follow `docs/rpc-service-role-migration.md` rollback

**Dependencies:** S3.3 (webhook shipped first so `rc_user_id` is written server-side)

### S3.5 — End-to-end referral proof on Production

**As** the release engineer
**I want** one production referral cycle: generate → register → first purchase → attribution → bonus grant
**So that** the growth loop is proven

**Acceptance criteria**
- Referrer device generates a code on Production install
- Referee device registers the code
- Referee purchases `safety_plus` (can be same as S3.1)
- `record_attribution` writes a row
- RC webhook fires, first-referral bonus Edge Function grants the bonus atomically (single-grant claim rate-limited 5/hr/code)
- Both devices see the bonus in their referral tracker
- Owner query in Supabase confirms one attribution row + one bonus row, no duplicates
- Logged to `docs/play-launch/referral-e2e-verification.md`

**Dependencies:** S3.1, S3.3, S3.4

---

## Epic E4 — Security Posture on Production + Rollout Discipline

**Goal:** Security controls behave identically on Production vs internal; staged rollout has a halt criteria doc.

**Value:** A silent RASP/KEK regression on the Production signing chain would be a critical safety failure. The halt doc is the only reason a staged rollout isn't a coin flip.

### S4.1 — Verify RASP + KEK on Production install

**As** the security engineer
**I want** RASP `detectTamper` + KEK auto-enroll flows verified on a Production install
**So that** the Production signing chain has not silently regressed behavior device-verified on internal

**Acceptance criteria**
- Production install on stock Pixel-class device: RASP `detectTamper` returns clean (no Security Alert)
- KEK auto-enroll succeeds on all four entry paths: fresh create, phrase import, PIN recovery, file restore
- No RASP false-positive triggered by Google's re-signing chain
- Vault v:2 blobs decrypt (AAD binding preserved)
- Panic wipe run: `inspectKeyMaterial().clean === true`, `localStorageResidue` empty (residue-first-run-tour regression guard still green)
- Results logged to `docs/play-launch/rasp-kek-production-verification.md`

**Dependencies:** S2.5

### S4.2 — Publish staged-rollout halt criteria

**As** the release manager
**I want** a written halt criteria doc for each rollout stage
**So that** halt-vs-continue is a decision against thresholds, not vibes

**Acceptance criteria**
- `docs/play-launch/rollout-halt-criteria.md` created
- Stages: 1% → 5% → 20% → 50% → 100%
- Halt thresholds per stage: crash-free rate <99.5%, ANR rate, RASP false-positive rate, KEK enrollment failure rate, IAP purchase failure rate, referral webhook 5xx rate
- Named owner per stage
- Rollback statement: Play has no true rollback — halt + supersede with a higher versionCode is the only mechanism; document the runbook

**Dependencies:** none (documentation-only; must land before S2.5 submission)

---

## Cross-Cutting Acceptance Criteria (apply to every story)

- **I1–I6 preserved** — no invariant weakened for launch pressure
- **I4 honesty** — no artifact (listing, docs, release notes) describes internal audit as independent
- **Fail closed** — any error in a security check denies the action
- **Telemetry consent** — no event transmitted without stored consent (two-chokepoint gate: `api/trackEvent.js` egress + `lib/consent.js` writes)
- **CI gates** — no ruleset weakening, no `--admin` overrides, no test-suite mocks that would let production Supabase receive test rows (`vitest.config.js` env blanking preserved)
- **Panic-wipe residue** — any new writer to localStorage is added to `ALL_RESIDUE_KEYS` before merge

## Dependency Graph (Critical Path)

```
S3.3 (RC webhook) ──► S3.4 (SQL migrations) ──► S3.5 (E2E referral)
                                                      │
S1.1 ──► S1.2 (14-day gate) ─────────────────────────┐│
                                                     ▼▼
S2.1 ──► S2.2, S2.3, S2.4 ──► S4.2 ──► S2.5 ──► S3.1 ──► S3.2, S4.1
```

**Critical path length ~ 14 days** (S1.2 gate dominates). Everything else parallelizes.

## Sequencing Recommendation

1. **Day 0** — S1.1 (start closed-testing gate ticking), S3.3 (start RC webhook implementation), S4.2 (halt doc)
2. **Days 1–7** — S2.1, S2.2, S2.3, S2.4 in parallel; S3.4 (SQL migrations) once S3.3 lands
3. **Day 14** — S1.2 gate satisfied → S2.5 submit at 1% rollout
4. **Post-submission** — S3.1, S3.2, S3.5, S4.1 on Production install
5. **Ratchet rollout** per S4.2 thresholds
