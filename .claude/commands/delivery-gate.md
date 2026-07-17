---
description: Pre-merge delivery gate for the current branch — /orch-pipeline + honest-review + codex second-pass + docs-sync check + Feature-Status status-tag audit. Single PASS/FAIL verdict. Never promotes anything to "verified".
argument-hint: [optional focus — same as /orch-pipeline]
---

# delivery-gate — pre-merge gate

Gate the current branch: **$ARGUMENTS**

## 1. Branch sanity
```
CURRENT=$(git branch --show-current)
[ "$CURRENT" = "main" ] && echo "ERROR: switch to a feature branch first" && exit 1
git status --porcelain
```
Refuse to run on main. Refuse to run with uncommitted changes.

## 2. Full pipeline
Delegate to `/orch-pipeline`. Report each substep's PASS/FAIL.

## 3. Honest review
Dispatch `veyrnox-honest-reviewer` over the branch diff. Any P1 finding = gate FAIL.

## 4. Codex second-pass
Delegate to `/codex-security-review`. Any `[P1]` = gate FAIL. INTERNAL only — never
present a Codex pass as the outstanding independent third-party audit.

## 5. Docs-sync audit
Dispatch `veyrnox-docs` in check-only mode:
- Every code claim of "device-verified" / "verified" / "closed" in this diff must be
  supported by an entry in `docs/Feature-Status.md` with matching evidence.
- Any status tag change in `CLAUDE.md` must have a paper trail (PR / commit).
- Any new hard rule must appear in `CLAUDE.md`.
Missing sync = gate FAIL.

## 6. Feature-Status status-tag audit
- No entry may say "verified" without an on-chain explorer txid.
- No internal audit may be referenced as independent.
- Every new / changed feature has a status tag (BUILT / TARGET / PLANNED / HONEST-DISABLED).
- Failing any of these = gate FAIL.

## 7. Verdict
- **PASS** iff every step passed.
- **FAIL** with the exact failing steps + how to remediate.
- On PASS, remind the user: PASS = shippable in code. It does NOT mean device-verified or
  independently audited unless the docs + evidence say so.
