# Design decision: Audit Log & Login Activity vs. deniability (I3)

**Status:** PRE-AUDIT · surface state **HONEST-DISABLED** (Audit Log not surfaced; Login Activity deferred).
**Update (PR #72 — supersedes "before any code"):** a *conservative* LOCAL primitive now exists — `src/wallet-core/auditLog.js`: OFF by default, stored in-vault under a neutral byte-shaped blob, with a hard in-code denylist that refuses every duress/stealth/hidden/panic/decoy/seed event and logs only benign `{type, ts}`. It is **unwired and not surfaced.** That route is deliberately *narrower* than the D1–D7 construction sketched below — it avoids the I3 hazard by refusing to log sensitive events at all, rather than by the per-vault-scoped storage shape. The D1–D7 storage shape (§4 sub-decision #1) and any wiring remain **audit-gated**; nothing is surfaced.
**Owner:** Al · **Reviewer (required):** independent audit
**Framing:** PRE-AUDIT.
**Cross-refs:** `docs/Security.roadmap.md` (S4 → Audit Log) · `docs/Feature-Status.md` · surfacing guard: `src/lib/__tests__/featureCatalogue.test.js`.

---

## 1. The problem in one sentence

An audit log and a login-activity record are, by default, **persistent metadata trails** — and a metadata trail that can prove a hidden wallet-set exists, or that a duress/panic credential was used, is a direct violation of **I3 (deniability is sacred)**.

Deniability currently holds *precisely because* `stealth.js` / `duress.js` carry **no `walletMeta` writes** — the metadata residual is visible-set-only. An audit log is a `walletMeta` write by another name. This decision exists so we don't erode I3 one well-intentioned log line at a time.

## 2. Why "just log it" fails

Standard implementations break invariants in specific ways:

| Feature | Naive implementation | Invariant broken | Concrete attack |
|---|---|---|---|
| Audit Log | Global log of unlock / access / send events across all sets | **I3** | Forensic capture of the device shows entries that only make sense if ≥2 wallet-sets exist → proves a hidden set → defeats deniability. |
| Audit Log | Single encrypted log unlocked by *any* credential | **I3** | Duress unlock can now read the *real* set's history → coercion yields the secret. |
| Login Activity | Record of unlock attempts incl. which credential / failures | **I3, I4** | "3 failed PINs, then success at 14:02, then a different success at 14:05" tells a coercer there's a second credential worth beating out of you. |
| Login Activity | Timestamps surviving to disk unencrypted | **I2-adjacent** | Even without content, attempt timing leaks usage patterns. |

The throughline: **logs are state, state has a footprint, and a footprint that distinguishes real-vs-decoy is the one thing the product must never produce.**

## 3. Hard constraints (any acceptable design must satisfy ALL)

- **D1 — Per-vault scoping.** Each wallet-set has its own log, encrypted under *that set's* unlocking credential. No shared/global log. The real set's log is unreadable with the duress credential, and vice versa. (This is the same structural property that makes `stealth.js`/`duress.js` safe.)
- **D2 — Structural indistinguishability.** The decoy's log must look like a complete, ordinary, modestly-active history. An attacker who unlocks the decoy sees a plausible full log and has **no signal** that another log exists. No "empty/locked region," no size tell, no "encrypted blob you can't open" sitting next to the readable one.
- **D3 — No cross-set events, ever.** A log may only contain events the *unlocking set itself* would honestly have generated. A duress unlock never records "real set was accessed earlier." Login Activity for the decoy shows only the decoy's own unlocks.
- **D4 — No credential-type disclosure.** A log entry must not record *which kind* of credential unlocked (real / duress / biometric-vs-PIN). It records "unlocked," not "unlocked via duress PIN." Recording the type is a coercion-evidence trail (see §2).
- **D5 — Fail closed (I4).** If the log can't be written or decrypted honestly, the operation fails honest — it does not fall back to a plaintext or global log.
- **D6 — Panic-path consistency.** A wipe/panic credential's destruction must leave no log entry that betrays that a wipe occurred against a *different* set. Post-wipe, the device must be indistinguishable from one that simply never had that set.
- **D7 — No size/existence oracle.** Total on-disk footprint must not scale visibly with number of sets in a way an attacker can measure. (Pad / fixed-region strategy is a sub-decision below.)

## 4. The open sub-decisions (these are the actual choices)

1. **Storage shape.** Per-set encrypted log file vs. a single padded fixed-size region partitioned by credential-derived keys. The fixed-region approach better satisfies D7 (no size oracle) but is harder to get right and is **exactly the kind of construction that must not be hand-rolled** — flag as audit line-item (same posture as the R2 capability-proof construction).
2. **Retention.** Ring buffer (last N events) vs. full history. Full history grows the footprint (D7 tension) and lengthens the coercion-evidence window. Recommend bounded ring buffer.
3. **Does Login Activity even earn its place?** It is the higher-risk, lower-value of the two. A wallet that shows "your last logins" buys marginal user reassurance at real deniability cost. **Recommendation: defer Login Activity entirely** unless a concrete user-security need (not feature parity) justifies it. Audit Log, scoped per D1–D7, is the more defensible of the two.

## 5. Recommended posture

- **Login Activity:** remain **HONEST-DISABLED**. Do not build for parity. Revisit only with a named user-security justification.
- **Audit Log:** may proceed to *design* under D1–D7, but **no implementation before the independent audit reviews the storage-shape construction** (sub-decision #1). On any build, ship as **UNAUDITED-PROVISIONAL** — and unlike a funds bug, a logging bug here doesn't lose money, it loses someone's plausible deniability under coercion. That asymmetry is why this one waits for the auditor.
- **Status note (PR #72 interim):** the conservative primitive described in the header is the interim posture — denylist + benign-events-only, **unwired, unsurfaced.** It does **not** implement the D1–D7 storage shape (sub-decision #1), and its existence does **not** lift the audit gate: no wiring into call sites and no catalogue surfacing until the auditor reviews the construction. The catalogue surfacing guard (`featureCatalogue.test.js`) enforces the "not surfaced" half.

## Owner override — primary-session wiring landed PRE-AUDIT (2026-06-16)

**This is an explicit, documented decision by the owner to wire the audit log before the
independent audit — NOT a sign the audit cleared.** It is recorded here so the override is
auditable and not mistaken for audit sign-off.

- **What was lifted:** §5's "no wiring into call sites until the auditor reviews the construction"
  and the zero-importer half of the `audit-log-honest-disabled.test.js` guard. The owner chose to
  wire the primitive's primary-session path now.
- **What was NOT lifted (still gated / still honest-disabled):**
  - **Surfacing.** No UI toggle, no page/route; the `featureCatalogue.test.js` guard still enforces
    "not surfaced." In shipped builds nothing logs unless a user manually sets the `veyrnox-audit-log`
    localStorage pref.
  - **The D1–D7 multi-set storage shape** (sub-decision #1) is NOT built. Logging is **primary-session
    only** and **hard-off in decoy/hidden** (`auditSecretForSession` returns null there), so the
    real-vs-decoy distinguisher hazard the auditor was to review is **never introduced** by this change.
  - **The hard denylist** (duress/stealth/hidden/panic/decoy/seed) is intact.
- **How the guard changed (not deleted):** `audit-log-honest-disabled.test.js` now permits exactly ONE
  approved importer — `lib/WalletProvider.jsx`, which owns the gated `recordAudit(type)` entry. Call
  sites reach the log only through that provider, never by importing `auditLog.js` directly. Routes/pages
  remain forbidden. Widening the approved-wirer set is itself a deliberate decision.
- **Residual risk accepted by the owner:** per §5, a logging bug here costs plausible deniability rather
  than funds. The narrowing above (primary-only, decoy/hidden-off, unsurfaced, no multi-set shape) keeps
  the residual surface small, but this path has **not** had the independent review §5 called for. Status
  stays **BUILT / UNAUDITED-PROVISIONAL**; the multi-set storage shape + surfacing still require the audit.

## 6. What this is really telling you

The roadmap line "Audit Log ❌ / Login Activity ❌" flattens a security distinction: two of the four MONITORING items are on-device primitives (RASP, Risk Scoring) and two are metadata-logging hazards. Both logging features point at the same gate — the audit. That's not a coincidence to engineer around; it's a signal that **the audit is the unblock**, not more building.
