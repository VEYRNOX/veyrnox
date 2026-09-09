---
name: watch-xcuitest-main-flakes
description: Notify on any ios-xcuitest-smoke workflow failure on main. Post-PR-#2481 regression watch for #2477.
---

OBJECTIVE
Detect xcuitest regressions on `main` after PR #2481 landed the startup-coordinator fix for #2477. Notify once per failed run. No mutation, no code, no re-triage.

HARD CONSTRAINTS
- NOTIFY ONLY. Do not open PRs, edit files, or attempt fixes. If a failure reappears, the human decides whether to reopen #2477 or investigate.
- Read against `origin/main` state only — no local worktree needed; this is `gh` calls against the GitHub API.
- One notification per (run_id, run_attempt). Do not spam repeats.

STEPS (each run)
1. Query the last 24h of ios-xcuitest-smoke runs on main:

       gh run list \
         --repo VEYRNOX/veyrnox \
         --workflow ios-xcuitest-smoke.yml \
         --branch main \
         --limit 20 \
         --json databaseId,headSha,conclusion,status,createdAt,event,attempt

2. Filter to `status == "completed"` AND `conclusion == "failure"` AND `createdAt` within the last 24h. `--failed` on `gh run rerun` overwrites the run's conclusion, so also inspect per-attempt job conclusions when in doubt:

       gh run view <databaseId> --json jobs -q '.jobs[] | select(.name=="xcuitest") | {status,conclusion,startedAt}'

3. NO failures → exit quietly. Send no notification.

4. FAILURES → send ONE notification per failed (run_id, attempt) pair:

   "xcuitest FAILED on main after #2481 landed. Run <run_id> attempt <n>, head <sha>, at <createdAt>. Assertion line from xcodebuild.log (first match of `error: -\\[` or `Test Case .* failed`) — download the xcresult bundle for the screenshot + AX-tree diagnostics attached by waitForEntryTile / tapButtonUntilAdvanced (PR #2481). Reopen #2477 if this recurs across multiple runs — one failure could be the 338 s AX-query symptom, which #2481 did not claim to fix."

   Fetch the assertion line:

       gh run view <run_id> --log-failed 2>/dev/null | grep -aE '(error: -\\[|Test Case .* failed|Testing failed)' | head -3

5. To avoid re-notifying, this task relies on the run's `attempt` being stable — a re-run creates a new (run_id, attempt) pair. If you have session memory of already-notified pairs, skip them. Otherwise, only alert on runs whose `createdAt` is more recent than the previous fire time of this task.

WHY THIS EXISTS
#2477 closed on the strength of one green xcuitest run — weak evidence per the issue's own success criterion. #2481's `waitForEntryTile` coordinator made the tile-wait deterministic and added screenshot + AX-tree diagnostics; it did not claim to fix the 338 s AX-query timeout. This watch turns the closed issue into a live signal: silent while main stays green, one ping when it doesn't.
