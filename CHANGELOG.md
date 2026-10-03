# Changelog

All notable changes to Veyrnox are documented in this file, starting **2026-07-05**.
Prior history is recorded in `docs/Feature-Status.md`, `docs/Audit.scope.md`, and the
dated files under `docs/audit-triage/` — this file does not retroactively reconstruct it.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Security-
relevant entries are tagged with their project status per `CLAUDE.md`: **BUILT** (in
code, tests green, testnet-only unless verified), **TARGET** (designed, not yet in
code), **PLANNED** (roadmap), or **HONEST-DISABLED** (present but off on principle).
"Verified" is reserved for a real on-chain testnet txid — see `CLAUDE.md`.

> **Backfill note (2026-10-01).** Everything from `[Unreleased]` down to `[Pre-1.0.1]` below was
> reconstructed from `git log` on `main` (commit subjects and PR numbers), the release records in
> `docs/RELEASE-v1.0.1-*.md` / `docs/RELEASE-v1.0.2.md`, and `docs/Feature-Status.md`. It is a
> curated summary of about 2,160 commits, not an exhaustive list. Dates are merge dates, and
> release dates are store dates from the release records. Items marked **BUILT** are in code with
> tests green; none of this is **verified** in the strict sense (a real on-chain txid) unless it
> says so. The independent audit of the full stack is still outstanding.

## [Unreleased] — planned as 1.0.3 (59)

Merged to `main` after 1.0.2 (2026-09-24 onward). **Planned for 1.0.3, versionCode / build 59
on both stores; not submitted.** It started at 58 (#2821); iOS 1.0.3 (58) was uploaded, then 1.0.3
was held for the AI Security trial fix (#2823) and moved to 59. Scope is all of `main` (owner
decision, 2026-10-02). See `docs/RELEASE-v1.0.3.md`.

### Added
- Paywall: cancellation assurance copy, tier comparison, and a recovery-gating fix (#2781);
  subscription lifecycle status and expiry (#2782); Android `free-trial-14d` offer routed to
  the purchase call (#2794); the 14-day free trial shown on the plans card and the nudge (#2805).
- Settings: a read-only "Web bundle" row showing the running OTA bundle version and whether an
  update is staged. Local status only, hidden on web and in decoy/demo (#2818). BUILT; seen
  working on a physical iPhone (development build), 2026-10-02.
- OTA tooling (not in the app): `scripts/ota/verify-live.mjs` proves the update host serves
  exactly what was signed (#2807), and also checks each object the way Android requests it,
  which catches a Cloudflare rewrite only Android received (#2817).

### Fixed
- Android OTA: `prepare` now downloads a file the APK did not package (Android drops the
  `.well-known` dot-files) instead of aborting, which made every Android update fail silently on
  1.0.2 (#2816). BUILT; emulator-verified end to end, not on a physical Android phone. Reaches
  users only with the 1.0.3 store release.
- Wallet idle lock is paused during Transak checkout, and the hand-off no longer relocks
  (#2756, #2763).
- Referral: opening a second referral link now says only the first code can be applied (#2766).
- CI: `canary-smoke` was skipped on every push because a skipped ancestor job tainted
  `success()` for downstream jobs (#2789).

### Changed
- `@sentry/react` 10 → 11, a major version (#2776).

### Security
- Dependency advisories: undici and brace-expansion high-severity advisories resolved (#2783);
  vulnerable `stream-json` removed from the Solana RPC tree (#2799); vulnerable Appium bundle
  replaced with pinned upstream source (#2800); rubyzip patched on Android and bumped on iOS
  (#2798, #2785); dompurify, axios and a group of minor and patch updates (#2795, #2793, #2787).

## [1.0.2] — 2026-09-23 (Play) / 2026-09-24 (App Store)

Google Play versionCode 57 published at 100% on 2026-09-23. App Store 1.0.2 build 8 approved on
its first review submission (2026-09-24, `READY_FOR_SALE`). versionCode 56 was submitted and
withdrawn; it never shipped. See `docs/RELEASE-v1.0.2.md`.

### Added
- Theft Protection: OS biometric step-up on unlock, adjustable spend limit with a seeded $500
  per-transaction cap, and step-up required to loosen a limit or turn protection off
  (#2498, #2680, #2696, #2753).
- Win paywall with an AI Security Protection upsell, Vigil owl on the backup nag, and a 7-day
  dormancy reminder (#2661).
- Signed over-the-air web bundle updates armed for 1.0.2, with the update check disclosed to
  the user and two hardware signing keys pinned (#2568, #2633). **BUILT**.
- Optional static-egress relay for the two Transak partner calls (see `docs/transak-relay.md`).
- Play release notes in all 44 locales (#2626).

### Changed
- App-wide UX pass against 20 UX principles; touch targets raised to 44px, text raised to the
  12px floor, empty states unified (#2589, #2610, #2613, #2616, #2617, #2620, #2621).
- Safety Plus users see the AI Security Protection upsell once, and paywall copy names only
  what Safety Plus gates (#2698, #2710, #2724, #2737).

### Fixed
- iOS: adopted the UIScene lifecycle, fixing a launch crash seen in 1.0.2 build 6 (#2751).
- Blank-page-on-launch: a pre-JS shell now paints and the watchdog tests for paint, not mount
  (#2614, #2645).
- Redeem Code and Manage Subscription never worked because `App.openUrl` does not exist (#2679).
- Send: malformed fiat amounts are rejected instead of truncated (MNY-04, #2706); larger amount
  field with the `$` kept visible (#2681, #2682).
- Referral codes survive until redemption succeeds, and redemption failures are classified and
  retry-capped (#2727).
- Transak widget URL matches the Create Widget spec and no longer re-mints tokens in a loop (#2654).

### Security
- Independent security audit of 2026-09-21: all findings remediated (#2731).
- Fail closed on multicall- and permit-wrapped approvals (#2740); S7 calldata/contract-code
  mismatch scored on the WalletConnect path (#2743).
- Revoking the current device now locks the session that minted the token (SEC-03, #2708);
  biometric unlock is no longer re-armed on every launch (SEC-05, #2704).
- Panic wipe: cancels pending OS notifications, stops re-creating the biometric preference,
  and stops in-flight chaff provisioning re-creating storage after a wipe (#2695, #2712, #2725).
- Printed recovery phrase removed from the DOM after print, clear and unmount (#2699).
- Deniability (I3): more shared-store surfaces gated in decoy sessions (#2647, #2649, #2711).
- `tip-chat` entitlement lookup moved to RevenueCat v2; a non-404 4xx or unreadable 2xx is no
  longer treated as a denial (#2663, #2665, #2726). Pages Functions upstream calls now have
  timeouts and response-size bounds (#2606).

## [1.0.1] — 2026-09-11 (App Store) / 2026-09-12 (Play)

App Store 1.0.1 build 59 approved from the 2026-09-11 submission after two rejections (see
`docs/RELEASE-v1.0.1-APPLE-SUBMISSION.md`). Play versionCode 48 released 2026-09-12 and served
users until 1.0.2 replaced it on 2026-09-23.

### Added
- **Personal Backup (2-of-3 Shamir DEK sharding)**, shipped as the "Advanced (2-of-3)" tab:
  same-device and cross-device share restore, passphrase-encrypted cloud share, and vault AAD
  `v:3` for kek-dek blobs (#1111, #1635, #1642, #1644, #1649, #1673, #1684, #1728, #1742).
  Built ahead of the independent audit under the 2026-08-08 owner override; **BUILT,
  UNAUDITED-PROVISIONAL**.
- **Fast biometric unlock**: biometric-first unlock path, silent unlock on the Keystore window,
  auto-prompt of Face ID on the lock screen, explicit biometric-consent screen (#2019, #2051,
  #2055, #2120, #2129, #2131, #2135). Opt-in delayed re-lock grace window (#2052).
- **KDF profile v2 (96 MiB / t=6)** for new vaults; older vaults stay at 192 MiB / t=3. The
  migration flag stays OFF; the real-device benchmark behind it was not run (#2054, #2103,
  #2101).
- **Subscriptions and paywall**: Safety Plus monthly and annual, AI Security Protection tiers
  and hub, Redeem Code, App Store promotional offers and Play offers selected by tag (fail
  closed when unavailable), Huawei HMS IAP behind the `huawei` flavor (#1026, #1326, #1327,
  #2158, #2200; the Huawei and Redeem Code commits landed 2026-08-31 without PR numbers).
- **Referral program**: tiered discount-payback, Supabase server-side code generation and
  rewards dashboard, `/r/<code>` universal/app links, referral carried across a store install
  (#1184–#1195, #2526, #2532, #2541).
- **Buy (Transak on-ramp)**: staging-only first, then enabled for production builds, with an
  order webhook receiver (#1509, #1584, #2030). Owner-only area.
- **Cloudflare Pages Functions API layer** for all external calls (#1566), and the TIP threat
  intelligence / Security Advisor integration with a signed local IOC cache for offline and
  deniability screening (#1580, #1624, #1741).
- **Multi-chain asset rows**: composite (symbol, chain) identity; USDC/USDT on Polygon,
  Arbitrum, Optimism, Avalanche and BNB (Phase 0–1b, 2026-09-02).
- **Send wizard** (3 steps, progressive disclosure) and unified transaction receipts with the
  real on-chain hash and explorer link (#2134, #2138, 2026-09-01).
- **Internationalisation**: 44 locales including Arabic RTL, per-locale code-split, and a
  44-locale store-listing pipeline (#1470–#1507, #1508).
- **Bug-report capture** with encrypted upload and native screen recording plugins (iOS
  ReplayKit, Android MediaProjection) (#2326–#2343).
- Consent-gated Sentry crash reporting (#2118); privacy-respecting anonymous event tracking,
  default-deny, with first-run consent (#1321, #1706, #1724).
- Samsung Galaxy Store flavor and Android product flavors (#1890, #1893).
- Vigil mascot placed on paywall surfaces (2026-09-16).

### Changed
- Hardware-wallet paths: Trezor and Ledger removed; Digital Shield is the only HW path (#2032).
- Onboarding rebuilt in slices (seed input grid, PIN setup, entry tiles, backup nag scheduler).
- Hardware KEK is auto-enrolled on wallet creation and restore, with a retry affordance for
  previously ineligible devices (#1298, #1301, #1763).

### Security
- **Deniability (I3)**: unlock-timing oracle closed with a structural KDF equalizer (#1000);
  chaff/real KDF-parameter parity restored across the v2 profile (#2069, #2116); many
  decoy-session gates and panic-residue sweeps (#1549, #1762, #1774, #1814, #2537).
- Panic wipe reports honest status, verifies side databases and enforces a numeric PIN floor
  (#1831).
- Audit remediation rounds (2026-08-16 through round 9), including rate limits, shard
  hardening and Transak HMAC verification (#1834, #2026, #2278).
- I4 fail-honest half restored on two refusal paths (audit H-1, H-2, #2422); hardware KEK
  required for the unauth alias (M-5, M-6, #2430).
- Session token moved to native Keychain/Keystore (#2105). SQL: `search_path` pinned on the
  remaining SECURITY DEFINER functions (#1352).
- 1.0.1 launch fixes: blank-page guard on launch and non-blank `/buy` fallback (#2500, #2521).

## [Pre-1.0.1] — 2026-07-05 to 2026-08-07

Covers the 1.0.0 mainnet-unlock release (GitHub release `v1.0.0`, 2026-07-06) and the work
leading to the 1.0.1 train. The `[Unreleased]` entries originally written here are kept
verbatim below this summary, with one correction: the 192 MiB Argon2id setting they describe
was later superseded by KDF profile v2 (96 MiB / t=6 for new vaults; see 1.0.1).

### Added
- Real Apple/Google in-app subscription, Safety Plus (#675).
- **RASP**: native F-09 probe device-verified on a Samsung Note 20 5G (#814); biometric
  re-confirm on WARN-tier environments (#878); `sensitiveGate` blocking seed reveal/export/
  import and clipboard seed-copy on BLOCK tier (#882, #885); tapjacking protection (#884);
  remote attestation, Option B, disclosed and deniability-gated, pre-sign only (#905, #908);
  Play Integrity JWS verification with x5c chain-walk and root-cert pinning (#922, #928,
  #1006); ProGuard repackaging and JS obfuscation (#917, #969); Frida Gadget detection,
  foreground re-probe and 60 s heartbeat (#948, #956); native signing gate closing a JS
  presign bypass (#1008). **BUILT, UNAUDITED-PROVISIONAL**; attestation not device-verified.
- Hardware KEK: consented "Upgrade protection" for legacy KEK vaults (#666), mandatory KEK
  enrollment after seed restore (#992), Secure Enclave key-wrap plugin scaffold (#690) and
  AndroidKeyStore/StrongBox plugin scaffold behind an `M2D_ENABLED` gate (#1116–#1145).
- Crypto detail pages, Analytics tab, send simulation preview and screening toggles
  (#786–#809); Token Approvals and Spam Filter enabled for mainnet (#769).
- Codex as a second security reviewer (two-developer protocol, #800, #805).
- WalletConnect deep links and Trust Wallet tile (#1282, #1288); live-relay E2E suite (#931).
- Legal pages wired in-app for store submission (#1187, #1244, #1329).

### Security
- Internal KEK audit HIGH findings H-1..H-3 closed (#723); BrowserStack integration removed to
  eliminate third-party exposure of the hardware factor (LOG-1, #756).
- Deniability: configured-state oracle removed from the DuressPin page (#577).
- WalletConnect session-approval RASP gate read a property that never existed (H-1, #1276).
- ECC multi-lens audit sweep and Codex P1 follow-ups across vault, RASP and a11y (#1079,
  #1147, #1174).

**Original entries (written 2026-07-05, kept verbatim):**

### Changed
- **Argon2id vault KDF memory cost raised 64→192 MiB** (`src/wallet-core/vault.js`
  `KDF_PARAMS.memorySize`: 65536→196608 KiB; iterations `t=3` and parallelism `p=1`
  unchanged), commit `d0522bfb`, PR #604. Reverses PR #465 (2026-06-28), which had
  lowered 192→64 MiB specifically to fix 4-8s unlock latency on Capacitor WebView
  devices. Reversal premise: device-exercised Face ID / biometric unlock (2026-07-05)
  now gives enrolled users a fast unlock path around the slow password KDF, so the
  stronger offline-seizure resistance is judged worth the latency again. Backward
  compatible — existing 64 MiB vaults keep unlocking under their own recorded KDF
  params; `LEGACY_KDF_PARAMS` remains 64 MiB; a lazy migration re-wraps a vault to
  192 MiB on the next password change/unlock (no forced re-encryption, no lockout).
  **Status: BUILT**, unit-tested (wallet-core 937/937 passing). **NOT verified** —
  no on-chain txid is implied, and the migration path itself has no device
  confirmation (the measurement below covers KDF latency only). **Honest caveats:**
  (1) users without biometric enrollment — including the Safari password-only web
  fallback — still pay the full 192 MiB password-KDF cost on every unlock; this
  raise ships no mitigation for that cohort. (2) The latency premise, unmeasured
  when this entry was first written, is now **MEASURED** on one flagship Android
  device (2026-07-05, Pixel 10 Pro XL, Android 16, `com.veyrnox.app.debug`,
  production argon2 worker in the installed APK via CDP): 192 MiB warm-worker
  median 603 ms (582–617 ms, n=5), cold-worker median 668 ms (657–678 ms, n=3);
  64 MiB warm median 182 ms (177–208 ms, n=5). The PR #465 4-8 s figure did NOT
  reproduce on this device (full report: PR #604 comment
  `issuecomment-4887451367`). Remaining: single flagship datapoint (mid/low-end
  Android NOT cleared), pure KDF cost not full unlock UX, iOS/web/Safari-fallback
  unmeasured, INTERNAL evidence. See
  `docs/crypto-implementation-verification.md` and `docs/Feature-Status.md` §2 for
  the updated parameter table and OWASP comparison.

### Added
- **Ring-boundary ESLint enforcement** (`eslint/rules/ring-import-lint.js`, wired via
  `eslint.config.js`) — Critical Blocker #1. A structural lint rule that fails the
  build if a UI/routes/backend/api/state module (`src/ui`, `src/pages`, `src/routes`,
  `src/backend`, `src/api`, `src/state`) directly imports an R0/R1 crypto-core module
  (`wallet-core/keystore`, `wallet-core/vault`, `wallet-core/vaultBackup`,
  `wallet-core/mnemonic`, `wallet-core/derivation`, `wallet-core/coldkey`, or the
  `@vault`/`@signing`/`@keys` aliases). Does not prove key safety — it only prevents
  the ring boundary from silently eroding as new UI code is added; a violation
  requires a human refactor (route the call through an allowed R2 facade), not an
  auto-fix. `src/sign-gate/*` is deliberately excluded (it's the intended pure
  decision facade the UI is supposed to call). **Status: BUILT.**
- **Mainnet flag-change CI gate** (`.github/workflows/ci.yml` job `mainnet-flag-gate`,
  `scripts/detect-mainnet-flag-changes.js`) — Critical Blocker #3. Diff-based check
  that does not gate "is mainnet on" but gates "did this PR CHANGE a mainnet
  activation flag" — a PR that flips `ALLOW_MAINNET`/`ALLOW_BTC_MAINNET`/
  `ALLOW_SOL_MAINNET` (or similar) is labeled `mainnet-gate-required` for explicit
  review rather than merging silently alongside unrelated changes. **Status: BUILT.**
- **D-02 / AL-06 / BIO-03 honest disclosures** — user/doc-facing acknowledgement of
  three residual findings from the 2026-07-05 internal static-analysis pass
  (`docs/audit-2026-07-05-deniability-internal.md`), each previously accepted as a
  residual risk in code/comments but not surfaced honestly to users or in status
  docs:
  - **D-02** (MEDIUM) — the primary-unlock timing oracle (`VULN-17`, a correct
    primary unlock returns after one Argon2id KDF while wrong-password/duress/panic
    paths run at least one additional KDF; the `PRIMARY_UNLOCK_EQUALIZER_MS` constant
    pads wall-clock time but not the underlying KDF cost) remains **ACCEPTED
    RESIDUAL** — disclosed, not code-fixed this round.
  - **AL-06** (LOW) — the audit log is primary-session-only by design
    (`auditSecretForSession` returns `null` for decoy/hidden sessions with no dummy
    blob written), which is itself a forensic tell distinguishing a primary session
    (blob present) from a decoy/hidden session (blob absent). Disclosed per I4
    honesty; no chaff-blob mitigation shipped this round.
  - **BIO-03** (MEDIUM) — the biometric unlock settings UI did not expose that its
    gate is an app-layer check (`BiometricAuth.authenticate()`), not an OS-enforced
    Keychain/Keystore ACL, and is therefore bypassable via Frida on a rooted/
    jailbroken device (see BIO-02). Disclosed to close the gap between user
    expectation ("hardware-bound biometric") and actual behavior pending Hardware
    KEK Phase 2.
  All three are internal-static-analysis findings, **not** independently audited —
  see the I4 disclaimer in `docs/audit-2026-07-05-deniability-internal.md`. Status
  tags for the underlying features are unchanged by this disclosure round; the gate
  status (mainnet open since 2026-06-17) is unchanged.
- **Crypto implementation verification doc**
  (`docs/crypto-implementation-verification.md`) — a from-source review of the
  vault's Argon2id→AES-256-GCM construction and the hardware-KEK HKDF combine,
  confirming the actual code against CLAUDE.md's documented design (including the
  I6 `HKDF(H‖C)` concatenation vs. an earlier XOR description, previously resolved
  as doc-only per the 2026-07-01 ECC audit). **Status: BUILT** (code-implemented,
  unit-tested), **NOT independently audited** for this specific crypto angle. Updated
  2026-07-05 to reflect the 64→192 MiB KDF raise (see above).

[Unreleased]: https://github.com/VEYRNOX/veyrnox/compare/main...HEAD
