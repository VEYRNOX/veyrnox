---
description: Behavior-preserving refactor — identify simplification / reuse / efficiency wins in the current diff or a named area, apply them, and prove no behavior change via unchanged tests + honest review. Never touches seed/keys/signing/auth semantics.
argument-hint: <area, or "current diff", or specific files>
---

# orch-refine-code — quality-only refactor (no behavior change)

Refine: **$ARGUMENTS**

## Non-goals (hard)
- Not a bug hunt (use `/orch-fix-defect` for that).
- Not a security review (use `/codex-security-review`).
- Not a feature change (use `/orch-change-feature`).
- Must NOT change observable behavior. Every existing test must still pass without edits.

## 1. Baseline
- Run the targeted test suite for the area; record the baseline pass count. This is the
  "no-behavior-change" contract.

## 2. Load the `simplify` skill
Invoke the `simplify` skill (installed in this session) — it is the canonical refine pass.
Restrict scope to the argument.

## 3. Constraints
- Do NOT touch files under `src/wallet-core/keystore/`, `src/wallet-core/mnemonic.js`,
  `src/wallet-core/derivation.js`, `src/rasp/`, `src/lib/twoFactorGate.js`,
  `src/lib/sendGate.js`, `src/lib/duress.js`, `src/lib/panic.js`, `src/lib/purchases.js`
  (security-sensitive — refactors here go through `veyrnox-security-tdd`, not this command).
- Do NOT add error handling / validation for cases that can't happen (per CLAUDE.md).
- Do NOT add comments explaining WHAT (only WHY, if non-obvious).

## 4. Apply the refactor
- Dispatch `veyrnox-ui` for UI/component simplification.
- For non-security core files, use the default `claude` agent or an inline pass.
- One moving part at a time.

## 5. Prove no behavior change
- Every previously-passing test still passes, unchanged.
- Lint clean on touched files.
- If the diff crosses into a UI, preview-verify.

## 6. Honest review
`veyrnox-honest-reviewer` on the diff. Any finding that the refactor smuggled in a
behavior change → revert that chunk. This command's whole purpose is neutrality.
