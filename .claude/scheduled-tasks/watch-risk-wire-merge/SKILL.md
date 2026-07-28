---
name: watch-risk-wire-merge
description: Notify once when feat/wire-risk-score-send-flow merges to main (RASP §7 unblock). Notify-only, self-disabling.
---

OBJECTIVE
Detect, exactly once, when the GitHub branch `feat/wire-risk-score-send-flow` has merged into `main` in the repository `aljobson/veyrnox-secure`, and notify the user that the RASP §7 live-wiring work is unblocked. This is NOTIFY-ONLY: you remove the wait, nothing else.

HARD CONSTRAINTS — DO NOT VIOLATE
- NOTIFY ONLY. Do NOT create a branch, do NOT edit any file (especially not SendCrypto.jsx), do NOT run any wiring/TDD, do NOT open any PR (draft or otherwise). Your entire job is detect-and-notify.
- **Shared-checkout note (2026-07-28): no worktree needed here, deliberately.** Sibling
  scheduled tasks now cut a worktree or read from `origin/main`, because
  `C:\Users\aljob\Downloads\Veyrnox` is shared by ~10 concurrent worktrees and sessions.
  This task touches **no local checkout at all** — it is a single `gh pr list` against
  `aljobson/veyrnox-secure` — so there is nothing to isolate. Do not add worktree ceremony
  to match the others. The NOTIFY-ONLY rule above is already the stronger constraint.
- SILENCE UNTIL THE EVENT. If the branch has not merged, exit quietly and send NO notification. Never send a "still waiting" ping.
- FIRE EXACTLY ONCE. After you send the merge notification, disable this task so it never runs again.

STEPS (each run)
1. Determine whether `feat/wire-risk-score-send-flow` has merged into `main`, using `gh` (already authenticated). Run ONE command:
       gh pr list --repo aljobson/veyrnox-secure --head feat/wire-risk-score-send-flow --state all --json number,state,mergedAt,mergeCommit
   Inspect the results: if any entry has `state` == "MERGED", the branch is MERGED (capture that entry's `mergeCommit` and `mergedAt`). If no entry is MERGED (entries are OPEN/CLOSED, or the list is empty), it is NOT merged. This single `gh pr` check is reliable across squash, rebase, and merge-commit strategies — all set the PR state to MERGED.

2. NOT MERGED → do nothing. Send no notification. Exit quietly.

3. MERGED → send EXACTLY ONE notification to the user with this text, filling in <sha> (the mergeCommit) and <timestamp> (the mergedAt):

   "§7 live wiring unblocked. feat/wire-risk-score-send-flow has merged to main (commit <sha>, merged <timestamp>). The tx-risk gate now exists at the send chokepoint. Next steps are human-in-the-loop, not automated:
   1) Retarget PR #167's base from the #166 branch to main.
   2) Start the §7 live-wiring cycle: diagram against the ACTUAL call site the merge created → sign-off → brief → implement, with the extended deniability test verified to bite.
   Do NOT auto-wire — the call site is deniability-critical and the lattice/biometric sign-off items are still open."

   Deliver this via a push-notification tool if one is available in your run; otherwise make this text the prominent first lines of your run output so it surfaces to the user.

4. SELF-DISABLE. After sending the notification, call the `update_scheduled_task` tool with taskId `watch-risk-wire-merge` and `enabled: false`, so the task fires exactly once and never runs again. Confirm it is disabled before you finish.

WHY NOTIFY-ONLY (context for any future reader of this task)
The §7 live wiring is the highest-audit-exposure step in the RASP effort. It stays human-in-the-loop because: the call site does not exist until this merge (an agent wiring it would be the first to see it, with stale context, on a deniability-critical path); the extended deniability test must bite on a realistic oracle (a review judgment, not a green checkmark); and an open sign-off item (biometric re-confirm on the warn/confirm tiers) means auto-implementing would silently decide an undecided design question. So: automate the wait, keep the wiring. Success = "pinged the human at the right moment," not "shipped the wiring."