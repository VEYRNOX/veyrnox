---
description: Orchestrate a defect fix — reproduce, root-cause via veyrnox-recon, write a failing regression test (TDD RED), fix minimally, honest-review, and confirm the RED test now GREEN.
argument-hint: <defect: symptom + how to reproduce; include any PR/issue number>
---

# orch-fix-defect — defect-fix pipeline (strict TDD)

Fix defect: **$ARGUMENTS**

## 0. Fetch main first (retro rule)
```
git fetch origin main && git log origin/main --oneline -15
```
Scan the titles for the symptom — main moves fast and the defect may already be fixed
(per the 2026-07-06 retro in CLAUDE.md). If it is, stop and tell the user.

## 1. Reproduce
- Reproduce the defect deterministically (unit test, e2e, or step-by-step device repro).
- If it cannot be reproduced, invoke `superpowers:systematic-debugging` — do NOT patch a
  hunch.

## 2. Root cause
Dispatch `veyrnox-recon` to trace the defect to its origin file:line. Report the root
cause BEFORE proposing a fix. No speculative fixes.

## 3. Write the failing test FIRST (TDD RED)
- The regression test lives alongside the code it protects.
- Run it: it must FAIL for the diagnosed reason (not for a syntax error).
- Only then proceed.

## 4. Minimum fix
- Security-sensitive → `veyrnox-security-tdd`.
- UI → `veyrnox-ui`.
- CI/build → `veyrnox-ci`.
- No refactoring. No adjacent cleanup. Fix the bug and stop (per CLAUDE.md).

## 5. Confirm GREEN + no regressions
- The RED test now passes.
- The targeted suite still passes.
- Lint clean on touched files.

## 6. Honest review + docs
- `veyrnox-honest-reviewer` on the diff.
- If the fix corrects a claim in `docs/Feature-Status.md` or `CLAUDE.md`, dispatch
  `veyrnox-docs` to sync — never leave a stale "verified" or "device-verified" claim
  standing.
