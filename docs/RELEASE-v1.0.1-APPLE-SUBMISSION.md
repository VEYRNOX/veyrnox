# Veyrnox 1.0.1 — Apple App Store Submission State

Owner: Al Jobson. Last updated: 2026-09-08 (session-rebuilt after prior scratchpad was lost).

**SUBMITTED for review — 2026-09-08 06:53:47 UTC.** All pre-submission gates green. Waiting on Apple. On approval, owner presses Release (releaseType MANUAL) — phased release then ramps over 7 days.

---

## Version core

| Field | Value | Source |
|---|---|---|
| App | Veyrnox (`6790188660`, bundle `com.veyrnox.app`) | ASC API |
| Version | 1.0.1 | `appStoreVersions/eaeb97ea-…` |
| State | WAITING_FOR_REVIEW | submittedDate `2026-09-08T06:53:47.299Z` |
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

Chain is **armed** end-to-end (wired 2026-09-08 in-session):

- `rc-webhook` redeployed on both Supabase projects (prod v14, staging v5) with `verify_jwt: false`. Sole authentication is the in-function timing-safe compare against `REVENUECAT_WEBHOOK_AUTHORIZATION` (the prior `verify_jwt: true` blocked legitimate RC delivery — the RC Authorization header is a shared secret, not a Supabase JWT).
- `REVENUECAT_WEBHOOK_AUTHORIZATION` set on both projects; secret persisted at `~/.veyrnox/rc-webhook-secret` (mode 600) on the dev machine.
- Two RC webhooks in project `proj82381f44`:
  - `whintgrb0a8102c4b` → prod Supabase, `environment: production`.
  - `whintgr6d9a9977bc` → staging Supabase, `environment: sandbox`.
- Smoke-tested: wrong secret → 401, right secret → 200, on both endpoints.
- **Synthetic end-to-end test on staging (2026-09-08):** minted a test code with `generate_referral_code`, POSTed a synthetic `INITIAL_PURCHASE` to staging `rc-webhook` with a `veyrnox_referral_code` subscriber attribute → row's `rc_user_id` written correctly by `set_referral_rc_user`. Test row cleaned up. Proves the entire `RC → webhook → RPC → DB write` path.
- **Prod `increment_referral` migration also landed 2026-09-08** — discovered mid-session that the `ref_code → p_code` rename was staging-only for six weeks. Every prod client call had been silently failing at PostgREST; 3560 referral rows sat at `count=0`. Applied via MCP (`increment_referral_rename_arg_ref_code_to_p_code`); anon/authenticated/service_role EXECUTE grants preserved. Future referrals will now count.

Only remaining gate for referral chain verification (does NOT block 1.0.1 submission):
- Real sandbox trip through the CLIENT flow: referee purchases with a code → RC fires `INITIAL_PURCHASE` (sandbox) → sandbox webhook lands (proven) → `Subscription.jsx` calls `first-referral-bonus` → `first_bonus_granted_at` timestamp lands on the referrer's row. Only the last leg (client → `first-referral-bonus`) is untested — every other leg has been exercised.

## Pre-Submit gate — all green before Submit

| # | Task | Result |
|---|---|---|
| 21 | Stock-iPhone golden-path walkthrough | ✓ Owner tested + confirmed |
| 22 | TestFlight Crashes + Xcode Organizer Hangs = 0 on build 57 | ✓ Zero signatures on build 57 per ASC diagnosticSignatures |

Both were the mandatory CLAUDE.md pre-submission gate — Play build 5 was rejected under the same failure mode (KEK/RASP fail-closed on untested device); we avoided that pattern this time.

## Also completed this session

- **TestFlight "What to Test" note** for build 57 populated (559 chars) — tester walkthrough instructions covering the golden path + the Play-rejection pattern to watch for.
- **Review submission item audit** — 4 items on `0babae55-…` all `READY_FOR_REVIEW` (1 appStoreVersion + 2 AI subs + 1 subscription-group artifact).
- **Reviewer notes verified** (1797 chars) — no-account explainer, PIN setup, receive/send flow, both subscription tiers with paths, sandbox tester note. PIN minimum ("8 digits") matches `src/lib/pinStrength.js:19`.

## What is NOT in scope of this submission

- Referral chain end-to-end verification (owner action; does not block Submit).
- Independent third-party audit of the full stack (S1–S4 + crypto + KEK + RASP) — remains outstanding.
- Play Store submission (separate HOLD, tracked in `RELEASE-v1.0.1-PLAY-SUBMISSION.md`).

## Session PR trail (2026-09-07 → 2026-09-08)

- **#2412** (merged, `e10dbde6`) — extend `APPLE_OFFER_IDS` map with the 5 `ai-*` referral keys.
- **#2415** (merged, `1e75ca7f`) — CLAUDE.md correction for referral bugs #1703 + #1704 marked FIXED.
- **#2434** (merged, `c39bf87`) — iOS versionCode bump 56 → 57 + iOS SPM sync (Capacitor 8.5.1 + purchases-hybrid-common 18.33.1 pinned to what shipped).
- **#2436** (merged, `43557d5`) — first-cut of these MD deliverables to `docs/`.
- **#2437** (merged, `9cce848`) — CLAUDE.md sync to referral chain armed state + prod migration lesson.
- **#2439** (merged, `8f5b624`) — release MDs synced to chain-armed state after RC webhooks configured.
- **#2414** (closed, wrong head branch) — first attempt at #2415 hit the release worktree branch; superseded.
