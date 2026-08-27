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
- `veyrnox-brace-expansion-watch` — probes whether `^5.0.8` override still breaks minimatch/eslint
- `veyrnox-appium-shellquote-watch` — re-resolves nested `shell-quote`/`body-parser` copy
- `veyrnox-elliptic-upstream-watch` — waits for a patched `elliptic`, or the Keystone chain (`bc-ur-registry-eth` → `hdkey` → `secp256k1`) dropping the path. Re-pointed 2026-08-25; it used to watch the Ledger and Trezor chains, both since gone from the tree.

## One-shot notifier (self-disabling)
- `watch-risk-wire-merge` — fires once when `feat/wire-risk-score-send-flow` merges to main
