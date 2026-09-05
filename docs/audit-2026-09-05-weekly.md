# Internal Security Audit — 2026-09-05
## Scope: RASP · WalletConnect · Hardware KEK · Auth Gates (Weekly)

> **Internal static-analysis pass.** Conducted by internal Claude specialist agents.
> Static code review only — no dynamic testing, no on-device verification.
> An independent third-party audit remains RECOMMENDED (see CLAUDE.md §Hard rules).

Conducted: 2026-09-05
Method: Static code analysis via parallel specialist agents (4 agents × 4 surfaces)
Branch audited: `security-audit/2026-09-05`, pinned to `origin/main` at
**`4ae2dbc19c8b9285922aaacd710e2ee042197ee4`**
Status: **Findings only. Do not mark anything verified without on-chain txid or on-device evidence.**

---

## How to read this report

**The audited commit is a pin, and `main` has moved past it.** `4ae2dbc1`
includes the FLAG_SECURE hardening (#2354) but **predates** the deniability-KDF
fail-safe (#2356) and the Permit2 fix (#2359). Where that matters to a finding's
status it is stated inline rather than left for the reader to work out.

**Findings were verified, not relayed.** Each agent was briefed to try to REFUTE
its own finding before reporting it and to list the refutations it discarded.
The coordinating session then independently re-derived the load-bearing claims
from source. Every finding below is marked:

- **[VERIFIED]** — the coordinating session re-checked it directly from the
  audited tree, with the check named.
- **[AGENT]** — reported by the specialist agent with a refutation trail, not
  independently re-derived. Lower confidence; treat as a lead.

One agent finding was **REFUTED** and one agent *recommendation* was **REJECTED**
as over-broad. Both are recorded below rather than silently dropped — a report
that only contains what survived is not a record of what was examined.

### Deviations from the runbook

The runbook's `subagent_type` values (`Penetration Tester`,
`Blockchain Security Auditor`, `Application Security Engineer`) all resolved;
no substitution was needed this run, unlike 2026-08-17 and 2026-08-25.

Opus was used for all four agents rather than the CLAUDE.md cheapest-capable
default, on the grounds that the model-cost rule names RASP, KEK, signing and
wallet-core as its explicit escalation cases — which is exactly this scope.

---

## Changes since last audit (2026-08-25 → 2026-09-05)

52 commits touched security-relevant paths. The material ones:

- **Bug-report screen recording, slices 1c → 2d.** An entirely new attack
  surface: native screen capture on both platforms (ReplayKit, MediaProjection),
  FLAG_SECURE coordination, a Supabase upload path with a new SECURITY DEFINER
  RPC, and a sealed-box-equivalent encryption helper. Shipped behind
  `VITE_BUG_REPORT_ENABLED`, default OFF.
- **FLAG_SECURE hardening (#2354).** `setSecureFlag(false)` had no native gate
  and nothing restored it; now grant-gated and self-healing on
  pause/resume/destroy.
- **Advisor page-snapshot egress removed (#2349).** 196 keys from 62 pages
  stopped reaching `tip-chat`.
- **Attestation honesty sweep** (#2280–#2285) and the Play Integrity mutable
  trust-anchor removal (#2284).
- **Transak webhook HMAC** gating and log-oracle fix (#2279, #2281, #2289).
- Panic-wipe residue keys for the store-review prompt (#2336).

---

## HIGH

### H-1 — [WC] Permit2 batch SignatureTransfer types were unlisted, and the fall-through signs — **[VERIFIED]** — FIX OPEN AT TIME OF WRITING

**Files:** `src/wallet-core/evm/typed-data.js:4-7` (`PERMIT_PRIMARY_TYPES`),
`src/lib/wcTypedLevel.js:38-43` (`PERMIT2_PRIMARY_TYPES`), consumed at
`src/lib/WalletConnectProvider.jsx:493` and
`src/components/walletconnect/RequestApprovalModal.jsx:209,215-220`.

Permit2's SignatureTransfer interface has **six** primary types.
`PermitBatchTransferFrom` and `PermitBatchWitnessTransferFrom` were in neither
allowlist, and neither string appeared anywhere in the repository.

The omission is not cosmetic because of what the fall-through does. An
unrecognised `primaryType` reaches `LEVEL.OK`, and on this surface **OK is the
only typed-data verdict that signs**: `presignGateOrReject` hardcodes
`acknowledged=false` (`WalletConnectProvider.jsx:423`) and `presignGate` passes
only on `DECISION.ALLOW` (`presign.js:60`), while `composeGate` maps
`CAUTION→WARN` and `RISK→CONFIRM` (`compose.js:82-91`). So every *recognised*
asset-authorising payload — `Permit`, `PermitSingle`, `PermitBatch`,
`PermitTransferFrom`, `PermitWitnessTransferFrom`, `OrderComponents`,
`BulkOrder` — is already hard-refused, and `PermitBatchTransferFrom` was the one
Permit-family payload the wallet would actually sign.

It signed with no drain-warning banner and no mandatory acknowledgement
(`isAssetAuthorising` false), rendering `PermitBatchTransferFrom on Permit2`
beside the genuine Permit2 contract address — reading as *more* trustworthy than
a flagged payload. A realistic drainer names exact balances rather than
`uint256`-max, so `hasUnlimitedAllowance` never fires either.

**Verification performed by the coordinating session:** zero repo matches for
the type name across `src/` and `e2e/`; both allowlists confirmed as
exact-membership `Set`s; `detectAssetAuthorising` (`typed-data.js:68-90`)
confirmed to key only on those two Sets and return
`{isAssetAuthorising:false}` otherwise; the `LEVEL.OK` fall-through confirmed at
`wcTypedLevel.js:120`.

**Refutations the agent discarded, checked and agreed with:** H-4's
primaryType↔graph reconciliation closes payload *forgery*, not an honestly
declared unlisted name; the `UNLIMITED (...)` formatter does not fire on exact
balances; `buildWcTransactionIntelligence` is on the `SEND_TRANSACTION` branch
only; the spend-limit gate and `WC_TWO_FACTOR_REQUIRED` live only in
`_handleSendTransaction`.

**Status: fix open in PR #2359 at time of writing (auto-merge armed, NOT
merged).** Two layers: both names added, plus a structural backstop treating any
primary struct that hands away an address-typed `spender`/`operator`/`delegate`
as asset-authorising. The backstop was confirmed to be real defence in depth —
with both names removed again the payload still scores CAUTION, i.e. still
refused.

**Agent recommendation REJECTED, and why.** Agent B additionally proposed
scoring *every* unrecognised type CAUTION, arguing it "costs no legitimate flow
that currently works". That holds for asset-authorising types and fails in
general: on this surface CAUTION means REFUSED, so it would also block DAO votes
and SIWE-style logins, which sign today and authorise nobody. The narrower
shape-based backstop was implemented instead, with a regression test pinning
that a Snapshot-style `Vote` stays OK.

---

## MEDIUM

### M-1 — [RASP] The OS-probe leg has no session latch, so a muted probe downgrades BLOCK to an overridable WARN — **[VERIFIED, in part]**

**Files:** latch present at `src/rasp/attestation.js:216-237`; absent from
`src/rasp/detect.js:89-110`, `src/rasp/degrade.js:118-129`,
`src/rasp/getFreshRaspArtifact.js:48-60`. Override consumed at
`src/pages/SendCrypto.jsx:1409-1417`. Guarantee undercut:
`src/sign-gate/compose.js:24-36`.

`compose.js:31-36` states the core RASP guarantee: a `block` from a hostile
*runtime* has no override "precisely because the confirmation itself can be
hooked". The Codex P2 latch was added to stop an attacker muting the
*attestation* response to flip `INTEGRITY_FAIL` (BLOCK) into
`INTEGRITY_UNAVAILABLE` (WARN). That latch covers **only** the attestation leg.
The on-device native leg is stateless: suppressing it — including by making the
bridge hang until `withFailClosedTimeout` fires — yields
`INTEGRITY_UNAVAILABLE` → WARN, which *is* overridable by biometric + ack, on a
runtime where that biometric boolean is itself forgeable.

**The self-contradiction is [VERIFIED] directly.** `getFreshRaspArtifact.js`
disagrees with itself in one file:

- header `:17-18` — *"On timeout, exception, or shape drift anywhere in the
  chain, the returned artifact has tier === TIER.BLOCK (never a fabricated
  CLEAN)."*
- inline `:46-47` — *"on throw or timeout the source is UNAVAILABLE, which
  detect() / detectAttestation() both map to INTEGRITY_UNAVAILABLE (→ WARN via
  degrade)."*

The inline comment matches the code. The header does not, and it masks exactly
the downgrade this finding describes. That half is a documentation defect and
should be corrected regardless of what is decided about the latch.

**The proposed fix conflicts with a recorded owner decision — do not apply it
blind.** Agent A recommends giving the OS leg the same session latch. But issue
**#2276** deliberately keeps pin/chain failures at WARN rather than
INTEGRITY_FAIL *because* the sticky session latch (`attestation.js:298`) would
otherwise produce a self-renewing BLOCK on genuine devices — the latch clears on
app-lock, but the next pre-sign probe re-fails and re-latches. Extending that
same latch to the OS leg imports that DoS risk to a second, noisier signal.

The two positions are both defensible and this report does not adjudicate them.
What it records is that they are in tension and that the tension is currently
undocumented in either place. **Owner decision needed.** The header correction
is independent of it and should land either way.

*Confidence: the mechanism is verified; the severity depends on an
attacker-already-has-Frida precondition, and RASP is explicitly best-effort and
unaudited.*

### M-2 — [KEK] The fast-path stores the RAW DEK, and the plugin's safety comment still describes the pre-refactor wrapped model — **[VERIFIED]**

**Files:** `src/wallet-core/keystore/native.js:624-660`, `:1301-1404`;
`android/.../AndroidBiometricCachePlugin.kt:410-439`, comment at `:242-247`.

The 2026-08-28 silent-fastpath refactor removed the wrapped-DEK envelope and the
HKDF(H) layer. The module now says so in its own words
(`native.js:626-628`): *"The DEK is stored as raw bytes (base64-encoded for the
Capacitor string bridge)"*. `unlockBiometricOnly` performs no
`getHardwareFactor`, no HKDF, no `combineKek`.

Within the alias's 30-second device-wide `BIOMETRIC_STRONG` window, one
fingerprint touch opens the **real** vault with no PIN — a genuine departure
from I6's two-factor construction, owner-accepted and disclosure-gated (Q1).
That part is recorded, not contested.

**The live defect is the stale reasoning.** `AndroidBiometricCachePlugin.kt:242-247`
still argues the cache discloses no secret because the wrapped DEK is
"useless without H". Post-refactor the slot holds the raw DEK, so a
stale-but-successful decrypt yields a directly usable key. The confidentiality
argument no longer holds; only the gating does. A future reader weighing a
change against that paragraph would be weighing it against a model the code
abandoned.

**Verification performed:** read `populateFastpathBestEffort` in full and
confirmed the raw-bytes storage and all seven write-side gates (I3, duress,
enabled, disclosure, passkey, RASP-ALLOW, plugin presence).

### M-3 — [Auth] The biometric cache's documented Keychain protection class is not the one the code sets — **[VERIFIED]**

**File:** `src/lib/biometricUnlock.js:188` sets
`KeychainAccess.whenUnlockedThisDeviceOnly`. `:524` — inside
`biometricUnlockSecurityMode()`, whose stated purpose is to "surface the CURRENT
protection level … so honest disclosure is possible" — claims
`whenPasscodeSetThisDeviceOnly`. Confirmed by reading both lines.

The classes differ behaviourally: `whenPasscodeSetThisDeviceOnly` requires a
passcode and iOS destroys the item when the passcode is removed;
`whenUnlockedThisDeviceOnly` does neither. The cached item is the plaintext
vault password (non-KEK) or the C-factor PIN (KEK).

**The code is deliberate and correct** — `keystore/native.js:292-298` uses the
same class and documents why (`whenPasscodeSetThisDeviceOnly` fails
`errSecNotAvailable -25291` under palera1n). Only the prose is wrong, in three
places, one of which is the designated disclosure API. Two prior weekly reports
have cited that function as evidence of honest disclosure, and 2026-08-17
recommended rendering it in the posture UI — which would have shipped the false
claim to users.

**Fix:** correct the prose, carry the palera1n rationale across, and decide
whether `biometricUnlockSecurityMode()` should be wired to a UI or deleted. An
uncalled disclosure function discloses nothing.

### M-4 — [Auth] The wrong-attempt limit and auto-wipe exist on one unlock handler, not both — **[VERIFIED]**

**File:** `src/components/WalletEntry.jsx`. `runPinUnlock` (`:1008-1207`) checks
the backoff before spending an attempt, registers the miss, raises the session
floor, persists, and fires `panicWipe({confirmed:true})` at 10. `runUnlock`
(`:911-951`) — the password-cohort handler bound to the password field and both
escape-hatch buttons — does none of it.

**Verification performed:** counted counter references in each handler —
`runPinUnlock` **5**, `runUnlock` **0**.

The agent's own refutation attempt is what makes this MEDIUM rather than HIGH,
and it checked out: the PIN-cohort branch (`:1781-1917`) returns before the
second view and binds only `PinPad → runPinUnlock`, so a PIN-cohort user cannot
side-step the counter.

The honesty half is the sharper problem. `featureCatalogue.js:180,271` and
`deniabilityUnlock.js:13` state *"10 consecutive wrong PINs trigger an
irreversible local wipe"* with no cohort qualifier.

**Fix:** either extend the guard to `runUnlock` (it is pure and
cohort-agnostic), or qualify every claim as PIN-cohort-only. The second is the
smaller diff and is honest; the first is what the docs currently promise.

### M-5 — [KEK] `getSecretUnauth` is an auth-free secret retrieval whose safety lives entirely in an out-of-module caller — **[AGENT]**

**File:** `android/.../AndroidBiometricCachePlugin.kt:176-205`, `:448-459`.

The unauth alias is built without `setUserAuthenticationRequired`, so the method
returns the cached unlock secret with no biometric prompt; the only in-plugin
gate is `rejectIfBlockTier`. Its documented safety rests on the caller passing
`{kekEnrolled: true}` and on the DEK being `HKDF(H ‖ C)` — but the plugin
performs no `kekEnrolled` check, no deniability check, and no biometric gate.

In a codebase that elsewhere insists on two independent chokepoints, guarding an
auth-free password cache at exactly one out-of-module site is a single point of
failure. Not independently re-derived; recorded as a lead with the agent's
reasoning intact.

---

## LOW

- **L-1 — [WC] The fee ceiling and H-7 max-fee disclosure are both keyed on a
  dApp-supplied fee field** — omitting `maxFeePerGas`/`gasPrice` skips
  `resolveMaxFeePerGas` entirely and renders no fee row, after which the
  RPC-supplied fee is unbounded on this path. Compounded by the 1,000,000 gas
  fallback when `estimateGas` throws. `WalletConnectProvider.jsx:676-707`,
  `fee.js:130-135`. **[AGENT]**
- **L-2 — [WC] `provider.estimateGas` is called without `from`**, so
  sender-dependent calls revert during estimation and land on the 1M fallback —
  the main feeder for L-1. `WalletConnectProvider.jsx:670-706`. **[AGENT]**
- **L-3 — [WC] The modal offers an approval affordance for typed-data payloads
  the handler can never approve.** Fail-closed, so not a hole; it presents a
  permission the product does not grant, then fails with an opaque error.
  `RequestApprovalModal.jsx:363-376`. **[AGENT]**
- **L-4 — [WC] `assertPersonalSignAddress` is dead, divergent from the live H8
  rule, and carries a 10-case suite that reads as coverage of the signing path.**
  `WalletConnectProvider.jsx:135-146`. **[AGENT]**
- **L-5 — [WC] `scoreWcTxLevel` is a dead export whose comment describes the
  live risk registry inaccurately** (says S2+S4; the registry is S2+S4+S9).
  **[AGENT]**
- **L-6 — [RASP] Two stale wiring comments in `RaspIntegrityPlugin.kt:552-554,
  571-572`** contradict the authoritative mapping in `nativeProbe.js`; the same
  file's own L-2 note already corrects them. Documentation rot only. **[AGENT]**
- **L-7 — [KEK] `getFastpathDek` / `getSecretUnauth` / `decryptSecret` leave the
  decrypted plaintext `ByteArray` unscrubbed**, where `HardwareKekPlugin.kt:404-410`
  scrubs the equivalent H buffer. The `getFastpathDek` plaintext is the raw DEK.
  **[AGENT]**
- **L-8 — [KEK] Android `enrollApi30`'s docstring claims a
  `KEK_ALREADY_ENROLLED` native reject the code does not implement** — it
  force-deletes and proceeds. The real guard is the JS `blob.kekWrap` check.
  `HardwareKekPlugin.kt:107-110` vs `:126-142`. **[AGENT]**
- **L-9 — [Auth] `WIPE_EXHAUSTED_EVENT` has no listener**, so the "fail honest"
  half of the clipboard wipe still does not exist. Carried from M-8
  (2026-08-25), unremediated. Second-order: after a failed wipe the 30 s TTL is
  never re-armed. `copySecret.js:44-47,120-122`. **[AGENT]**
- **L-10 — [Auth] SendCrypto's `TwoFactorGate` verify callback uses the bare
  `verifyActiveCredential`**, not the `bricked`-aware variant the other three
  step-up surfaces use, so an OOM-bricked verifier reads as "Incorrect PIN" five
  times and forces a lock. `SendCrypto.jsx:2733`. **[AGENT]**
- **L-11 — [Auth] `assertPasskeyFactorSatisfied` is a never-called assertion
  whose stated rule contradicts shipped unlock behaviour**; wiring it in would
  brick unlock for users whose authenticator went away.
  `WalletProvider.jsx:248-261` vs `:1727-1728`. **[AGENT]**
- **L-12 — [Auth] The equalizer's fifth KDF still straddles the visible
  outcome** — a rendering-order artifact, total KDF work is equal. Carried from
  L-11 (2026-08-25), unchanged. **[AGENT]**

---

## REFUTED — reported by an agent, disproved on verification

### Fast-path cache survives passkey registration — **REFUTED**

Agent C reported (at self-declared MEDIUM confidence, explicitly flagging that
the compensating control might live outside its file set) that
`unlockBiometricOnly` lacks the `isPasskeyRegistered()` gate the write path has,
so "warm the cache, then register a passkey" would leave a readable cache.

**The read-path gap is real** — `unlockBiometricOnly` has six gates and no
passkey check (verified: `isPasskeyRegistered` count 0 in `:1301-1340`).
**The consequence is not.** `src/lib/passkey.js:110-134`
(`notifyPasskeyRegistrationChanged`) clears the fast-path slot on **any**
registration flip, with a comment naming this precise scenario: *"a
newly-registered passkey must not be silently bypassable by a stale fast-path
cache the user warmed up before enrolling"* — owner ruling, Finding 2 on #2051.

**Residual, narrower than the original claim and worth keeping:** that clear is
fire-and-forget (`Promise.resolve().then(...)`) with errors swallowed, and the
read path has no passkey gate behind it. A failed clear therefore leaves a
readable cache with no backstop. Adding the read-side gate would make the
best-effort clear non-load-bearing.

This is recorded because the agent's honest hedging is what made the refutation
cheap — it named the file to check.

---

## Status vs prior audit (2026-08-25)

Statuses marked **[VERIFIED]** were re-derived this run; the rest are carried on
agent evidence.

| Prior | Status |
|---|---|
| H-1 fast-path biometric reopens H-3 (no duress gate) | **FIXED** — write gate `native.js:637`, read gate `:1326`. Both present. **[VERIFIED]** |
| H-2 KDF v2 broke chaff↔real parity | **STILL PRESENT at the audited pin.** Note: the audited commit predates #2356, which made the reveal-time repair fail-safe when the pool is unreadable. #2356 does not itself close H-2's distinguisher. |
| H-3 WC send fetches a TIP verdict then discards it | **FIXED** — S9 now in the live registry (`walletConnectIntel.js:21-23`). **[AGENT]** |
| H-4 EIP-712 `primaryType` not reconciled with `types` | **FIXED** — `typed-data.js:39-55` derives the root from the graph and rejects mismatch *and* ambiguity. **[VERIFIED]** |
| M-5 `screenCapture` ELEVATED, no FLAG_SECURE backstop (iOS) | **STILL PRESENT.** #2354 hardened Android FLAG_SECURE only; iOS has no equivalent. |
| M-6 spend limits scored on native `value` only | **FIXED** — `resolveWcSpendAmount` values ERC-20 transfers and fails closed on unvaluable tokens. **[AGENT]** |
| M-7 PIN timed backoff never enforced | **FIXED** — checked before the attempt is spent, `WalletEntry.jsx:1016-1024`. **[AGENT]** |
| M-8 clipboard wipe has no `focus` trigger | **FIXED** for the trigger; the *honest-failure* half remains open as L-9. |
| M-9 PIN counter fails open when localStorage unwritable | **FIXED** — session floor + `storageDegraded` notice. **[AGENT]** |
| M-10 biometric cache not invalidated on enrollment change | **PARTIALLY FIXED** (Android `setInvalidatedByBiometricEnrollment`), iOS still TARGET and honestly marked. **[AGENT]** |
| L-3/L-4/L-5/L-6/L-7/L-8/L-9/L-10 | **STILL PRESENT** — carried, none re-verified this run. |

---

## INFO / PASS — controls confirmed working

The full per-agent PASS lists are long; these are the ones that matter most and
were traced to the signing or key-release call, not grepped.

**The historic H-1 field-misread is fully remediated.** Every gate consumer
reads `proceedAllowed`: `WalletConnectProvider.jsx:424,439,495,579,932`,
`SendCrypto.jsx:1181,1382,1432`, `CryptoSigning.jsx:64`, `sendGate.js:158`,
`signingPolicy.js:78`. No caller reads a property the gate does not return.

**No fail-open found on the RASP surface.** Every failure path lands on WARN or
BLOCK; unknown conditions degrade to BLOCK plus the full SENSITIVE set
(`degrade.js:173-178`); the browser leg's hardcoded CLEAN cannot reach a native
ALLOW (`selectPresignProbeSource.js:50-62`); an ack can never buy past BLOCK
(`presign.js:52-53` with `compose.js:138`).

**I6 is correct.** `kek.js:238-240` builds `ikm = H‖C` by ordered concat with
domain `veyrnox/kek/v1/combine(H||C)`; degenerate all-zero factors are rejected;
H, C, ikm, DEK and derived bits are zeroed in `finally` at every site.

**Typed-data chain binding and session binding hold.** H7 enforced at a single
site with a pre-modal mirror; chain resolved from the session's *approved*
namespaces rather than the request's claim; topic→session resolved from
`getActiveSessions()` with a missing/non-numeric expiry treated as expired.

**Domainless Permit is closed on both axes** — a domain without `chainId` fails
the H7 bind; one without `verifyingContract` still scores CAUTION and is
refused.

**The unlock timing equalizer is structurally sound.** The equalizer calls the
real resolver verbatim and discards the result, so count *and* KDF param profile
match a miss by construction — there is no calibration constant left to drift
against the 96 MiB/t=6 vs 192 MiB/t=3 split. KDF ledger verified by hand at 5
derivations on all three outcomes.

**The PIN counter's session floor is monotonic and fail-closed**, backoff is
checked before an attempt is spent, and infrastructure failures correctly do not
count toward the wipe.

---

*Internal audit. Static analysis only. Four specialist agents, findings
independently re-derived where marked [VERIFIED]. One agent finding refuted and
one agent recommendation rejected, both recorded above. This is NOT the
outstanding independent third-party audit.*
