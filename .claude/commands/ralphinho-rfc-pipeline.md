---
description: RFC-first pipeline — draft an RFC for a non-trivial change, get an adversarial second-model review of the RFC (not the code), incorporate the review, then hand off to /plan-canvas and /orch-add-feature. Prevents "build first, discover the design bug at review time".
argument-hint: <change name and one-paragraph pitch>
---

# ralphinho-rfc-pipeline — RFC → adversarial review → plan → build

RFC subject: **$ARGUMENTS**

## 1. Draft the RFC
Create `docs/rfcs/YYYY-MM-DD-<slug>.md` with these sections:

```
# RFC: <title>

## Status
Draft | Under review | Accepted | Rejected | Superseded-by

## Summary
One paragraph. What is being proposed. Who wants it. Why now.

## Motivation
The problem in the current design. Include file:line evidence where possible.

## Proposed design
Enough detail that a skeptic could find a hole. Not code — architecture + invariants +
data flow + platform matrix.

## Alternatives considered
At least two. State why each was rejected.

## Compatibility & migration
Existing vaults / storage / entitlements / protocol versions. How installed users upgrade.
Fail-closed on malformed input.

## Invariants preserved
I1–I6 checklist. Explicit for each.

## Open questions
Numbered. Each blocks acceptance.

## Rollout plan
Behind a flag? Which platforms first? How is it observed in production?
```

## 2. Adversarial second-model review of the RFC (not the code)
Run:
```
codex review "You are an adversarial RFC reviewer for the Veyrnox self-custody wallet.
Read docs/rfcs/YYYY-MM-DD-<slug>.md. Do NOT implement anything. Find design-level
weaknesses only:
- Invariant violations (I1 keys never leave device, I2 no silent egress, I3 deniability
  zero-egress, I4 fail closed, I5 backend untrusted, I6 hardware binding).
- Missing migration / fail-closed path.
- Over-scoped changes (feature creep, premature abstraction).
- Any claim of 'verified' or 'independent' that isn't backed by evidence.
- Any threat-model gap.
Return findings tagged [P1] (blocks acceptance) and [P2] (advisory)."
```
Codex is INTERNAL — never present its review as the outstanding independent third-party
audit.

## 3. Incorporate the review
- Address every `[P1]` in the RFC. Either fix the design or note the residual and why
  it's accepted.
- Update the RFC status to **Accepted** only after all P1s are resolved. If the RFC has
  to be rejected, mark it **Rejected** and stop — do NOT proceed to implementation.

## 4. Handoff
- Run `/plan-canvas <slug>` to turn the accepted RFC into an implementation plan.
- Then `/orch-add-feature` (new) or `/orch-change-feature` (delta) to execute.
- The RFC file is the record — link it from `docs/Feature-Status.md`.
