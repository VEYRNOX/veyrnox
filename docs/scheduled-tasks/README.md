# Scheduled task definitions — dependency audit system

Mirrored copies of the five scheduled tasks that audit this repo's npm dependencies.
Checked in so the decisions they encode — in particular the accepted-security-residuals
list — get code review and version history.

## ⚠️ These are COPIES, not the executing source

The daily task now resolves its runbook from `origin/main:.claude/scheduled-tasks/<task-id>/SKILL.md`
— the `~/.claude/scheduled-tasks/<task-id>/SKILL.md` file is a short loader that fetches
the ref. So **`.claude/scheduled-tasks/` in this repo is the authoritative runbook**, and
the files here in `docs/` are review copies of it. Editing a file here changes nothing.

Re-copy rather than hand-merging when the two disagree. Snapshot re-taken
**2026-08-25** for `veyrnox-daily-dep-audit.md` only; the other files here are still the
2026-07-28 snapshot and two of them describe watchers that no longer exist.

## The tasks

| File | Schedule | What it does |
|---|---|---|
| `veyrnox-daily-dep-audit.md` | daily 07:36 | `npm audit` against `origin/main`'s lockfile, applies the residuals list, renders a summary widget. **Holds the accepted-residuals list — the single source of truth.** |
| `veyrnox-dependency-audit.md` | Mon 09:04 | Deeper weekly audit; reads the residuals list, escalates anything new via a PR, short-circuits when nothing is. |
| `veyrnox-elliptic-upstream-watch.md` | Tue 09:34 | Registry-only watch for a patched `elliptic`. **Its runbook still checks the Ledger and Trezor chains, which no longer exist in the tree — re-point it at the Keystone chain.** |
| `veyrnox-appium-shellquote-watch.md` | — | **Watcher DELETED.** Residual retired 2026-08-23; file kept for history only. |
| `veyrnox-brace-expansion-watch.md` | — | **Watcher DELETED 2026-08-22.** Residual retired; file kept for history only. |

## Accepted residuals as of 2026-08-25

One root package, five low advisories, at `origin/main` `24333ad9`. The 2026-07-28
version of this section listed four roots and 51 advisories — `brace-expansion`,
`shell-quote` and `body-parser` have all since been retired with evidence (see the
"Retired residuals" section of `veyrnox-daily-dep-audit.md`), and the `elliptic` count
fell from 18 to 5 when the Trezor and Ledger dependencies left the tree.

| Root | Count | Why accepted | Watcher |
|---|---|---|---|
| `elliptic` | 5 low | No upstream fix at any version (6.6.1 is `latest`); single chain via `@keystonehq/keystone-sdk`; the Keystone device signs | elliptic-upstream-watch — PARTIAL, brief is stale |

**The reported-findings count being zero would not mean the tree is clean** — residuals
are suppressed with stated reasons, not absent. On 2026-08-25 nothing was suppressed at
all: the `elliptic` entry's "gains a path into `src/wallet-core/`" trigger had fired, so
all 5 findings were reported normally.

Every entry carries a reason, an evidence-based revisit trigger, and a named watcher.
Read the daily-dep-audit file for the full reasoning before acting on any of them.

## Two rules worth reading before you touch any of this

**A version number is not evidence.** On 2026-07-27 the `shell-quote` residual was retired
because a patched upstream release shipped and npm reported `fixAvailable: true`. Both
facts were true; the finding was unfixable anyway, and it was reinstated the same day.
Revisit triggers are phrased against the resolved tree for this reason. Verify the
vulnerable package is actually gone before retiring anything.

**A green build is not evidence either.** The `brace-expansion` `^5.0.8` override takes
`npm audit` from 32 high to 3 and passes `npm run build` — then dies in `npm run lint`
with `TypeError: expand is not a function`. `npm run lint` is the acceptance test.
