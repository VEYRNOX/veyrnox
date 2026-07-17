---
description: Wishlist-driven batching — collect a "santa list" of small independent improvements, sort by cost/impact, batch the cheap high-impact ones into a single sweep, and defer the rest with a written reason. Prevents one-off cleanups derailing feature work.
argument-hint: <area or theme — e.g. "Send screen", "deniability strings", "docs drift"; or "current diff" to santa-sort review comments>
---

# santa-method — wishlist → sort → batch → deliver

Wishlist for: **$ARGUMENTS**

## 1. Gather the wishlist
- If the argument is an area: dispatch `veyrnox-recon` to enumerate small independent
  improvements in that area — dead code, honesty-doc drift, stale comments, missing test
  pins, low-hanging simplifications, mislabeled status tags.
- If the argument is "current diff": read the current branch's honest-review / codex
  output and treat each P2 / P3 as a wishlist entry.
- If the user hands over a list explicitly: use theirs verbatim, do not re-derive.

## 2. Score each entry
Table: id → description → file(s) → cost (S/M/L) → impact (S/M/L) → invariant risk
(none / low / medium / high) → dependency (independent / blocks other / blocked by other).

- Any entry touching seed / keys / signing / auth / RASP / KEK / IAP is invariant-risk
  ≥ medium and does NOT go through this command — hand it to `veyrnox-security-tdd` via
  `/orch-fix-defect` or `/orch-change-feature` instead.

## 3. Select the batch
- Take entries with cost = S and impact ≥ M, filter to independent (different files, no
  ordering dependency), and cap the batch at ~8 to keep review tractable.
- Everything not selected goes to a "Deferred" section with a one-line reason (too big,
  not urgent, blocks other work, needs owner decision). Deferred items must be filed as
  GitHub issues or flagged for the user — never silently dropped.

## 4. Deliver the batch (parallel)
- One agent per file (never two agents on the same file).
- UI → `veyrnox-ui`. Docs → `veyrnox-docs`. Non-security core → default `claude` agent.
- Single message, multiple Agent calls, so they run concurrently.

## 5. Honest review + verify
- `veyrnox-honest-reviewer` on the combined diff.
- Lint on touched files. Targeted tests.
- Preview-verify any UI touch.

## 6. Report
- What landed (with the wishlist id for each).
- What was deferred (with the one-line reason and where it's tracked).
- Never mark anything "verified" — that still requires an on-chain txid.
