# Internal Security Audit — 2026-07-20
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-07-20
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces),
followed by a by-hand re-verification pass on every HIGH and on each MEDIUM whose claim
was structural (dead code, missing call site, platform asymmetry).
Branch audited: `claude/fix-c1-k2-deniability` (4 commits behind `origin/main`, 0 ahead —
no unique commits; carries uncommitted work only). **Every finding below was additionally
re-checked against `origin/main` and is present there**, so none is a stale-branch artifact.
Status: **Findings only — nothing fixed. Do not mark anything verified without on-chain txid or on-device evidence.**

---

## Headline

**Three HIGH, all independently confirmed by hand, all live on `origin/main`.** Each is the
same failure shape: *a control that exists, is documented as enforcing something, and does
not actually enforce it.*

1. **The WalletConnect session-approval RASP gate is a permanent no-op** — it reads two
   properties (`gate.blocked`, `gate.sentence`) that the gate function has never returned.
   Shipped broken in the commit that added it; no test exercises the branch.
2. **Cold-sign broadcast skips the WARN-tier biometric step-up** that `degrade.js`'s own
   spec says is required, and that `SendCrypto.jsx` implements — a checkbox tap is the only
   friction on a rooted device.
3. **Setting up a Duress PIN does not clear a pre-existing real-PIN biometric cache** — so
   on the exact coercion path the feature exists for, Face ID can still open the REAL wallet.

Findings 1 and 3 are the most consequential: both defeat a control precisely in the scenario
it was built for (compromised device; coercion), and both are invisible to the current test
suite.

| Severity | Count |
|---|---|
| CRITICAL | 0 |
| HIGH | 3 |
| MEDIUM | 8 |
| LOW | 3 |
| INFO / disclosed residual | 5 |
| PASS (controls confirmed correct) | 45+ across all four surfaces |

---

## Changes since last audit (2026-07-14 → 2026-07-20)

~80 commits. The security-relevant shape of the week: **almost none of it was security work.**
The bulk is referral/subscription plumbing (PRs #1184–#1207, #1235), Google Play launch prep
(#1187–#1192, #1199), ECC UX/a11y/motion batches (#1144–#1150, #1174), and CI/typecheck
unblocks (#1172, #1175, #1177, #1179–#1182, #1236, #1237, #1238).

Security-relevant items:

- `6a673ee3` / PR #1152, #1178 — **M2c/M2d ungated** (`M2C_ENABLED`, `M2C_HARDWARE_WRAP_ENABLED`,
  `m2cEnabled`, `M2D_ENABLED` all flipped to `true`). This materially widens the hardware-KEK
  attack surface. Note: the M2c/M2d wrap path is **architecturally distinct** from the
  `HardwareKekPlugin`/`kek.js` HKDF-combine design that this audit's KEK brief covered
  (nested wrap vs. combine), and was **not** in the assigned file list — see *Coverage gaps*.
- `39cd73a1` / #1145, `80313d75` / #1141 — real `BiometricPrompt`-gated `wrap()`/`unwrap()`.
- `8a00a7da` / #1188 — Android manifest now declares `CAMERA` (fixes a genuinely broken QR
  scanner) and justifies `RECORD_AUDIO`.
- `871708ba` / #1233 — daily security-diff scan landed findings A-1..A-4 (toolchain/governance:
  no-op Claude Code hooks, hook commands spawning interactive `cmd.exe`, untracked signing
  keystore, admin-bypassable required status checks). **A-4 remains OPEN by owner decision.**
- H-1 from the prior weekly (unlock timing oracle) was **fixed** in this window — see
  *Status vs prior audit*.

**Uncommitted working-tree state at audit time** (present in what the agents read): in-progress
work on `panic.js` adding a `SESSION_RESIDUE_KEYS` list + `clearSessionResidue()` /
`readSessionResidue()`, closing a real deniability residue gap — `veyrnox-recent-pages` in
`sessionStorage` names `/duress-pin`, `/stealth-wallets`, `/panic-wipe` and survives the
post-wipe reload by spec. Plus `Layout.jsx`, `useRecentPages.js`, `ReferralTracker.jsx` and
four new test files. This is unlanded work and is **not** assessed as shipped code here; it
is noted because it is the fix for a residue class this audit would otherwise have flagged.

---

## HIGH

### H-1 — WalletConnect session-approval RASP gate is dead code: reads properties the gate never returns (fail-OPEN)

**File:** `src/lib/WalletConnectProvider.jsx:771-772`

```js
const gate = await presignGateOrReject();
if (gate && gate.blocked) throw new Error(gate.sentence || 'RASP integrity check failed — session refused');
```

**Verified by hand.** `presignGateOrReject()` (`:331-386`) has exactly two `return` statements
— `:375` `return { proceedAllowed: true, rejectCode: null }` and `:386`
`return { proceedAllowed: false, rejectCode }`. It never sets `.blocked` or `.sentence` on
either. The three signing call sites (`:390`, `:436`, `:511`) all correctly read
`gate.proceedAllowed`. `handleApproveSession` at `:771` is the **only** site reading
`gate.blocked`/`gate.sentence`; both are permanently `undefined`, so the condition is
always false and every session approval proceeds **regardless of RASP tier** — including a hard
`TIER.BLOCK` from a rooted / Frida-hooked / emulated / tampered / attestation-failed device.

**Failure scenario.** Device is rooted or hooked. RASP correctly resolves `TIER.BLOCK`. The
user (or malware driving the UI on the compromised device) opens a WalletConnect pairing to
a hostile dApp and taps Connect. The gate is called, returns `{proceedAllowed:false,
rejectCode:'RASP_BLOCK'}`, the check reads `undefined`, nothing happens, and
`approveSession()` runs. The hostile dApp is now connected, holds the wallet's real EVM
address, and has a live request channel — exactly the state CLAUDE.md documents as prevented
("a rooted/hooked device cannot approve new WC sessions", PR #1129/#1105).

**Why it is HIGH and not CRITICAL.** The downstream signing chokepoints
(`_handlePersonalSign`, `_handleSignTypedData`, `_handleSendTransaction`) all read
`proceedAllowed` correctly and remain fail-closed, so this bug alone does not yield a
signature or a broadcast. The bypass is scoped to session *approval* (connection + address
disclosure + open channel), not key-touching operations.

**Why no test caught it.** Every WC test that touches `approveSession` mocks it as an inert
`vi.fn()` and none exercises `handleApproveSession` under a non-ALLOW tier. The branch has
never been executed. It shipped broken in the commit that introduced it (`7cdeee64`) and has
not been modified since — this control has never worked.

**I4 violation: YES** — a documented fail-closed control silently fail-opens on every call.

**Fix.** `if (!gate.proceedAllowed) throw new Error(...)`, mirroring `:390-391`. Add a
regression test that stubs a non-ALLOW tier and asserts `approveSession()` is never called.

---

### H-2 — Cold-sign broadcast omits the WARN-tier biometric step-up that every other sign chokepoint enforces

**File:** `src/pages/ColdSign.jsx:64, 163` — compare `src/pages/SendCrypto.jsx:773-776, 850-853`

**Verified by hand.** `degrade.js` sets `requiresBiometric: true` for `CONDITION.ROOTED` and
`CONDITION.INTEGRITY_UNAVAILABLE`, and its own comments state this is "enforced by
`SendCrypto.jsx` B5". `SendCrypto.jsx` does enforce it, twice: a UI gate (`raspNeedsBio` /
`blockedByRaspBio`, `:773-776`) and a defense-in-depth re-check at the sign hot path against
a freshly-fetched artifact (`raspNeedsBioAtSign`, `:850-853`). A repo grep of `ColdSign.jsx`
for `requiresBiometric`, `verifyBiometric2fa`, and `Biometric` returns **nothing**. Its
broadcast calls `presignGate(tier, LEVEL.OK, riskAck)` where `riskAck` is a plain checkbox
("I reviewed this transaction on my signer and want to broadcast it"). `composeGate()`
proceeds on WARN for any `acknowledged === true`.

**Failure scenario.** Android device is rooted (Magisk Hide active) or the OS probe is
transiently unavailable → WARN tier with `requiresBiometric: true`. On the Send screen this
forces a Face/fingerprint re-confirm. On the cold-sign broadcast screen it requires one
checkbox tap. An adversary who has compromised the runtime enough to tamper with the
displayed transaction — or who is coercing the user — only needs the box ticked, not a
biometric defeated.

**I4 violation: YES** — the artifact's `requiresBiometric` flag is silently ignored on this
surface, making WARN advisory-only here while the codebase's own documentation says it is not.

**Fix.** Port the `raspNeedsBio` / `blockedByRaspBio` / `raspNeedsBioAtSign` pattern from
`SendCrypto.jsx`, gated identically (native-only, `presign.decision !== 'block'`).

---

### H-3 — Configuring a Duress PIN does not clear a pre-existing real-PIN biometric cache: Face ID can still open the REAL wallet under coercion

**Files:** `src/lib/WalletProvider.jsx:2001-2020` (`setDuressPin`), `src/pages/DuressPin.jsx:125, 207-209`,
`src/lib/authModel.js:52-72` (`shouldAutoCacheTypedPin`), `src/components/WalletEntry.jsx:754-769`

**Verified by hand.** `setDuressPin()` provisions the decoy vault and returns; it makes **no**
call to `clearUnlockSecret()`. (Confirmed by enumerating every `clearUnlockSecret` call site in
`WalletProvider.jsx`: `:809`, `:841`, `:884`, `:939`, `:1812`, `:2018` — panic, rollback,
create, import, disable-biometric, and `removeDuressPin`. Not `setDuressPin`.) The cache is
repointed at the decoy **only** if the user ticks "Use Face ID for the Emergency wallet" on
the setup screen — `useBioForDecoy`, which defaults to `useState(false)` (`DuressPin.jsx:125`)
and is the sole trigger for `enableDecoyBiometricUnlock` (`:207-209`).

**The remaining guard is order-dependent.** `shouldAutoCacheTypedPin` previously checked
`duressConfigured` via `hasDuressVault()`; that check was **removed** because PIN-cohort chaff
provisioning makes `hasDuressVault()` always return `true` on every device, which had disabled
auto-caching entirely. The docstring (`authModel.js:53-68`) now names `alreadyCached` as "the
operative guard". `alreadyCached` correctly prevents the real PIN from *overwriting* an
existing decoy cache — i.e. it protects the order *decoy-first, then unlock*. It does nothing
for the reverse order:

1. User enables biometric unlock for the real wallet → cache holds the **REAL** PIN.
2. User later sets up a Duress PIN, leaving the (unchecked-by-default) Face-ID-for-decoy box alone.
3. `setDuressPin` does not clear the cache.
4. Cache still holds the REAL PIN. **Face ID opens the REAL wallet.**

**Failure scenario.** Device is seized. The coercer says "just use Face ID." The owner — who
set up a Duress PIN believing biometric access is now safe — complies, and the real wallet
opens. This is the precise moment the duress feature exists to protect, and it fails silently.
The on-screen copy ("Anyone forcing you to use Face ID only ever sees the decoy") is scoped to
the checked-checkbox case but reads as a blanket guarantee once any duress PIN exists.

**Also stale:** the inline comment at `WalletEntry.jsx:761-763` still claims "Once a DURESS
vault exists it never caches" and "duress-presence-unknown FAILS CLOSED (treated as duress
present)" — both describe the removed `duressConfigured` guard, not current behaviour.

**Invariants violated: I3** (a real-vs-decoy failure at the coercion boundary) **and I4** (the
feature does not do what its own UI copy states).

**Fix.** In `setDuressPin()`, force-clear any existing biometric cache unless the caller
simultaneously opts into `enableDecoyBiometricUnlock` — so Face ID falls back to PIN-only until
consciously re-bound. Alternatively, detect `isBiometricUnlockEnabled() === true` at duress-setup
time and require an explicit re-bind (to decoy) or disable before leaving the page. Add a
regression test starting from an **already-cached real-PIN** state (existing
`duress-biometric-decoy.test.jsx` cases all start from an empty cache — which is why this is
untested). Correct the stale comments at `WalletEntry.jsx:761-763`.

---

## MEDIUM

### M-1 — [RASP] Cold-sign broadcast uses a heartbeat-sampled RASP artifact, not a fresh probe at broadcast time
`src/pages/ColdSign.jsx:64, 162`. `ColdSign.jsx` imports only `useRaspArtifact` (never
`getFreshRaspArtifact`) and reads the closure `raspArtifact?.tier` inside `handleBroadcast()`.
`getFreshRaspArtifact.js`'s own header documents that the hook's mount/foreground/60s-heartbeat
state "can be up to ~60 s stale" — which is exactly why `SendCrypto.jsx:827` and
`WalletConnectProvider.jsx:331-365` re-probe at sign time (P2-1, audit 2026-07-15). The cold-sign
flow has an unusually long real-world window (scan out → sign on the offline device → scan back),
making the staleness practically, not just theoretically, reachable. Still fails closed to
`TIER.BLOCK` on `undefined`, so this is an inconsistently-applied freshness discipline rather
than a fail-open. **Fix:** call `getFreshRaspArtifact()` inside `handleBroadcast()`.

### M-2 — [KEK] iOS `getHardwareFactor` has no native RASP gate; Android does (platform asymmetry)
`ios/App/App/HardwareKekPlugin.m` vs `android/…/HardwareKekPlugin.kt:287`. **Verified by hand:**
a case-insensitive grep of the iOS plugin for `rasp|jailbreak|blockTier|integrity` returns
**zero** matches, while Android gates H release on `RaspIntegrityPlugin.isBlockTier(context)`
as the first statement of `getHardwareFactor()` (fail-closed via `getOrElse { true }`). On iOS
the only RASP enforcement is at the JS layer (`presignGate`), which fires at sign time, not at
H-release time. **Failure scenario:** on a jailbroken iPhone where the JS layer is hooked — which
the project's own 2026-07-14 palera1n + ElleKit device session confirms is achievable — H can
still be released by the native SE path with no native integrity check; the only remaining
barrier is Face ID and the SE ACL. **Fix:** call the existing `RaspIntegrityPlugin.m` detection
from `getHardwareFactor:` before `SecKeyCreateDecryptedData`. New this pass.

### M-3 — [Auth] The documented PIN-backoff rate limiter is dead code; wrong-PIN attempts are unthrottled to the 10-strike wipe
`src/lib/pinAttemptGuard.js:37-61`; `src/components/WalletEntry.jsx:731, 737, 818`. **Verified by
hand** with a repo-wide grep: `pinBackoffMs` is computed and returned as `backoffMs`, but the
sole caller destructures only `{ attempts, shouldWipe }`. `PIN_BACKOFF_KEY`
(`'veyrnox-pin-backoff-until'`) is declared and *removed* on success — it is **never written and
never read**. The module comment claims escalating 5 s / 30 s / 5 min tiers at attempts 3/5/7
("unchanged from the prior VULN-8 rate-limit"); that control does not exist at runtime. The only
throttle is the ~0.6–0.7 s Argon2id cost per attempt, for up to 9 guesses. Practical impact is
bounded (only 10 attempts exist before the wipe), so this is as much an honesty gap as a security
one. **Fix:** wire `backoffMs` into `runPinUnlock` (persist `backoffUntil`, disable submit with a
countdown), **or** delete the dead code and the comment that claims it is enforced. I4.

### M-4 — [KEK/Android] Raw HMAC output (hardware factor H) never zeroed
`android/…/HardwareKekPlugin.kt:373-375`. `hmacResult` (the raw 32-byte H) and `macInput` are
left to JVM GC after base64 encoding — no `Arrays.fill(…, 0)`. iOS zeroes the equivalent buffer
via `resetBytesInRange` **and** `mlock`s it. Recoverable by heap scrape on a live/backgrounded
process on a compromised device. **Carried from 2026-07-14 M-1 — still present, unfixed.**

### M-5 — [KEK/iOS] `enroll()` plaintext-H buffer is an immutable `NSData`, never zeroed
`ios/App/App/HardwareKekPlugin.m:174`. **Verified by hand:** the enroll path builds
`[NSData dataWithBytes:hBytes …]`; only the stack buffer `hBytes` is `memset` (`:178`, `:185`).
The heap copy inside the immutable `NSData` is never wiped and is architecturally un-wipeable
via that API. The *decrypt* path (`:325-349`) correctly uses `NSMutableData` + `mlock` +
`resetBytesInRange`; the fix was never mirrored to enroll. **Carried from 2026-07-14 M-2 —
still present, unfixed.**

### M-6 — [WC] Known-bad / unresolvable dApp flag is display-only at the per-request signing gate
`src/components/walletconnect/RequestApprovalModal.jsx:162-167, 176-184`. **Verified by hand:**
`approveBlocked` is `needsReauth || (isAssetAuth && !permitAcknowledged) || (SEND && !txAcknowledged)
|| type === UNKNOWN || riskBlocks` — it contains neither `dapp.flagged` nor `sessionUnresolved`.
It is in fact *declared at `:162`, before `dapp` exists at `:178`*, so it structurally cannot
reference it without reordering. A session whose identity cannot be resolved sets `flagged: true`
with the reason "Treat it as suspicious" — which is rendered as a banner and then not enforced.
Session-*establishment* does hard-block known-bad domains (`session.js:195-208`), so this is the
per-request gate only. **Carried from 2026-07-14 M-3 — still present, unfixed.**

### M-7 — [KEK] `hardwareKekVersion` / `kekSalt` are not bound into the vault AAD
`src/wallet-core/vault.js` (`vaultAad` covers `{v, kdf}` for kek-dek, explicitly excluding `salt`).
An attacker with local write access to the persisted blob can down-stamp `hardwareKekVersion: 3 → 2`
or strip `kekSalt` without invalidating any GCM tag. **Not currently an unlock bypass** — the
resulting H is derived from the wrong salt and `unwrapDek` fails the tag (fail-closed). It is a
structural weakness: any future code path that makes a decision by trusting `blob.hardwareKekVersion`
without the crypto also succeeding would be silently spoofable. **Already tracked** as issue #1111
with a two-round plan (`docs/superpowers/plans/2026-07-18-vault-aad-v3-migration.md`), blocked on
implementer assignment. Confirmed by code read that the gap matches the issue description exactly.

### M-8 — [Auth] Wrong-PIN counter lives in attacker-clearable `localStorage`
`src/lib/pinAttemptGuard.js:11-17`; `src/components/WalletEntry.jsx:730-739`. The counter driving
the irreversible 10-strike panic wipe is plain `localStorage` (`veyrnox-pin-attempts`), not sealed
to any hardware attempt counter. Clearable via `adb shell run-as` on a debug build, any same-origin
script on web, or filesystem access on a rooted/jailbroken device — defeating the auto-wipe and
enabling unbounded guessing against Argon2id. **Honestly disclosed in-code** (so no I4 violation),
tracked against hardware-KEK-backed attempt sealing. **Carried from 2026-07-14 M-8 — unchanged.**
Recommend cross-referencing in `docs/Feature-Status.md` that the *counter* is not among the
hardware-bound protections, now that hardware KEK is ungated for the vault DEK itself — the
distinction is easy to lose.

---

## LOW

- **L-1 — [KEK] `native.js` lacks the F-08 malformed-blob guard that `web.js` has.**
  `web.js:547` throws `KEK_ERR.MALFORMED_VAULT` on `kdf === 'kek-dek' && !blob.kekWrap`;
  `native.js` `_unlockInner` (`:380`) has no equivalent, so such a blob falls through to the
  "non-KEK" branch and attempts an Argon2id decrypt against DEK-sealed ciphertext. Fails closed
  (GCM tag mismatch) but surfaces a generic error instead of the stable code, so caller logic
  branching on `MALFORMED_VAULT` fires on web and not on native. Unmirrored fix. New this pass.
- **L-2 — [Auth] `credentialVerifier.js:32-38` comment says the KDF is "currently 64 MiB".**
  It is 192 MiB (`vault.js` `KDF_PARAMS.memorySize = 196608`). The code correctly imports the
  live `KDF_PARAMS`, so there is no functional bug — pure documentation drift. Worth fixing
  because stale-constant drift against `KDF_PARAMS` is precisely the class of error that caused
  the H-1 timing regression this codebase already had to fix twice.
- **L-3 — [Auth] `copySecret` wipe has no read-back sentinel.** `src/lib/copySecret.js:26-31`.
  Unconditional overwrite with `WIPE_REPLACEMENT`; if the user copies something else inside the
  30 s window it is clobbered too. Data-loss papercut, **not** a secrecy risk — the secret is
  still wiped. Explicitly disclosed in-source. All three triggers (30 s timer, `visibilitychange`,
  `APP_LOCK_EVENT`) confirmed correctly wired and torn down exactly once via the `done` flag.
  **Carried from 2026-07-14 L-8 — unchanged, accepted.**

---

## INFO / disclosed residuals (no action implied)

- **TLS SPKI certificate pinning is inert.** Every pin in `CertPinManager.kt:57-89` and
  `src/wallet-core/rpc/pinning.js:45-70` is a literal `PLACEHOLDER_…_REPLACE_ON_DEVICE=`, and
  `buildPinnedClient()` is **never referenced** from any `.kt`/`.java` file — dead code, not
  mis-wired-but-live. `scripts/check-cert-pin-manager-safety.mjs` is present, correct, and would
  fail CI if anyone wired it in while pins remain placeholders. Native TLS pinning therefore
  provides **zero** protection in the current build; the JS host allowlist is a hostname
  allowlist (I2 egress control), not a certificate-identity pin. Honestly disclosed + CI-guarded.
- **`RELEASE_CERT_SHA256` (APK self-tamper) correctly fails closed.** A blank Gradle property
  yields `tampered = true` (`RaspIntegrityPlugin.kt:765-805, 957-978`), as does any exception.
  A release build that forgets `-PRELEASE_CERT_SHA256` blocks every launch — a fail-*safe*
  failure mode, i.e. a release-pipeline reliability dependency, not a security hole.
- **`checkLocalSocketConnect()` is individually fail-open under SELinux denial**
  (`RaspIntegrityPlugin.kt:216-234`) — documented in its own comment. One of six OR'd signals in
  `detectRoot()`, with `checkDangerousProps` (bootloader state) as the primary Magisk-Hide-resistant
  signal. Disclosed coverage limit, not a defect.
- **dApp identity in both WC modals is entirely self-reported** by the connecting dApp (WC v2
  offers no domain-ownership assertion here); `checkDappDomain()` only consults a ~20-entry local
  blocklist. Both modals already carry honest caveats ("absence does not confirm safety"). Inherent
  protocol limitation, correctly disclosed.
- **Android biometric cache is not bound to `setInvalidatedByBiometricEnrollment(true)`**
  (`biometricUnlock.js:86-100`, H-NEW-5) — explicitly disclosed TARGET item, distinct from the
  vault-DEK KEK path.

---

## Status vs prior audit (2026-07-14 weekly)

| Prior finding | Status this pass | Evidence |
|---|---|---|
| **C-1** — C-01 fail-open not propagated to ColdSign / WC / CryptoSigning | ✅ **FIXED** (already reconciled as fixed on main last pass) | `ColdSign.jsx:64` uses `useRaspArtifact()`; `WalletConnectProvider.jsx:331-365` composes `selectPresignProbeSource` + attestation with fail-closed timeouts. Confirmed by read. **But see H-1/H-2/M-1: three *different* defects now sit on these same surfaces.** |
| **H-1** — primary-unlock timing equalizer under-compensates (~2.3 s oracle) | ✅ **FIXED** | `PRIMARY_UNLOCK_EQUALIZER_MS` **removed entirely** (`WalletProvider.jsx:202-210`). Replaced by `spendPrimaryUnlockEqualizerKdfs()` (`deniabilityUnlock.js:215-219`), which re-runs the same `resolveDeniabilityUnlock()` and discards the result — every outcome now costs an identical 5 KDFs *by construction*, with no constant to drift. `chaffBlob()` imports `KDF_PARAMS` dynamically rather than hardcoding. This is the correct structural fix, not a re-tuned magic number. **Residual (honest):** KDF-count parity is unit-proven; end-to-end wall-clock parity on real devices is still unmeasured. |
| **M-1** — Android `hmacResult` (H) not zeroed | ⚠️ **STILL PRESENT** | → M-4 above. |
| **M-2** — iOS enroll `NSData` H copy not zeroed | ⚠️ **STILL PRESENT** | → M-5 above. Verified by hand at `HardwareKekPlugin.m:174`. |
| **M-3** — WC `dapp.flagged` not in `approveBlocked` | ⚠️ **STILL PRESENT** | → M-6 above. Verified by hand at `RequestApprovalModal.jsx:162`. |
| **M-4** — RASP-blocked WC request fails silently in the UI | ⚠️ **STILL PRESENT** | Signing handlers still `rejectRequest(...).catch(()=>{})` and `return` without throwing (`:390-392`, `:436-438`, `:511-513`). Fail-closed on the wire; not fail-*honest* to the user. |
| **M-5** — WARN-tier `requiresBiometric` dead everywhere | 🟡 **PARTIALLY FIXED, and the gap is now sharper** | `SendCrypto.jsx` genuinely enforces it (UI + sign-time). `ColdSign.jsx` does **not** → promoted to **H-2** this pass, because the inconsistency (one surface enforces, a sibling does not) is more dangerous than uniform non-enforcement. `CryptoSigning.jsx` passes `acknowledged=false` unconditionally — over-conservative, safe. |
| **M-6** — RaspSecurity / catalogue understate RASP status | ✅ **LIKELY FIXED** | `RaspSecurity.jsx` now uses `useRaspArtifact()` (PR #953/#1013); features catalogue moved to a two-state verified/roadmap model (PR #1185). Not re-audited in depth this pass. |
| **M-7** — RaspSecurity readout browser-only on native | ✅ **FIXED** | PR #953 — confirmed last pass, unchanged. |
| **M-8** — PIN counter in localStorage | ⚠️ **STILL PRESENT (disclosed)** | → M-8 above. |
| **L-1** — `checkSystemWritable()` low-yield | ⚠️ STILL PRESENT (not a defect) | Now one of six OR'd root signals; disclosed. |
| **L-2** — `resolveGasLimit` doesn't clamp negative `txGas` | ⚠️ UNVERIFIED this pass | Not re-checked; gas cap itself confirmed PASS. |
| **L-3** — two independent EIP-712 chainId implementations | ⚠️ UNVERIFIED this pass | Both were correct last pass; duplication risk unchanged. |
| **L-4** — modal dApp identity from React state | ✅ **FIXED** | `RequestApprovalModal.jsx:174-177` now resolves `liveSession` by topic from `sessions` and fails closed to `flagged:true` when unresolvable. (The *enforcement* of that flag is M-6.) |
| **L-5** — iOS Face ID cancel → `NO_HARDWARE_FACTOR` | ⚠️ STILL PRESENT | UX-copy only; confirmed exempt from the wipe counter. |
| **L-6** — Android salt `ByteArray` not zeroed | ⚠️ **STILL PRESENT** | Same site as M-4. |
| **L-7** — Android async biometric-prompt exception escapes try/catch | ⚠️ UNVERIFIED this pass | Not re-checked. |
| **L-8** — `copySecret` no read-back sentinel | ⚠️ STILL PRESENT (accepted) | → L-3 above. |

**Net movement:** the prior HIGH (H-1 timing oracle) is genuinely and structurally fixed —
the best outcome of the week. No prior finding regressed. Three new HIGHs were found, all of
which pre-date this week's commits (H-1 shipped broken in `7cdeee64`; H-3's guard was weakened
when `duressConfigured` was removed; H-2 has existed since WARN-tier enforcement was added to
`SendCrypto.jsx` only). **These are pre-existing defects newly discovered, not regressions
introduced this week.**

---

## INFO / PASS (controls confirmed working)

**RASP / sign-gate**
- `detect.js` fails closed to `INTEGRITY_UNAVAILABLE` (never `CLEAN`) when `available !== true`, and rejects malformed/partial signal shapes rather than coercing missing fields to `false → CLEAN`.
- `nativeProbeSource()` fails closed to `{available:false}` on off-platform / absent plugin / throw / non-object / malformed shape — no path fabricates a clean verdict.
- `selectPresignProbeSource()` (the C-01 fix) never falls back to the browser leg's CLEAN on native. Confirmed by code read, not by comment.
- `attestationProbeSource()` checks `isDeniabilityOrDemoActive()` **before** any platform check or network call — genuine I3 zero-egress, confirmed by statement order.
- `degrade()` fails closed to the strongest BLOCK for any unrecognised condition including `undefined`; pure and set-blind (no wallet-set parameter in scope).
- `sensitiveGate()` fails closed on a null artifact (P1-2 fix present and correct).
- `compose.js` / `presign.js` 4-value lattice ranks unknown RASP tiers → BLOCK and unknown tx levels → CONFIRM; BLOCK is non-overridable by any acknowledgement path.
- `MainActivity.java` calls `RaspIntegrityPlugin.Companion.earlyCheck()` **before** `registerPlugin()`/`super.onCreate()` — BLOCK-tier devices never initialise the Capacitor bridge. Confirmed wired.
- `detectTamper()`/`earlyDetectTamper()` fail closed to `tampered=true` on blank cert, unreadable signing info, or any exception.
- Magisk/Zygisk/KernelSU/APatch/LSPosed detection breadth is real and honestly scoped (path lists, `checkDangerousProps` via reflection to dodge SELinux, Frida gadget thread/pipe scans); residual coverage limits documented rather than overclaimed.
- No egress anywhere in `src/rasp` or `src/sign-gate` (I2).

**WalletConnect / EIP-712**
- `presignGate()` correctly gates all three signing handlers on `proceedAllowed` (H-1 is the *session-approval* site only).
- `eth_sign`, `signTypedData` v1/v3, `wallet_addEthereumChain`, `wallet_switchEthereumChain` all in `BLOCKED_METHODS`, auto-rejected pre-modal; `eth_signTransaction` → UNKNOWN → Approve hidden.
- H7 chainId binding enforced **twice** (pre-modal at `session_request` arrival + at sign time), fail-closed on missing/mismatched chainId. No domainless/chainId-less fallback exists.
- H8 / #1092 / #1091 signer- and `from`-address binding enforced pre-modal **and** in-handler for `personal_sign`, `signTypedData_v4`, and `eth_sendTransaction`.
- Topic-to-session binding: every handler re-resolves by `topic` from live `getActiveSessions()`, never cached React props. No cross-session reuse path found.
- M9 1,000,000 gas cap unconditional including the self-estimated branch; `maxFeePerGas`/`gasPrice` clamped per-chain; `maxPriorityFeePerGas` clamped to the capped max fee, never negative.
- M11 session expiry via `assertSessionLive` before every handler; missing/non-numeric/expired treated fail-closed.
- I3: relay init **and** teardown both gate on `isDeniabilityOrDemoActive() || !isUnlocked || isDecoy || isHidden`.
- Known-bad domain hard-block at session establishment enforced twice (UI + `session.js:195-208` throwing `DAPP_BLOCKED_KNOWN_BAD`).
- VULN-19 RPC-chain guard verifies `eth_chainId` before broadcast; `wc:` URI structurally validated twice before `client.pair()`.

**Hardware KEK** (0 CRITICAL / 0 HIGH this pass)
- `combineKek()` requires both H and C, exact length, non-degenerate (all-zero rejected); ordered `H‖C` matches spec; no transposition possible. **No path found where a KEK-enrolled vault unlocks on one factor** — checked exhaustively across both platform implementations.
- `unwrapDek()` returns a generic `UNWRAP_FAILED` on any GCM failure — does not distinguish wrong-PIN from tampered blob (deniability-safe).
- JS-layer H/C/KEK/DEK zeroing via `try/finally` correct on **every** call site including error paths (unlock, enrollKek, unenrollKek, changePassword, saveVaultContents, upgradeKekToV3). The gaps (M-4/M-5) are native-layer only.
- Android key: `setUserAuthenticationRequired(true)`, `setUserAuthenticationParameters(0, AUTH_BIOMETRIC_STRONG)` (per-use, no caching), **no** `AUTH_DEVICE_CREDENTIAL` on the crypto key, `setInvalidatedByBiometricEnrollment(true)`; `KeyPermanentlyInvalidatedException` handled fail-closed with cleanup.
- The app-layer device-credential lockout fallback (`H16-DEVIATION`) does **not** itself release H — the retried native call still requires a genuine `AUTH_BIOMETRIC_STRONG` match at the Keystore layer. Confirmed by trace.
- iOS: genuine `kSecAttrTokenIDSecureEnclave` (`HardwareKekPlugin.m:141`), ACL is `privateKeyUsage | biometryCurrentSet` only (no passcode-OR-biometric flag). **"Secure Enclave" naming is backed by the actual API call — no I4 honesty violation.**
- StrongBox honestly surfaced: real `KeyInfo.securityLevel` read verbatim, never fabricated; enroll gate **rejects** SOFTWARE/unknown tiers; `tierBadge.js` distinguishes StrongBox vs TEE truthfully. Preferred-not-enforced with a TEE floor, disclosed.
- Malformed/absent `kekSalt` fails closed on **both** the Kotlin plugin (base64 validation, empty-decode rejection) and JS (`decodeKekSalt` 32-byte enforcement) — no silent fallback to the fixed global salt for a v3-stamped vault.

**Auth gates / keystore**
- **Timing equalizer structurally sound** (see Status table, H-1) — no fixed-ms sleep; identical KDF count *and param profile* across all outcomes, including legacy-param installed-base blobs.
- `captureVerifierSafe` returns `null` on any throw; `verifyCredential(null)` → `false`, `verifyCredentialDetailed(null)` → `{ok:false, bricked:true}`; `verifyActiveCredentialDetailed` additionally catches and returns `bricked:true` rather than allowed. `constantTimeEqual` is a genuine full-length XOR-accumulate with no early return.
- `evaluateTwoFactor` is session-blind by design (no `isDecoy`/`isHidden` parameter exists), defaults `actionPasswordConfigured` to `false` (fail closed), and collapses wrong-PIN/wrong-password/both into one opaque `WRONG` code — no oracle.
- **No fail-open path found in `WalletProvider.unlock`.** The deniability equalizer's own throw is deliberately swallowed in its own try/catch specifically so it can never misroute a confirmed-correct unlock into the decoy (`:1521-1533`). No `catch { return allowed }` pattern anywhere in the file.
- `retrieveUnlockSecret()` is the sole raw-secret read path and requires a real OS biometric match first; the KEK fast-path is reachable only when `hasVaultKekWrap()` is positively confirmed. Not clearing the cache on `lock()` is correct-by-design (clearing would defeat one-tap unlock) — the gap is at duress setup (H-3), not at lock.
- `registerFailedPinAttempt` uses `attempts >= PIN_WIPE_AFTER` (not `===`) so a tampered/skipped count cannot slip past the threshold un-wiped.
- Infra-vs-wrong-PIN classification correct: passkey/biometric gate errors, panic sentinel, `KEY_PERMANENTLY_INVALIDATED`, `NO_HARDWARE_FACTOR`, `HARDWARE_FACTOR_DEGENERATE`, and user-cancel are all excluded from the wipe counter — a flaky sensor cannot destroy a correct-PIN user's funds.

---

## Coverage gaps in this audit (stated honestly)

- **M2c/M2d was ungated this week (PRs #1152/#1178) and was NOT audited.** The M2c/M2d
  Secure-Enclave/StrongBox *wrap* path (`veyrnoxEnclave.js`, `VeyrnoxEnclavePlugin.swift/.kt`)
  is architecturally distinct from the `kek.js` HKDF-combine design that the KEK brief covered,
  and `native.js` now conditionally routes `unlock()` through it. **This is the single largest
  unreviewed change of the week and should be the first surface of the next pass.**
- iOS `RaspIntegrityPlugin.m` was outside the RASP brief; iOS/Android parity questions beyond
  M-2 are UNVERIFIED.
- Prior L-2, L-3, L-7 were not re-checked this pass.
- No dynamic testing, no device execution, no heap dumps, no on-chain transaction. Every
  "confirmed" above means *confirmed by reading source*, nothing more.

---

## Recommended remediation order

1. **H-1 (WC session-approval gate)** — a one-line fix (`!gate.proceedAllowed`) plus the
   regression test that should have existed. Highest value-per-effort in the entire report.
2. **H-3 (duress biometric cache)** — clear or re-bind the cache in `setDuressPin()`; add the
   already-cached-real-PIN test case; fix the stale comments at `WalletEntry.jsx:761-763`.
3. **H-2 (ColdSign WARN biometric)** — port the `SendCrypto.jsx` B5 pattern; fold in **M-1**
   (`getFreshRaspArtifact`) since it is the same function and the same edit.
4. **M-2 (iOS KEK native RASP gate)** — closes a real platform asymmetry on a jailbreak-reachable path.
5. **M-3** — wire the backoff **or** delete it and its comment. Do not leave a documented control that does not run.
6. **M-4 / M-5** — mirror the proven zeroing patterns (`Arrays.fill` on Android, `NSMutableData` on the iOS enroll path).
7. **M-6** — add `dapp.flagged`/`sessionUnresolved` to `approveBlocked` (requires moving the `dapp` declaration above it).
8. **M-7 (#1111)** — already planned; blocked on implementer assignment, not on analysis.
9. LOW items as convenient.

**Nothing in this report is fixed by this report, and nothing here is "verified."** No on-chain
txid and no on-device evidence was produced by this static pass. Every finding above is a
source-reading conclusion. The independent third-party security audit remains outstanding and is
**not** substituted by this internal review.
