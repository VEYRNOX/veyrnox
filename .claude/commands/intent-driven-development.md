---
description: Start from user intent, derive testable acceptance criteria, write those tests first (RED), then implement the minimum code to reach GREEN. Behavior specified by tests, not by prose.
argument-hint: <user intent — one sentence, from the user's perspective, e.g. "I want to enroll hardware KEK from Security Settings on my Android phone">
---

# intent-driven-development — intent → acceptance tests → code

Intent: **$ARGUMENTS**

## 1. Clarify intent (do NOT skip)
Restate the intent as: **"As a <role>, I want <capability> so that <outcome>."** If any of
the three slots is unknown, ask the user ONE clarifying question before proceeding — do
not guess role/outcome.

## 2. Derive acceptance criteria
Produce a short, unambiguous, testable list — Given/When/Then form. Each criterion must:
- Be observable from outside the code (UI, on-chain, storage state, network call absence).
- Reference at least one Veyrnox invariant it must preserve (I1–I6) OR explicitly note
  "no invariants touched".
- Be checkable by a single test.

## 3. Write the tests FIRST
- One test per criterion. Prefer the layer closest to the criterion (unit if pure logic,
  component if UI, e2e if flow).
- Run them. They must FAIL (RED) for the right reason (not a syntax / import error).
- Do NOT write implementation code yet. If tempting, that's a signal to sharpen the test.

## 4. Implement to GREEN
- Security-sensitive → `veyrnox-security-tdd` (strict TDD).
- UI → `veyrnox-ui`.
- CI / build → `veyrnox-ci`.
- Minimum code to pass. No adjacent refactors, no "just also fix this" (per CLAUDE.md).

## 5. Honest review + docs
- `veyrnox-honest-reviewer` on the diff.
- `veyrnox-docs` for Feature-Status. Status tag is BUILT at most — passing tests are
  never "verified".

## 6. Verify
- All acceptance tests pass.
- Preview-verify any UI criterion.
- Any "on-chain" acceptance criterion requires a real explorer-confirmed txid from the
  user before it may be marked complete.
