# Veyrnox — project guide for Claude Code

Veyrnox is a self-custody, coercion-resistant crypto wallet (Vite + React + Capacitor;
ethers v6; @noble / @scure). Web + mobile (iOS/Android via Capacitor). The seed is the
identity; the app never holds keys server-side.

> **Full audit history:** `docs/CLAUDE-audit-archive.md` (moved 2026-07-20 to reduce
> context-window pressure). Read on demand when you need PR-level detail.

## Model cost rule

Default to the cheapest capable model (Haiku or Sonnet) for subagents, research, and
routine tasks. Only escalate to Opus for complex multi-file architectural changes,
security-critical code (wallet-core, signing, KEK, RASP), or tasks that explicitly
require deep reasoning. When spawning subagents, pass `model: "haiku"` or
`model: "sonnet"` unless the task justifies Opus.

## Hard rules (do not violate)

- **Mainnet unlocked 2026-06-17.** `ALLOW_MAINNET = true`, `ALLOW_BTC_MAINNET = true`,
  `ALLOW_SOL_MAINNET = true`. Both the internal audit (2026-06-17, the mainnet gate) and
  the independent ECC third-party audit (2026-06-23) are complete. "Internal" is never
  presented as "independent" (I4 honesty). Independent third-party security audit of the
  full stack (S1–S4 + crypto + KEK + RASP) remains outstanding.
- **Verify, don't assert.** An asset/feature is "verified" ONLY after a real on-chain
  testnet transaction confirms on a block explorer with a txid the user supplies. Passing
  tests, clean review, or a green suite are NOT verification.
- **Status tags.** BUILT (in code, testnet/provisional), TARGET (designed, audit-gated),
  PLANNED (roadmap), or HONEST-DISABLED (present but off on principle). Code-complete +
  tests green = BUILT at most.
- **Audit gate (§24).** The internal audit gates mainnet. RASP, hardware KEK, device
  attestation, network hardening, and cloud recovery are TARGET/PLANNED — need real-device
  verification and the audit.
  - **Personal Backup override (2026-08-08, owner-authorized):** Personal Backup
    (2-of-3 Shamir DEK sharding per `docs/cloud-recovery-shard-spec.md`) may
    proceed to implementation ahead of the independent audit. Full record in
    AGENTS.md's Audit-gate bullet — carveouts unchanged: internal-audit review
    of the completed architecture is still required, real-device verification
    before enrollment, I1/I3 invariants preserved. Nothing here is "verified"
    until an on-device recovery trip completes and an independent audit passes.
- **No fake security.** Never mock a security control to look real. If something can't be
  delivered honestly, honest-disable it (I4: fail honest, fail closed).

## Current state summary (2026-07-28)

**Hardware KEK:** Both platforms BUILT + device-verified (INTERNAL). M2c (iOS SE) and M2d
(Android StrongBox/TEE) UNGATED (PR #1152). Android C-1 v3 salt-binding FIXED +
device-verified. iOS device-verified FULL (2026-07-08). KEK auto-enroll on all wallet
entry paths — fresh create (PR #1298) + phrase import, PIN recovery, file restore
(PR #1301) — eliminates redundant PIN re-entry at enrollment. Independent audit
outstanding.

**RASP:** F-09 DEVICE-VERIFIED (FULL, INTERNAL) on Android (Magisk, 2026-07-12) and iOS
(palera1n, 2026-07-14). G3 Frida Gadget detection device-verified on both platforms.
C-01 native fail-closed gate fixed (PR #825). Play Integrity ES256 JWS verification +
nonce binding fixed (PRs #955, #1009).

**Vault:** AES-256-GCM, Argon2id 192 MiB KDF. v:2 blobs with AAD binding (PR #1076).
KEK-DEK AAD salt exclusion P1 fixed (PR #1079).

**WalletConnect:** C3 RASP gate, H7 chain binding (pre-modal), H8 address binding
(pre-modal), M9 gas cap, M11 session expiry, H-NEW-B step-up re-auth. 2FA + spend-limit
gate on `eth_sendTransaction` (PR #1118). `from`/signer address binding on
`eth_sendTransaction` and `eth_signTypedData_v4` (PR #1118). **H-1 session-approval RASP gate FIXED (PR #1276, merged 2026-07-20):**
`handleApproveSession` was reading `gate.blocked`/`gate.sentence`, which
`presignGateOrReject()` never returned — every WC session approval proceeded regardless
of RASP tier. Fixed to read `!gate.proceedAllowed` (same shape the three signing
chokepoints already use). Regression-tested, BUILT, INTERNAL — not device-verified.

**Safety Plus IAP:** Monthly $5.99 + Annual $49.99 (same `safety_plus` entitlement).
Store-side setup complete (Apple + Google + RevenueCat). iOS sandbox-purchase
device-verified. **Apple account is now an Organization (Veyrnox LTD, Team R54268MWFV) —
verified 2026-07-21; Guideline 3.1.5(b) satisfied**, unblocking the iOS real-device build
and the first App Store / IAP submission (both still to be done). Play launch still gated
on the upload-key reset (pending). Referral system BUILT (4-tier discount model, Supabase server-side codes,
API-hardened PR #1334 — dedup + rate-limited RPCs, see tracking section below;
further API-hardened 2026-07-28 by the internal-audit wave: H-1..H-3 identity/access,
M-6..M-8 rate-limit + idempotency, L-8..L-10 dedup + IP dimension, see the 07-28
entry — CODE only, SQL still pending run in Supabase);
deniability-hardened 2026-07-20 (PR #1262, K-2): `syncCount` no longer coerces a failed API
read into a fake "synced" success state written to shared localStorage, and the tracker
page now renders a neutral empty state (gated on `isDeniabilityOrDemoActive()`) instead of
reading/writing real referral state in decoy/demo sessions.

**Promotional offers (2026-07-23) — BUILT, INTERNAL, no purchase ever made.** All 10
store-side offers exist on both platforms (4 referral tiers + retention 50%, × monthly and
annual). The two stores are NOT symmetric and code must not treat them as one mechanism:
- **Play** — offers on the base plan, matched by TAG (`referral-gold`), bought with
  `purchaseSubscriptionOption`. Every offer carries `rc-ignore-offer`, so a discount only
  applies if the app names it. Discounts are true percentages in every currency.
- **Apple** — promotional offers matched by IDENTIFIER, signed by RevenueCat
  (`getPromotionalOffer`, using the In-App Purchase key — already uploaded and valid; the
  "StoreKit Subscription Offer key" slot is for local StoreKit-config testing only), bought
  with `purchaseDiscountedPackage`. Identifiers are unique per subscription GROUP and
  reject hyphens, hence `referral_gold_monthly` / `_annual` and the asymmetric
  `retention_50` / `retention_50_annual`. Mapping table: `purchases.js APPLE_OFFER_IDS`.
- **Apple cannot express small percentages.** 2.5% off is not a price point; Bronze uses
  the nearest point at or BELOW target ($5.79 / $48.49), so a customer is never charged
  more than advertised. FX rounding erases small discounts entirely in some territories
  (Bronze is full price in Albania/Armenia) — so the paywall must render the
  store-returned price, never a hardcoded tier percentage.
- A package's `priceString` is always the BASE plan price on both stores; the offer price
  comes from `purchases.js offerPriceInfo` (Apple `product.discounts[]`, Play the option's
  `introPhase`). Unresolvable → render no price rather than the base price (I4).
- All offer paths fail CLOSED: a missing or unsigned offer throws `OFFER_UNAVAILABLE`
  rather than falling through to a full-price charge.
Not verified: no real purchase has been completed on either platform.

**Anonymous event tracking (PR #1321) — LIVE, and it changed the privacy story.**
`api/trackEvent.js` writes 7 event types to our own Supabase with a random
`veyrnox-device-id`; `receive_viewed` and `send_completed` carry an asset symbol.
Suppressed entirely in deniability/demo (I3). Consequences worked through 2026-07-23:
- The pipeline is PROVEN to work end-to-end, but has **zero real-user data** — the
  only rows ever written were 126 from local test runs (see below).
- **Test suite was writing to PRODUCTION Supabase.** `.env.local` credentials leak
  into Vitest, so any test rendering WalletProvider inserted real rows — 126 events
  across 114 phantom device_ids from one run. Fixed in PR #1328 by blanking the
  Supabase env in `vitest.config.js` (same mechanism already used for
  VITE_FORCE_TIER/VITE_BYPASS_RASP). CI was never affected (no `.env.local` there),
  which is why a green pipeline never caught it.
- **Store declarations were understated.** Play Data Safety and Apple App Privacy
  both claimed App-functionality-only; **Analytics** purpose added to both
  2026-07-23. Still open: Apple's **Usage Data → Product Interaction** is undeclared.
  **Consent/opt-out now exists (2026-07-26):** opt-in screen at first wallet entry
  (`TelemetryConsent.jsx`, suppressed in deniability/demo) plus a permanent toggle
  at Settings → Privacy. The gate lives in `api/trackEvent.js` — the single egress
  chokepoint — NOT in `analytics.js emit()`, because the 11 original call sites
  bypass `emit()` entirely. Declining transmits nothing and mints no device id.
  **Two chokepoints, not one (2026-07-27, PR #1410):** `trackEvent.js` gates
  EGRESS; `lib/consent.js` gates WRITES to the shared
  `veyrnox-telemetry-consent` key. Three writers existed — `TelemetryConsent
  .choose()`, the Settings switch, `WalletEntry`'s fresh-create reset — and none
  checked for a decoy/demo session, so a coerced tap could flip or wipe the real
  user's answer. `setConsent()`/`clearConsent()` now no-op there (reads stay
  ungated; reading leaves no trace). Do NOT re-guard at call sites — that
  three-place duplication is exactly how the third writer shipped unguarded.
- **veyrnox.com/privacy — the "dated 16 June / no analytics or tracking" note
  here was WRONG and is deleted.** Verified by rendering the live page
  2026-07-26: it says "Last updated: 23 July 2026" and already discloses the
  usage events. What it actually needs is the CONSENT update (it mirrors the
  pre-consent in-app §9): opt-in wording, Settings → Privacy, the fuller event
  list, and the panic-wipe line. Paste-ready copy:
  `docs/veyrnox-com-privacy-corrections-2026-07-26.md`.
  The site source is NOT in this repo, not in `aljobson/veyrnox-marketing`
  (content only) and not in `aljobson/Veyrnox.ai` — it is served by uvicorn on
  Render behind Cloudflare and the body is client-rendered, so `curl` shows only
  nav/SEO shell. Find the CMS before promising an edit.
- **API security hardening (PR #1334, merged 2026-07-23).** All Supabase writes
  now go through rate-limited SECURITY DEFINER functions — no direct table INSERT
  via the anon key. Controls: `track_event()` 60/device/hour + event allowlist
  (the 4 KB metadata cap this line used to claim was NEVER implemented in
  `api-security-hardening.sql`; it and a `SET search_path` pin were added for
  real in `sql/telemetry-events-allowlist.sql`, 2026-07-26 — rerun that file);
  `increment_referral()` 1 per device per code (dedup table
  prevents count-inflation attack); `generate_referral_code()` 1 per device;
  `register_referral_code()` 3/device/hour; `record_attribution()` validated +
  2/code/hour; `referral_attributions` public SELECT removed (revenue data no
  longer disclosed). Shared `lib/deviceId.js` extracted. SQL migration:
  `sql/api-security-hardening.sql`. BUILT, INTERNAL — not independently audited.
- **H-3 (2026-07-28) — `record_attribution` REVOKE appended to
  `sql/api-security-hardening.sql`, SHIP-ONLY.** Every SECURITY DEFINER function
  in that file was created with the default PUBLIC EXECUTE grant, leaving
  `record_attribution` reachable by the anon key — a caller can forge revenue
  rows against any published referral code (subject to the 2/hr rate limit and
  the $0–$1000 range), inflating a referrer's earnings display. The primary
  H-3 fix REVOKEs `record_attribution` from PUBLIC/anon/authenticated and
  GRANTs EXECUTE to service_role only. The seven other functions listed in
  `sql/check-first-referral-bonus-hardening.sql`'s STILL OPEN section receive
  the same treatment in the same commit — but six of them (`track_event`,
  `increment_referral`, `generate_referral_code`, `register_referral_code`,
  `get_referral_earnings`, `get_referral_paid_count`) still have live anon
  callers in `src/api/referralApi.js` and `src/api/trackEvent.js`. Running the
  SQL without a matching client refactor will break referral + telemetry
  writes at runtime. Owner must review before executing. Only
  `record_attribution` and `get_referral_leaderboard` are safe-immediate.
  - **CORRECTED 2026-08-07 — the "client refactor" above is DONE, and the
    remaining prerequisite is one env var, not a rewrite.** Those two modules no
    longer touch PostgREST: both `import { rpc } from '@/api/edgeApi'`, and
    `edgeApi.rpc()` is `post('/api/rpc/' + encodeURIComponent(fn), params)`.
    Nothing under `src/` contains `supabase.rpc(` or `/rest/v1/rpc`. The
    refactor landed with the Pages Functions layer in `e99dd422`; this bullet
    was written before it and was never revisited. Calls still arrive as role
    `anon` for one reason only — `functions/api/rpc/[fn].js` injected
    `SUPABASE_ANON_KEY`. **That file was the last anon caller.**
  - PR #1606 makes that proxy prefer `SUPABASE_SERVICE_ROLE_KEY` with an anon
    fallback, so it is a NO-OP until the secret is set. **Ordering is
    load-bearing:** (1) merge #1606, (2) set `SUPABASE_SERVICE_ROLE_KEY` on the
    `veyrnox-prod` Pages project, (3) verify it is set and deployed, (4) THEN
    run the REVOKEs. Running (4) first still breaks every referral and
    telemetry write — symptom is `permission denied for function <name>` from
    `/api/rpc/*`. Full runbook, including rollback:
    `docs/rpc-service-role-migration.md`.
  - **This does not close H-3, and must not be written up as if it does.**
    `record_attribution` stays in the proxy allowlist, so attribution remains
    client-INITIATED — just no longer anon-callable via PostgREST. H-3's intent
    is server-AUTHORED attribution via the RC webhook
    (`sql/referral-rc-webhook.sql`, still a skeleton). Removing it from the
    allowlist before that webhook exists would silently stop attribution being
    recorded at all.
  - **New standing rule:** once the service-role key is set, `ALLOWED_RPCS` in
    `functions/api/rpc/[fn].js` is the ONLY boundary in front of it, because
    service_role bypasses RLS. Never add a table-proxy route, a passthrough
    path segment, or a wildcard to any file that can read that key — with RLS
    bypassed, one such route is full database access.
  - **Process lesson, general:** this bullet described a blocker that had been
    resolved by unrelated work weeks earlier, and every subsequent session
    treated it as current because it read as authoritative. A statement about
    *another part of the codebase* decays silently — re-derive it from the code
    before acting on it, the way the CORRECTED line above was
    (`git grep 'supabase\.rpc(' -- src` returning nothing is the whole proof).

**All 10 assets LIVE** — ETH, MATIC, ARB, OP, AVAX, BNB, BTC, SOL, USDC, USDT.

**Play Store: LIVE on internal testing (2026-07-22).** Upload-key reset approved
2026-07-22 09:29 UTC. Release 5 (1.0) uploaded and published to internal testing track.
Upload key: `veyrnox-upload.jks` (SHA-1 `97:5A:05:8E…:BA:B2:F3`). App signing cert
(Google's): `D8:99:69:D5:C4:9F:39:50:A8:CA:20:03:13:C5:0E:B1:09:37:E3:9B:62:4B:38:64:
3F:B3:A0:4F:63:44:6C:B9`. RASP `detectTamper` verified clean on stock Pixel 10 (no
Security Alert). Play Billing (IAP) device-verified on internal track. GitHub Secrets
(`KEYSTORE_BASE64`, `KEYSTORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD`,
`RELEASE_CERT_SHA256`) updated 2026-07-22 for CI.
- versionCodes 1–5 consumed. Next upload must use **6+** (`build.gradle` is at 6).
- **Release build verified end-to-end 2026-07-23** (INTERNAL): signed `app-release.aab`,
  `jarsigner` verified, `BuildConfig.RELEASE_CERT_SHA256` = Google's app-signing cert.
  Fixed en route: `keystore.properties` `storeFile` resolved against the wrong directory
  (release path was dead), and the debug-fingerprint guard PR #1310 added had been silently
  dropped by PR #1313. See `docs/audit-2026-07-23-branch-review.md`. RASP on a Play
  install still device-unverified.
- **The debug-cert guard — FIXED 2026-07-26 (#1386 + #1391), issue #1373 CLOSED.**
  Two earlier versions of this line were wrong in opposite directions: first it claimed
  "CI now asserts the guard's rejections" while the assertion had never once passed, then
  it said the guard was inert and unfixed after #1386 had already landed. Current state,
  read from merged code rather than assumed:
  - **The guard fails closed** (`android/app/build.gradle`). #1386 replaced the
    fail-open `sha256Of` — which returned `null` on a missing storeFile and swallowed
    every exception — with a candidate sweep (`debugCandidates` × alias variants) that
    **throws** if nothing resolves, listing what it tried. #1391 closed the matching
    fail-open on the UPLOAD branch: a release keystore that exists but cannot be opened
    (wrong password/alias) no longer skips the comparison in silence. Both have explicit,
    typed-on-purpose escape hatches — `-PALLOW_MISSING_DEBUG_KEYSTORE=true` and
    `-PALLOW_UNREADABLE_UPLOAD_KEYSTORE=true`.
  - **The regression test now runs on PRs** (`release-guard-scope` + `release-cert-guard`
    in `ci.yml`). This is the half that mattered most: the test used to live inside
    `android-release`, gated on `github.ref == 'refs/heads/main' && event != pull_request`,
    so **no PR could ever catch a regression**. That is why an inert guard survived ~15
    merges over two days — every red run on main looked caused by whatever had just
    landed. The job also asserts the CORRECT fingerprint still builds, because a guard
    that rejected *everything* would otherwise pass all four rejection cases.
  - **Fail-closed guards need their preconditions built first.** #1386 alone made
    `android-release` worse, not better: it hard-failed on a missing debug keystore while
    the keystore was only created inside the test step that ran *after* the build. A
    revert was opened (#1389) and closed in favour of #1391, which creates the debug
    keystore before the build steps instead.
  - Fourth regression of this same guard: #1310 added → #1313 silently dropped → #1325
    restored → #1338 caught it → inert until #1386/#1391. If you touch it, the standing
    test is the thing keeping it honest — do not weaken it to make a build pass.
  - **Verified:** `android-release` succeeded on `main` at `ffe795ed` (run `30219992941`)
    — the first green run of that job since 2026-07-24. INTERNAL/CI evidence only; RASP
    on a Play install remains device-unverified, and no release has been shipped from it.
- **Personal** developer account: 12-tester/14-day rule gates **production only**.
- Data Safety: all 9 owner-decisions resolved (`docs/play-launch/data-safety-form.md`).
- **Apple account is now an Organization (Veyrnox LTD, Team R54268MWFV)** — Guideline
  3.1.5(b) satisfied. First App Store submission still to do.
- **iOS build 1.0 (2) uploaded 2026-07-23** (source: PR #1329). Contains the iOS
  promotional-offer path, the offer-price fix, and the inlined privacy policy.
- **CLI upload works — Xcode GUI is NOT required.** Earlier notes said the
  `xcodebuild` CLI failed on signing auth; that applied to device *runs*. With an
  App Store Connect **API key** the whole chain runs unattended:
  `archive` → `-exportArchive` (`destination: upload`) → delivered. Key lives at
  `~/.appstoreconnect/private_keys/AuthKey_<KeyID>.p8`, Issuer ID
  `2d4c5bd7-1de3-4953-b203-a92e788c2d7c`. Team Key, App Manager role is sufficient.
- **The export-compliance "blocker" was stale.** The locked French declaration was
  NOT blocking submission — uploads and submission were fine. The real gap was
  **Model Reporting Rules for Digital Platforms (MRDP)** sitting at "Missing Info"
  on the Veyrnox LTD business entity; answered 2026-07-23 (personal services = No)
  and now Active. Banking/Paid Apps/tax forms were Active throughout.
  Always check App Store Connect directly before treating a note as current.
- `ITSAppUsesNonExemptEncryption` set to `false` in Info.plist (PR #1332) — Apple
  no longer asks the encryption questions at submission. The France declaration
  requirement is resolved. See `docs/play-launch/export-compliance-counsel-note.md`
  for the counsel rationale.
- `veyrnox.com` is a client-rendered SPA — `curl` gives **false negatives** when checking
  page content; verify by rendering the page.

**CI merge gating — there is NO code-scanning gate (decided 2026-07-26, issue #1375).**
The `code_scanning` rule was **removed** from ruleset `Veyrnox Code Review` (`17946638`).
CodeQL still scans all six languages on every PR and still files alerts to the Security
tab; they no longer block merges. Swift stays covered by push-to-main and the weekly scan.
Everything else on the ruleset is unchanged — `required_status_checks` (**five** contexts,
tabulated in the two-layer note below — this file said three until 2026-08-08),
`pull_request` (0 required approvals — **on the ruleset only**; classic branch protection
is a separate layer, see that note), `deletion`, `non_fast_forward`. Exact rule JSON for
restoring the removed rule is in issue #1375.
- **`copilot_code_review` is NOT a rule on `17946638`** (verified 2026-08-08 by reading
  `gh api repos/VEYRNOX/veyrnox/rulesets/17946638`; its four rules are `deletion`,
  `non_fast_forward`, `pull_request`, `required_status_checks`). It lives on a SECOND
  ruleset — `Code Quality Copilot review for default branch` (`19500012`) — whose
  `enforcement` is **`disabled`**, so it gates nothing. Copilot still comments on PRs; it
  has never blocked one. This file listed it as an active rule here for months.
  `gh api repos/VEYRNOX/veyrnox/rulesets` lists BOTH; querying only `17946638` hides the
  second one's existence.
- **Why.** #1368 scoped the Swift scan (60–90 min: scarce macOS runner + full
  Capacitor/xcodebuild compile) to PRs touching iOS/Swift. But the rule gates on the CodeQL
  **TOOL** with no per-language granularity, so a typical PR uploaded 5 of 6 languages, the
  result set was permanently incomplete, and **every** non-iOS PR sat at BLOCKED with
  `--admin` the only exit. Before #1368 the same gate was merely slow — four PRs on
  2026-07-26 were `--admin`'d past it.
- **Three fixes were tried and are all impossible — do not re-attempt:**
  (a) scope the rule to exclude Swift — the rule's only parameter is a list of
  `{tool, alerts_threshold, security_alerts_threshold}`; there is **no** language/category
  field; (b) make Swift cheap — CodeQL has **no `build-mode: none` for Swift** (it is GA
  for C#, available for the source-only languages), and the iOS sources cannot compile off
  macOS; (c) upload a "not analysed" SARIF on the skip path — **GitHub rejects any SARIF
  with `executionSuccessful: false`** (`Code Scanning could not process the submitted SARIF
  file: unsuccessful execution`), proven in PR #1377 (closed). The only encoding GitHub
  accepts is `executionSuccessful: true` + empty `results`, which asserts that CodeQL
  analysed `EnclaveKeyService.swift` / `VeyrnoxEnclavePlugin.swift` and found nothing on
  PRs that never looked at them — fake security, so it was not taken.
- **Honest statement:** this is a real reduction against the ruleset's *intent*, though not
  against its *actual* prior behaviour (a gate satisfied by `--admin` on every merge). The
  remaining honest alternative is running the real Swift scan on every PR and accepting the
  60–90 min block.

**`main` is gated by TWO layers, not one — and the second one was broken (fixed
2026-08-03).** Everything above describes ruleset `Veyrnox Code Review` (`17946638`).
There is ALSO **classic branch protection** on `main`, which this file never mentioned.
**Neither layer is uniformly the tighter one** — that framing was true only while classic
held `strict: true`, and it stopped being true on 2026-08-08. Today the RULESET requires
more contexts (five vs three) and classic requires none the ruleset does not. Read both
before concluding anything about what gates a merge —
`gh api repos/VEYRNOX/veyrnox/branches/main/protection` is the half that
`gh api repos/.../rulesets/17946638` does not show you, and vice versa.
- **The two layers require DIFFERENT check sets. The effective gate is the UNION — five
  contexts, not three** (verified 2026-08-08):

  | context | ruleset `17946638` | classic protection |
  |---|---|---|
  | `verify` | yes | yes |
  | `unit-tests` | yes | yes |
  | `Release-cert guard rejects wrong fingerprints` | yes | yes |
  | `mainnet-flag-gate` | yes | — |
  | `staging-gate` | yes | — |

  `staging-gate` is the one most likely to surprise you: it is defined in
  `deploy-preview.yml`, NOT `ci.yml`; it is a pure reporter whose verdict comes from its
  `deploy` + `e2e` dependencies; and it carries a docs-only escape hatch
  (`docs_only == true` AND `deploy == skipped` → pass). That hatch is why report-only PRs
  sail through it while a code PR gets the full deploy + smoke test. It also means
  `staging-gate` inherits every flake in the deployed-preview path — see the
  `okx-candles` note below.
- **A third-party outage can red a required gate.** `deploy`'s "Check edge endpoints"
  step probes the live preview, so an upstream exchange hiccup fails `staging-gate`. It
  did on `52e3e05f` (2026-08-07) and `35d85509` (2026-08-08) — 2 of 20 runs — both times
  `/api/data/okx-candles` returning 502. Neither was diagnosable, because the proxy
  collapsed every failure mode to a bare 502; fixed in #1622, which preserves OKX's own
  code (`OKX code 50011`) client-side and logs the full upstream detail server-side. The
  flake itself is NOT fixed — the next occurrence is merely legible.
- **It made every PR unmergeable, and that is why the history is full of `--admin`.**
  Two independent blockers: (a) `required_approving_review_count: 1` +
  `require_code_owner_reviews: true`, on a repo where one account authors every PR —
  GitHub forbids self-approval, so the requirement could never be met; (b) a required
  status context `release-cert-guard`, which is the job's **id**. GitHub matches required
  contexts on the job's **display name**, and that job sets
  `name: Release-cert guard rejects wrong fingerprints` — so the context never reported
  and every PR sat at "Expected — waiting for status to be reported".
- **The irony: the job was purpose-built to be required.** Its own comment in `ci.yml`
  says it "ALWAYS runs and ALWAYS reports a conclusion, so that it can be added to the
  branch ruleset's required checks", and spells out that a skipped-or-absent required
  check blocks every PR. The intent was right; it was wired up under the wrong string.
- **Fixed 2026-08-03:** context corrected to
  `Release-cert guard rejects wrong fingerprints` (this RESTORES a gate that had never
  once fired), and approvals set to `0` / code-owner review off, matching the ruleset.
  `--admin` should no longer be needed for a green PR. **If you find yourself reaching
  for `--admin`, that is a signal the config regressed — diagnose it, do not habituate.**
  Verified by merging PR #1546 with a plain `gh pr merge --squash`, no override.
- **`strict` is now `false` — changed 2026-08-08.** It was `true` (branch must be current
  with `main`) and was deliberately retained on 2026-08-03 as "forces frequent rebases,
  left alone rather than quietly loosened". That reasoning missed the mechanism:
  **GitHub's auto-merge does NOT update a behind branch — it only waits.** So on a repo
  merging 10+ times a day, any merge landing inside a PR's check cycle re-blocked it, and
  `unit-tests` alone is ~14 min. The failure is SILENT and reads as success: the PR shows
  every check green and simply never merges, with no red anywhere to explain it.
  PR #1620 needed three manual `gh pr update-branch` calls and still lost the race to its
  own follow-up PR merging first. Turned off to match the ruleset, which was ALREADY
  `strict: false` — so the two layers now agree rather than a new posture being invented.
  **Honest cost, stated plainly:** a PR can now merge having passed checks against an
  older base, so a semantic (non-textual) conflict can land untested. `verify` and
  `unit-tests` still gate every merge, and the classic layer's other settings are
  unchanged. Prior protection JSON backed up under
  `%TEMP%\veyrnox-protection-backup\main-protection-before.json`; restore with
  `gh api --method PATCH repos/VEYRNOX/veyrnox/branches/main/protection/required_status_checks`
  sending `strict` AND the `checks` array (send the array — `strict` alone risks dropping
  the required-check list).
- **If a PR is green everywhere and still will not merge, check `mergeStateStatus`
  first.** `BEHIND` means the up-to-date rule; `BLOCKED` means a required context has not
  reported yet. Neither shows up as a failure.
- `enforce_admins` is `false`, which is the only reason the three `--admin` merges on
  2026-08-03 (#1542, #1544, #1545) were possible at all. All three were green on every
  check that actually reported; nothing red was bypassed.

**2026-07-20 branch-review + weekly audit (`docs/audit-2026-07-20-weekly.md`):** C-1
(CRITICAL, More-drawer "Recent" tiles named duress/stealth/panic routes and survived
decoy sessions/lock/panic-wipe), K-2 (referral sync fail-as-success + pre-gate real-state
read/write), S-1 (user-facing security caveats stripped from Documentation by PR #1243),
and H-3 (duress setup didn't clear a pre-existing real-PIN biometric cache) are all BUILT
+ merged (C-1 + K-2 both in PR #1262; S-1 in #1268; H-3 in #1261). H-1 (WC session-approval gate
fail-open) fix merged in PR #1276. H-2 (ColdSign WARN-tier biometric
step-up gap) — **no action taken, correctly**: `ColdSign.jsx` is unreachable dead code (no
route/import), and the underlying gap is already tracked as weekly M-5 (2026-07-14).

**2026-07-27 branch-review — 10 findings, all fixed (PRs #1409 `fbb5b942`, #1410).**
Two of them had already reached `main` via PR #1403, so the fixes were cut fresh off
`main` rather than onto the review branch.
- **I3 leak (was live on main):** `WalletEntry.jsx` logged `isDemo` — i.e. whether
  the session is a DECOY — to the console on every render. Removed. The one
  legitimate log in that file is `import.meta.env.DEV && console.error(...)`; copy
  that pattern, never a bare `console.log`.
- **Consent re-asked forever:** `setConsentDone(false)` in `handleKekEnroll`/
  `handleKekSkip` re-showed the "one-time" screen on EVERY unlock for anyone who
  skipped KEK (the gate re-fires each unlock; the skip is in-memory only), and
  `TelemetryConsent.choose()` writes unconditionally — so each re-prompt
  overwrote a stored "denied". Removed. `consentDone` is seeded from
  `getConsentState()` at mount; a device with a stored answer must never re-ask.
- **⚠️ The tests had been edited to assert the bug.** PR #1403 changed
  `WalletEntry.kek-gate` tests 6/7 to click through a consent screen that should
  never appear (`getConsentState` is mocked `'granted'` there), turning a
  regression guard into a description of the defect — green pipeline, bug shipped.
  Restored, plus a `queryByTestId('consent-dismiss')).toBeNull()` guard. **Treat
  "align tests with the new flow" as a review smell**; the same pattern appeared as
  `c2db16ae fix(tests): align tests with consent flow`.
- **Send amount dead-ended silently:** Continue gates on `isFormAmountWellFormed`
  (rejects `1e-8`, `1,5`, `1.2.3`, `1.`) but `sendAmountErrorKind` returned null
  for all of them, so the button did nothing and said nothing. Added a `malformed`
  kind fed the gate's OWN verdict (`wellFormed`), so message and gate cannot drift.
  Also: `onSendAnother` now resets `amountTouched`/`addressTouched`/`showErrors`,
  and the amount error is `role="status"`/polite (it carries the live
  `over-balance` case; the address error stays `role="alert"` as it is blur-gated).
- **Pricing honesty:** "Save 30%" and "4 months free" were hardcoded beside
  offer-adjusted prices they weren't derived from — and monthly/annual resolve via
  two INDEPENDENT `offerPriceInfo()` calls, so annual can be the WORSE deal while
  the badge claims 30% off. "4 months" was wrong even at USD base (3.65). Both now
  derive from `lib/annualSaving.js`, which returns null → render NO claim (I4).
- **`.mono-value`, not `font-mono tabular-nums`** — the latter misses the slashed
  zero and letter-spacing every other verifiable value gets.
- **FirstRunTour was deleted undocumented by PR #1403, reopening ECC F-P3-3 (#1160).
  RESTORED 2026-07-28 (PR #1417) — F-P3-3 is remediated again.** The component and its
  placement test came back byte-identical from `de8cb829^`; the wiring was re-applied to
  the CURRENT `WalletEntry.jsx` rather than reverted wholesale, because #1409/#1410 had
  since rewritten that file's consent logic. **No consent change was reverted.**
  Two lessons worth keeping: (a) the tour never blocked consent — the consent branch
  returns FIRST, and consent was absent because `consentDone` is seeded from a stored
  answer at mount; the deletion was collateral to that misdiagnosis. (b) The placement
  test asserts the render sits within 900 chars of its `if`, so explanatory comments go
  ABOVE the branch, not inside it. **Corrected twice, and both corrections are now
  closed.** (i) This bullet listed the `veyrnox-first-run-tour-*` keys as absent from the
  panic-wipe residue list — true when #1417 was written, false when it merged, since
  PR #1415 (`593c969b`) had added them ~50 min earlier (PR #1414 was an independent
  duplicate of that same finding and was closed). See the 07-28 entry. (ii) It then listed
  `OUTCOME_PREAMBLE_ENABLED = false` as off pending an owner decision; **PR #1422 removed
  the flag.** The disable rested on a misidentification — `OutcomeSteps` is 3 steps, is
  not a modal, and sits on `/plans` BEHIND the consent gate, so it never blocked consent;
  the 5-step modal actually on screen was `FirstRunTour`, which #1403 had just deleted and
  which was still rendering from the device-side cache that PR's own message identifies.

**2026-07-28 daily security diff — 2 findings, both fixed and MERGED.** Scanned 14
commits (`34f5da31`→`758aeb95`). The window was strongly net-positive on its own (four
controls ADDED: `rollback.yml` shell-injection validation, the `lib/consent.js` I3
write-gate, the `tracking-integration.jsx` I3 local-state gate, the Settings telemetry
read-gate), plus a regression-test assertion restored. Two items needed work.
- **Residue keys survived panic wipe (PR #1415, `593c969b`).**
  `veyrnox-first-run-tour-armed` / `-seen` were never in the panic-wipe list.
  `ALL_RESIDUE_KEYS` drives BOTH the erase AND `inspectKeyMaterial().clean`, so they
  survived a wipe *and* it still reported clean. Fixed in `METADATA_RESIDUE_KEYS` +
  regression test (`panic-residue-first-run-tour.test.js`), which is red before the fix
  for the real reason (`localStorageResidue` empty while the key is present).
  **The lesson, and it is general: "nothing reads this key any more" is NOT an
  exemption — that is the property EVERY key in that list has after a wipe. What makes a
  key a tell is its PRESENCE.** `veyrnox-first-run-tour-seen` asserts a real install
  existed here AND walked the coercion stack. `docs/Feature-Status.md` had called it
  "no residual-state hazard"; that line is corrected and marked as having been wrong
  rather than quietly reworded. Same class as DIFF-0723-DEVICEID (`veyrnox-device-id`)
  in the findings tracker — check that precedent before writing one of these off.
  **The finding was found VIA the orphaned keys but never depended on them being
  orphaned.** #1417 restored the writer ~50 min later, so the keys are live again and the
  sweep is if anything more clearly right: the claim was never "dead keys linger", it was
  "these keys are a tell and the wipe misses them" — true either way.
  **Standing rule, unchanged: deleting a component orphans its storage keys. Cross-check
  every key a deleted file wrote against `ALL_RESIDUE_KEYS`.**
- **A disabled flag made a whole test block pass vacuously (PR #1418, `3f6773ab`).**
  `Subscription.jsx` carries `const OUTCOME_PREAMBLE_ENABLED = false`, so the preamble
  cannot render at all — which made all THREE tests in the gating block assert the same
  thing by accident. Two were hollow: their `localStorage` / `currentTier` setup was
  inert. All three also matched on the step's COPY, so a copy edit alone would have made
  them pass for a second wrong reason. Now keyed off the `outcome-step` testid; the two
  conditional tests are `.skip`ped (NOT deleted — `outcomeStep`'s initialiser still reads
  `OUTCOME_SEEN_KEY` and still returns null for `safety_plus`, so deleting would bring
  that back unguarded), and the remaining test is bidirectional and **fails the moment
  the flag flips to true** — verified by actually flipping it, not asserted. That failure
  is the tripwire that sends a reader back to un-skip; do not relax it.
  **The tripwire fired and was honoured (PR #1422).** That PR removed the flag, so the
  un-skip condition was met: the first case went red and was rewritten to assert the
  preamble DOES render — not relaxed. Both `.skip`s are gone; the block is 3/3 active,
  0 skipped, and each case is mutation-checked against the specific gate it names
  (re-disable the render / ignore `OUTCOME_SEEN_KEY` / drop the `safety_plus` early
  return each turn exactly one red). Worth recording as a process result, not just a
  code one: #1418 and #1422 were written by different sessions that never spoke, and the
  handoff worked **because #1418 wrote the un-skip condition into the file** rather than
  leaving it in a PR description. Do that.
  **This is the flag-disabled cousin of the "align tests with the new flow" smell:
  a test asserting a behaviour that can no longer occur is coverage that READS as present
  and is not.**
- **The scan's pattern list is a floor, not a ceiling — and it keeps lagging.** Two
  consecutive runs produced findings from files no pattern matched (07-27 the SQL/edge
  surface, 07-28 `src/components/FirstRunTour.jsx`). The 07-28 report records the pattern
  to add; the task file may only write its own report, so it has NOT been applied.
- **Process — `main` moves faster than a document can describe it.** Three separate
  staleness events in one day, all the same shape: a statement true when written and
  false when merged. (a) #1412 landed 7 min after the scan's pre-merge checkpoint —
  caught only by the post-merge checkpoint, which is why that third checkpoint exists
  (amendment PR #1416, `7f53ac94`). (b) #1417 shipped a "keys are not in the residue
  list" line that #1415 had already falsified, corrected above. (c) this entry itself was
  first written listing its PRs as still open. **Treat every claim about another PR's
  state as perishable: cite a SHA, or re-read before merging.**

**2026-07-28 internal audit + fix wave — ECC methodology, 28/28 findings merged.**
Full-stack internal review via ECC skills (`security-review`, `security-scan`,
`security-bounty-hunter`, `production-audit`) with `veyrnox-recon`/`veyrnox-honest-reviewer`
on recon/verify. Ten surfaces scanned, every finding adversarially refuted before it
survived. Report at `docs/audit-2026-07-28-internal.md`. Head after the wave: `4f2d62e0`.
Distribution: 1 critical, 5 high, 11 medium, 10 low, 1 info — all 28 landed on `main`
today via PRs #1435..#1461 plus #1462 (M-10) stacked-merged via #1442 (M-4).
- **C-1 → PR #1438.** `FirstRunTour` rendered its 5-step modal in decoy sessions when a
  real user armed but never dismissed, and its dismiss handler wrote to shared
  localStorage from decoy — K-2 pattern, third writer to `TOUR_ARMED/SEEN_KEY`. Fixed
  with two-chokepoint gating (render + dismiss) via `isDeniabilityOrDemoActive()`,
  matching the `lib/consent.js` pattern from PR #1410.
- **Referral / bonus chain overhaul (H-1..H-3, M-6..M-8, L-8..L-10).** Shipped as CODE
  only — nothing has run against the live DB. `p_rc_user_id` removed from
  `generate_referral_code`/`register_referral_code` (H-1); server binding deferred to a
  RC webhook (skeleton in `sql/referral-rc-webhook.sql`, wiring is a TODO — chain does
  not function end-to-end until it lands). `register_referral_code` requires
  `p_device_id` with rate-limit hoisted above the NULL check (H-2). `record_attribution`
  gets `REVOKE ALL FROM PUBLIC, anon, authenticated` + service_role GRANT, applied to
  every function in the STILL-OPEN section of
  `check-first-referral-bonus-hardening.sql` (H-3). Per-IP + global caps on
  `generate_referral_code` (M-6) and `track_event` (M-7). First-referral-bonus Edge
  Function gets stable `Idempotency-Key` + 4xx/5xx-distinguished rollback (M-8).
  `record_attribution` gets UNIQUE-index dedup + DISTINCT in read paths (L-8). CORS
  drops `http://localhost` (L-9). Bonus-claim rate limit gets per-IP dimension (L-10).
- **H-4 → PR #1436.** Pinned exact versions on `ethers`, `@noble/curves`,
  `@noble/hashes`, `@scure/bip32`, `@scure/bip39`, `@scure/btc-signer`,
  `@reown/walletkit`. Floating carets dropped; CODEOWNERS + Dependabot ignore split so a
  grouped minor PR can no longer land a signing-path bump unreviewed.
- **H-5 → PR #1435.** Removed `|| true` swallow of lint/typecheck in
  `android-e2e-tests.yml` and deleted the fabricated 8/8-passing `test-status` summary.
  Deleted rather than replaced — CI status now reads only what actually ran.
- **KEK / vault hygiene (M-3, M-1, M-2, L-1, L-2, I-1).** `enrollHardwareCredential`
  defaults `vaultWrapped=true` on catch (M-3, #1443); a transient probe IO error can no
  longer enter the destructive `clearCredential()+enroll()` branch. BTC (M-1, #1441)
  and Sol (M-2, #1445) derivations gained try/finally zeroization of seed + master +
  leaf key material; Sol needed a second push for a JSDoc `@type` annotation on the
  `let node = null` refinement pattern. `credentialVerifier.deriveRaw` zeroes encoded
  PIN bytes (L-1). Native `saveVaultContents`/`_unlockInner`/`upgradeKekToV3` move
  `decodeKekSalt` + `getHardwareFactor` inside the try/finally (L-2). AAD v:3 migration
  plan documented at `docs/vault-aad-v3-plan.md` (I-1); #1111 remains open.
  **Naming note:** this wave's M-1/M-2 are BTC/Sol, unrelated to the pre-existing "M-1
  (EVM key unzeroable, ethers v6)" in Open residuals below — different audit's
  numbering, EVM still open on that front.
- **WalletConnect surface (M-4, M-5, L-4..L-6, M-10).** dApp icon URL now goes through
  `isSafeIconUrl` (M-4, #1442); news + NFT sinks get their own allowlists
  (`newsThumbUrl`, `nftImageUrl`) and CSP `img-src` narrowed from `https:` wildcard to
  the explicit union of hosts (M-10, #1462 stacked on M-4). Typed-data pre-sign gate
  composes an `assetAuthorising` risk level via `scoreWcTypedDataLevel` (M-5).
  `handleApproveSession` enforces `isSendReauthRequired()` post-RASP (L-4).
  `rejectRequest` honours caller-supplied reason and audits it (L-5).
  `_scheduleProposalExpiry` finally wired into `_storeProposal` (L-6).
- **M-9 → PR #1449.** `scripts/bundle-trezor-connect.mjs` locks download to
  `connect.trezor.io` HTTPS-only with ≤3 redirects AND verifies bytes against
  `scripts/trezor-connect-manifest.json` sha256s. Manifest seeded with current v9 file
  hashes (`iframe.html`, `popup.html`, `webusb.html`); regenerate on major-version
  bumps. Failed the first CI run because the finder forgot to seed hashes; second push
  `38f1df65` fixed.
- **L-3 → PR #1451.** `PlayIntegrityPlugin.verifyJwsSignature` KDoc drift closed;
  stale block describing pre-#1097 bypass replaced with a pointer to
  `PlayIntegrityJwsVerifier` + a JVM test that constructs an issuer-CN-"Google" cert
  with the wrong SHA-256 and asserts `verify()` returns false.
- **L-7 → PR #1459.** `finalisePinRestore` enforces `/^\d{8,12}$/` (matching
  `createBackupEnvelope`).
- **Rebase collisions handled honestly.** The four SQL PRs editing
  `sql/api-security-hardening.sql` conflicted as they landed. H-2 (3-file) and M-6
  (1-file) needed real merges; each preserved BOTH intents — H-1's `p_rc_user_id`
  removal AND the new PR's addition — never reintroducing a dropped param. Sanity check
  used `git diff origin/main --stat` scoped to the PR's file set; force-with-lease
  pushed; auto-merge survived. Do this in the branch's existing worktree (from the fix
  workflow's leftovers, `.claude/worktrees/wf_fdd618d3-975-*`), not in the primary.
- **Auto-merge is safer than `--admin`.** The whole wave cleared the ruleset
  (`verify`, `mainnet-flag-gate`, `unit-tests`, `copilot_code_review`) with zero admin
  overrides. The M-2 and M-9 real test failures were caught by required checks —
  exactly what the `--admin`-past-red debug-cert saga
  (#1310→#1313→#1325→#1338→#1386/#1391) exists to prevent.
- **Lesson (fix-workflow pattern).** Spawning one worktree-isolated agent per finding
  shipped 26/28 first try. The two that needed re-work (M-2 typecheck, M-9 manifest
  seed) both surfaced only in CI — because the fix agents skipped `npm ci`
  (~5 min × 28 worktrees) and relied on CI. Correct trade-off; the second push was
  cheap. Do NOT increase the per-worktree local-test cost to catch these; use the
  monitor + rebase-in-existing-worktree pattern instead.
- **Not the independent audit (I4).** ECC skills + Veyrnox agents are still Claude-run;
  this pass narrows the target of the outstanding third-party audit, it does not close
  it. Real-device RASP, native compiled binaries, live Supabase RLS enumeration, live
  RevenueCat runtime remain untested. Publish-facing framing must NOT describe this
  pass as independent.

**Open residuals:** M-1 (EVM key unzeroable, ethers v6), M-6 (iOS bridge H copy),
#1111 (vault AAD v:3 migration — plan r2 done, implementation blocked on owner decisions),
LOG-1 remediation BUILT (PR #572), independent third-party audit outstanding.
- **Referral RPC arg rename — DONE (pre-publish window, 2026-07-24).**
  `increment_referral` renamed from `ref_code` to `p_code` (DROP+recreate in
  `sql/api-security-hardening.sql`, client updated in `referralApi.js`). Run the
  updated SQL in Supabase before deploying the matching client build.
- **First-referral bonus Edge Function — BUILT, NOT DEPLOYED (updated 2026-07-28).**
  `supabase/functions/first-referral-bonus/index.ts` + `sql/first-referral-bonus.sql`.
  Requires: (a) run the SQL migrations in this order —
  `first-referral-bonus.sql`, `check-first-referral-bonus-hardening.sql`,
  `bonus-claim-rate-limit.sql`, re-run `definer-search-path-pin.sql`, then the
  2026-07-28 audit-wave additions: the updated `api-security-hardening.sql` (H-2/H-3
  changes to `register_referral_code` + REVOKE batch on `record_attribution`), the
  updated `first-referral-bonus.sql` (H-1 rc_user_id removal, M-6 per-IP + global
  rate-limit dimension), the new `sql/referral-rc-webhook.sql` skeleton (H-1
  server-side RC binding), M-7 track_event IP+global caps, M-8 attempts table,
  L-8 UNIQUE dedup index, L-10 per-IP bonus-claim rate-limit table; (b) **wire the
  RevenueCat webhook that H-1 depends on** — the client no longer sends `rc_user_id`,
  so the referral bonus chain does not function end-to-end until the webhook lands
  and writes `rc_user_id` server-side with signature verification; (c) `supabase
  functions deploy first-referral-bonus` — **NOT `--no-verify-jwt`**, that flag told
  the platform to skip JWT verification and accept anonymous requests, and dropping
  it is part of the 2026-07-26 hardening; (d) set `REVENUECAT_V1_SECRET_KEY` in
  Edge Function secrets, and optionally `ALLOWED_ORIGINS` for preview deployments.
  Client wired in Subscription.jsx (fires after `record_attribution`).
  Auth note: the bearer check is possession of the PUBLIC anon key, not user
  authentication — this app has no accounts. Containment comes from the atomic
  single-grant claim, service_role-only RPCs, and the 5/hour/code rate limit.

## Security invariants

- I1 — keys never leave the device
- I2 — no silent data egress
- I3 — deniability mode makes zero backend calls
- I4 — fail honest, fail closed
- I5 — backend untrusted by design
- I6 — Hardware Binding: KEK = HKDF(H ‖ C) — ordered concat, NOT XOR
  (`kek.js: combineKek`, domain `veyrnox/kek/v1/combine(H||C)`)

## OWASP security coding rules

These rules apply to all code written or reviewed in this project. They complement the
security invariants above and are aligned with OWASP Top 10 (2025), ASVS 5.0, and the
OWASP Top 10 for LLM Applications.

### Input validation (A05 Injection)
- All user input validated before use — length, type, range, allowlist.
- Supabase RPCs use parameterised queries only; never interpolate user values into SQL.
- Shell/CLI: never pass user input to `child_process.exec` or template strings that reach
  a shell. Use `execFile` / array-form `spawn` with `shell: false`.
- DOM: never use `dangerouslySetInnerHTML`, `innerHTML`, or `eval` with user-controlled
  data. React's JSX escaping is the default; breaking out of it requires justification.
- URL/deep-link params: validate against an allowlist of expected keys and value shapes
  before acting on them (WalletConnect URIs, `?demo=`, Capacitor deep links).

### Cryptographic standards (A04)
- TLS 1.2+ for all network traffic; certificate pinning on native builds (Capacitor).
- Vault: AES-256-GCM only; Argon2id KDF (192 MiB, already in place).
- Key derivation: @noble/@scure only — never Web Crypto for seed/key derivation.
- No custom crypto primitives. If a new algorithm is needed, it comes from an audited
  library (@noble, @scure, or ethers built-ins).
- RNG: `crypto.getRandomValues` / `@noble` CSPRNG only; never `Math.random` for anything
  security-relevant (tokens, nonces, IVs, key material).

### Secrets management (A02 Security Misconfiguration)
- Secrets go in `.env.local` (git-ignored) or platform secure storage (Keychain/Keystore).
  Never commit secrets, API keys, signing keys, or credentials to the repository.
- Supabase anon key is the only key allowed in client code — and only because RLS + RPC
  SECURITY DEFINER functions gate all writes (PR #1334).
- Keystore passwords, App Store Connect keys, and GitHub Secrets are CI-only; never
  reference their values in source.
- Log output must never contain seeds, private keys, mnemonics, PINs, passwords, or KEK
  material. Sanitise before logging.

### Access control (A01 Broken Access Control)
- Deny by default: new features are gated (ALLOW_MAINNET pattern) until explicitly
  ungated after audit/verification.
- Supabase RLS enforced on every table; no table allows raw INSERT/UPDATE/DELETE via the
  anon key — all writes go through SECURITY DEFINER RPCs with rate limits.
- WalletConnect: every signing request goes through `presignGateOrReject` — no bypass
  path. Session approval goes through the same gate shape (PR #1276).
- RASP tier gates (BLOCK/WARN/ALLOW) are checked at every security chokepoint; a missing
  or errored gate result = BLOCK (fail-closed, I4).

### Error handling (A10 Mishandling of Exceptional Conditions)
- Fail closed: any error in a security check (RASP, KEK, gate, auth) must deny the
  action, never allow it. This is I4 codified.
- Never expose stack traces, internal paths, or Supabase error details to the user. Show
  a generic error message; log the real error with a correlation ID.
- `try/catch` around crypto operations must re-throw or deny — never silently swallow a
  decryption or signature failure.
- Offer paths fail CLOSED: a missing/unsigned promotional offer throws
  `OFFER_UNAVAILABLE` rather than falling through to full-price (already in place).

### Dependency & supply chain (A03)
- Pin exact versions in `package-lock.json`; no floating ranges (`^`, `~`) in
  `dependencies` for crypto or security-critical packages.
- Run `npm audit` before merging any PR that touches `package.json`. Flag and resolve
  high/critical advisories before merge.
- New dependencies require justification: what it does, why it's needed, how many
  transitive deps it pulls. Prefer well-audited, single-purpose packages over large
  frameworks.
- Native dependencies (Capacitor plugins, Gradle/CocoaPods): review the plugin's
  permissions and native code surface before adding.

### Authentication & session security (A07)
- PINs/passwords: minimum 12 characters enforced (H-A on mainnet builds).
- Biometric auth: always backed by a hardware-bound key (Keychain/Keystore); never a
  simple boolean "is biometric enrolled" check.
- Session tokens (WalletConnect, RevenueCat): minimum 128-bit entropy, expiry enforced
  (M11), invalidated on lock/panic-wipe.
- Step-up re-auth required for high-risk operations: signing, spend-limit changes,
  WalletConnect session approval (H-NEW-B).

### Logging & monitoring (A09)
- Log security events: RASP triggers, gate decisions (allow/block), signing attempts,
  failed auth, rate-limit hits.
- Never log sensitive data (seeds, keys, PINs, full addresses). Truncate or hash
  identifiers in logs.
- Anonymous event tracking (PR #1321) is suppressed in deniability/demo mode (I3);
  verify this holds for any new event type.
- Test suites must not write to production backends (vitest.config.js env blanking,
  PR #1328).

### Client-side security (XSS / DOM)
- CSP: enforce a strict Content-Security-Policy that blocks inline scripts and
  `unsafe-eval`. Capacitor's webview CSP must match.
- No `eval`, `Function()`, `setTimeout(string)`, or `document.write`.
- Sanitise any value rendered from chain data (token names, ENS names, WalletConnect
  metadata) — treat on-chain/external data as untrusted input.
- Deep links and universal links: validate scheme, host, and path against an allowlist
  before routing.

### Database security (Supabase / PostgreSQL)
- **RLS on every table.** No table may have RLS disabled. New tables must define
  row-level security policies before the migration is merged.
- **SECURITY DEFINER RPCs for all writes.** The anon key must never INSERT, UPDATE, or
  DELETE directly. All mutations go through SECURITY DEFINER functions that validate
  input, enforce rate limits, and run with a narrow `search_path` (PR #1334 pattern).
- **Parameterised queries only.** Never concatenate or interpolate values into SQL — not
  in migrations, not in RPCs, not in edge functions. Use `$1`-style placeholders.
- **Principle of least privilege.** The `anon` role gets SELECT on the minimum columns
  needed; never grant `anon` write access to raw tables. Service-role key is server-only
  (edge functions / CI), never in client code.
- **Schema migrations are code-reviewed.** Every `.sql` migration file is reviewed for:
  privilege escalation (GRANT), RLS policy gaps, missing indexes on lookup columns used
  in rate-limit checks, and accidental data exposure (public SELECT on sensitive columns
  like `referral_attributions` — removed in PR #1334).
- **Rate-limit state in the DB.** Rate limits use server-side timestamps
  (`clock_timestamp()`) and dedup tables — never trust client-supplied timestamps.
- **No `SELECT *` in RPCs.** Return only the columns the caller needs to prevent
  accidental data leakage when columns are added later.
- **Backups & retention.** Supabase point-in-time recovery is enabled. Destructive
  migrations (DROP, TRUNCATE, column removal) require explicit owner approval and a
  backup verification step before execution.

### API security (comprehensive)
- **Rate limiting on every RPC.** All Supabase RPCs are rate-limited per device (already:
  60/hr tracking, 1/device referral dedup, 3/hr registration). New RPCs must define and
  enforce a rate limit before merge — no unthrottled write endpoints.
- **Input validation at the API boundary.** Every RPC validates argument types, lengths,
  and ranges server-side. Use allowlists for enumerated values (event types, asset
  symbols). Reject unexpected fields rather than ignoring them.
- **Payload size caps.** All endpoints enforce a maximum payload size (4 KB metadata on
  `track_event` — implemented 2026-07-26; this rule described it for months before it
  existed, so treat a documented cap as unverified until you have read the SQL). New
  endpoints must define and enforce a cap proportional to the data they accept.
- **No sensitive data in URLs.** Use POST bodies or headers — never query strings. Device
  IDs, referral codes, and asset identifiers go in the request body.
- **CORS.** Restrict `Access-Control-Allow-Origin` to the app's own domains. No wildcard
  (`*`) on authenticated or write endpoints.
- **Idempotency.** Write RPCs must be idempotent or use dedup keys to prevent replay.
  `increment_referral` uses a dedup table; new RPCs must follow the same pattern.
- **Response hygiene.** API responses must not leak internal IDs, table names, constraint
  names, or PostgreSQL error codes to the client. Wrap errors in a generic envelope with
  a client-safe message.
- **Versioning.** Breaking RPC signature changes require a migration window (see the
  `ref_code → p_code` rename note). After first publish, old and new signatures must
  coexist until all clients have updated.
- **Authentication boundaries.** The anon key authenticates the app, not the user. Any
  endpoint that returns user-specific data must additionally validate a user-scoped token
  or device attestation.
- **Edge function security.** Supabase edge functions must: validate the `Authorization`
  header, enforce the same rate limits as direct RPCs, never import the service-role key
  from client-reachable code, and set `Content-Type` explicitly on responses.

### SSRF & network (A10 / network hardening)
- Never fetch arbitrary user-supplied URLs from server-side code. WalletConnect relay
  and RPC endpoints use a hardcoded allowlist.
- Block private/internal IP ranges in any URL-fetching code (Capacitor HTTP plugin,
  Supabase edge functions).

## Demo mode (known trap)

Demo mode triggers on `?demo=1`, `VITE_DEMO_MODE=1`, native dev, OR a persisted
`veyrnox-demo=1` in localStorage (persists silently across reloads). Before any real
verification: clear demo (`/?demo=0`), confirm fresh real wallet shows 0.0 on-chain.

## Dev send ungate (testnet verification)

Set `VITE_DEV_UNGATE_SEND=1` via `.env.local` (git-ignored) — NOT an inline shell var
(fails on Windows/PowerShell). Flips gate decision only, never asset status.
Dead-code-eliminated from production builds.

## Wallet model

One HD seed derives per-chain accounts (Model B). EVM assets share one secp256k1
m/44'/60' address; BTC (m/84'/UTXO/PSBT) and SOL (ed25519/SLIP-0010) have their own.

## Per-chain gotchas

- BNB testnet: enforces minimum gas price; "Slow" fee tier can underprice — use Standard+.
- USDT: no official Tether Sepolia; uses an Aave faucet stand-in.
- WalletConnect: test PINs/passwords must be ≥12 chars (H-A minimum on mainnet builds).

## Environment

- Windows (Git Bash / MINGW64). iOS native build needs a Mac.
- Use `.env.local` for env flags, not inline shell vars.
- **Never use PowerShell here-strings in a Bash/Git Bash call.** `@'...'@` is PowerShell
  syntax; in bash the `@` characters are literal, so
  `git commit -m @'<newline>subject...'@` produces a commit whose subject is a bare `@`
  with the real subject demoted to the body and a trailing `@` on the last line. Use a
  heredoc instead — `git commit -F - <<'EOF' ... EOF` — quoting the delimiter so `$` and
  backticks stay literal. Observed **twice on 2026-07-28** in two independent sessions
  (see `git reflog`: `commit: @` at 11:43, then two amends to fix it), so this is a
  recurring trap, not a one-off. Both shells are available here and each needs its own
  syntax; check which tool you are in before writing a multi-line string. Amend before
  pushing — a `@` subject in the history is permanent once it lands.
- **`npm ci` / `npm install` work plainly again (2026-07-26).** `--legacy-peer-deps` is no
  longer needed and CI no longer passes it (#1372 bumped `@vitejs/plugin-react` to `^5.2.0`
  so its peer range admits `vite@8`; #1376 dropped the flag from the workflows). Two traps
  if you touch `package-lock.json` on an older branch: `--legacy-peer-deps` strips the whole
  `appium` peer subtree (~3,700 lines) and a full `npm install` re-adds ~37 nested
  `appium-uiautomator2-driver/node_modules/*` entries. Regenerate with
  `npm install --package-lock-only` and check the diff contains only what you changed.

## Design system

Calm near-black surfaces (#050608 → #1D222B), one teal accent (#4ADAC2 = verified),
Schibsted Grotesk for prose / IBM Plex Mono for verifiable values, deniability by default
(never show wallet count/list), plain-language risk before signing.

## Working pattern

- Reconnaissance before changes; report root cause before fixing.
- **Fetch main before diagnosing.** Main moves 10+ commits/day. Run
  `git fetch origin main && git log origin/main --oneline -15` before diagnosing bugs.
- Pure helpers + unit tests where logic can be extracted.
- One moving part at a time. Don't mark anything verified without the user's on-chain txid.

## The primary checkout is SHARED — never work in it

`C:\Users\aljob\Downloads\Veyrnox` is used concurrently by many sessions: scheduled tasks
(daily security diff, branch review, weekly audit, dependency watchers) and any number of
interactive ones. **10+ worktrees are typically checked out at once.** Treat the primary
checkout as read-only shared state.

**Never in the primary checkout:** `git checkout` / `git switch` / `git rebase` / `git
stash`, editing files, or `npm install`. Switching its branch reaches into every other
session at once, and an uncommitted edit there can be swept into an unrelated PR.

**Do this instead** — cut a branch worktree from `origin/main` and work entirely inside it:

```bash
git fetch origin main
git worktree prune
git branch --no-track <branch> origin/main   # --no-track is REQUIRED, see below
git worktree add "$TEMP/<name>" <branch>
```

- **`--no-track` is not optional.** Without it git sets the upstream to `origin/main`, and
  a later bare `git push` from that branch targets **main**.
- The worktree needs its own `node_modules` (`npm ci`) — it does not inherit the primary's.
- Remove it when the PR is open, not before: `git worktree remove <path> --force`.
- Never `git gc --prune` / `git prune` — the repo carries thousands of unreachable commits
  belonging to other sessions' in-flight work.

**Reading is exposed too, not just writing.** The primary checkout is frequently on a
detached HEAD or an unrelated feature branch, so anything read from its working tree is of
unknown provenance. A previous tracker run analysed a detached HEAD and reported the
results as `main`. Read from the ref, not the tree: `git show origin/main:<path>`.

**Two failures on 2026-07-28, both from this:**
- **Duplicated work** — two sessions independently found the same panic-residue finding
  and opened PRs #1414 and #1415 **92 seconds apart**. One had to be closed.
- **Cross-contamination** — PR #1423's branch picked up an unrelated commit from another
  session mid-flight. It could not be force-pushed (that would have destroyed work seconds
  old), so the branch was abandoned and reopened as #1427.

**Windows/Git-Bash trap:** MSYS rewrites the `:` in `git show origin/main:path`, so the
command fails and prints nothing — which looks exactly like "no matches found" and will
have you report a false all-clear. Export `MSYS_NO_PATHCONV=1` first, and sanity-check with
`git cat-file -s origin/main:<path>` that you are reading a non-zero file.

## Multi-agent working pattern

Subagents in `.claude/agents/`: `veyrnox-recon` (read-only), `veyrnox-ui` (design-system),
`veyrnox-security-tdd` (strict TDD), `veyrnox-honest-reviewer` (honesty bar). Fan out in
ONE message for concurrency.

### Codex — second developer

Codex is read-only (`codex review` or `codex exec -s read-only`). Claude reads the report,
then implements. Codex output is INTERNAL — never the outstanding independent audit.

Runbook: `docs/codex-review-runbook.md` — CLI install, one-line invocation
(`codex review --base main`), when to use it, when it does NOT substitute for
the independent audit gate.

### Orchestration — pick automatically

| Signal | Pattern | Apply |
|---|---|---|
| Fixed known targets, independent | **Parallel Execution** | Fan agents in ONE message |
| Open-ended discovery, unknown count | **Dynamic Spawner** | `dynamic-spawner` agent |
| Destructive/irreversible action | **Router + Human Gate** | `router-human-loop` first |

Tie-break: destructive → Router; scope unknown → Spawner; else → Parallel.

## Key docs (read on demand, not loaded by default)

- `docs/CLAUDE-audit-archive.md` — full PR-by-PR audit history (moved from here)
- `docs/Feature-Status.md` — per-feature status with PR numbers and evidence
- `docs/Audit.scope.md` — audit scope and gate status
- `docs/hardware-kek-phase-plan.md` — KEK rollout plan
- `docs/audit-2026-07-01-kek-internal.md` — KEK audit findings
- `docs/audit-triage/internal-audit-2026-06-17.md` — mainnet gate audit
