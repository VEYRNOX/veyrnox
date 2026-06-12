# Design decision: Audit Log & Login Activity vs. deniability (I3)

**Status:** DECISION MADE (owner) — both features are **APPROVED-FOR-BUILD**, conditional on D1–D7 and the auditor gate in §5. Ship tier on any build: **UNAUDITED-PROVISIONAL** (caveat non-droppable until independent audit reviews storage shape).
**Owner:** Al · **Reviewer (required, not waived):** independent audit
**Framing:** PRE-AUDIT.
**Supersedes:** the prior HONEST-DISABLED / defer-Login-Activity posture (preserved in §7 for provenance). This is a deliberate reversal by the owner, recorded here so the change is in the diff-able source of truth rather than carried as an informal note.

---

## 0. What changed and why (the reversal, stated honestly)

The prior version of this doc held both features at HONEST-DISABLED: Audit Log gated behind the auditor, Login Activity recommended for outright deferral as the higher-risk / lower-value of the two. The owner has decided **both will be enabled and surfaced in the Security menu.**

This doc now records that decision. It does **not** delete the constraints that made the features hazardous — those constraints become **binding implementation conditions**, not reasons to defer. The distinction matters: "enabled" here means "approved to build under D1–D7 and shipped UNAUDITED-PROVISIONAL," **not** "ships free of the auditor review." The one thing the owner has *not* waived, and cannot waive without changing the product's security claim, is the §5 auditor gate on the storage-shape construction. Enabling the feature and hand-rolling its storage are two different decisions; only the first has been made.

**Honest flag retained in-doc:** Login Activity remains the higher-risk, lower-value feature (§2, §4.3). It is being enabled by owner decision, not because a named user-security need was established. If a build slips on D3/D4, this is the feature that converts a logging bug into a coercion-evidence trail. That risk is now *accepted and managed under D1–D7*, not avoided — which is a legitimate owner call, but it is the riskier of the two paths and is recorded as such.

---

## 1. The problem in one sentence

An audit log and a login-activity record are, by default, **persistent metadata trails** — and a metadata trail that can prove a hidden wallet-set exists, or that a duress/panic credential was used, is a direct violation of **I3 (deniability is sacred)**.

Deniability holds *precisely because* `stealth.js` / `duress.js` carry **no `walletMeta` writes** — the metadata residual is visible-set-only. An audit log is a `walletMeta` write by another name. Enabling these features does not relax that fact; it means the implementation must reproduce the `stealth.js`/`duress.js` property (per-set, credential-derived, no cross-set residual) rather than log naively.

## 2. Why "just log it" fails (still true — these are the failure modes the build must avoid)

| Feature | Naive implementation | Invariant broken | Concrete attack |
|---|---|---|---|
| Audit Log | Global log of unlock / access / send events across all sets | **I3** | Forensic capture of the device shows entries that only make sense if ≥2 wallet-sets exist → proves a hidden set → defeats deniability. |
| Audit Log | Single encrypted log unlocked by *any* credential | **I3** | Duress unlock can now read the *real* set's history → coercion yields the secret. |
| Login Activity | Record of unlock attempts incl. which credential / failures | **I3, I4** | "3 failed PINs, then success at 14:02, then a different success at 14:05" tells a coercer there's a second credential worth beating out of you. |
| Login Activity | Timestamps surviving to disk unencrypted | **I2-adjacent** | Even without content, attempt timing leaks usage patterns. |

The throughline, unchanged: **logs are state, state has a footprint, and a footprint that distinguishes real-vs-decoy is the one thing the product must never produce.** Enabling the feature means engineering *around* every row of this table, not past it.

## 3. Hard constraints (BINDING — any build must satisfy ALL)

These were "constraints any acceptable design must satisfy." With the features now approved for build, they are the **acceptance criteria**. A build that fails any D-constraint does not ship.

- **D1 — Per-vault scoping.** Each wallet-set has its own log, encrypted under *that set's* unlocking credential. No shared/global log. The real set's log is unreadable with the duress credential, and vice versa.
- **D2 — Structural indistinguishability.** The decoy's log must look like a complete, ordinary, modestly-active history. An attacker who unlocks the decoy sees a plausible full log and has **no signal** that another log exists. No empty/locked region, no size tell, no unopenable blob beside the readable one.
- **D3 — No cross-set events, ever.** A log contains only events the *unlocking set itself* would honestly have generated. A duress unlock never records "real set was accessed earlier."
- **D4 — No credential-type disclosure.** A log entry records "unlocked," never "unlocked via duress PIN." No real/duress/biometric-vs-PIN type in any entry.
- **D5 — Fail closed (I4).** If the log can't be written or decrypted honestly, the operation fails honest — never a plaintext or global fallback.
- **D6 — Panic-path consistency.** A wipe/panic credential leaves no entry betraying that a wipe occurred against a *different* set. Post-wipe, the device is indistinguishable from one that never had that set.
- **D7 — No size/existence oracle.** Total on-disk footprint must not scale visibly with number of sets in a measurable way. (Storage-shape sub-decision below.)

**UI corollary (from the Security-menu work):** the Security menu row may be present on every device (capability ≠ usage). The feature's own screen must not display a readable enabled-state or which credential's log is being shown — same "action, not status" rule applied to Duress PIN and Biometric target. A coercer opening the feature must not be able to read, from its state, that a second set exists.

## 4. Sub-decisions (now scoped as build tasks, not blockers)

1. **Storage shape.** Per-set encrypted log file vs. a single padded fixed-size region partitioned by credential-derived keys. Fixed-region better satisfies D7 but is **exactly the construction that must not be hand-rolled** — **audit line-item** (same posture as the R2 capability-proof and the request-signing construction). *This is the §5 gate. Enabling the feature does not authorise hand-rolling this.*
2. **Retention.** Bounded ring buffer (recommended) vs. full history. Full history grows footprint (D7 tension) and lengthens the coercion-evidence window. **Decision: bounded ring buffer** unless the owner records a reason otherwise.
3. **Login Activity scope.** Now enabled by owner decision. To hold D3/D4 it shows **only the active set's own unlocks**, records no credential type, and no failed-attempt detail that implies a second credential. If it cannot meet D3/D4 in build, it fails closed (shows nothing) rather than degrading to a leaky log.

## 5. Posture (revised)

- **Audit Log:** APPROVED-FOR-BUILD under D1–D7. Proceed to design and implementation of everything *except* the storage-shape construction, which **still requires the independent audit to review before it ships** (§4.1). May be exercised behind a flag pre-audit; ships UNAUDITED-PROVISIONAL.
- **Login Activity:** APPROVED-FOR-BUILD under D1–D7 and §4.3. Higher-risk; build must demonstrate D3/D4 with negative tests (a duress unlock produces no entry distinguishable from a real unlock; no credential-type ever recorded) before merge.
- **The auditor gate is not waived.** A logging bug here doesn't lose money — it loses someone's plausible deniability under coercion. That asymmetry is why the storage-shape construction waits for the auditor even though the feature is approved. Enabling the feature brought the audit *onto the critical path for this feature*; it did not remove it.

## 6. Tests that gate merge (deniability, not just function)

- Duress unlock → log entry (if any) is byte-indistinguishable from a real unlock's entry. No type field.
- Decoy set's log reads as a complete, plausible history; no signal of a second log's existence (D2).
- Device on-disk footprint identical between a one-set and a two-set device (D7).
- Panic/wipe leaves no residual entry referencing the destroyed set (D6).
- Fail-closed: corrupt/undecryptable log → operation fails honest, no plaintext/global fallback (D5).

## 7. Provenance — prior posture (superseded, retained for the record)

The prior version recommended: **Login Activity — remain HONEST-DISABLED, do not build for parity, revisit only with a named user-security justification; Audit Log — design only, no implementation before audit reviews storage shape.** It read the roadmap line "Audit Log ❌ / Login Activity ❌" as a signal that *the audit is the unblock, not more building.* That reading is preserved here intentionally: the owner has chosen to build, and §5 keeps the one piece of that reasoning that still binds — the auditor gate on storage shape.

---

*All statuses PRE-AUDIT. "Code-ready ≠ verified": these features are verified only when the storage-shape construction has passed independent audit, not when the unit tests are green.*
