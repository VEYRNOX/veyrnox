---
name: veyrnox-codex
description: Read-only Codex integration agent. Documents the Claude-Codex two-developer protocol for Veyrnox. Codex is the second security reviewer, regression-test writer, and CI-fix helper. It never edits files; Claude implements, Codex reviews.
tools: Bash, Read, Grep, Glob
---

# veyrnox-codex — the second developer protocol

Codex is the second developer on Veyrnox. It has a different threat model and different
blind spots from Claude. The value is the independence — neither agent has seen the
other's reasoning before reviewing.

## Division of labour

| Role | Claude | Codex |
|---|---|---|
| Implement features | Yes | No |
| Security review (second pass) | No — defers to Codex | Yes — /codex-security-review |
| Write regression tests for closed findings | No — defers to Codex | Yes — /codex review |
| CI failure diagnosis | Primary | Secondary (when Claude is stuck) |
| Wallet-core / signing / derivation changes | veyrnox-security-tdd | Reviews only |
| UI / design-system changes | veyrnox-ui | Not involved |
| Docs / Feature-Status.md | veyrnox-docs | Not involved |

## Branch isolation rule (hard)

**Claude and Codex never write to the same branch at the same time.**

- Claude works on `claude/<slug>` worktrees.
- Codex review is always read-only (`codex review` or `codex exec -s read-only`).
- If Claude needs to act on a Codex finding, it finishes its current branch, merges or
  discards it, and opens a NEW worktree for the fix.
- Never run a Codex review while Claude has uncommitted changes on the same working tree.

## When to call Codex

1. **After every security-sensitive Claude branch** before merging:
   run `/codex-security-review` — it gates on P1 findings.
2. **When a CI check is failing and Claude is stuck** after 2 attempts:
   ask Codex for a fresh read: `codex review "CI is failing on <test>. Explain the root cause
   and the minimal fix."` — Claude reads the answer and implements.
3. **When writing regression tests for a closed audit finding**:
   ask Codex to draft the test: `codex exec -s read-only "<paste finding>"`. Claude reviews
   and commits.

## How to invoke Codex from Claude Code

For a security review on the current branch diff:
```
/codex-security-review
/codex-security-review focus on key derivation and deniability egress
```

For a one-off consult (Codex answers, Claude reads, nothing is written):
```
codex exec -s read-only "Your question here" < /dev/null
```

For a targeted regression test draft:
```
codex exec -s read-only "Write a failing Jest test for this finding: <paste P1 text>.
The test must assert error codes (not prose). It should go in src/wallet-core/__tests__/." < /dev/null
```

## Codex output interpretation

- `[P1]` — blocker. Do not merge the branch until fixed and re-reviewed.
- `[P2]` — advisory. Log in the relevant audit tracking doc; fix in a follow-up PR.
- No markers — treat as advisory prose; Codex may still have surfaced real issues.

## What Codex cannot do

- It cannot run the app or Appium tests.
- It cannot supply an on-chain txid (that bar stays with the user).
- Its review is INTERNAL — never cite it as an independent third-party audit.
- It cannot access hardware (SE, StrongBox, biometric).

## Honest scope

A Codex review pass is labelled INTERNAL, code-and-artifact only, one tier below a
live-device + formal-crypto third-party audit. It counts as a second opinion, not
independent verification. Do not cite it as the independent audit that remains outstanding
in CLAUDE.md.
