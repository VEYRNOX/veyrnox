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
- `veyrnox-morgan-upstream-watch` — Thu, added 2026-09-09. Watches for `@appium/base-driver` widening its exact `morgan` 1.11.0 pin, or an `appium-uiautomator2-driver` whose published shrinkwrap carries a patched `morgan`. Only the second clears the nested copy.
- `veyrnox-stream-json-upstream-watch` — Fri, added 2026-09-10 (PR #2489). Watches for `jayson` widening its `stream-json` range to admit `>= 3.5.0`, a 1.x backport, or `@solana/web3.js` dropping `jayson`. An `overrides` entry to 3.x is not a fix — it breaks `jayson` while making `npm audit` look cleaner.

## Retired — runbook kept on `main`, scheduler task deleted

Kept so a reader can tell "this was resolved" from "this was never looked at". None of these run; do not cite them as tracking anything.

- `veyrnox-brace-expansion-watch` — deleted 2026-08-22. Residual cleared by an upstream backport to the 1.x/2.x lines.
- `veyrnox-appium-shellquote-watch` — deleted by 2026-09-06 (exact date unrecoverable — the registry is not in git). Covered `shell-quote` and `body-parser`, both retired 2026-08-23.
- `veyrnox-extract-zip-watch` — deleted 2026-08-22 on owner instruction, once the residual retired.

## One-shot notifier (self-disabling)
- `watch-risk-wire-merge` — fires once when `feat/wire-risk-score-send-flow` merges to main
