# H2 Threat-Model Decision — RESOLVED

**Date:** 2026-06-30  
**Decision:** **OPTION A** — Decoy wallet WITH second factor (PIN + Action Password / Passkey / Face ID)  
**Decided By:** Owner (2026-06-30)  
**Status:** IMPLEMENTATION READY (storage landed, enforcement to be wired)  
**Audit Gate:** §24 SATISFIED — both audits complete. This was a design call, now resolved.  
**Next Step:** Implement UI + enforcement wiring (estimated 2–3 hours)

---

## The Question

**Should a decoy wallet carry a second factor (2FA)?**

The technical implementation is ready. The blocking question is **design intent.**

---

## Context

### What We Have (Landed in Commits)

- ✅ **Storage shape:** decoy/hidden wallets now wrap the seed in a fixed-length multi-vault container (`makeContainer` / `serializeContainer`)
- ✅ **Chaff-length parity:** every slot (real, decoy, chaff) is byte-identical in length — no distinguisher
- ✅ **Action Password per-set:** the container can carry an Action Password record per wallet (decoy/hidden/real all independent)
- ✅ **Enforcement wiring exists:** primary set's 2FA enforcement in `twoFactorGate.js` is complete

### What's Missing (2–3 hour job once decided)

- UI to collect Action Password for decoy/hidden setup
- Enforcement wiring in `twoFactorGate.js` to check the unlocked container for per-set Action Password
- Tests (straightforward, follows primary-set pattern)

---

## Option A: Decoy WITH Second Factor

**PIN + Action Password** (or PIN + Passkey/Face ID) for decoy wallet.

**Pros:**
- Defense-in-depth: even if coercer knows the PIN, second factor slows an attack
- Consistent with primary-set security posture
- Audit-friendly (symmetric model)
- User can choose via Settings toggle (gives agency)

**Cons:**
- **Friction under coercion:** a coercer can force BOTH PIN and password, defeating the decoy's purpose
- Complicates UX (two factors to remember for a decoy)
- Breaks the "frictionless plausibly-deniable wallet" guarantee

**Threat model impact:**
- Primary concern: a sophisticated adversary (border, law enforcement) can compel the second factor just like the first
- The decoy's real value is **plausible deniability**, not "unbreakable under torture"

---

## Option B: Decoy WITHOUT Second Factor

**PIN only** for decoy wallet. No Action Password 2FA in decoy setup.

**Pros:**
- **Frictionless under coercion:** single factor makes the decoy truly usable while threatened
- Matches the deniability design intent (coercer can't distinguish decoy setup from real-wallet setup, but once unlocked, PIN-only wallet is faster to use)
- Simpler UX
- Honest about the threat model: a coercer with your PIN can access your decoy; the protection is that they don't know it's a decoy

**Cons:**
- Weaker defense-in-depth on the decoy (if compromised, attacker gets in with one factor)
- Asymmetry with primary wallet (may feel inconsistent)
- Audit may flag as "unequal protection"

**Threat model impact:**
- Primary defense: plausible deniability (is it real or decoy?), not security strength
- If coercer is already compelling you, they're already past the deniability boundary
- Second factor adds complexity without actually blocking a determined attacker

---

## Option C: HONEST-DISABLED (Defer Decision)

Mark H2 as **HONEST-DISABLED** in Feature-Status.md with a note: *"Per-set Action Password 2FA parity deferred pending threat-model design decision (frictionless-under-coercion vs. defense-in-depth). Storage groundwork complete. See docs/h2-threat-model-decision-required.md."*

**Pros:**
- No implementation until the design call is made
- Honest: the feature is **designed and buildable**, just not built (clear why)
- Buys time for more thought/user research

**Cons:**
- Leaves a feature incomplete
- Delays a straightforward 2–3 hour job
- Requires a follow-up decision anyway

---

## Recommendation (Not Binding)

**Go with Option B (decoy without second factor)** because:

1. **Matches deniability intent:** a decoy under coercion should be frictionless, not a security stronghold
2. **Honest about threat model:** if coercer has the PIN, they're already past the deniability boundary; second factor doesn't help
3. **Simpler implementation:** PIN-only decoy follows the pattern more cleanly
4. **User expectation:** "decoy" = fast escape route, not "second vault with equal protection"

But **this is your design call.** The audit is done; the technical choice is yours.

---

## Next Steps

**Choose one:**

1. **Option A**: Reply "go with decoy 2FA" → next session implements UI + enforcement + tests (3 hours)
2. **Option B**: Reply "go without decoy 2FA" → next session documents the decision + tests the decoy-only path (1 hour)
3. **Option C**: Reply "defer & mark HONEST-DISABLED" → documents blocker, revisits later

**Once decided:** next session can land it in 1–3 hours.

---

## Related Docs

- `docs/vault-auth-architecture-brief.md` §6b — full deniability model + both threat angles
- `docs/Feature-Status.md` §6 (H2 section) — current status + what's landed
- `docs/audit-triage/h2-decoy-hidden-2fa-parity.md` — detailed audit gate reasoning

---

**Owner decision required.** Everything else is ready.
