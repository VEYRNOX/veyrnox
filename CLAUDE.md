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

## Current state summary (2026-07-20)

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
on the upload-key reset (pending). Referral system BUILT (4-tier discount model, Supabase server-side codes);
deniability-hardened 2026-07-20 (PR #1262, K-2): `syncCount` no longer coerces a failed API
read into a fake "synced" success state written to shared localStorage, and the tracker
page now renders a neutral empty state (gated on `isDeniabilityOrDemoActive()`) instead of
reading/writing real referral state in decoy/demo sessions.

**All 10 assets LIVE** — ETH, MATIC, ARB, OP, AVAX, BNB, BTC, SOL, USDC, USDT.

**Play Store: BLOCKED on upload key reset (2026-07-20).** Play has an upload certificate
registered for `com.veyrnox.app` (`0F:3F:FC:05…:42:C5:26`) that matches **no usable
keystore**. Three ruled out by fingerprint: the Windows `veyrnox-release.keystore`
(`6D:F9:D0:DB…`), the newly generated `android/veyrnox-upload.jks` (`CC:3F:16:36…`), and
CI `KEYSTORE_BASE64` (`5F:5E:B6:E1…`). Two more are **PKCS#12 and unopenable** (certs are
encrypted in that format, so they cannot even be identified without the password, and
`S0cR4Te…` fails on both): `android/veyrnox-release.jks` (2730 B) and
`OneDrive-Personal/Windows Downlad PC/Veyrnox Wallet market/veyrnox-release.keystore`
(2714 B — a *different* file from the Windows copy above). Either could be the missing
key, but without its password neither is usable, so the outcome is unchanged. A **reset was
requested 2026-07-20 and is confirmed pending** (~1–2 business days); on approval
`veyrnox-upload.jks` becomes the valid upload key. Do NOT generate further keystores.
Traps for whoever picks this up:
- The Play **app record already exists** (draft, internal testing, release `3 (1.0.2)`
  live since Jul 13) — do not create a duplicate.
- `RELEASE_CERT_SHA256` must be **Google's app signing cert**
  (`D8:99:69:D5…:44:6C:B9`), NOT either upload key — Play App Signing re-signs the
  upload, so a Play-installed build otherwise fails RASP `detectTamper` (`tampered:true`).
- versionCodes are **permanently consumed** per upload (1–3 gone, now 4); deleting a
  release does not free them. `versionName` is the only customer-visible field — set to
  **`1.0`** for launch.
- **Personal** developer account: Google's 12-tester/14-day rule gates **production
  only**, not internal testing — real Play Billing IS verifiable on the internal track.
- Data Safety: all 9 owner-decisions resolved (`docs/play-launch/data-safety-form.md`).
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
LOG-1 remediation BUILT (PR #572), independent third-party audit outstanding,
Play upload key reset pending (above).

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
