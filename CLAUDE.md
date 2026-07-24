# Veyrnox — project guide for Claude Code

Veyrnox is a self-custody, coercion-resistant crypto wallet (Vite + React + Capacitor;
ethers v6; @noble / @scure). Web + mobile (iOS/Android via Capacitor). The seed is the
identity; the app never holds keys server-side.

> **Full audit history:** `docs/CLAUDE-audit-archive.md` (moved 2026-07-20 to reduce
> context-window pressure). Read on demand when you need PR-level detail.

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
- **No fake security.** Never mock a security control to look real. If something can't be
  delivered honestly, honest-disable it (I4: fail honest, fail closed).

## Current state summary (2026-07-23)

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
API-hardened PR #1334 — dedup + rate-limited RPCs, see tracking section below);
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
  2026-07-23. Still open: Apple's **Usage Data → Product Interaction** is undeclared,
  and there is **no consent/opt-out** (ePrivacy question — counsel).
- **veyrnox.com/privacy is still WRONG** — dated 16 June, says "No analytics or
  tracking" in two places. In-app policy fixed (PR #1329); the site is not.
- **API security hardening (PR #1334, merged 2026-07-23).** All Supabase writes
  now go through rate-limited SECURITY DEFINER functions — no direct table INSERT
  via the anon key. Controls: `track_event()` 60/device/hour + event allowlist +
  4KB metadata cap; `increment_referral()` 1 per device per code (dedup table
  prevents count-inflation attack); `generate_referral_code()` 1 per device;
  `register_referral_code()` 3/device/hour; `record_attribution()` validated +
  2/code/hour; `referral_attributions` public SELECT removed (revenue data no
  longer disclosed). Shared `lib/deviceId.js` extracted. SQL migration:
  `sql/api-security-hardening.sql`. BUILT, INTERNAL — not independently audited.

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
  dropped by PR #1313. CI now asserts the guard's rejections. See
  `docs/audit-2026-07-23-branch-review.md`. RASP on a Play install still device-unverified.
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
- `ITSAppUsesNonExemptEncryption` is **not set** in Info.plist, so Apple still asks
  the encryption questions at submission — the path that produced the France
  declaration requirement. Counsel decision, see
  `docs/play-launch/export-compliance-counsel-note.md`.
- `veyrnox.com` is a client-rendered SPA — `curl` gives **false negatives** when checking
  page content; verify by rendering the page.

**2026-07-20 branch-review + weekly audit (`docs/audit-2026-07-20-weekly.md`):** C-1
(CRITICAL, More-drawer "Recent" tiles named duress/stealth/panic routes and survived
decoy sessions/lock/panic-wipe), K-2 (referral sync fail-as-success + pre-gate real-state
read/write), S-1 (user-facing security caveats stripped from Documentation by PR #1243),
and H-3 (duress setup didn't clear a pre-existing real-PIN biometric cache) are all BUILT
+ merged (C-1 + K-2 both in PR #1262; S-1 in #1268; H-3 in #1261). H-1 (WC session-approval gate
fail-open) fix merged in PR #1276. H-2 (ColdSign WARN-tier biometric
step-up gap) — **no action taken, correctly**: `ColdSign.jsx` is unreachable dead code (no
route/import), and the underlying gap is already tracked as weekly M-5 (2026-07-14).

**Open residuals:** M-1 (EVM key unzeroable, ethers v6), M-6 (iOS bridge H copy),
#1111 (vault AAD v:3 migration — plan r2 done, implementation blocked on owner decisions),
LOG-1 remediation BUILT (PR #572), independent third-party audit outstanding.

## Security invariants

- I1 — keys never leave the device
- I2 — no silent data egress
- I3 — deniability mode makes zero backend calls
- I4 — fail honest, fail closed
- I5 — backend untrusted by design
- I6 — Hardware Binding: KEK = HKDF(H ‖ C) — ordered concat, NOT XOR
  (`kek.js: combineKek`, domain `veyrnox/kek/v1/combine(H||C)`)

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

## Multi-agent working pattern

Subagents in `.claude/agents/`: `veyrnox-recon` (read-only), `veyrnox-ui` (design-system),
`veyrnox-security-tdd` (strict TDD), `veyrnox-honest-reviewer` (honesty bar). Fan out in
ONE message for concurrency.

### Codex — second developer

Codex is read-only (`codex review` or `codex exec -s read-only`). Claude reads the report,
then implements. Codex output is INTERNAL — never the outstanding independent audit.

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
