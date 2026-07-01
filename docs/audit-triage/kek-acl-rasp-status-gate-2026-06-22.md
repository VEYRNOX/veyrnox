# KEK / ACL / RASP — consolidated status gate (2026-06-22)

> **WHAT THIS IS:** the single disposition record for the three remaining
> hardware/native security layers — the **hardware KEK** (key-encryption-key),
> the **OS-enforced biometric ACL** (M2c/M2d Secure Enclave + StrongBox binding),
> and **RASP** OS-level runtime detection. It states, in one place, the verbatim
> gate that governs all three:
>
> > **The remaining KEK / ACL / RASP work is TARGET / PLANNED. It requires
> > real-device verification, adversarial verification, recovery verification, and
> > independent third-party audit sign-off before any status drops.**
>
> **WHAT THIS IS NOT:** a status change. This document flips nothing. It does not
> mark anything BUILT, validated, verified, or audited; it does not start any
> build. It consolidates the existing OPEN audit items (`H-2`, `§3`, RASP-native)
> so the gate is discoverable from one file instead of scattered across the specs.
> Per `CLAUDE.md` and `docs/Audit.scope.md`, **"internal" is never presented as
> "independent"**, and a green test suite / clean review is **BUILT at most, never
> verified** ("verify, don't assert").

| | |
|---|---|
| **Date** | 2026-06-22 |
| **Branch** | `claude/fervent-banzai-6be759` |
| **Scope** | hardware KEK · OS-enforced biometric ACL (M2c/M2d) · RASP OS-level detection |
| **Author** | Claude (Opus 4.8), Claude Code |
| **Method** | read-only status-tag sweep across all code + docs; cross-referenced against existing OPEN audit items |
| **Outcome** | **no status-tag drift found**; gate recorded |

---

## 0. Sweep result — every status tag is honest and consistent

A full sweep of every code and doc site for these three areas found **no
over-claim and no drift**. Each tag accurately reflects reality:

| Area | Where the status lives | Tag | Honest? |
|---|---|---|---|
| KEK | `docs/kek-architecture-spec.md:3` | **TARGET (design); on build UNAUDITED-PROVISIONAL** | ✅ no impl code exists |
| KEK | `docs/Internal-Audit-2026-06.md` H-2 | **OPEN** (mainnet blocker) | ✅ |
| KEK | `docs/audit-triage/ai-review-2026-06-19-unaudited-features.md` F-16 | accepted known item | ✅ |
| KEK (PRF spike) | `src/dev/prfSpike.js`, `src/pages/dev/PrfSpike.jsx` | DEV-only harness, BUILT, **unrun** (needs device) | ✅ dead-code-eliminated in prod |
| ACL (M2c/d) | `docs/M2cd.native-acl-plan.md:1` | **PLAN / NOT YET IMPLEMENTED** | ✅ zero code |
| ACL | `src/wallet-core/keystore/native.js:42-50` | self-discloses "NOT an OS-enforced ACL … deferred (M2c/M2d)" | ✅ M2b app-layer only |
| ACL | `src/lib/featureCatalogue.js:165` (Native Secure Storage) | **`'roadmap'`** | ✅ |
| ACL | `docs/Internal-Audit-2026-06.md` §3 | **OPEN** (mainnet blocker) | ✅ |
| RASP | `src/lib/featureCatalogue.js:275` | **`'built'`** (policy + browser probe) | ✅ |
| RASP | `src/pages/RaspSecurity.jsx` | UI shows **UNAUDITED-PROVISIONAL**, `Independent audit: not yet` | ✅ |
| RASP | `src/lib/featureClassification.js:281` | `verdict: 'live'` *(route-ships-honestly, not asset-status)* | ✅ note discloses audit-gated |
| RASP | `docs/rasp-validation-roadmap.md:3` | **BUILT (policy only) / detection PARKED** | ✅ |
| RASP | `src/pages/Documentation.jsx:79` | `"available"` + desc "UNAUDITED-PROVISIONAL … OS-level pending native plugin + audit" | ✅ |

**Two items previously flagged as drift were verified NOT to be over-claims:**
1. `featureClassification.js` `verdict: 'live'` for `/rasp-security` uses that
   file's own vocabulary (`'live' | 'disabled' | 'cut'` — line 9), meaning the
   route **ships honestly**, *not* the asset-status "live". The note discloses
   UNAUDITED-PROVISIONAL and OS-level-audit-gated.
2. The `"✅ VERIFIED 2026-06-20"` markers on RASP in `Feature-Status.md` /
   `featureClassification.js` follow a **file-wide convention** meaning "UAT
   UI-render confirmed on this date" (used on ~15 unrelated feature lines); each
   RASP instance scopes it explicitly to "browser probe live" and discloses
   `Independent audit: not yet`. Rewriting it for RASP alone would *introduce*
   inconsistency. (RASP's catalogue status remains `'built'`, never `'verified'`,
   and `docs/rasp-validation-roadmap.md:13` notes the §5 honesty-lock structurally
   forbids the surface claiming "active" unless `resolveStatus('RASP') === verified`.)

---

## 1. KEK — hardware key-encryption-key

**Current state:** TARGET / design only. No implementation code. The combine
construction (`KDF(H ‖ C)`), DEK wrapping, per-credential-set salt, and the four
credential paths exist exclusively in `docs/kek-architecture-spec.md`.

**Why it can't drop now:**
- **Gate-on-the-gate:** the PRF-in-WebView spike (`docs/kek-architecture-spec.md`
  §8, `docs/prf-webview-spike-brief.md`) is **UNRESOLVED**. The harness
  (`src/dev/prfSpike.js`, 14/14 unit tests) is BUILT but has **never run on a
  device** — it needs a physical Android device. Building the KEK combine before
  the spike result is recorded risks building against a fiction (spec's own
  warning, §8).
- **Open design question §7:** non-enrolled-PIN handling. Interim mitigation is
  `src/wallet-core/decoyFallback.js` (Option A deterministic decoy) — a
  workaround, not the KEK.
- **Audit line-items §9:** six unreviewed items (combine construction, KDF cost
  for a 6-digit input, non-enrolled PIN, decoy terminus, entry-surface
  indistinguishability, PRF bridge boundary).
- **Load-bearing blocker:** `H-2` (OPEN) — the 6-digit PIN is the sole at-rest
  factor on web; seized ciphertext is offline-brute-forceable (keyspace 10⁶ behind
  Argon2id 192 MiB only). *(note: KDF reverted to 64 MiB post-audit; see commit 1226085e)* The hardware KEK is the named fix. Until it ships **and
  is audited**, web PIN-cohort wallets must not hold mainnet value and must not be
  presented as coercion-resistant.

---

## 2. ACL — OS-enforced biometric binding (M2c / M2d)

**Current state:** PLAN / NOT YET IMPLEMENTED. Only **M2b** shipped — an
app-layer biometric gate (`authenticate()` → then read the Keychain/Keystore
item). The OS-enforced ACL is zero code.

**Why it can't drop now:**
- **No hardware binding exists:** there is no `kSecAttrAccessControl(biometryCurrentSet)`
  on iOS and no `setUserAuthenticationRequired(true)` on Android. The shipped
  plugins do not expose per-item biometric ACL binding; a thin custom Swift +
  Kotlin plugin is the planned path and is **unwritten**
  (`docs/M2cd.native-acl-plan.md`).
- **Honest gap is self-disclosed in code:** `src/wallet-core/keystore/native.js:42-50`
  — in-context code that skips the JS check could read the blob; an OS-ACL would
  make the hardware itself refuse release without a fresh biometric.
- **Four open decisions** before M2c-1 (`M2cd.native-acl-plan.md` §7): accessibility
  class, re-enroll invalidation, lockout fallback, device-access confirmation.
- **Load-bearing blocker:** `§3` (OPEN) — not assessable here; a hard dependency
  for any mobile mainnet scope. Requires real iOS (Secure Enclave) + real Android
  (StrongBox) devices for adversarial testing.

---

## 3. RASP — OS-level runtime detection

**Current state:** the **pre-audit-safe policy lane is BUILT** and shipped —
`src/rasp/{conditions,degrade,detect,index,browserProbe}.js` + send-path wiring
(`detect → degrade → presignGate`, always-on) + full test suite (I3 deniability,
detect/degrade, signing-path, dashboard). The **native detector is zero code**.

**Why it can't drop further now:**
- **Native probe source unbuilt:** root/jailbreak, debugger (Frida/ptrace),
  binary tamper/repackage, emulator detection require a native Capacitor plugin —
  no Swift or Kotlin exists. `detect()` correctly **fails closed** to
  `INTEGRITY_UNAVAILABLE` (never a fabricated `CLEAN`) when no native probe is
  present.
- **Remote attestation leg parked by decision:** `docs/rasp-attestation-egress-decision.md`
  adopts Option A (no remote-attestation egress in v1; Play Integrity / App Attest
  / DeviceCheck deferred), honoring I2/I5.
- **Roadmap Phases 2b–6 not done** (`docs/rasp-validation-roadmap.md`): real-device
  verification (Phase 4) and independent audit (Phase 5) are the only things that
  flip RASP to **VALIDATED**. An emulator green check is explicitly **not** evidence.

---

## 4. The gate — conditions to drop ANY of the three

No status for KEK, ACL, or RASP-native may change from TARGET / PLANNED / BUILT to
a stronger claim until **all four** of the following are satisfied for that layer
and recorded with evidence:

1. **Real-device verification** — exercised on physical iOS (Secure Enclave) and
   Android (StrongBox) hardware. Emulator/simulator green is not evidence.
   (KEK additionally needs the PRF spike resolved on a real device first.)
2. **Adversarial verification** — exercised against a genuinely hostile runtime
   (rooted/jailbroken device, debugger attached, re-packaged binary) per the
   scenario matrix; must not brick legitimate users.
3. **Recovery verification** — the duress / stealth / panic deniability model and
   the non-custodial recovery paths survive intact through enroll, re-enroll,
   biometric invalidation, lockout, and panic-wipe. No new credential/set-existence
   tell is introduced (I3).
4. **Independent third-party audit sign-off** — a human external firm reviews the
   construction. The internal audit does **not** satisfy this and is never
   presented as independent.

Prerequisites that are environment-bound and **cannot be done in this session**:
macOS + Xcode, a physical iPhone with Secure Enclave, a physical Android device
with StrongBox, and an engaged independent auditor.

**Execution checklist for the on-device pass:** `docs/audit-triage/device-test-checklist.md`.

---

## 4a. Open audit items — FLAGGED FOR REVIEW (not fixed)

> Compiled from the existing specs + the status sweep. **These are flags for your
> later review, not verdicts.** Severity is cited **only** where an existing audit
> doc already assigns one; everything else is **"auditor to grade"** — deliberately
> not pre-graded (AI severity grading tends to inflate). Nothing here is fixed,
> started, or status-changed.

| # | Area | Item to review | Type | Severity | Source |
|---|------|----------------|------|----------|--------|
| K1 | KEK | Combine construction `KDF(H ‖ C)` — input/domain separation, salt handling, soundness | design | auditor to grade | `kek-architecture-spec.md` §9 |
| K2 | KEK | DEK-wrap AEAD mode, nonce handling, key-commitment | design | auditor to grade | `kek-architecture-spec.md` §9 |
| K3 | KEK | KDF cost adequacy for a 6-digit input (offline-exhaustibility) | shipped + design | **HIGH** (H-2) | `Internal-Audit-2026-06.md` H-2; `vault.js` |
| K4 | KEK | Non-enrolled-PIN handling; interim Option A decoy | design + shipped | auditor to grade | `kek-architecture-spec.md` §7; `decoyFallback.js` |
| K5 | KEK | Decoy terminus + entry-surface indistinguishability (no oracle/tell) | design | auditor to grade | `kek-architecture-spec.md` §9 |
| K6 | KEK | PRF bridge boundary (PRF→KDF input trust) | design | auditor to grade | `kek-architecture-spec.md` §9 |
| K7 | KEK | **PRF-in-WebView spike UNRESOLVED** — must run on a real Android device before the combine is built | gate-on-gate | blocker | `kek-architecture-spec.md` §8; `prf-webview-spike-brief.md`; `prfSpike.js` |
| A1 | ACL | M2b app-layer gate bypassable by in-context code that skips the JS check | shipped | auditor to grade (self-disclosed) | `native.js:42-50` |
| A2 | ACL | M2c/M2d OS-enforced ACL **unbuilt** — needs custom Swift/Kotlin plugin (shipped plugins lack per-item biometric ACL binding) | unbuilt | **OPEN** (§3) | `M2cd.native-acl-plan.md`; `Internal-Audit-2026-06.md` §3 |
| A3 | ACL | §7 open decisions: accessibility class, re-enroll invalidation, lockout fallback, device-access confirmation | design | auditor to grade | `M2cd.native-acl-plan.md` §7 |
| A4 | ACL | Real-device adversarial test (seized / rooted / jailbroken / debugger-attached) | verification | OPEN (§3) | `Internal-Audit-2026-06.md` §3; `device-test-checklist.md` |
| A5 | ACL | Recovery/deniability interaction with ACL (panic-wipe, duress, seed recovery; no new on-disk tell) | design + verification | auditor to grade | `M2cd.native-acl-plan.md` |
| R1 | RASP | Native probe source **unbuilt** (root/jailbreak/debugger/tamper/emulator) — no Swift/Kotlin exists | unbuilt | auditor to grade | `rasp-validation-roadmap.md` Phase 2b |
| R2 | RASP | Remote-attestation leg parked (Option A, no egress) — confirm v1 scope decision holds | decision | auditor to grade | `rasp-attestation-egress-decision.md` |
| R3 | RASP | Real-device hostile-runtime verification (Phase 4) before any "validated" flip | verification | OPEN | `rasp-validation-roadmap.md` Phase 4 |
| R4 | RASP | Browser probe (`navigator.webdriver` + legacy fp) trivially evadable — confirm disclosure acceptable for v1 | shipped | auditor to grade (disclosed) | `browserProbe.js`; `RaspSecurity.jsx` |
| R5 | RASP | Fail-closed correctness when a real native probe is wired in (no path yields fabricated `CLEAN`) | shipped + future | auditor to grade | `detect.js`; `presign.js` |
| X1 | all | **Independent third-party audit sign-off** — the gate; internal/AI review does not satisfy it | gate | blocker | `CLAUDE.md`; `Audit.scope.md` |

**Disposition for every row above: OPEN — review after.** None fixed in this session.

---

## 4b. Detailed pre-audit findings — INTERNAL agent pass (2026-06-22)

> **WHAT THIS IS:** findings from three read-only internal review agents (one per
> area) run on 2026-06-22. **This is pre-audit AI-assisted input, NOT the
> independent audit.** Severities are the **agents' own grades and are NOT
> ground-truthed** unless a row says **[VERIFIED]** — and AI severity grading is
> known to inflate (see `panic-wipe-residue-gap` lesson). Treat every grade as a
> hypothesis to confirm during review. **Nothing here was fixed or status-changed.**
> The agents made no edits.

### KEK (agent IDs K-1…K-11)

| ID | Agent sev | Type | Finding (confirm before acting) |
|----|-----------|------|----------------------------------|
| K-1 | HIGH | design | `KDF(H ‖ C)` underspecified — KDF primitive, length-prefixing of H/C, output length not fixed; concatenation canonicalization hazard |
| K-2 | HIGH | design | DEK wrap has no key-commitment; AES-GCM (house cipher) non-committing → under Option A, unwrap runs against attacker-influenceable KEKs (partitioning risk) |
| **K-3** | MEDIUM **[VERIFIED]** | shipped+design | **Keyspace drift: spec said 6-digit/10^6 (`kek-architecture-spec.md:70,280`); shipped is 8-digit/10^8 (`PinPad.jsx:32`, `WalletEntry.jsx:48`). §9 cost line-item quantified wrong number by 100×.** H-2 conclusion unchanged (10^8 still offline-exhaustible). **✅ FIXED 2026-06-22 — spec diagram + §9 cost line updated to 8-digit/10^8.** |
| K-4 | HIGH | design | KEK closes H-2 **only if `H` is provably non-exportable** from a seized+rooted device; §8 PRF-in-WebView may force `H` across the JS boundary in clear |
| K-5 | MEDIUM | shipped | Argon2id cost frozen by chaff-parity (`deniabilityUnlock.js`) → KEK adds a factor but cannot raise per-guess cost; `H` becomes single point of failure |
| K-6 | LOW (auditor) | shipped | `decoyFallback.js:90-94` empty-PIN label + seizable `deviceSalt` → empty-PIN decoy recomputable offline; possible Option-A tell |
| K-7 | MEDIUM | shipped | Decoy determinism rests on plaintext `deviceSalt` (opaque key `vx-2c3d4e5f…`); confirm panic-wipe clears the **current** opaque key + legacy (extends C-1) |
| K-8 | LOW | shipped | `PinPad.jsx:63` aria-label broadcasts live PIN length per keystroke (screen-reader / shoulder-surf length oracle) — spec §9-item-5 pre-existing |
| K-9 | MEDIUM | shipped(spike) | PRF spike measures stability, NOT entropy / non-exportability / re-enroll survival / rpId pinning — green spike under-justifies the build |
| K-10 | INFO | shipped(spike) | `prfSpike.js:319` force-sets `prfEnabled=true` on eval → can't distinguish "platform enabled prf" from "lied but get() returned something" |
| K-11 | HIGH (auditor) | design | Re-enroll / rotation could fork `H` per-set: real DEK bricked under old `H` while Option-A decoys still open → funds-loss path + observable tell |

### ACL / native key-at-rest (agent IDs NF-1…NF-11)

| ID | Agent sev | Type | Finding (confirm before acting) |
|----|-----------|------|----------------------------------|
| NF-1 | MEDIUM | shipped | `panic.js` residue list + `inspectKeyMaterial` enumerate web storage only; native `veyrnox_`-prefixed Keychain/Keystore items not covered → post-wipe `clean` can't attest native erase (extends F-02..F-06 to native) |
| NF-2 | HIGH (auditor) | shipped | One-tap cache stores plaintext vault password behind passcode-only accessibility (no Argon2id) → offline extraction bypasses memory-hard KDF. Disclosure was already honest. **✅ HARDENED 2026-06-22 (owner chose "strengthen, keep") — explicit confirm-gate added before enabling one-tap (BiometricUnlockSettings.jsx + 14 tests).** Underlying at-rest downgrade remains until M2c/d OS-ACL ships — auditor still to ratify acceptability |
| NF-3 | HIGH (auditor) | shipped | M2b biometric gate bypassable by in-context code on rooted/jailbroken/debugger device (self-disclosed `native.js:42-50`); biometric not cryptographically load-bearing |
| NF-4 | LOW/INFO | shipped | `isSecureHardwareAvailable()` is a passcode-presence proxy; `keyStore.js` typedef over-promises "Secure Enclave/StrongBox available" |
| NF-5 | LOW | shipped | `changePassword` native re-wrap not crash-atomic (single `set`, no temp+swap) |
| NF-6 | INFO | shipped | Post-lockout biometric silently widens to device-passcode (`allowDeviceCredential:true`) — coercion-model relevant |
| NF-7 | INFO | unbuilt | M2c/M2d entirely unwritten — no bespoke Swift/Kotlin plugin exists (confirmed); construction in plan is standard/correct. Must not be shown as shipped |
| NF-8 | INFO | design | Option-A HW-wrap-the-blob is sound; §7 decisions #1 (accessibility class) + #2 (re-enroll invalidation) are the security-load-bearing ones |
| NF-9 | MEDIUM (auditor) | design | `biometryCurrentSet`/`setInvalidatedByBiometricEnrollment` can brick the single vault item for ALL passwords incl. duress/panic; `wrap` version field a possible new on-disk tell |
| NF-10 | LOW | design | Lazy re-wrap migration window: item HW-unbound until first unlock; don't flip "hardware-bound" UI on build version |
| NF-11 | INFO | n/a | Simulator can't exercise Enclave/StrongBox at all — current "sim build succeeds" proves nothing about HW backing |

### RASP (agent IDs R-01…R-09)

| ID | Agent sev | Type | Finding (confirm before acting) |
|----|-----------|------|----------------------------------|
| R-01 | MEDIUM (honesty) | shipped | EMULATOR copy "testnet stays available" is dead — `permitsTestnet` consumed nowhere; emulator sends are hard-blocked. Fails safe, but copy is false. **✅ FIXED 2026-06-22 — EMULATOR sentence no longer promises testnet; comment marks `permitsTestnet` as unwired TARGET (degrade.js + test).** |
| R-02 | LOW | shipped | Non-EVM (BTC/SOL) sends get no RASP banner (riskVerdict null) but ARE blocked at submit — UI/enforcement divergence, not a bypass |
| R-03 | LOW (honesty) | shipped | Browser probe (`navigator.webdriver` + legacy globals, sampled once at load) trivially evadable by any in-scope adversary; "detection active" reads stronger than it is |
| R-04 | INFO (honesty) | shipped | `RaspSecurity.jsx:81` hard-codes `Wired: yes` not derived from `resolveStatus`; roadmap says it should flip only on real-detector path |
| R-05 | LOW | shipped | i3 test exercises `degrade/detect` with synthetic sources, not the shipped `detect(browserProbeSource)` expression (structural set-blindness holds) |
| R-06 | MEDIUM (honesty) | shipped | WARN copy promised "confirm with biometrics to continue" but `presignGate`/`compose` treat WARN as proceed-allowed with no biometric step enforced by RASP. **✅ FIXED 2026-06-22 — ROOTED + INTEGRITY_UNAVAILABLE WARN copy reworded to drop the unenforced biometric promise; `requiresBiometric` marked unwired TARGET (degrade.js + test).** |
| R-07 | LOW | shipped | `SendCrypto.jsx:556` `?? TIER.ALLOW` is the one non-fail-closed default in the chain (catch makes it practically unreachable) |
| R-08 | INFO | shipped+unbuilt | `INTEGRITY_FAIL` unreachable today (parked 2b) but degrade/UI present it as live — reader can't tell which conditions actually fire |
| R-09 | INFO (no issue) | shipped | `notifyRaspAlert` confirmed in-memory only, no egress (Option A holds) |

**Disposition for every §4b row: OPEN — review after.** None fixed; none verified except **K-3 [VERIFIED]**. The agents flagged R-01 and R-06 (honesty copy) and K-2/K-4/K-11 (KEK construction crux) as the items they'd most want resolved — recorded as their opinion, not a confirmed grade.

---

### §4c — INTERNAL static-analysis pass 2026-06-28 (KEK/RASP-relevant items)

| Finding | Status | Resolution |
|---|---|---|
| H-NEW-A — native.js KEK zeroing (changePassword/enrollKek/unenrollKek) | ✅ FIXED | PR #433 (c8a7f5e) — pre-audit |
| H-NEW-D — iOS HardwareKekPlugin uses Keychain item not Secure Enclave | OPEN / TARGET | Requires Mac + Xcode + SE entitlement; see docs/M2cd.native-acl-plan.md |
| F-01/F-02 — biometric cache not OS-ACL bound (Android: no setInvalidatedByBiometricEnrollment; iOS: cache item not kSecAccessControlBiometryCurrentSet) | OPEN / TARGET | M2c/M2d plan; requires custom Capacitor plugin + real device |
| F-09 — RaspIntegrityPlugin not adversarially tested on rooted/Frida devices | OPEN | Phase 4 roadmap — real device required |
| M-K — passkey assertion counter (signCount) cloned authenticator detection | ✅ BUILT (2026-06-30) | WebAuthn signCount persistence + validation (localStorage, best-effort). Detects cloned/replayed soft authenticators. Device verification gate: real cloned-authenticator test (e.g. iCloud Keychain backup replay). See docs/Feature-Status.md §8a |

Gate conditions in §4 are UNCHANGED. ALLOW_MAINNET stays true.

---

## 5a. Post-2026-06-27 addendum — security hardening PRs merged to `main`

> **WHAT THIS IS:** a record of code-level hardening that landed after this gate doc was
> written. None of these PRs satisfy the gate conditions in §4 — they require real-device
> verification, adversarial verification, and independent audit sign-off which remain OPEN.
> They are incremental defence-in-depth improvements recorded here so the gap between this
> doc and current `main` is auditable.
>
> **Reminder:** "BUILT" = code on main + tests green. Not "verified", not "audited".

### KEK zeroing hardening (H-NEW-4, H-NEW-6) — PR #418

`src/wallet-core/keystore/web.js` `unlock()`, `enrollKek()`, `changePassword()` now wrap the
full KEK/DEK lifetime in `try/finally`. Both `H` (hardware factor) and the derived KEK are
zeroed on every code path — including when `unwrapDek` or `wrapDek` throws. `changePassword`
previously held an `H2 = H.slice()` copy across two `combineKek` calls; both `H2` and `newC`
are now zeroed in `finally`. Defence-in-depth over `combineKek`'s own in-place zeroing (which
was already implemented). **Status: BUILT.** Gate conditions in §4 unchanged; this is a
belt-and-suspenders improvement, not a gate drop.

**Impact on K4 (PRF/H exportability):** H zeroing reduces the window a seized+rooted device
has to read `H` from JS heap. It does NOT close the exportability concern — that remains an
open audit item requiring real-device adversarial verification. The gate still holds.

### Biometric ACL gap — honest-documented (H-NEW-5) — PR #420

`@aparajita/capacitor-secure-storage` does **NOT** call `setInvalidatedByBiometricEnrollment(true)`.
A new biometric enrolment therefore does **not** invalidate the cached PIN. This was documented
as HONEST-DISABLED: the gap is clearly disclosed in code comments and the audit record. A
drop-in replacement plugin with proper ACL binding is the TARGET fix; it requires real-device
verification and cannot be confirmed in JS. **Status: HONEST-DISABLED (gap recorded, not closed).**

This finding is consistent with NF-9 in §4b above. The gap is now formally recorded in
`docs/audit-2026-06-27-unvalidated-claims.md` (H-NEW-5, 2026-06-27 independent review).

### KEK honest naming sweep (H14/H15/H16) — PR #414

`isKekEnrolled`, `biometricUnlockUsesKek`, `hasHardwareFactor` renamed. Names previously
implied a hardware guarantee for what is (on web/M2b) a software-layer KEK. `isSecureHardwareAvailable()`
is the honest gate that returns `true` only when OS-enforced ACL is actually present.

**Impact on NF-4 (`isSecureHardwareAvailable()` as passcode proxy, §4b):** the rename does
not fix the underlying OS-ACL gap but eliminates the names that were the source of over-claim.
The finding in the §4b table is partially addressed at the naming level; the substance (no
real OS-enforced ACL) is unchanged and the gate in §4 still holds.

### Web vault password minimum (H-A) — PR #424

`validateWebVaultPassword()` enforces a 12-character minimum for web vault creation on mainnet
builds (`ALLOW_MAINNET = true`). This raises the effective keyspace for the offline-brute-force
scenario (H-2) from 8-digit PIN (10^8 / Argon2id 192 MiB) *(note: KDF reverted to 64 MiB post-audit; see commit 1226085e)* to a ≥12-character password.

**Impact on H-2 (K3 / sole at-rest factor):** this is a **partial defence-in-depth mitigation**
of H-2. A 12-character user-chosen password is still exhaustible offline with sufficient compute
(quality depends on entropy, not just length). H-2 **remains OPEN** — the hardware-bound KEK
(binding to a non-exportable `H` factor from the secure element) is still the named long-term
fix. H-A raises the bar without closing the finding. Gate conditions in §4 unchanged.

### android-release CI job — PR #421

`.github/workflows/ci.yml` now includes an `android-release` job that runs on every `main`
push after `verify` passes: `npx cap sync android` + `./gradlew assembleRelease -PRELEASE_CERT_SHA256`
(cert hash injected from CI secret). The signed APK is uploaded as a 30-day CI artifact.
Scope: CI build automation. Does not affect the gate conditions in §4 (which are about
real-device verification, not CI build).

---

## 5. Cross-references

- KEK design + open questions: `docs/kek-architecture-spec.md` (§7, §8, §9)
- PRF spike brief: `docs/prf-webview-spike-brief.md`; harness `src/dev/prfSpike.js`
- ACL plan: `docs/M2cd.native-acl-plan.md`; shipped M2b notes `docs/M2b.native-keystore-notes.md`
- RASP roadmap: `docs/rasp-validation-roadmap.md`; egress decision `docs/rasp-attestation-egress-decision.md`
- OPEN blockers: `docs/Internal-Audit-2026-06.md` (H-2, §3)
- Accepted known item: `docs/audit-triage/ai-review-2026-06-19-unaudited-features.md` (F-16)
- Native session task order + prerequisites: `docs/native-session-handoff.md`
- Audit scope (internal ≠ independent): `docs/Audit.scope.md`; policy `CLAUDE.md`
