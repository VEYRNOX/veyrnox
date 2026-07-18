---
description: Produce a single-page planning canvas for a feature or change — intent, non-goals, users, constraints, invariants touched, risks, honest scope, test slice, and step-by-step. Written to docs/superpowers/plans/ under today's date.
argument-hint: <thing to plan — feature name or change>
---

# plan-canvas — one-page planning artifact

Plan: **$ARGUMENTS**

## 1. Recon
Dispatch `veyrnox-recon` (or a short read-only pass) to gather: existing entry points,
tests, feature-status row, security invariants that will be touched.

## 2. Fill the canvas
Write a file at `docs/superpowers/plans/YYYY-MM-DD-<slug>.md` with EXACTLY these sections
(no more, no less):

```
# <feature/change>

## Intent (1 paragraph)
What outcome. For whom. Why now.

## Non-goals
Bullets. What this deliberately does NOT do.

## Users & flows
Who touches this, and the shortest end-to-end path each does.

## Constraints
Compile-time flags, platforms, mainnet/testnet posture, KDF cost, storage keys, protocol versions.

## Security invariants touched
I1 / I2 / I3 / I4 / I5 / I6 — mark which apply and how the plan preserves each. Fail-closed
posture for each control.

## Risks & mitigations
Table: risk → likelihood → mitigation → owner.

## Honest scope
BUILT vs TARGET vs PLANNED vs HONEST-DISABLED. What would be required to promote each
step to device-verified / independently audited.

## Test slice
- RED tests to write first (TDD).
- Which files they live in.
- Any device-verification runbook this plan depends on.

## Steps
Numbered. One moving part per step. Each step lists the agent that owns it
(veyrnox-security-tdd / veyrnox-ui / veyrnox-ci / veyrnox-docs).

## Exit criteria
The specific, checkable set of conditions that mean this plan is done.
```

## 3. Do NOT implement
This command produces the canvas only. Handoff to `/orch-add-feature` or
`/orch-change-feature` is a separate, explicit step. Never mark anything "verified" in the
canvas.
