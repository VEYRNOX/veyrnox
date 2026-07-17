---
description: Orchestrate adding a new feature end-to-end — brainstorm → plan → recon → TDD implement → honest review → codex second-pass → verify. Enforces Veyrnox status tags and never marks anything "verified" without a real on-chain txid.
argument-hint: <feature name and 1–2 sentence intent>
---

# orch-add-feature — new feature pipeline

Orchestrate adding: **$ARGUMENTS**

## 1. Frame the intent
- If the intent is vague, invoke the `superpowers:brainstorming` skill to sharpen scope
  before any code work. Do NOT skip when the ask is under-specified.
- Restate the user's intent in one paragraph. List explicit non-goals.
- Confirm: is this BUILT / TARGET / PLANNED / HONEST-DISABLED per Veyrnox status-tag rules?
  A new feature typically starts BUILT (code + unit tests) or TARGET (design only).

## 2. Recon
Dispatch `veyrnox-recon` read-only over the surface area this feature touches. Produce a
findings report with `file:line` references. NO changes yet.

## 3. Plan
Invoke `superpowers:writing-plans` to produce a plan document under `docs/superpowers/plans/`.
The plan must state: files touched, security invariants involved (I1–I6), tests to write
first (TDD RED), acceptance criteria, and the honest scope (what will be BUILT vs what
requires device verification / independent audit).

## 4. Fan out implementers — ONE agent per independent file/subarea, in a SINGLE message
- UI / a11y / design-system → `veyrnox-ui` (must preview-verify)
- wallet-core / signing / auth / risk / gating → `veyrnox-security-tdd` (strict TDD, RED before GREEN)
- CI / build / release plumbing → `veyrnox-ci`
- Never let two parallel agents edit the same file.

## 5. Honest review
Dispatch `veyrnox-honest-reviewer` on the combined diff. Fix P1/P2 findings before proceeding.
Re-review until clean.

## 6. Codex second-pass (security-sensitive features only)
If the feature touches keys / seed / signing / auth / deniability / RASP / KEK / IAP:
run `/codex-security-review` and gate on `[P1]` findings.

## 7. Docs sync
Dispatch `veyrnox-docs` to update `docs/Feature-Status.md` (with correct status tag) and
`CLAUDE.md` if a hard rule changed. Never overstate: BUILT ≠ verified.

## 8. Verify
Run lint + targeted tests; preview-verify UI changes; for native features, capture device
evidence per the runbooks. Report:
- what landed (with PRs / commits)
- what was deliberately LEFT (with the reason)
- the exact status tag (BUILT / TARGET / …)
- what would be required to promote to device-verified / independent-audit

**Never** write "verified" without a real explorer-confirmed on-chain txid the user supplies.
