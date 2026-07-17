---
description: Orchestrate modifying an existing feature — recon current state, plan the delta only (never a rewrite), implement minimally, honest-review, and update docs/status.
argument-hint: <feature to change and the desired delta — e.g. "biometric 2FA: replace hard toggle with tiered opt-in">
---

# orch-change-feature — feature-modification pipeline

Change feature: **$ARGUMENTS**

## 1. Recon the current implementation FIRST
Dispatch `veyrnox-recon` to map the existing feature: entry points, tests, feature-status
row, security invariants involved. NO changes yet.

## 2. Delta-only plan
- Invoke `superpowers:writing-plans`. The plan MUST be scoped to the delta — do not
  refactor surrounding code, do not "clean up" adjacent files, do not introduce a new
  abstraction (per CLAUDE.md's "no premature abstraction").
- Explicitly list: what stays, what changes, what is removed. Call out any migration
  needs (vault format, storage keys, protocol versions).

## 3. Backwards-compat check
For anything that touches persisted state (vault blobs, storage keys, DEK/KEK, IAP
entitlements): describe how existing installs upgrade. Fail-closed on malformed input.
Never silently reset.

## 4. Implement
- Security-sensitive → `veyrnox-security-tdd` (strict TDD).
- UI/a11y → `veyrnox-ui` (preview-verified).
- CI/build → `veyrnox-ci`.
- One moving part at a time. One file per parallel agent.

## 5. Honest review + docs sync
- `veyrnox-honest-reviewer` on the diff.
- `veyrnox-docs` updates `docs/Feature-Status.md` (status tag, migration note) and
  `CLAUDE.md` if a hard rule shifted.

## 6. Verify
Lint + targeted tests; preview-verify UI; for a security-sensitive delta, run
`/codex-security-review`. Never mark "verified" without an on-chain txid.
