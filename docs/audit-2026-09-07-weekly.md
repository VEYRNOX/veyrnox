# Internal Security Audit — 2026-09-07
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-09-07
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `security-audit/2026-09-07`, pinned to `origin/main` @ **`d0c4423c`**
Status: **Findings only — nothing fixed at the time of writing. Do not mark
anything verified without on-chain txid or on-device evidence.**

> **Update, same day — M-1 and M-2 are also FIXED in code** (branch
> `fix/audit-2026-09-07-m1-m2`). M-1's downgrade is closed for the three
> BLOCK-tier signals by a session latch in `nativeProbe.js` that arms **only on a
> positive hard detection** and can never arm from an absence — which is what
> keeps #2276's self-renewing-BLOCK failure out of this leg; the soft axes are
> deliberately not latched (they are WARN either way, so a mute downgrades
> nothing), and the contradictory `getFreshRaspArtifact.js` header is corrected.
> M-2 is closed by AND-ing the WC sign path's remote screen with
> `hasAdvisorOnlineAccessCached()`, matching the three call sites that already
> gated. Both carry regression guards mutation-checked in **both** directions.
> **BUILT, INTERNAL — unit-tested only, not device-verified.**
>
> **Update, same day — H-1 and H-2 are FIXED in code.** Both were remediated in a
> follow-up PR off `main` (see `fix/audit-2026-09-07-fail-honest`): the three WC
> signing handlers now `throw` instead of `return`, and the send 2FA gate uses
> `verifyActiveCredentialDetailed` and surfaces an absent verifier as a
> non-attempt `oom` verdict. Both fixes carry new regression guards, each
> mutation-checked by reintroducing the exact defect. **BUILT, INTERNAL —
> unit-tested only; neither is device-verified, and no status tag advances on
> this.**
>
> **Correction, same day:** this sentence used to end "Every other finding below
> remains open." That was true when written and false a few hours later — every
> H, M and L finding was remediated over the course of the day (#2422, #2426,
> #2428, #2430, #2431), with L-2 and the disclosure half of L-3 deliberately left
> as recorded by-design decisions rather than fixed. Each finding's own heading
> carries its status; trust those over this banner, which is written once and
> ages.

---

## How to read this report

Every finding carries one of:

- **[VERIFIED]** — the reporting agent traced the path end to end, *and* the audit
  author independently re-derived it from the source at the audited pin. Both
  HIGHs below are in this class.
- **[AGENT]** — reported on agent evidence, cited but not independently re-read.

`file:line` references are against `d0c4423c`. This repo merges 10+ times a day;
re-read before acting.

### Deviations from the runbook

- The runbook's four `subagent_type` names (`Penetration Tester`,
  `Blockchain Security Auditor`, `Application Security Engineer`) all resolved.
  No silent substitution was needed this run, unlike 2026-08-17 and 2026-08-25.
- All four agents ran on `opus` per CLAUDE.md's model-cost rule, which names
  wallet-core, signing, KEK and RASP as the escalation cases.

---

## The theme of this run: I4's two halves came apart

Both HIGH findings are the same defect wearing different clothes, on two
unrelated surfaces, found by two agents that never spoke to each other.

**I4 is "fail honest, fail closed." In both cases the *closed* half holds
perfectly and the *honest* half is absent.** No key is released, no signature is
produced, no funds move — and the user is told something false about why.

- **H-1 (WalletConnect):** a RASP block on a hooked device ends in a *success
  haptic* and a silently-dismissed modal. The dApp is told the user rejected the
  request (EIP-1193 code 4001). They did not; their device failed an integrity
  check, and nothing anywhere says so.
- **H-2 (Auth):** a fast-path biometric unlock mounts a session with no step-up
  verifier. The send 2FA gate reads the resulting `false` as a wrong PIN, tells
  the user *"Incorrect PIN or Action Password"* five times, and force-locks the
  wallet.

This is worth stating as a class, because a gate-level test cannot see either
one. Both were pinned by tests that assert the *rejection* happened — and both
shipped anyway, because no test asserts what the user is shown afterwards. The
security control works. Its only channel for telling a human it worked is
wired to the wrong signal.

---

## Changes since last audit (2026-09-05 → 2026-09-07)

Two days, 12 commits touching audited surfaces. The window is **net-positive**;
no new finding below originates in it.

- **`8727f06c`** — Buy/Transak moved to the system browser on native (T-INF-103).
- **`d6df1b8f`** — manual Rate opens the store page; first-inbound becomes a
  milestone. Checked for the K-2 pattern (a third writer to shared
  `localStorage`) and it is **clean**: all eight exported entry points in
  `src/lib/reviewPrompt.js` are I3-gated, including `triggerReviewPromptIfEligible`
  indirectly via `shouldPromptForReview()` (`:63`), and
  `veyrnox-first-inbound-fired` is already in `ALL_RESIDUE_KEYS` (`panic.js:347`).
- **`826bd1c8` / `e5e1406f`** — the disabled bug-report screen-recording feature
  removed, ~4,200 lines deleted. Two security boundaries **narrowed** as a result:
  - `functions/api/rpc/[fn].js` — `create_bug_report_upload` removed from
    `ALLOWED_RPCS`. That file is the only boundary in front of the service-role
    key; the allowlist shrinking is the right direction.
  - `RaspIntegrityPlugin.kt:94-99` — FLAG_SECURE is unconditional again, and the
    comment hedging that it "could be cleared" is gone because the clearing code is.
- **Orphan check, resolved with a non-grep signal.** `sql/bug-report-upload.sql`
  survives in the repo. It was **never applied to either database** — `list_tables`
  on production (`jwstkrtslotnjyerzzsi`) and staging (`nszlbcmcysftwyudthjz`)
  shows no `bug_reports` or `bug_report_upload_rate_limit`. **Repo residue, not
  live surface.** This closes an item previously recorded as an open
  storage-schema orphan.
  - **CORRECTION, same day.** This bullet also said the file was *"correctly
    locked down on its own terms (RLS enabled, `REVOKE ALL FROM PUBLIC, anon,
    authenticated`, service_role-only EXECUTE)."* **The second half of that was
    wrong, and #2417/#2418 caught it, not this audit.** The function grants were
    as described, but the storage policy `bug_reports_service_role_all` carried
    **no `TO service_role` clause**, so `USING (bucket_id = 'bug-reports')`
    applied to *every* role — anon included. The audit read the policy's NAME and
    the function's REVOKE block and generalised "locked down" across both.
    Nothing was ever exposed, because the never-applied finding above is
    independently true and was verified directly against both databases. But the
    characterisation was wrong: **a policy named for a role is not scoped to that
    role — only a `TO` clause does that.** Fixed on `main` in `56e2f07b`, which
    drops the policy entirely (service_role bypasses RLS and needs none).

---

## HIGH

### H-1 — [WC] Every pre-sign gate rejection returns silently, and the modal answers it with a SUCCESS haptic — **[VERIFIED]** · **FIXED** (#2422)

**Files:** `src/lib/WalletConnectProvider.jsx:439-442`, `:495-498`, `:579-582`
(the three rejections); `:1003`, `:1022`, `:1079` (dequeued regardless);
`src/components/walletconnect/RequestApprovalModal.jsx:261-262`
(`successHaptic(); onClose();`); `src/lib/haptics.js:42-48`.

All three signing handlers reject and then **`return`**, not throw:

```js
const gate = await presignGateOrReject(typedLevel);
if (!gate.proceedAllowed) {
  await rejectRequest(topic, id, gate.rejectCode).catch(() => {});
  return;                                    // WalletConnectProvider.jsx:497
}
```

The modal's `handleApprove` wraps those calls in a `try` and treats a
non-throwing return as success — `successHaptic(); onClose();`
(`RequestApprovalModal.jsx:261-262`), where `successHaptic` is
`Haptics.notification({type: NotificationType.Success})` (`haptics.js:42-48`).

So on a `RASP_BLOCK` (hooked/rooted runtime), a `RASP_WARN_REJECTED` (any probe
timeout — see M-1, `INTEGRITY_UNAVAILABLE → WARN`), or a `TX_RISK_REJECTED`
(every asset-authorising Permit, every S9 TIP hit): the user taps Approve, feels
the success notification, the modal closes, the request is dropped from
`pendingRequests`, and **nothing on screen says it was refused or why.** The dApp
receives EIP-1193 code `4001` — literally *User Rejected Request* — so the dApp
tells the user they rejected it.

**The asymmetry is the proof this is an oversight, not a design choice.**
`handleApproveSession` reads the *identical* gate and **throws**
(`WalletConnectProvider.jsx:932-934`), so `SessionProposalModal` renders it
correctly. Every other rejection in the same three handlers also throws —
`PERSONAL_SIGN_ADDRESS_MISMATCH`, `TYPED_DATA_ADDRESS_MISMATCH`,
`CHAIN_ID_MISMATCH`, `SESSION_CHAINID_INVALID`, `SEND_ADDRESS_MISMATCH`,
`WC_TWO_FACTOR_REQUIRED`, `WC_SEND_LIMIT_EXCEEDED`, `STEP_UP_REQUIRED`,
`SESSION_EXPIRED`. **Only the RASP / tx-risk plane returns.**

**Independent re-derivation (audit author):** read all three handlers and the
session-approval contrast at the pin — `return` at 441/497/581 vs `throw` at 933.
Read `handleApprove` 246-268 and `successHaptic` at `haptics.js:42-48`.
`grep -rnF` for `RASP_WARN_REJECTED` / `TX_RISK_REJECTED` across `src` outside
tests returns **six hits, all inside `WalletConnectProvider.jsx`, five of them
comments and one the assignment** (`:432-433`) — the codes are minted and never
rendered anywhere.

**Refutations considered and discarded:**
- *"Something else notifies the user."* Nothing does — see the grep above.
  `session.js rejectRequest` fires an analytics event only. The `toast.error` at
  `:809` is on the blocked-method branch, a different path.
- *"The request stays queued so the user retries."* No —
  `setPendingRequests(prev => prev.filter(...))` runs unconditionally after the
  handler returns.
- *"It's rare."* WARN includes every `INTEGRITY_UNAVAILABLE`, which M-1 records
  as routine on native. `scoreWcTypedDataLevel` maps **every** asset-authorising
  typed-data payload to CAUTION or RISK, and `presignGateOrReject` hardcodes
  `acknowledged=false` (`:423`) — so the commonest Permit case always lands here.
- *"A test pins this."* The four RASP-gate suites assert `rejectRequest` was
  called with the right code. **No modal-level test references `successHaptic`**
  (`grep -rlF` over `src/components/walletconnect/__tests__/` returns nothing).
  That is precisely why it survived.

**Honest counter-position, recorded rather than resolved:** no funds move and no
signature is produced, so a reasonable auditor could rate this MEDIUM. It is
rated HIGH here because I4 is *fail honest AND fail closed*, and the half that
fails is the one RASP exists to deliver.

**Fix:** make the three handlers `throw` with the reject code, exactly as
`handleApproveSession` already does at `:932-934`. One line each; the modal's
`catch` already renders it. Pin it with a **modal-level** test asserting
`successHaptic` is not called and `err` is rendered — the existing handler-level
tests structurally cannot see this.

### H-2 — [Auth] The fast-path biometric unlock mounts a session with no step-up verifier; the send 2FA gate reads that as five wrong PINs, then locks — **[VERIFIED]** (code path; on-device **[UNVERIFIED]**) · **FIXED** (#2422, unit-tested only — the fix is not device-verified either)

**Files:** `src/lib/WalletProvider.jsx:2215-2257`, `:2213`, `:1550`;
`src/components/WalletEntry.jsx:863-866`, `:1817`;
`src/pages/SendCrypto.jsx:2733` vs `:1651`;
`src/wallet-core/credentialVerifier.js:116`.

`unlockBiometricOnly` sets `setUnlocked(true)` but never assigns
`verifierRef.current` or `lastAuthAtRef.current`. The four production
`verifierRef.current = await captureVerifierSafe(...)` sites are
`WalletProvider.jsx:1074`, `:1126`, `:2059`, `:2690` — **none on this path**, and
an `awk` scan of lines 2215-2400 for `verifierRef|lastAuthAtRef` returns nothing.

The trade-off comment directly above it is wrong about the consequence:

> `:2213` — *"A subsequent send will require the user to type their PIN at the
> step-up gate — a UX cost, never a security regression."*

Typing the PIN cannot satisfy that gate. `verifyCredential(null, entered)`
returns `false` unconditionally — `if (!verifier || !verifier.hash ||
!verifier.salt) return false;` (`credentialVerifier.js:116`). The two step-up
surfaces in the same file then diverge:

| surface | call | null-verifier behaviour |
|---|---|---|
| `SendCrypto.jsx:1651` `submitReauth` | `verifyActiveCredentialDetailed` | `result.bricked` → honest "unavailable", **no attempt burned** |
| `SendCrypto.jsx:2733` `TwoFactorGate.verify` | bare `verifyActiveCredential` | `false` → `TWO_FACTOR.WRONG` → *"Incorrect PIN or Action Password"* ×5 → `lock()` |

This is prior **L-10 with its reachability re-derived, and that changes the
rating.** It is not a rare Argon2id OOM edge case: it is the deterministic
outcome of **every warm-cache fast-path unlock** on a device with PASSWORD- or
PASSKEY-mode send 2FA configured — on a feature that is **default-ON** (#2055).

**Independent re-derivation (audit author):** confirmed the five
`verifierRef.current` assignment sites and their line numbers; confirmed lines
2215-2400 contain no `verifierRef`/`lastAuthAtRef`; read `credentialVerifier.js:116`;
confirmed `SendCrypto.jsx:2733` uses the bare variant while `:1651` in the same
file uses `Detailed`.

**Refutations tried and discarded:**
1. *"#2106 hid the fast path."* It hid only the **dedicated button** —
   `WalletEntry.jsx:1817` `const fastpathButtonVisible = false`, and the comment
   immediately above it says *"this only drops the button."*
   `handleBiometricUnlock` calls `unlockBiometricOnly()` **first** and `return`s
   on success (`:863-866`). The hidden button is exactly what makes this read as
   unreachable. **Verified by the audit author, and this refutation failing is
   what makes the finding HIGH rather than theoretical.**
2. *"`isVerifierReady` closes it."* It exists for this (`:1550`) — but see M-3:
   `grep -rnF` repo-wide returns **three** hits, all definition/export/typedef.
   Zero consumers.
3. *"It fails open."* No. `sendReauthRequired` returns `true` on
   `lastAuthAt == null` (`sendReauth.js:15`), so the send is blocked. I4's
   *fail closed* half holds; the *fail honest* half does not.
4. *"BIOMETRIC 2FA mode avoids `:2733`."* Correct — `send2faMethod === BIOMETRIC`
   returns at `:2731`. That narrows the cohort to PASSWORD/PASSKEY; it does not
   remove it.

**What is NOT claimed:** no on-device reproduction was attempted. The code path
is verified; the lived user experience is not.

**Fix:** point `SendCrypto.jsx:2733` at `verifyActiveCredentialDetailed` and
branch on `bricked` before `evaluateTwoFactor` — the same three lines
`submitReauth` already has ~1,000 lines above it in the same file. Correct the
`:2213` comment. Longer-term: have `unlockBiometricOnly` populate `verifierRef`
from the recovered DEK path, or gate the send UI on `isVerifierReady()`.

---

## MEDIUM

### M-1 — [RASP] The OS-probe leg still has no session latch: a muted probe downgrades a would-be BLOCK to an overridable WARN — **[VERIFIED]** · ~~STILL PRESENT~~ **FIXED (partial, by design)**

> **Fixed same day, and the scope is narrower than the finding — read this before
> assuming it is fully closed.** The three BLOCK-tier signals (hooked, tampered,
> emulator) now latch for the session in `nativeProbe.js`, so a later mute
> re-asserts them instead of degrading to WARN. The soft axes (rooted, elevated,
> screenCapture) are **deliberately not latched**: they are WARN in both
> directions, so a mute downgrades nothing there, and latching them would strand
> the false-positive-prone axis in a sticky state.
>
> The owner escalation this finding called for was resolved by narrowing rather
> than deciding: the latch arms **only on a positive detection from an available,
> shape-valid verdict** and can never be armed by a timeout, throw, partial shape
> or `available:false`. A genuine device reports false on all three and so never
> arms it — there is no state for a mute to renew. That is precisely what makes
> it structurally different from the attestation latch, which arms on
> `attestationFailed` and can therefore be asserted on a genuine device by a
> stale root pinset. **#2276's reasoning is untouched and its WARN posture
> stands.** The sub-defect (the header claiming BLOCK where the code yields WARN)
> is also corrected.

**Files:** latch present only on the attestation leg `src/rasp/attestation.js:216-237,298`;
absent from the native leg (`src/rasp/nativeProbe.js`, `src/rasp/getFreshRaspArtifact.js:48-60`).
Downgrade consumed at `src/pages/SendCrypto.jsx:1409-1417`. Guarantee undercut at
`src/sign-gate/compose.js:24-36`.

`compose.js:30-36` states the core RASP guarantee — a `block` from a hostile
*runtime* has no override "precisely because the confirmation itself can be
hooked." The Codex latch covers **only** the attestation leg. The native leg is
stateless: make the bridge hang until `withFailClosedTimeout` fires, or force a
throw, and you get `UNAVAILABLE` → `INTEGRITY_UNAVAILABLE` (`detect.js:90-91`) →
**WARN** (`degrade.js:118-129`) — overridable via biometric + ack on a runtime
where that biometric boolean is itself forgeable.

**Documentation sub-defect, independently re-derived and worth fixing on its own:**
`getFreshRaspArtifact.js:17-18` claims *"On timeout, exception, or shape drift
anywhere in the chain, the returned artifact has tier === TIER.BLOCK"*, while
`:46-47` and `withFailClosedTimeout` itself map a per-leg timeout to
`UNAVAILABLE → WARN`. **The header is wrong and masks exactly this downgrade.**
Only the top-level `catch` (`:87-90`) yields BLOCK.

**Refutations discarded:** *"genuine hook → BLOCK via `detectHook`"* — true only
if the call completes, and the finding is about suppression. *"Attacker already
has Frida"* — correct, and it caps severity at MEDIUM, but the attestation latch
defends that same precondition, so the asymmetry is the finding.

**Do NOT apply the same latch blind.** Issue #2276 deliberately keeps pin/chain
misses at WARN because the sticky latch (`attestation.js:298`) produces a
self-renewing BLOCK on genuine devices. Extending it to the noisier OS leg
imports that DoS to a second signal. The two positions are in genuine tension
and the tension is undocumented in both places.

**Recommended:** (a) correct the `getFreshRaspArtifact.js:17-18` header to match
the code — independent, land either way; (b) escalate to owner for the latch
decision, and record the #2276 tension in `compose.js`/`attestation.js` so the
next session does not re-derive it.

### M-2 — [WC] The sign-path TIP remote screen is not tier-gated and fires with no disclosure — **[VERIFIED]** · I2 · **FIXED**

> **Fixed same day.** The WC send path now ANDs `remoteScreenEnabled` with
> `hasAdvisorOnlineAccessCached()`, matching the three call sites that already
> gated. The cached reader (not `useTier()`) because this is a `useCallback`
> outside the render path; it is fail-closed to `free` before TierProvider
> resolves **and** forced to `free` on the deniability flip, so both defaults
> deny. The fix took the gate-the-code option rather than removing the modal's
> gate — but the note below still stands: **the two must not disagree.** If the
> product ever wants screening on every tier, remove both, because the real
> defect was behaviour the disclosure did not describe, not the tier itself.

**Files:** `src/lib/WalletConnectProvider.jsx:1075` vs
`src/components/walletconnect/RequestApprovalModal.jsx:65-70`; egress at
`src/risk/walletConnectIntel.js:76-79`; identity header at `src/api/tipClient.js:55-57`.

Three of four call sites AND the remote screen with `advisorOnline`
(`SendCrypto.jsx:858`, `:873`, `RequestApprovalModal.jsx:68`). The **WC signing
path does not**:

```js
remoteScreenEnabled: readRemoteScreenPreference(!!import.meta.env.VITE_TIP_BASE_URL),  // :1075
```

`readRemoteScreenPreference` defaults to `tipConfigured` when no preference is
stored, so a Free or Safety Plus user's WC send POSTs recipient address,
calldata, value and chain to `tip-screen` — with a stable `X-Rc-User-Id` header
— at sign time. The modal is the disclosure surface and for that cohort renders
**neither** notice (`remoteScreenEnabled` false suppresses one,
`remoteScreenUnavailable` false suppresses the other). Silent egress with an
identifier.

**I3 is intact** — `screenTransaction` checks `isDeniabilityOrDemoActive()` first
and WC is torn down in deniability. **I2 is not.**

**Refutations discarded:** *"`screenTransaction` gates internally"* — it gates on
secrets and configuration only; the tier gate lives entirely at call sites.
*"The in-app path does the same"* — the opposite; WC is the only one of four
missing it. *"`VITE_TIP_BASE_URL` may be unset in shipping builds"* — it comes
from a GitHub repo variable (`ci.yml:48`); the code path is verified, the live
exposure depends on that value, **stated rather than assumed.**

**Fix:** thread `advisorOnline` into `handleSendTransaction` and AND it into
`:1075`. If the owner instead wants screening on all tiers as fail-closed
hygiene, the modal's gate must be removed so disclosure matches behaviour — the
two must not disagree.

### M-3 — [Auth] `isVerifierReady` is a dead export whose docstring names exactly the failure the app is shipping — **[VERIFIED]** · **FIXED (by deletion)**

> **Fixed same day, by deleting it rather than wiring it.** The finding offered
> both. Wiring was the right call when it was written, because the failure the
> docstring described was live — but H-2's fix closed that failure by a different
> and better route: `verifyActiveCredentialDetailed` returns `bricked` for an
> absent verifier, and all five step-up surfaces now branch on it
> (`useActionGuard`, `useRevealWithReauth`, `HiddenWallet2faGate`, and both
> SendCrypto gates). A separate readiness probe would be a second, weaker way to
> ask the same question — weaker because it is a snapshot a caller can read and
> then act on stale, where `bricked` comes back from the verify attempt itself.
>
> **The bare `verifyActiveCredential` was deleted with it, and that is the more
> valuable half.** H-2's fix removed its last caller, leaving the exact API that
> *caused* H-2 sitting exported next to the safe one, differing only by being
> shorter to type. It collapsed "wrong credential" and "no verifier to check
> against" into one `false`. Leaving it is how a sixth surface reintroduces H-2.

**File:** `src/lib/WalletProvider.jsx:1550`, `:2816`; `src/lib/WalletProvider.d.ts:43`.

Repo-wide `grep -rnF 'isVerifierReady' src` returns **three** hits: the
definition, the context export, the typedef. No component, no hook, no test. Its
own docstring says callers can *"surface a 'please re-lock' message rather than
silently returning wrong-password failures until the attempt cap locks the user
out."* That is H-2 verbatim. **The remediation primitive for the shipped defect
was built, exported, typed — and never wired.** Same family as L-4, L-5, L-11:
an unwired control that reads as coverage on the context surface.

**Fix:** wire it at the SendCrypto 2FA gate (which also resolves H-2's honesty
half), or delete it. An uncalled readiness probe reports nothing.

### M-4 — [Auth] The unlock timing equalizer is KDF-count-equal but not equal to the *visible* outcome — **[VERIFIED]** (ordering) / **[UNVERIFIED]** (paint timing not benched) · re-rated from prior L-12 · **FIXED**

> **Fixed same day.** The miss path's fifth KDF is now fire-and-forget
> (`void captureVerifierSafe(password)`) before the throw, mirroring the success
> path, so both outcomes spend it AFTER their visible surface. `void` keeps the
> work — the derivation still runs, so count and param-profile parity are
> unchanged — and only stops the error waiting on it.
>
> **A finding about the existing test came out of this, and it explains why M-4
> survived two audits.** `unlockTimingEqualizer.h1.test.jsx` mocks
> `captureVerifierSafe` to `async () => null`, so the fifth derivation never
> enters its argon2id ledger at all. Its success/miss count parity therefore holds
> **whether or not the equalizing call exists** — confirmed by deleting the call
> and watching the suite stay green, on the pre-fix code as well as the fixed
> code. It pins the four real KDFs correctly; it simply cannot see this one, and
> it is the suite a reader would assume covers it.
>
> The new `unlockTimingEqualizer.m4Ordering.test.jsx` pins the ordering
> deterministically — it holds the capture open and asserts the rejection still
> arrives — plus that the capture is still invoked, so the fix cannot decay into
> silently deleting the equalizing work. Mutation-checked both ways.
>
> **Still UNVERIFIED, unchanged:** paint timing is not benched. The ordering is
> now provably right; that React paints inside the KDF window on a real device
> remains reasoned, not measured.

**Files:** `src/lib/WalletProvider.jsx:2009` vs `:2059`; `:1845-1847`;
`src/wallet-core/deniabilityUnlock.js:213`, `:232-236`;
`src/lib/__tests__/unlockTimingEqualizer.h1.test.jsx:136-138`, `:191-200`.

- **Success:** `setUnlocked(true)` at `:2009`; the fifth KDF
  (`await captureVerifierSafe(password)`) at `:2059`. The only intervening
  `await` is `:2029`, which is `void (async () => {...})()` — fire-and-forget.
  React flushes the unlock render at `:2059` and the dashboard paints **while**
  the 96 MiB Argon2id runs.
- **Miss:** `await captureVerifierSafe(password)` at `:1846` runs **before**
  `throw primaryErr` at `:1847`, so the error surface appears only after all
  five KDFs.

Net: prompt → *visible outcome* differs by one full Argon2id (96 MiB/t=6 on v2,
192 MiB/t=3 on v1). That is the order of magnitude H-1 exists to remove.

The load-bearing wrong claim is inside the guard itself —
`unlockTimingEqualizer.h1.test.jsx:136-138` calls this *"the awaited critical-path
cost an attacker with a stopwatch measures."* **A shoulder-surfing attacker's
stopwatch stops at the screen, not at promise resolution.** And
`deniabilityUnlock.js:213` says the capture *"runs after the session mounts, off
the visible unlock path"* — true for success only; the M-4 comment at
`WalletProvider.jsx:1844-1846` deliberately keeps it **on** the visible path for
a miss. Two comments describe the same KDF pair with contradictory intent.

**Refutations discarded:** *"total work is equal"* — equal work, unequal
time-to-observable. *"React may not paint first"* — argon2id is async wasm and
yields immediately; **not benched here, and that step alone is UNVERIFIED.**
*"Prior audit rated it LOW"* — it did, as a "rendering-order artifact"; the
artifact is one whole Argon2id at the exact observable H-1 was built to flatten.

**Fix (one line):** on the miss path make `:1846` fire-and-forget —
`void captureVerifierSafe(password);` then `throw primaryErr` — mirroring
success. Pair with a test measuring **time-to-visible-outcome**; the existing
count test cannot catch a regression here, which is why this survived two audits.

### M-5 — [KEK] The fast-path stores the RAW DEK; the plugin's safety comment still describes the pre-refactor wrapped model — **[VERIFIED]** · **FIXED**

> **Fixed same day.** The comment now states what the slot actually holds: the
> raw DEK, gated solely by the 30 s `BIOMETRIC_STRONG` Keystore window, with the
> `wrappedDek` field name flagged as historical. The retired claim is quoted in
> place and marked false rather than deleted, because "useless without H" is
> exactly the reasoning a future reader would otherwise reconstruct from the
> field name. The runtime residual is unchanged and remains owner-accepted.

**Files:** `android/app/src/main/java/com/veyrnox/app/AndroidBiometricCachePlugin.kt:241-247`
vs `src/wallet-core/keystore/native.js:626`, `:648-653`, `:1372-1385`.

The 2026-08-28 refactor removed the wrapped-DEK envelope. `populateFastpathBestEffort`
now stores the **raw DEK** (`native.js:651-653`, `btoa(b64)` of the 32 bytes) and
the read side decodes straight back and calls `decryptVaultWithDek` with **no
`combineKek`, no H, no C**. But the Kotlin comment still argues the cache
discloses no secret because *"the wrapped DEK is useless without H (KEK =
HKDF(H ‖ C))"*. Post-refactor the slot holds the **directly usable** DEK; only
the 30 s Keystore gating still holds. **Independently re-derived** — the comment
text and the `btoa(dek)` store were read side by side at the pin.

The *runtime* residual is owner-accepted and gated (opt-in OFF, disclosure card,
`isDuressConfigured` write+read gates at `native.js:637`/`:1326`, RASP-ALLOW).
The live defect is the stale comment — which is why this is MEDIUM, not HIGH. A
reviewer weighing a future change against that paragraph reasons against a model
the code abandoned.

**Fix:** rewrite `AndroidBiometricCachePlugin.kt:241-247` to state the slot holds
the raw DEK, gated solely by the 30 s `BIOMETRIC_STRONG` window, and that
confidentiality no longer rests on H.

### M-6 — [KEK] `getSecretUnauth` is an auth-free secret read whose only native gate is RASP block-tier — **[AGENT]** · **FIXED, but NOT by the recommended fix**

> **Fixed same day — and the recommended remedy was deliberately not taken.**
> This finding proposed requiring the caller to pass `kekEnrolled: true`. That
> would have been decoration: the threat model is injected in-page JS on a
> compromised runtime calling the plugin directly, and such a caller controls
> every argument it passes. `biometricUnlock.js` had already reached that
> conclusion in as many words — *"a caller-attested isEnrolled flag would not be
> trustworthy here"* — so implementing it would have contradicted a documented
> decision in the same code and shipped a gate that gates nothing.
>
> The guard is a **Keystore fact** instead, which a caller cannot forge:
> `getSecretUnauth` and `putSecretUnauth` both require the hardware KEK key alias
> to exist, and the read purges any stale entry and reports a miss (which routes
> JS to the auth-gated read — biometric-gated, so the miss is the safe outcome).
>
> **This turned out to be load-bearing rather than defence in depth**, which the
> finding did not establish: `clearHardwareCredential()` deletes the KEK key and
> does **not** purge this cache, so "entry present, KEK absent" is reachable —
> and in that state the cached PIN is no longer a C-factor but the vault password
> itself, released with no prompt. The write side is gated too, because on a null
> read the JS migration fallback re-persists the entry immediately; a read-only
> guard would have been undone on the very next unlock.
>
> **Residual, unchanged and stated:** on a runtime that is already compromised
> *while a KEK exists*, injected JS can still read the cached C-factor without a
> prompt. C alone opens nothing without H, and H needs the StrongBox-gated op.
> Closing that would mean putting auth on the unauth alias, which removes the
> only reason the alias exists.
>
> Verified by static pins only (`androidBiometricCache.kekPrecondition.test.js`),
> each mutation-checked. **The guard itself has never run on a device** — it
> depends on AndroidKeyStore and needs an instrumented run to be exercised.

**File:** `AndroidBiometricCachePlugin.kt:176-205`, key built at `:448-459` with
`REQUIRES_USER_AUTH_UNAUTH = false`. Only in-plugin gate: `rejectIfBlockTier` (`:182`).

The prior audit said safety *"lives entirely in an out-of-module caller."* That
is now **too strong**, and the correction matters: there are two JS-side
backstops that consult the keystore rather than a caller hint —
`biometricUnlock.js:167-177` (write, fail-closed on probe error) and `:485-492`
(read, re-verifies `hasVaultKekWrap()` and throws). So the unauth alias only ever
holds a **C-factor**, useless without H.

**Residual keeping it MEDIUM:** the *plugin boundary itself* is ungated. Injected
in-page JS on a compromised runtime can call
`Capacitor.Plugins.AndroidBiometricCache.getSecretUnauth()` directly, bypassing
both JS checks, with only a block-tier RASP check. Bounded to C, but it is a
single native chokepoint where the rest of the codebase insists on two.

**Fix (defense-in-depth):** have the plugin refuse the unauth read unless the
caller passes explicit `kekEnrolled:true`, mirroring the JS contract at the bridge.

---

## LOW

> **Update, same day — 13 of 15 LOW findings are FIXED in code; TWO are closed
> as by-design and were deliberately NOT changed** (branch
> `fix/audit-2026-09-07-lows`). Read the two exceptions before assuming the
> section is clear:
>
> - **L-2 is NOT a defect.** The attempt counter and 10-strike auto-wipe live on
>   `runPinUnlock` and not `runUnlock` because those serve different COHORTS: an
>   8-digit PIN (small keyspace, guessable online → counter + backoff + wipe) and
>   a ≥12-character vault password (Argon2id is the control; online guessing is
>   not the threat). Adding a wipe to the password path would destroy a wallet
>   when its owner mistypes a long passphrase ten times — irreversible fund loss
>   from a typo. The reasoning is now recorded at `runUnlock` so this stops being
>   re-filed; if a limit is ever wanted there, the honest shape is a timed
>   backoff, not a wipe.
> - **L-3 is fixed on its SECURITY half only.** The per-chain fee ceiling now
>   applies when the dApp names no fee (previously the cheapest way past
>   F-02-GASCAP was to send nothing). The DISCLOSURE half — the modal rendering
>   no fee row for those requests — is NOT closed: the modal would have to
>   receive a resolved fee it is not given today, and inventing one risks showing
>   a number different from what gets signed. Stated rather than quietly counted
>   as done.
>
> Everything else below is remediated. Behaviour changes (L-3, L-4, L-5, L-6,
> L-7, L-11, L-13, L-14) carry regression guards where they are testable, each
> mutation-checked by reintroducing the exact defect. L-1, L-10 and L-12 are
> comment corrections; L-8, L-9 and L-15 are deletions of dead code that read as
> coverage. **BUILT, INTERNAL — unit-tested only, none device-verified.**
>
> One correction found while fixing: **L-7's first regression test passed
> vacuously.** It asserted that a recursion guard stopped a cyclic type graph;
> such a graph never reaches that code at all, because H-4's root reconciliation
> rejects it first (no single unreferenced struct). The test was rewritten to
> assert the real defence, and the code comment claiming the guard was "required"
> was corrected to say it is belt-and-braces for a future caller.

- **L-1 — [Auth] Prior M-3 STILL PRESENT: the biometric cache's documented
  Keychain protection class is not the one the code sets.**
  `biometricUnlock.js:188` sets `whenUnlockedThisDeviceOnly`; `:524` claims
  `whenPasscodeSetThisDeviceOnly`; the header at `:22` and `:59` repeats the
  wrong class. Compounding: `grep -rnF biometricUnlockSecurityMode src/` outside
  its own file returns **nothing** — the designated disclosure API has zero
  callers, so it discloses nothing while three prose sites carry the false claim. **[AGENT]**
- **L-2 — [Auth] Prior M-4 STILL PRESENT: the wrong-attempt limit and auto-wipe
  exist on one unlock handler, not both.** `WalletEntry.jsx:912-951` `runUnlock`
  has **zero** references to `PIN_ATTEMPTS_KEY`, `readPinAttempts`,
  `registerFailedPinAttempt` or `raisePinSessionFloor`; `runPinUnlock`
  (`:1008-1187`) has all four (`:1016`, `:1047`, `:1150-1155`, `:1168`).
  Independently re-derived by `awk` over the `runUnlock` range. **[VERIFIED]**
- **L-3 — [WC] Prior L-1 STILL PRESENT: the fee ceiling and H-7 max-fee
  disclosure are both keyed on a dApp-supplied fee field.**
  `WalletConnectProvider.jsx:676-699` is `if (maxFeePerGas) … else if (gasPrice)`
  — omitting both skips `resolveMaxFeePerGas` and lets ethers take fees from
  `feeData` uncapped, while `fee.js:107-109` returns `null` so no fee row renders. **[AGENT]**
- **L-4 — [WC] Prior L-2 STILL PRESENT: `provider.estimateGas` is called without
  `from`.** `tx` is built at `:670-674` as `{to, value, data}` only; sender-dependent
  calls revert during estimation and land on the 1M fallback — the main feeder for L-3. **[AGENT]**
- **L-5 — [WC] Prior L-3 STILL PRESENT, and broader.** `RequestApprovalModal.jsx:363-376`
  unchanged. Second instance found: an **invalid** typed-data payload is
  deliberately left queued (`WalletConnectProvider.jsx:870-874`) and reaches the
  modal with the Approve button **enabled**. Under H-1 that approval now ends in
  a success haptic. Re-derived at the pin. **[VERIFIED]**
- **L-6 — [WC] The spend-limit gate fails OPEN when the limits cannot be read.**
  `WalletConnectProvider.jsx:1058-1064` swallows a `TransactionLimit.list()`
  failure into `txLimits = []`, after which nothing can block — and the code's own
  comment says *"fail open on limit axis."* The same handler fails **closed** when
  it cannot *value* a transfer (`WC_SEND_UNVALUED_TOKEN`), the strictly less
  severe failure. Precedent for the other direction: the PIN counter's
  `storageDegraded` path. **[VERIFIED]**
- **L-7 — [WC] The H-1 structural backstop inspects only the primary struct's own
  fields.** `grantsAddressAuthority` (`typed-data.js:37-46`) is a flat
  `fields.some(...)` with no recursion, so a wrapper type (`SignedOrder { order:
  OrderComponents, sig: bytes }`) or an authority-granting struct with no
  top-level `spender`/`operator`/`delegate` (Safe's `SafeTx`) scores `LEVEL.OK`.
  Narrower than it sounds — a Permit2-usable digest requires the exact primary
  type, and the named allowlists cover that family. The comment claims only the
  shape it implements, so this is a gap, not a false claim. **[VERIFIED]**
- **L-8 — [WC] Prior L-4 STILL PRESENT:** `assertPersonalSignAddress` is dead,
  divergent from the live H8 rule, and carries a 10-case suite that reads as
  coverage of the signing path. `WalletConnectProvider.jsx:135-146`. **[AGENT]**
- **L-9 — [WC] Prior L-5 STILL PRESENT:** `scoreWcTxLevel` is a dead export whose
  comment says the registry is S2+S4; the live registry is S2+S4+**S9**
  (`walletConnectIntel.js:19-26`). **[AGENT]**
- **L-10 — [RASP] Prior L-6 STILL PRESENT: two stale wiring comments in
  `RaspIntegrityPlugin.kt`** (`:548-549` and `:566-567`; the prior audit cited
  `:552-554,:571-572` — a few lines of drift, same two comments). `:548-549`
  claims `screenCapture:true → signals.hooked → BLOCK`; the authority
  `nativeProbe.js:198,201` folds it into `elevated` (Android) or
  `CONDITION.SCREEN_CAPTURE` (iOS), and `:204` says explicitly *"screenCapture is
  NOT Frida-severity and stays off this axis."* `:566-567` claims
  `overlayActive → signals.rooted → WARN`; `nativeProbe.js:116` shows it is
  **DROPPED**. The method's own KDoc was corrected by the L-2 sweep; these inline
  comments were missed, so a reader at the function body still gets the wrong
  mapping. Independently re-derived. **[VERIFIED]**
- **L-11 — [KEK] Prior L-7 STILL PRESENT, mildly worse post-refactor:**
  `getFastpathDek` / `getSecretUnauth` / `decryptSecret`
  (`AndroidBiometricCachePlugin.kt:200`, `:312`, `:524`) leave the decrypted
  plaintext `ByteArray` unscrubbed, where `HardwareKekPlugin.kt:404-410` scrubs
  the equivalent H buffer. The `getFastpathDek` plaintext is now the **raw DEK**
  (see M-5), so the lingering heap copy is the vault key itself. **[AGENT]**
- **L-12 — [KEK] Prior L-8 STILL PRESENT:** `enroll()`'s docstring
  (`HardwareKekPlugin.kt:107-110`) claims a `KEK_ALREADY_ENROLLED` reject the
  code never emits — `enrollApi30` force-deletes a stale alias and proceeds
  (`:126-142`). `grep -F` finds the constant only in the comment. The real
  re-enroll guard is the JS `blob.kekWrap` check. **[AGENT]**
- **L-13 — [KEK] NEW: the native RASP block-tier gate is on the three *read*
  methods but not the three *write* methods.** `getSecret` (`:94`),
  `getSecretUnauth` (`:182`), `getFastpathDek` (`:296`) each call
  `rejectIfBlockTier`; `putSecret` (`:60`), `putSecretUnauth` (`:149`),
  `putFastpathDek` (`:257`) do not — independently confirmed by listing the
  method declarations against the gate call sites. Low because writes don't
  disclose, an attacker on a BLOCK-tier runtime already holds the plaintext, and
  the JS populate path already fail-closes on non-ALLOW. Worth closing only
  because a read/write asymmetry is what a future refactor mis-reads as "writes
  are safe by design." **[VERIFIED]**
- **L-14 — [Auth] Prior L-9 STILL PRESENT:** `WIPE_EXHAUSTED_EVENT` has a
  definition (`copySecret.js:56`), a dispatch (`:121`), and **one test
  listener** — no production consumer, so the "fail honest" half of the clipboard
  wipe still does not exist. Second-order defect intact: `:116-117` sets
  `done = true; cleanup()` on exhaustion, so the 30 s TTL is never re-armed. **[VERIFIED]**
- **L-15 — [Auth] Prior L-11 STILL PRESENT:** `assertPasskeyFactorSatisfied`
  (`WalletProvider.jsx:254`) is never called from `src/`; wiring it in as written
  would brick unlock for users whose authenticator went away. **[AGENT]**

---

## Status vs prior audit (2026-09-05)

Two days elapsed, so most items are unchanged by construction. Statuses marked
**[VERIFIED]** were re-derived this run by the audit author, not carried.

| Prior | Status |
|---|---|
| **H-1** Permit2 batch SignatureTransfer types unlisted, fall-through signs | **FIXED** — PR #2359 merged 2026-09-05 22:09Z and confirmed an **ancestor of the audited commit** via `git merge-base --is-ancestor` (not grep). `typed-data.js:12-16` now lists all seven Permit primary types including `PermitBatchTransferFrom` / `PermitBatchWitnessTransferFrom`; the structural backstop shipped alongside. **[VERIFIED]** |
| **M-1** RASP OS-probe leg has no session latch | **STILL PRESENT** — carried as M-1, with the `getFreshRaspArtifact.js:17-18` header contradiction newly documented. **[VERIFIED]** |
| **M-2** Fast-path stores the raw DEK; plugin comment describes wrapped model | **STILL PRESENT** — carried as M-5. **[VERIFIED]** |
| **M-3** Biometric cache's documented Keychain class ≠ the one set | **STILL PRESENT** — carried as L-1, with the zero-caller disclosure API as compounding. **[AGENT]** |
| **M-4** Attempt limit + auto-wipe on one unlock handler, not both | **STILL PRESENT** — carried as L-2. **[VERIFIED]** |
| **M-5** `getSecretUnauth` auth-free, safety in an out-of-module caller | **STILL PRESENT, framing corrected** — carried as M-6. Two JS backstops bound the impact to a C-factor; the ungated plugin boundary is the real residual. **[AGENT]** |
| **L-1 / L-2 / L-3 / L-4 / L-5** (WC) | **ALL STILL PRESENT** — carried as L-3, L-4, L-5, L-8, L-9. L-3's successor (L-5) is **broader** than filed. |
| **L-6** (RASP stale comments) | **STILL PRESENT** — carried as L-10. **[VERIFIED]** |
| **L-7 / L-8** (KEK) | **STILL PRESENT** — carried as L-11, L-12. |
| **L-9** `WIPE_EXHAUSTED_EVENT` has no listener | **STILL PRESENT** — carried as L-14. **[VERIFIED]** |
| **L-10** SendCrypto 2FA uses the bare verify variant | **STILL PRESENT — ESCALATED to H-2.** Reachability re-derived: not an OOM edge case but the deterministic outcome of a default-ON feature. **[VERIFIED]** |
| **L-11** `assertPasskeyFactorSatisfied` never called | **STILL PRESENT** — carried as L-15. |
| **L-12** Equalizer's fifth KDF straddles the visible outcome | **STILL PRESENT — RE-RATED to M-4.** Prior rating was "rendering-order artifact"; the artifact is one full Argon2id at the exact observable the equalizer exists to flatten. **[VERIFIED]** |
| **REFUTED** — fast-path cache survives passkey registration | **STILL REFUTED.** Re-checked; no new evidence overturns it. `unlockBiometricOnly` still has no `isPasskeyRegistered` gate while `populateFastpathBestEffort` does, and the compensating clear lives in `passkey.js` — the prior refutation and its narrow residual both stand, unchanged. Not re-reported. |

**Nothing regressed.** One prior finding fixed, two re-rated upward on
re-derivation, the rest carried.

---

## INFO / PASS — controls confirmed working

Traced to the signing or key-release call, not grepped.

**The historic H-1 field-misread remains fully remediated.** All 20 gate
consumers were enumerated. Every `presignGate` consumer reads `proceedAllowed`
(`WalletConnectProvider.jsx:424,439,495,579,932`, `SendCrypto.jsx:1181,1382,1432`,
`CryptoSigning.jsx:64`, `sendGate.js:158`, `signingPolicy.js:78`,
`composeVerdict.js:221`, `RequestApprovalModal.jsx:151`). Every remaining
`gate.blocked`/`gate.sentence` reader consumes `sensitiveGate()`, whose return
shape genuinely **is** `{blocked, sentence}` (`sensitiveGate.js:40-48`) —
correct, not the bug.

**No fail-open found on the RASP detection chain.** `detect()` and
`detectAttestation()` both refuse partial or non-boolean shapes;
`selectPresignProbeSource.js:50-62` never falls back to browser CLEAN on native
(C-01); `degrade.js:173-178` defaults to the strongest BLOCK; an ack can never
buy past BLOCK. The one caveat is M-1's per-leg timeout → WARN, which the file
header wrongly describes as BLOCK.

**WARN-tier biometric enforcement holds.** `degrade.js` sets
`requiresBiometric:true` on every WARN condition; `SendCrypto.jsx:1409-1417`
throws `RASP_BIO_REQUIRED` so an ack alone cannot pass a native WARN.
WalletConnect passes `acknowledged=false` unconditionally (`:423`).

**Android tamper-cert is a real fail-closed pin, not a placeholder.**
`RaspIntegrityPlugin.kt:806-850` compares the installed signing cert SHA-256 to
`BuildConfig.RELEASE_CERT_SHA256`; blank/unreadable/no-digest → `tampered=true`.
Pinned by `raspTamperConfig.test.js`.

**I6 is correct.** `kek.js:238-240` builds `ikm = H‖C` by ordered concat
(`ikm.set(H,0); ikm.set(C,H_LEN)`) with domain
`veyrnox/kek/v1/combine(H||C)` — matching the invariant verbatim, not XOR.
Degenerate all-zero factors rejected; H, C, ikm, bits and DEK zeroed in `finally`
at all 15 native/web call sites. Known unzeroable residuals (JS seed string, iOS
`hB64` NSString, Android `b64` String) are disclosed as architectural.

**iOS SE-vs-Keychain naming is honest (I4).** `HardwareKekPlugin.m` stores only
the ECIES *ciphertext* of H in the generic Keychain; the decrypting P-256 key is
minted in the Enclave, and `keyTier:"SecureEnclave"` is returned only after a
real SE keygen. `EnclaveKeyService.swift:60-68` reports `backing:"secureEnclave"`
only when `SecureEnclave.isAvailable`. `kek.js:16-31` explicitly forbids an
unqualified "hardware-backed" claim for Android.

**StrongBox falls back honestly.** `readSecurityLevel` reports the true tier from
`KeyInfo.securityLevel`, never fabricated (`-99 NO_KEY`, `-98 PROBE_ERROR`).
DEVICE_CREDENTIAL is gone (H16) — `AUTH_BIOMETRIC_STRONG` only, everywhere.

**Chain, topic and session binding hold.** Chain is resolved from the session's
**approved** namespaces, never the request's claim, and enforced pre-modal and
again at sign time; `eth_chainId` is verified against the RPC before broadcast
(VULN-19). Topic→session always resolves through `getActiveSessions()`, never
React state; a missing or non-numeric expiry is treated as expired.

**v1/v3 blocking is doubly enforced** — rejected by `BLOCKED_METHODS` at the
front door, and never advertised in the approved namespace.

**Domainless / unlisted Permit is closed on both axes.** A domain without
`chainId` fails the H7 bind; the seven Permit types plus Seaport plus the
structural backstop all score CAUTION/RISK, and `presignGate` passes only on
`DECISION.ALLOW` with `acknowledged` hardcoded false.

**Gas cap holds unconditionally** — `resolveGasLimit` clamps both the dApp value
and our own estimate to `WC_GAS_CAP`, and the estimate's `.catch()` falls back to
the cap itself, not to unbounded.

**Phishing lookup is not tier-gated where it matters.** `session.js:221-229` runs
`checkDappDomain` inside `approveSession` and hard-blocks with no tier condition.
Residual worth stating: a session approved *before* its domain reached the feed
gets no request-time warning on lower tiers, and the check does not re-run for
live sessions.

**`captureVerifierSafe` OOM handling is fail-closed throughout.**
`credentialVerifier.js:102-108` never throws; `MAX_CREDENTIAL_LEN` rejects before
argon2id allocates; the `setTimeout(0)` yield keeps peak memory to one KDF. The
only gap is that "bricked" is distinguishable **only** through the Detailed
variant — H-2.

**The PIN attempt counter is monotonic and fail-closed for what it claims.**
Reads are floored against a session high-water mark; a failed read *or* write
latches `storageDegraded` and is surfaced; the persisted backoff deadline is
clamped to `PIN_BACKOFF_MAX_MS` so a tampered far-future value cannot lock the
owner out. `shouldWipe: attempts >= PIN_WIPE_AFTER`, not `===`. Both keys are in
`ALL_RESIDUE_KEYS`. Subject to L-2's cohort gap.

**Infra-vs-wrong-PIN classification is intact** (`WalletEntry.jsx:1094-1145`) —
`KEY_PERMANENTLY_INVALIDATED`, `NO_HARDWARE_FACTOR`, `USER_CANCELLED`,
`MALFORMED_VAULT` and friends all return without incrementing. This is the
control stopping a flaky sensor from destroying funds after ten retries.

**Equalizer cost parity passes** — `spendPrimaryUnlockEqualizerKdfs` runs the
real resolver and discards the result, so the memorySize multiset is identical
across outcomes **by construction**, for v2 (96 MiB/t=6), v1 (192 MiB/t=3) and
mixed-era footprints. The residual is ordering, not cost — M-4.

**I3 holds on every surface examined.** `attestationProbeSource` checks
`isDeniabilityOrDemoActive()` first, before any platform check or bridge call;
`screenTransaction` does the same; WC is torn down in deniability; and the new
`reviewPrompt.js` surface added since the last audit is gated at all eight
entry points.

---

*Internal audit. Static analysis only. Four specialist agents; both HIGH
findings and eight other items independently re-derived by the audit author at
the audited pin. Nothing here is device-verified, no on-chain transaction was
made, and no status tag should advance on the strength of this document. This is
NOT the outstanding independent third-party audit.*
