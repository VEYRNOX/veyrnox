# Internal Security Audit — 2026-08-03
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates · TIP egress · Shamir DEK sharding (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification, no on-chain
> confirmation. An independent third-party audit remains RECOMMENDED and OUTSTANDING
> (see CLAUDE.md §Hard rules). Nothing in this report is "verified" in the project's
> sense of that word.

Conducted: 2026-08-03
Method: Static code analysis via parallel specialist agents (6 agents × 6 surfaces)
Branch audited: `security-audit/2026-08-03`, a worktree pinned to `origin/main`
Commit audited: `f39c0a89476c8a9a6ffa085954e9655e3a8c22d3`
Status when written: **Findings only — nothing fixed.**
Status now: **remediation in progress — see the Remediation log at the end of
this document.** The findings below are left EXACTLY as first written, including
the ones since fixed. This is a dated record of what the tree looked like on
2026-08-03; rewriting a finding to say "fixed" would destroy the evidence of what
was wrong and make the report useless for judging whether the fix was adequate.
The log at the end is the single place that tracks state.

**Do not mark anything verified without an on-chain txid or on-device evidence.**
Nothing in the remediation log is "verified" in that sense either — the fixes
carry unit tests and CI, which this project does not count as verification.

### Scope extension this run (noted per the task's "make reasonable choices" clause)

The four standing surfaces were audited as specified. Two surfaces were **added**
because they landed since the last weekly (2026-07-20) and bear directly on the
invariants:

- **TIP threat-intelligence egress** (`src/api/tipClient.js`, `tipScreen.js`,
  `s9-tip-threat.js`, `SecurityAdvisor.jsx`) — commit `22f3878b`, 2026-08-02, one day
  before this audit. A brand-new network egress path in an app whose I2/I3 invariants
  are about egress. Never audited.
- **Shamir 2-of-3 DEK sharding** (`src/wallet-core/shamir.js`) — PR #1538. A
  hand-rolled secret-sharing primitive operating on the vault DEK, which is an explicit
  exception to the project's own "no custom crypto primitives" rule.

Both are reported below alongside the standing surfaces.

### How severities were adjudicated

Agent ratings were not accepted at face value. Every HIGH and above was re-verified by
hand against the pinned tree before inclusion, and two ratings were changed:

- Agent E rated the TIP send-gate defect **CRITICAL**. Adjudicated **HIGH** here,
  because `VITE_TIP_*` is unset in `.env.example`, `.env.staging`, and all CI
  workflows — the feature cannot fire in any build that exists today. It becomes
  CRITICAL the moment the endpoint is provisioned. The defect itself is confirmed.
- Every finding carries a **Live?** marker: `LIVE` (reachable in a shipping build now),
  `PRE-WIRING` (defect is real but the code is unreachable/unconfigured today).

This distinction is the difference between "fix now" and "fix before you turn it on",
and collapsing it would misrepresent the risk either upward or downward.

---

## Changes since last audit (2026-07-20 → 2026-08-03)

290 commits, 17 merge commits. Security-relevant themes:

**Fix wave landed (2026-07-28 internal audit, 28 findings).** Confirmed present in this
tree: `11ac316a` (M-3, fail-closed `isVaultWrapped`), `4fb9789d` (L-2, `decodeKekSalt` +
`getHardwareFactor` inside try/finally), `bec1f635` (M-5, typed-data risk scoring in the
WC pre-sign gate), `69c7d79d` (L-4, step-up re-auth on WC session approval), `fea6fb88`
(L-5, `rejectRequest` honours caller reason), `fba89baf` (L-6, `_scheduleProposalExpiry`
wired), `51a1c58b` (L-1, PIN-byte zeroization), `5340f087` (L-3, Play Integrity KDoc).

**Vault/KEK malformed-input hardening.** `e0d8144a`, `770db268`, `8468fab2`, `b869fb41`
— `parseVaultBlob`, `decryptVault`, and `decryptVaultWithDek` now reject structurally
incomplete blobs with stable error codes.

**New: Android debug RASP bypass** (`53493e94`, #1524) — audited as the priority item
this run. **PASS**, see below.

**New: TIP threat intelligence + SecurityAdvisor** (`22f3878b`) — new egress surface.

**New: Shamir 2-of-3 DEK sharding + Security Posture** (`0a70fd2d` + 6 hardening
commits) — new custom crypto.

**Dependencies.** Routine Dependabot flow plus `8ddd2784` (react-i18next 15→17),
`72fe0bbf` (brace-expansion CVE), `e6cbe6e0`/`81a85a07`/`06d8697f` and four pinned
GitHub Actions bumps.

---

## HIGH

### H-1 — [TIP/Send] The send gate never awaits the TIP verdict; a send can proceed with the threat-intel signal silently absent — `PRE-WIRING`
`src/pages/SendCrypto.jsx:818, 854, 858, 881, 907`; `src/risk/signals/s9-tip-threat.js:24-28`.

`riskReady` — the sole input to `riskPending`/`blockedByRisk` — is
`DEMO || !!txSim.data || txSim.isError || !simEnabled`. It never references
`tipQuery.isFetching`/`isLoading`. Verified by hand: no consumer of `blockedByRisk`
observes the TIP query's pending state. When the verdict is computed before TIP
resolves, `chainData.tipResult` is `undefined` and `s9TipThreat` returns `LEVEL.OK` —
**not because TIP said "safe", but because it has not answered.** Nothing in the data
model distinguishes "not screened yet" from "screened, clean". The same
`scoreCurrentSend()` closure is re-read at the signing chokepoint (`:988`), so the
re-check inherits the same stale `undefined`.

Verified per-asset behaviour (`txSim` at `:751` is EVM-only per `:771`; there is no
`solSim`):

| Case | `riskReady` | Effect |
|---|---|---|
| EVM, remoteScreen on | true once `txSim` settles | Local RPC sim typically settles **before** the remote TIP call (10 s timeout) → S9 skipped. S1–S8 still run, so partial local protection remains. |
| BTC/SOL, sim toggle **off** | true immediately (`!simEnabled`) | **No wait for TIP at all**, and per the code's own comment at `:851-853` S9 is the *sole* contributor for these chains → zero threat-intel protection. |
| BTC/SOL, sim toggle **on** (default) | never true (`txSim` never runs for these chains) | Send is permanently blocked. Fail-*closed*, but a functional bug — see L-4. |

**Why HIGH and not CRITICAL:** `VITE_TIP_API_KEY` / `_SIGNING_SECRET` / `_BASE_URL` are
unset in `.env.example`, `.env.staging`, and every CI workflow — verified by grep. With
no `baseUrl`, `getClient()` returns `null`, `screenTransaction()` returns `null`, and S9
returns OK for every send. The feature is inert in all current builds, so there is no
live exposure. **This becomes CRITICAL on the day TIP is provisioned**, and it is
strictly cheaper to fix before that than after.

**Fix:** fold `tipQuery.isFetching` into `riskReady`/`riskPending` with the same
discipline already applied to `txSim` (whose own comment at `:855-856` explains exactly
why the code waits for the simulation to settle — apply that reasoning to S9), and
render a distinct "screening…" state so the block is visible rather than silent.
Separately, S9 should distinguish `tipResult === undefined` (not screened) from a
screened-clean result rather than collapsing both to OK.

### H-2 — [Auth] Clipboard seed-phrase wipe silently and permanently fails on the exact trigger it exists for — `LIVE`
`src/lib/copySecret.js:58-69`.

`wipe()` sets `done = true` and calls `cleanup()` — tearing down the TTL timer, the
`visibilitychange` listener, and the `APP_LOCK_EVENT` listener — **before** the async
`navigator.clipboard.writeText(WIPE_REPLACEMENT)` is known to have succeeded. Its
rejection is swallowed by `.catch(() => {})`. The `onHide` trigger fires precisely when
`document.visibilityState === 'hidden'`, which is the documented condition under which
`writeText` rejects for lack of document focus.

Read the file's own header: line 10-11 states "writeText requires document focus in many
browsers, so a backgrounded/blurred page rejects; we swallow that quietly", and lines
12-13 state "A visibilitychange listener wipes early when the page is hidden". Both
statements are individually true and were never connected. The trigger that fires on
hide is the one whose write cannot succeed — and because it also cancels the 30 s TTL,
the fallback is destroyed with it.

`copySecret()` is called with the real mnemonic from `SeedGrid.jsx:68` and
`WalletEntry.jsx:679`. The realistic flow — copy seed → switch to a password manager to
paste it — is exactly the failing path. Result: **the seed phrase remains on the OS
clipboard indefinitely**, readable by any app with clipboard access, clipboard-history
managers, and cross-device clipboard sync.

**Fix:** do not mark `done`/tear down listeners until the wipe write resolves. On
rejection, re-arm and retry when the page returns to `visible`, with a bounded retry
ceiling. **Add the missing regression test** — `copySecret.harden.test.js` and
`copySecret.test.js` both assert the `.catch()` swallow exists and that the TTL and
app-lock paths work when `writeText` succeeds, but neither covers reject-then-refocus,
which is why this survived.

### H-3 — [Deniability/I3] `confirmWalletBackup` writes a persistent forensic tell to shared localStorage from a decoy/hidden session — `LIVE`
`src/lib/WalletProvider.jsx:1256-1262`; call sites `src/pages/WalletSeedQR.jsx:103, 182`.

`confirmWalletBackup` has **no `isDecoy`/`isHidden` guard**, while eight sibling
mutators in the same file do (`:1006`, `:1028`, `:1049`, `:1204`, `:1383`, `:1389`,
`:1394`, `:1399`, `:2177`). `WalletSeedQR.jsx` calls it unconditionally on every
Print/Share action and carries no gate of its own.

Backing up the decoy's seed under coercion is normal, expected, and *encouraged* —
it is what makes the decoy convincing. Doing so calls `setWalletBackedUp(decoyId, true)`,
writing a new entry keyed by the decoy/hidden wallet's real UUID into the shared,
un-namespaced `veyrnox-wallet-meta` blob — whose own header in `lib/walletMeta.js`
states that hidden/duress wallets are "NOT referenced here", an invariant this path
breaks. A forensic inspection then shows **more wallet-id entries than the user admits
to owning**, which is direct evidence a hidden wallet exists.

The in-code rationale — "Cheap localStorage flip — no password, no re-encrypt (it is not
secret)" — reasons about the secrecy of the *value* and misses that the *presence* of
the key is the tell. This is the identical error recorded in the 2026-07-28 residue
finding: *"'nothing reads this key any more' is NOT an exemption — what makes a key a
tell is its PRESENCE."*

Correctly scoped: `veyrnox-wallet-meta` **is** in `ALL_RESIDUE_KEYS` (`panic.js:232`),
so a panic wipe does clear it. The exposure is that it survives lock/relock and any
inspection short of a wipe — which is the coercion scenario, since a coerced user is
unlocking, not wiping. The write is also functionally pointless: decoy wallets are
already hardcoded `backedUp: true` at unlock (`WalletProvider.jsx:1731`).

**Fix:** add `if (isDecoy || isHidden) return;`, matching the pattern used by every
sibling mutator.

### H-4 — [TIP] HMAC signing secret is read from a `VITE_`-prefixed env var, so it would ship inside the client bundle — `PRE-WIRING`
`src/api/tipScreen.js:18-24`; `src/api/tipClient.js:25-38`.

`createTipClient` requires a `signingSecret` and derives
`keySecret = HMAC(signingSecret, sha256(apiKey))` **in the client**. It is sourced from
`import.meta.env.VITE_TIP_SIGNING_SECRET`. Vite statically inlines every `VITE_`-prefixed
variable into the built bundle — web and the Capacitor app alike. The identifier-renaming
obfuscation in `vite.config.js` does not hide string literals.

An HMAC scheme in which the authentication secret is shipped to the caller provides no
authentication: anyone who unpacks the bundle can forge signed `/api/v1/screen` requests.
This also conflicts with the project's own secrets rule — *"Supabase anon key is the only
key allowed in client code"* — which holds only because RLS + SECURITY DEFINER RPCs gate
everything behind it. No equivalent server-side containment is described for TIP.

**Currently no secret is exposed:** `VITE_TIP_*` is unset in `.env.example`,
`.env.staging`, and CI (verified). Nothing has leaked. This is the ideal moment to fix
it — before provisioning, not after a rotation.

**Fix:** never place a symmetric signing secret in a client-exposed env var. Route
signing through a server-side proxy Veyrnox controls, or have TIP issue short-lived,
narrowly-scoped client tokens.

### H-5 — [TIP/Privacy] The opt-in disclosure materially understates what leaves the device — `PRE-WIRING`
`src/i18n/locales/en/wallet.json:363, 365`; `src/pages/SendCrypto.jsx:688-699`.

The user-facing text says the feature "sends this address to a third party" / "The
recipient address will be sent to the TIP service at the verify step."

The actual payload additionally carries the user's **own** wallet address (`from`), the
transaction amount (`valueWei`), contract address and calldata where applicable, and —
most significantly — `recentCounterparties`: **up to 20 addresses drawn from the user's
full transaction history, address book, and whitelist** (`knownAddresses`, built at
`:666-676`). Unlike the other optional fields, this one is not spread-conditional; it is
attached on every request.

A user who reads the disclosure and concludes that one address leaves the device is in
fact disclosing a slice of their counterparty graph. This is a consent-accuracy gap and
a store-declaration/privacy-policy gap: the existing privacy work covers only the
anonymous `trackEvent` pipeline, not this flow.

**Fix:** enumerate the fields honestly in the opt-in copy, or drop `from` /
`recentCounterparties` / `valueWei` from the payload if they are not load-bearing for
the verdict. Update the in-app privacy section and `veyrnox.com/privacy` before this
ships.

### H-6 — [Shamir] Share envelope is CRC32-authenticated only; one held share suffices to force a silent wrong-key reconstruction — `PRE-WIRING`
`src/wallet-core/shamir.js:229-237, 296-298, 310-337`.

Every envelope field — `k`, `n`, `setId`, `x`, and the 32 `y` bytes — is protected only
by CRC-32, an unkeyed linear error-detection code whose algorithm sits in the same file.
`combine()` treats a CRC pass as sufficient proof of authenticity and performs Lagrange
interpolation with no cryptographic authentication of the result.

Agent F constructed a working proof-of-concept (re-implementing the file's own
GF(2⁸)/Lagrange/CRC logic offline): given one genuine share and its public
`setId`/`k`/`n`/`x`, it solves for `y` bytes that make `combine()` return an
**attacker-chosen 32-byte value**, recomputes a valid CRC, and `combine()` returns
normally — no exception, no signal. Because `k` and `n` are themselves inside the
CRC-protected region and are only cross-checked *between shares in the same call*, an
attacker editing one share can also lower the declared threshold.

The module's own comment concedes this and pushes the safety net onto a caller that does
not yet exist: *"The caller MUST authenticate the reconstructed DEK against the vault's
AES-256-GCM AAD before using it."*

**Not exploitable today** — `shamir.js` has **zero non-test callers** (verified
independently; the only import is `__tests__/shamir.test.js`). None of the spec's
integration modules exist. The forgery lets an attacker choose the *output*, never
recover the genuine DEK below threshold — so this is not CRITICAL, and downstream GCM
authentication would reject the wrong DEK if the documented caller discipline is
actually implemented.

**Fix before wiring:** make the contract enforceable rather than advisory — e.g. store
`SHA-256(domain ‖ setId ‖ k ‖ n ‖ DEK)` in vault metadata and verify it inside
`combine()`, or require a caller-supplied verification callback so the check cannot be
forgotten. (The file's stated worry that a hash commitment would leak the secret does
not hold for a domain-separated hash of a uniformly random 256-bit value.)

### H-7 — [WC] Transaction fee is never displayed before approval; a dApp can bill up to the per-chain cap on a "0 value" transaction — `LIVE`
`src/components/walletconnect/RequestApprovalModal.jsx:290-343`; caps at
`src/lib/WalletConnectProvider.jsx:184-218, 607-630`.

The SEND_TRANSACTION block renders Network, To, native Value, and a calldata prefix —
and no fee or gas row anywhere. `resolveMaxFeePerGas`/`resolveMaxPriorityFeePerGas`
clamp dApp-supplied values to `MAX_BASE_FEE_GWEI` (1000 gwei mainnet) but neither
rejects nor flags a fee at the ceiling, and the priority fee — paid to the proposer in
full under EIP-1559 — is clamped to the *same* ceiling rather than to a small tip. With
`WC_GAS_CAP` at 1,000,000 gas, a callee that deliberately burns its limit yields a fee
bill up to roughly one native token on mainnet.

No risk signal scores gas or fee fields (`grep` over `src/risk/` returns no gas-aware
signal), so the transaction reads as unremarkable. The user sees "0 ETH", ticks the two
acknowledgement boxes, and loses the fee.

The caps (M9 / F-02-GASCAP) are correctly wired and bound the worst case; the defect is
that the bound is never disclosed.

**Fix:** render worst-case fee (`gasLimit × cappedMaxFeePerGas`) as its own row in native
units and fiat, and feed a fee-magnitude signal into the risk score so an abnormal fee
drives the CONFIRM/WARN gate rather than passing silently.

---

## MEDIUM

### New this pass

- **M-1 — [WC] `verifyingContract` is computed for display and then never rendered.**
  `src/wallet-core/evm/typed-data.js:148-162` returns `contract: domain.verifyingContract`,
  and its own test suite documents the intent. `RequestApprovalModal.jsx:259-287` renders
  only `description.summary` (which uses `domain.name`, an attacker-controlled free-text
  string) and the message fields. Neither `.contract` nor `.chainId` is read anywhere in
  the component tree. For a Permit, the user therefore sees a token *name* the dApp chose
  and never the contract the signature actually authorises. H7 already binds and enforces
  `domain.chainId` (`WalletConnectProvider.jsx:472-497`), so the chain axis is closed —
  this is the contract-identity axis only. One-line UI fix; the data already exists.

- **M-2 — [KEK] `unenrollKek` was missed by the L-2 zeroization fix on both platforms.**
  `native.js:1045-1066`, `web.js:642-662`. PR #1454 moved `decodeKekSalt` +
  `getHardwareFactor` inside `try/finally` at three sites (`_unlockInner`,
  `saveVaultContents`, `upgradeKekToV3`); `unenrollKek` retains the pre-fix shape, so a
  biometric cancel — the exact scenario the commit cites — skips the `finally` and
  `saltBytes` is never zeroed. `web.js`'s `unenrollKek` never references `saltBytes` in
  its `finally` at all, so it is unwiped even on success. **Bounded:** `kekSalt` is
  persisted in the vault blob as plain base64 and is not H, C, KEK, or DEK — this is
  hygiene inconsistent with a stated invariant, not key exposure. The three L-2
  regression tests in `native.zeroize.test.js` do not cover `unenrollKek`.

- **M-3 — [Deniability] Decoy/hidden unlock silently destroys the real user's pending
  referral state.** `src/lib/WalletProvider.jsx:1752-1762`. The block runs unconditionally
  for every session type; `clearPendingReferral()` (a plain localStorage write) executes
  before the network call. The RPC itself *is* correctly gated in `referralApi.js:63`, so
  I3's "zero backend calls" holds and this is not a deniability tell — but real state is
  destroyed from inside a decoy session, the same class as the K-2 fix. Narrow
  precondition (a code applied at creation, then a decoy unlock before the next real
  unlock) but real.

- **M-4 — [TIP] Response schema is unvalidated; valid-JSON-wrong-shape reads as "no
  threat".** `src/api/tipScreen.js:53-60`; `s9-tip-threat.js:60-67`. The `catch` only
  fires on thrown exceptions (network error, non-2xx, abort, JSON syntax error). A
  response that parses but omits or renames `verdict` flows through as success, and S9
  falls to its final `return LEVEL.OK`. This contradicts the file's own header claim
  ("I4: fail closed on error… never a silent pass") for the failure mode most likely from
  a backend regression or schema drift. **Fix:** validate `verdict ∈ {allow, warn, block}`,
  `sanctions_hit` boolean, `threat_signals` array; treat any deviation as `error`.

- **M-5 — [TIP] SecurityAdvisor is a second, undisclosed egress path for free-text user
  input.** `src/components/SecurityAdvisor.jsx:294-335`. Chat messages plus
  `current_screen`/`wallet_chain` are POSTed unauthenticated to `/api/v1/chat`. The I3
  gate is correct and tested (the component returns `null` under
  `isDeniabilityOrDemoActive() || DEMO`), but there is no disclosure screen and no
  consent check — `lib/consent.js` is not imported. The project deliberately reduced
  telemetry to a single egress chokepoint; this bypasses it. A user may type an address
  or describe their situation with no forewarning it reaches a third-party AI endpoint.

- **M-6 — [TIP/Honesty] `advisorKnowledge.js` sells TIP screening as a Safety Plus
  exclusive that the code does not gate.** `advisorKnowledge.js:259, 263` tells users
  "Safety Plus adds enhanced threat screening…"; the `remoteScreen` toggle
  (`SendCrypto.jsx:467-473`) has no entitlement check of any kind. I4 mismatch in the
  *safe* direction (undersells free protection), but a free-tier user could skip real
  protection believing it is paid. Fix the copy or gate the feature — not both.

- **M-7 — [Shamir] The implementation is not constant-time, contradicting its own
  governing spec's MUST.** `shamir.js:93-96` branches on zero operands and indexes
  `LOG_TABLE`/`EXP_TABLE` with secret-derived bytes — classic cache/branch-timing
  patterns. `docs/cloud-recovery-shard-spec.md:112-114` states the implementation
  "MUST be constant-time on the share bytes". Heavily mitigated in practice: `split()`
  draws a fresh polynomial on every call so traces cannot be accumulated against one
  secret,
  `combine()` runs at human timescales, and an attacker with code execution has far
  cheaper options. Not considered exploitable — but the code does not meet the bar its
  own spec set, and one of those two artefacts should change before this is wired.

### Carried from prior audits — verified by hand against this tree

- **C-1 — [KEK/iOS] `getHardwareFactor` still has no native RASP gate; Android does.**
  A case-insensitive grep of `ios/App/App/HardwareKekPlugin.m` for
  `rasp|jailbreak|blockTier|integrity` returns **zero** matches, while Android gates H
  release on `RaspIntegrityPlugin.isBlockTier(context)` at `HardwareKekPlugin.kt:287`.
  On a jailbroken device with the JS layer hooked, H can still be released natively.
  *Carried 2026-07-20 M-2 — unchanged.*

- **C-2 — [Auth] The documented PIN-backoff rate limiter is still dead code.**
  `pinAttemptGuard.js:37, 59` computes and returns `backoffMs`; a repo-wide grep finds
  **no consumer anywhere outside the module itself**. `PIN_BACKOFF_KEY` is removed on
  success but never written or read. The comment at `:32-36` still asserts the tiers are
  live ("unchanged from the prior VULN-8 rate-limit") — that comment is the I4 honesty
  gap. Either wire it or delete both the code and the claim.
  *Carried 2026-07-20 M-3 — unchanged.*

- **C-3 — [KEK/Android] Raw HMAC output (factor H) is never zeroed.**
  `HardwareKekPlugin.kt:373-374` — `hmacResult` and `macInput` are left to GC after
  base64 encoding. Stronger than previously stated: there is **not a single
  `Arrays.fill` / `.fill(0)` anywhere in the file**. Note the JS layer's zeroization is
  thorough (`kek.js:264-273` and every caller re-wipes) — the gap is native-only.
  *Carried 2026-07-14 M-1 → 2026-07-20 M-4 — third consecutive audit.*

- **C-4 — [KEK/iOS] `enroll()`'s plaintext-H buffer is an immutable `NSData`, never
  zeroed.** `HardwareKekPlugin.m:174` builds `[NSData dataWithBytes:hBytes …]`; only the
  stack buffer is `memset` (`:178`, `:185`). The decrypt path does this correctly —
  `NSMutableData` + `mlock` + `resetBytesInRange` (`:333-349`) — and the fix was never
  mirrored to enroll.
  *Carried 2026-07-14 M-2 → 2026-07-20 M-5 — third consecutive audit.*

- **C-5 — [WC] The known-bad / unresolvable dApp flag is still display-only at the
  per-request gate.** `RequestApprovalModal.jsx:166-171` —
  `approveBlocked = needsReauth || (isAssetAuth && !permitAcknowledged) || (SEND &&
  !txAcknowledged) || type === UNKNOWN || riskBlocks`. It contains neither `dapp.flagged`
  nor `sessionUnresolved`, and is *declared at `:166`, before `sessionUnresolved` exists
  at `:180` and `dapp` at `:182`* — so it structurally cannot reference them without
  reordering. `dapp.flagged` is used only for the banner at `:235`. Session
  *establishment* does hard-block known-bad domains (`session.js:204-217`), so this is
  the per-request gate only.
  *Carried 2026-07-14 M-3 → 2026-07-20 M-6 — third consecutive audit, verbatim.*

- **C-6 — [Auth] The wrong-PIN counter remains attacker-clearable `localStorage`.**
  `pinAttemptGuard.js:11-17`; `WalletEntry.jsx:777-786`. Confirmed there is **no
  non-clearable backstop** anywhere in native code. Clearing `veyrnox-pin-attempts`
  resets the countdown to the irreversible 10-strike wipe. Honestly disclosed in-code at
  `:12-18` as an "Accepted software limit", so no I4 violation.
  *Carried 2026-07-20 M-8 — unchanged.*

- **C-7 — [KEK] `hardwareKekVersion` / `kekSalt` still not bound into the vault AAD.**
  Tracked as #1111; the v:3 migration plan landed (`67b811a6`, `docs/vault-aad-v3-plan.md`)
  but implementation remains blocked on owner decisions. Not an unlock bypass — a wrong
  salt yields a failing GCM tag (fail-closed).
  *Carried 2026-07-20 M-7 — plan advanced, code unchanged.*

---

## LOW

- **L-1 — [KEK] `changePassword` decodes/generates salt before entering its try/finally.**
  `native.js:903-913`. Same shape as the L-2 class, but every statement in the pre-try
  window is synchronous and effectively non-throwing (`getRandomValues`, `btoa`).
  Consistency fix only; no exploit path identified.

- **L-2 — [RASP] Detection-chain doc drift between the Kotlin plugin and `nativeProbe.js`.**
  `RaspIntegrityPlugin.kt:84-95` documents `screenCapture → hooked → BLOCK` and
  `overlayActive → rooted → WARN`. Actual current mapping (`nativeProbe.js:169-176`):
  `screenCapture` is on the `elevated` axis (WARN) per #1108, and `overlayActive` is
  **dropped entirely** per #1104 — both pinned by passing regression tests. No live
  bypass; the enforcement layer is correct. The risk is to future reviewers reading the
  native file's comments as authoritative.

- **L-3 — [Auth] Four sibling wallet-metadata mutators rely solely on UI-level gating.**
  `WalletProvider.jsx:1264-1290` (`renameWallet`, `switchWallet`, `setWalletAssets`,
  `toggleWalletAsset`) have no internal `isDecoy`/`isHidden` guard and depend on
  `WalletPortfolioPage.jsx`'s `canManage` hiding the controls. Not proven reachable in a
  decoy session through normal UI — unlike H-3, which is. Defence-in-depth consistency.

- **L-4 — [Send/SOL] `riskReady` can never settle for SOL sends while the simulation
  toggle is on.** `SendCrypto.jsx:818` depends solely on `txSim`, which is EVM-only
  (`:771`); there is no `solSim`. With `simEnabled` defaulting to true (`:478-480`) and
  `remoteScreen` on, `riskApplicable` is true while `riskReady` stays false, so
  `blockedByRisk` remains true indefinitely. **Fails closed**, so this is a functional/UX
  defect rather than a security hole — but it means the H-1 fail-open window is reached
  specifically by users who have turned the simulation *off*. Flagged from code reading;
  not reproduced at runtime.

- **L-5 — [Docs] `docs/Feature-Status.md:789` is now false.** It states Social Recovery
  "(guardian / Shamir SSS / multi-party approval) … never built … **No code exists.**"
  `src/wallet-core/shamir.js` is real, tested Shamir SSS code as of PR #1538. The
  guardian/multi-party half remains correctly absent; the Shamir half is not. Same
  stale-claim pattern this project already tracks as a process risk.

---

## Status vs prior audit (2026-07-20 weekly)

| Prior finding | Status | Evidence |
|---|---|---|
| H-1 — WC session-approval gate fail-open | **FIXED** | All four call sites read `gate.proceedAllowed`/`gate.rejectCode`, matching `presign.js:44-58`. Verified per-method. |
| H-2 — ColdSign WARN-tier biometric gap | **REFUTED / NOT APPLICABLE** | WARN-tier biometric enforcement is real in the live path: `SendCrypto.jsx:909-916` disables send, and `:996-1008` re-asserts it at the signing chokepoint using a *freshly sampled* artifact, throwing `RASP_BIO_REQUIRED`. `ColdSign.jsx` remains unreachable dead code (no route, no import). |
| H-3 — Duress setup left real-PIN biometric cache | **FIXED, no sibling gap** | `setDuressPin()` force-clears the cache before provisioning (`WalletProvider.jsx:2039-2044`); `removeDuressPin()` (`:2062-2079`), `panicWipe()` (`:812-813`), and `changePassword()` (`:1416-1444`) all covered. `enforceDuressBiometricInvariant()` wired at `WalletEntry.jsx:637` for pre-fix users. |
| M-1 — ColdSign uses stale heartbeat artifact | **STILL PRESENT, immaterial** | ColdSign is dead code. Fails closed to `TIER.BLOCK` regardless. |
| M-2 — iOS `getHardwareFactor` has no native RASP gate | **STILL PRESENT** | → C-1 above. |
| M-3 — PIN backoff is dead code | **STILL PRESENT** | → C-2 above. |
| M-4 — Android raw H never zeroed | **STILL PRESENT** | → C-3 above. |
| M-5 — iOS enroll H never zeroed | **STILL PRESENT** | → C-4 above. |
| M-6 — WC flagged-dApp gate is display-only | **STILL PRESENT** | → C-5 above, verbatim. |
| M-7 — vault AAD does not bind salt/version | **UNCHANGED (plan advanced)** | → C-7 above; #1111 open. |
| M-8 — PIN counter in clearable localStorage | **STILL PRESENT** | → C-6 above. |
| L-1 — `native.js` lacks web's malformed-blob guard | **FIXED** | `e0d8144a` + `770db268` + `8468fab2` added `MALFORMED_VAULT`/`VAULT_MALFORMED` guards; `b869fb41` added unhappy-path tests. |
| L-2 — stale "64 MiB" KDF comment | **STILL PRESENT** | Documentation drift only; code imports live `KDF_PARAMS`. |
| L-3 — `copySecret` has no read-back sentinel | **SUPERSEDED** | The data-loss papercut stands, but H-2 above is the materially worse defect in the same function. |

---

## INFO / PASS — controls confirmed working

**The priority item this run — PASS.** Commit `53493e94` (#1524) gates the RASP cert
check on `BuildConfig.DEBUG` at `RaspIntegrityPlugin.kt:768-772` and `:961-965`.
`BuildConfig.DEBUG` is an AGP compile-time constant tied to the build type's `debuggable`
flag; `android/app/build.gradle:77-94` hardcodes `debuggable false` on `release` with no
flavor, property, or CI path that flips it, and `minifyEnabled true` lets R8 strip the
branch. The debug variant also carries `applicationIdSuffix ".debug"`, so it installs as a
different package. The bypass **cannot reach a release build, cannot be flipped at
runtime, and cannot be flipped by repackaging.** The `FLAG_SECURE` half of the same PR was
reverted — `MainActivity.java:48-51` applies it unconditionally, pinned by the
`g4-android-flag-secure` regression test.

**iOS genuinely uses the Secure Enclave — no I4 naming violation.**
`HardwareKekPlugin.m:139-146` sets `kSecAttrTokenID: kSecAttrTokenIDSecureEnclave` with a
`.biometryCurrentSet` ACL; only the ECIES ciphertext of H lands in the generic Keychain.
`EnclaveKeyService.swift:104-143` **throws** `secureEnclaveUnavailable` rather than
falling back to a plain Keychain key, and `capability()` honestly reports
`backing: "none"` when unavailable.

**StrongBox fallback is honestly reported.** `HardwareKekPlugin.kt:196-226` tries
StrongBox then TEE; `readSecurityLevel()` (`:158-181`) reports the *real*
`KeyInfo.securityLevel` rather than assuming success. `EnclaveKeyService.kt:706-712`
carries an explicit "never label a software-backed key as 'tee'" comment.
`hardware.js:181-199` refuses `SOFTWARE`/`UNKNOWN` tiers before enrolling.

**I6 conformance exact.** `kek.js:72` — `KEK_DOMAIN = 'veyrnox/kek/v1/combine(H||C)'`;
`:238-240` — `ikm.set(H, 0); ikm.set(C, H_LEN)`. Ordered concat, H first, no XOR.
Degenerate all-zero H or C rejected before HKDF (`:230-236`).

**Biometric key binding.** `setUserAuthenticationParameters(0, AUTH_BIOMETRIC_STRONG)`
(fresh auth per use, no DEVICE_CREDENTIAL fallback) and
`setInvalidatedByBiometricEnrollment(true)` on both Android key specs
(`HardwareKekPlugin.kt:207-208`, `EnclaveKeyService.kt:640-641`).

**Every WC signing method passes the gate with the correct result shape.**
`eth_sendTransaction`, `personal_sign`, `eth_signTypedData_v4`, and session approval all
call `presignGateOrReject` and read `proceedAllowed`. `eth_sign`, `eth_signTypedData` v1
and v3, and `wallet_switch/addEthereumChain` are rejected pre-signer via
`router.js:39-45` and never advertised in `buildApprovedNamespaces`.

**WC chain and signer binding.** chainId resolved exclusively from the live session store
(`resolveSessionCaip2`, `:305-312`); `from`/signer binding enforced twice (pre-modal and
at signing) for both send and typed-data. Session expiry (M11) asserted from live state
before every handler (`:828-845`); proposal expiry wired (`session.js:42-87`).
RPC-endpoint chain-id spoofing re-checked immediately before broadcast (`:596-598`).

**RASP fails closed at every layer checked.** `detect.js:85-108`,
`nativeProbe.js:152-161`, `attestation.js:166-178`, `selectPresignProbeSource.js:50-62`
(native never inherits the browser leg's CLEAN), `getFreshRaspArtifact.js:41-91`
(timeout/throw/shape-drift → `TIER.BLOCK`), `compose.js:64-95` (unknown tier → BLOCK,
unknown tx level → CONFIRM), `sensitiveGate.js:40-48`. `earlyCheck()` runs before
`registerPlugin()`/`super.onCreate()`, so the bridge never initialises on a BLOCK-tier
device.

**Shamir crypto core is correct where it counts.** GF(2⁸) verified against brute-force
polynomial multiplication for all 65,536 input pairs; `gfInv(a)·a == 1` for all 255
nonzero `a`. `crypto.getRandomValues` only — no `Math.random` (pinned by a test that
spies on it). `x = 0` excluded at both split and combine. **Duplicate-x rejected**
(`DUPLICATE_X_COORD`) — the classic threshold break is closed. Threshold enforced before
interpolation; extra shares verified against the reconstructed polynomial
(`SHARE_INCONSISTENT`), which is genuine cheating-participant detection with a
non-vacuous test. Zeroization complete across `split()`, `combine()`, the Lagrange basis,
and the result buffer on every throw path.

**I3 holds across the new egress surface.** `screenTransaction()` checks
`isDeniabilityOrDemoActive()` as its first statement, before any client construction or
fetch (`tipScreen.js:36`); the helper itself fails closed on throw. SecurityAdvisor
returns `null` under the same condition, with a passing regression test. No TIP verdict,
address, or chat history is written to `localStorage`/`IndexedDB` anywhere in the new
code — no new residue.

**TIP error path genuinely fails closed** to CAUTION/medium (`tipScreen.js:61-76` →
`s9-tip-threat.js` `verdict === 'error'` → `LEVEL.CAUTION`), tested on both sides. TIP
can only raise the composite verdict, never lower it (`score.js:96-104`), and a throwing
S9 is caught and reported as CAUTION.

**Egress endpoint is CSP-pinned**, not wildcarded — `index.html`'s `connect-src` lists
the TIP host explicitly alongside the other hardcoded RPC/API hosts.

**The posture feature registered its residue key correctly.** `veyrnox-posture-dismissed`
was added to `METADATA_RESIDUE_KEYS` in the same commit that introduced it
(`panic.js:299`) — the standing "a new component's storage keys must join the wipe list"
rule was followed. `veyrnox-remote-screen` and `veyrnox-sim-enabled` were already listed
(`:243-244`).

**`securityPosture.js` does not overstate protection (I4).**
`hardwareKekStatus.isHardwareKekEnrolled()` is a genuine two-part probe (credential
enrollment **and** a live `hasVaultKekWrap()` check), explicitly designed so an orphaned
alias cannot inflate the score. All un-self-detectable fields — PIN length, the four
`share*` flags, WC session settings — default to `false`/`null` and contribute zero
rather than being assumed true, pinned by an integration test against the real scoring
function. TEE honestly caps below 100%.

**No XSS vector in any untrusted-data render path.** No `dangerouslySetInnerHTML`,
`innerHTML`, or `eval` in the WC modals, `TransactionPreview`, or the new TIP/Advisor
components — all rendering goes through JSX text nodes. dApp icon URLs pass
`isSafeIconUrl` with `referrerPolicy="no-referrer"`.

**No secret leakage in logs** across the audited surfaces. The single `console.error` in
`WalletProvider.jsx:1334` logs an internal KDF failure message — no PIN, seed, key, or
`isDecoy` boolean.

**No secrets committed.** `.env.example` and `.env.staging` are tracked but contain no
secret values (staging Supabase entries are deliberately blank). `VITE_TIP_*` appears in
neither, nor in CI.

---

## Coverage gaps in this audit (stated honestly)

- **Static analysis only.** No emulator, no device, no jailbroken/rooted hardware, no
  network capture, no on-chain transaction. Nothing here is "verified" per the project's
  own definition.
- **Native compiled artifacts were not examined.** The R8 dead-stripping claim in the
  #1524 PASS is reasoned from `build.gradle` and AGP semantics, **not** confirmed by
  disassembling a release APK. That is the honest limit of this finding.
- **The Shamir CRC forgery PoC was run against a re-implementation** of the module's own
  logic, offline — not against the app runtime. The conclusion follows from the algebra
  (unkeyed linear checksum over attacker-editable fields) and is not runtime-confirmed.
- **No live backend was touched.** Supabase RLS, the TIP staging worker, and RevenueCat
  runtime behaviour are all untested here.
- **iOS files were read, not built.** No Mac in this environment.
- **This is INTERNAL.** Claude-run specialist agents, adversarially cross-checked, are
  still Claude. This pass narrows the target of the outstanding independent third-party
  audit; it does not close it, and must not be described as independent.

---

## Recommended remediation order

1. **H-2** (clipboard seed persists indefinitely) — live, affects the most sensitive
   secret in the product, and the fix plus its missing regression test are both small.
2. **H-3** (decoy backup write) — live, one-line guard, defeats coercion resistance,
   and the pattern is already established eight times in the same file.
3. **H-7** (WC fee never displayed) — live fund-loss vector; the caps exist, only the
   disclosure and a fee-magnitude signal are missing.
4. **H-1, H-4, H-5, M-4, M-5, M-6** — the TIP cluster. All must land **before**
   `VITE_TIP_*` is provisioned. H-1 becomes CRITICAL on that day; H-4 requires an
   architectural change (server-side signing proxy), so it should be scheduled now
   rather than discovered at launch.
5. **H-6, M-7** — the Shamir cluster. Must land before `shamir.js` is wired to any
   recovery flow. Currently dead code, so there is time — but the authentication design
   is the kind of thing that hardens once callers exist.
6. **C-3, C-4** (native H zeroization, both platforms) — third consecutive audit. Either
   fix them or move them to a documented, accepted-residual list so they stop recurring
   as findings.
7. **C-5** (WC flagged-dApp gate) — third consecutive audit, verbatim, and the fix is a
   statement reorder plus two added disjuncts.
8. **C-2** (PIN backoff dead code) — decide: wire it or delete it *and* the comment that
   claims it is enforced. The current state is the I4 problem.
9. **L-5** (`Feature-Status.md` stale Shamir claim) — one line, and it is the project's
   own honesty ledger.

---

# Remediation log

Appended 2026-08-03, after the findings above were written. **The findings
themselves are unmodified** — this section is the only place that tracks state,
so the report stays a faithful record of the tree at `f39c0a89` while remaining
useful for follow-up.

One exception, recorded rather than made silently: H-1's per-asset table pointed
at "L-5" for the permanent-block case. That was a wrong cross-reference in the
original write-up — the finding is **L-4**; L-5 is the `Feature-Status.md` claim.
Corrected in place. No finding text, severity or conclusion changed.

Nothing here is "verified" in this project's sense. Every fix carries unit tests
and passed CI's required checks; that is not an on-chain txid and not on-device
evidence, and it does not close the outstanding independent third-party audit.

## Merged to `main`

| Finding | Fix | PR | Squash commit |
|---|---|---|---|
| **H-2** clipboard seed wipe fails on backgrounding | Wipe commits only on a CONFIRMED successful write; a rejection leaves every trigger armed and a return to `visible` retries. `inFlight` collapses overlapping triggers; `MAX_WIPE_ATTEMPTS` bounds them. "At most once" is preserved and unchanged in meaning — at most one *successful* wipe. | [#1548](https://github.com/VEYRNOX/veyrnox/pull/1548) | `8b09570d` |
| **H-3** decoy backup-confirm writes a forensic tell | An `isDecoy`/`isHidden` early return in `confirmWalletBackup`, matching the eight sibling mutators, with both added to the `useCallback` deps. | [#1549](https://github.com/VEYRNOX/veyrnox/pull/1549) | `e11e00a5` |
| **H-7** WalletConnect fee never displayed | "Max fee — up to X SYMBOL" row plus a note stating it is a ceiling, not an estimate. Derived from the same `resolveMaxFeePerGas` / `WC_GAS_CAP` that ENFORCE the cap, so display and enforcement cannot drift. | [#1551](https://github.com/VEYRNOX/veyrnox/pull/1551) | `3fb12228` |
| **H-6** Shamir CRC-only authentication | Envelope v2 adds a domain-separated SHA-256 commitment over setId, k, n and the secret, recomputed inside `combine()` and rejected on mismatch. Runs before the extra-share check so a forgery among the first k is caught; constant-time compare; binds setId/k/n. v1 rejected, not migrated. | [#1552](https://github.com/VEYRNOX/veyrnox/pull/1552) | `9d37f016` |
| **M-7** GF arithmetic not constant-time | `gfMul` is a fixed 8-iteration masked loop with no indexed reads; `gfInv` is a fixed square-and-multiply chain; the log/exp tables are deleted. The spec's unachievable "MUST be constant-time" was reworded to the verifiable bar rather than ticked off. | [#1553](https://github.com/VEYRNOX/veyrnox/pull/1553) | `97750cbb` |
| **M-4** unvalidated TIP response read as "no threat" | Explicit verdict allowlist; unrecognised shapes degrade to the `error` verdict (CAUTION). Strict-boolean sanctions flag, array-coerced signals, one shared unavailable-result object. Hardened at the second layer too: S9 returns OK only for an explicit `allow`, and `verdictToRiskLevel`'s default moved from `info` to `medium`. | [#1555](https://github.com/VEYRNOX/veyrnox/pull/1555) | `e98fd300` |
| **H-5** opt-in understated egress | Disclosure now enumerates the fields actually sent, with historical counterparties called out in their own sentence. | [#1555](https://github.com/VEYRNOX/veyrnox/pull/1555) | `e98fd300` |
| **M-6** advisor sold free screening as paid | Copy corrected — nothing protecting a transaction is behind the paywall. Pinned by a test that also asserts the send flow still has no entitlement gate, so the code and the claim must move together. | [#1555](https://github.com/VEYRNOX/veyrnox/pull/1555) | `e98fd300` |

## Open, awaiting CI

All three passed `verify`, `mainnet-flag-gate` and `staging-gate`; each was
waiting on the ~20-minute `unit-tests` full suite when this log was written.
**Do not read these as landed.**

| Finding | Fix | PR |
|---|---|---|
| **H-1** send gate never awaited the TIP verdict; **L-4** BTC/SOL blocked forever | Readiness stated once in `lib/riskGateReady.js`: ready when EVERY contributor that applies to this send has settled. Both queries' `enabled` and the gate read the same constants, so they cannot drift. Keys off the query's settled state, not its payload. Re-asserted at the signing chokepoint. | [#1554](https://github.com/VEYRNOX/veyrnox/pull/1554) |
| **M-5** advisor chat was a second ungated egress path | Separate, explicit, one-time consent in `lib/advisorConsent.js`, deliberately NOT reusing the telemetry answer. Declining routes to the existing local knowledge base, so it is not a dead end. Key registered in the panic-wipe residue list, with a test. | [#1556](https://github.com/VEYRNOX/veyrnox/pull/1556) |
| **H-4** HMAC signing secret would ship in the bundle | Signing moved to `supabase/functions/tip-screen`, which holds the TIP API key and signing secret as Edge Function secrets. The client sends an unsigned request with the Supabase anon key. Guard: setting the forbidden client-exposed vars DISABLES screening rather than using them. | [#1557](https://github.com/VEYRNOX/veyrnox/pull/1557) |

**H-4 is BUILT, NOT DEPLOYED.** No request has ever gone through that function.
Before TIP can be switched on: deploy the function (note the deliberately
missing `--no-verify-jwt`), set the TIP base URL, API key and signing secret as
Edge Function secrets, and set the client-side base URL as the feature switch.

## Still open — nothing done

- **M-1** — WC `verifyingContract` computed but never rendered. One-line UI fix;
  the data already exists.
- **M-2** — `unenrollKek` missed by the L-2 zeroization fix on both platforms.
- **M-3** — decoy/hidden unlock destroys the real user's pending-referral state.
- **L-1** — `changePassword` decodes salt before its `try/finally`.
- **L-2** — RASP detection-chain doc drift (`screenCapture` / `overlayActive`).
- **L-3** — four wallet-metadata mutators rely on UI-level gating only.
- **L-5** — `docs/Feature-Status.md:789` still says Shamir SSS has no code. Now
  doubly wrong: H-6 and M-7 both changed that file since.
- **C-1 … C-7** — every carried finding. C-3/C-4 (native H zeroization, both
  platforms) and C-5 (WC flagged-dApp gate) are on their **third consecutive
  audit** and should either be fixed or moved to a documented accepted-residual
  list so they stop recurring as findings.

## Owner decision taken

**Drop `recentCounterparties` from the TIP payload.** The audit offered this as
an alternative to H-5's disclosure fix; the owner chose to do both. Verified
before acting that `risk/fromSendState.js:92` feeds the same `knownAddresses` set
into `activeSetLocalState` as `counterparties`, which **S4** reads for
lookalike/near-duplicate detection — on every send, regardless of the remote
toggle. The field was therefore buying a duplicate of a capability already held
locally, at the cost of the most sensitive item in the payload. Change pending;
it also removes the H-5 counterparties disclosure, because copy claiming that
history is sent would be the same defect inverted.

## Process notes worth keeping

Three of these are about the tests rather than the code, and all three are the
same failure: **a test that is green for a reason other than the one you think.**

- **A test written for this wave was vacuously green.** The first
  `SecurityAdvisor` consent suite used `keyDown` to submit, but the composer is a
  form with an `onSubmit` handler — so nothing was ever sent, and the "sends
  nothing to the network" assertions passed against the **unfixed** component.
  Caught by running the suite against `origin/main` before trusting it. After the
  correction, 6 of 7 fail pre-fix.
- **The H-5/M-6 copy tests were written after the edit**, so they were checked by
  reverting to the original strings: 9 of 11 fail against the old copy.
- **A pre-existing test had become vacuous.** "rejects shares with tampered
  version byte" set the version to `0x02`, which H-6's v2 bump made
  byte-identical to a genuine share — it asserted a rejection that could no
  longer occur. Rewritten to use genuinely unsupported versions, and widened to
  pin that legacy v1 is rejected, since accepting v1 would reopen H-6.

Two more, about method:

- **M-7's verification ORDER was the point.** `gfMul`/`gfInv` were exported and
  the exhaustive tests run against the OLD table-driven code first (9 passing),
  then the rewrite applied and the same 9 re-run. That is direct evidence the
  change altered the timing profile and not a single output value, across all
  65,536 multiply pairs and all 255 inverses.
- **Mutation checks, not just red-green.** H-2, H-6 and M-7 each had the fix
  selectively disabled to confirm the new tests fail for the specific reason
  claimed, and that the controls stay green.

And one about scope:

- **Tests were edited in three PRs, always deliberately and always flagged.**
  H-6 changed format constants (share size, version byte, CRC offsets — the last
  now derived from exported constants so they cannot rot again); H-4 changed two
  env stubs because the configuration contract genuinely changed. In both cases
  the new behaviour is asserted independently, so the edited tests are not the
  only thing standing behind the claim. "Align tests with the new flow" is a
  documented review smell in this repo, and these were checked against it rather
  than waved through.
