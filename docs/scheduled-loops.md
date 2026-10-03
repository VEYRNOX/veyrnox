# Veyrnox scheduled loops

Registry of the recurring skills under `.claude/scheduled-tasks/`. Each has its own `SKILL.md` with full runbook.

## Daily
- `daily-veyrnox-branch-review` — branch vs main across correctness / security / design-system / a11y
- `veyrnox-daily-security-diff` — scan security-sensitive file changes on `origin/main`
- `veyrnox-daily-dep-audit` — `npm audit` summary widget

## Weekly
- `veyrnox-weekly-security-audit` — parallel audit across RASP / WalletConnect / KEK / Auth
- `veyrnox-audit-finding-tracker` — sync `docs/audit-findings-tracker.md` vs main
- `veyrnox-dependency-audit` — weekly npm audit; spawns fix agents for CRITICAL/HIGH
- `gemini-weekly-sweep` — Sun 03:00 GMT; Gemini 2.5 Pro long-context sweep of one safe subsystem (rotate: `src/components/` → `src/pages/` → `src/hooks/` → `src/api/`); writes `docs/audit-gemini-sweep-<date>.md`. Slash command: `/gemini-weekly-sweep [path]`. Skips sensitive paths unless `GEMINI_PAID_TIER=1`. See `.claude/commands/gemini-weekly-sweep.md`.

## Weekly — upstream residual watchers (read-only, evidence-based)

One per accepted residual in `.claude/scheduled-tasks/veyrnox-daily-dep-audit/SKILL.md`, which is the source of truth for each residual's rationale. A watcher reports; it never edits a residual entry or opens a PR.

**Registration lives in the scheduler, not in git, so this list cannot prove a task exists.** Confirm with `list_scheduled_tasks` — check `enabled`, and check `lastRunAt` against the merge time of any runbook change. This section listed two deleted watchers as live until 2026-09-10 (see Retired below); that is the failure mode to expect here.

- `veyrnox-elliptic-upstream-watch` — Tue. Waits for a patched `elliptic`, or the Keystone chain (`bc-ur-registry-eth` → `hdkey` → `secp256k1`) dropping the path. Re-pointed 2026-08-25; it used to watch the Ledger and Trezor chains, both since gone from the tree.

## Retired — runbook kept on `main`, scheduler task deleted

Kept so a reader can tell "this was resolved" from "this was never looked at". None of these run; do not cite them as tracking anything.

- `veyrnox-brace-expansion-watch` — deleted 2026-08-22. Residual cleared by an upstream backport to the 1.x/2.x lines.
- `veyrnox-appium-shellquote-watch` — deleted by 2026-09-06 (exact date unrecoverable — the registry is not in git). Covered `shell-quote` and `body-parser`, both retired 2026-08-23.
- `veyrnox-extract-zip-watch` — deleted 2026-08-22 on owner instruction, once the residual retired.
- `veyrnox-morgan-upstream-watch` — disabled 2026-10-03 after PR #2800 removed the bundled Appium copy and the shared copy resolved patched.
- `veyrnox-stream-json-upstream-watch` — disabled 2026-10-03 after PR #2799 moved to `jayson@5.0.0`, which no longer installs `stream-json`.

## One-shot notifier (self-disabling)
- `watch-risk-wire-merge` — fires once when `feat/wire-risk-score-send-flow` merges to main
