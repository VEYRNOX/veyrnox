# Scheduled task definitions — dependency audit system

Mirrored copies of the five scheduled tasks that audit this repo's npm dependencies.
Checked in so the decisions they encode — in particular the accepted-security-residuals
list — get code review and version history.

## ⚠️ These are COPIES, not the executing source

The tasks actually run from `~/.claude/scheduled-tasks/<task-id>/SKILL.md` on the owner's
machine. **Editing a file here changes nothing.** A change has to be made in
`~/.claude/scheduled-tasks/` to take effect, and copied here to be reviewed.

That is a two-places-to-edit problem and it will drift. Treat the `~/.claude` copy as
authoritative whenever the two disagree, and re-copy rather than hand-merging. Snapshot
taken **2026-07-28**.

## The five tasks

| File | Schedule | What it does |
|---|---|---|
| `veyrnox-daily-dep-audit.md` | daily 09:06 | `npm audit`, applies the residuals list, renders a summary widget. **Holds the accepted-residuals list — the single source of truth.** |
| `veyrnox-dependency-audit.md` | Wed 09:04 | Deeper weekly audit; reads the residuals list, escalates anything new via a PR, short-circuits when nothing is. |
| `veyrnox-elliptic-upstream-watch.md` | Mon 10:04 | Registry-only watch for a patched `elliptic` or either hardware-wallet dep dropping the path. |
| `veyrnox-appium-shellquote-watch.md` | Mon 09:04 | Re-resolves the tree to check whether the nested vulnerable `@appium/support` copy is actually gone. |
| `veyrnox-brace-expansion-watch.md` | Mon 11:02 | Functionally probes whether the `^5.0.8` override still breaks `minimatch`/`eslint`. |

## Accepted residuals as of 2026-07-28

All 51 advisories `npm audit` reports are accepted residuals across four root packages.
**The reported-findings count being zero does not mean the tree is clean** — 32 high and
19 low advisories are live; they are suppressed with stated reasons, not absent.

| Root | Count | Why accepted | Watcher |
|---|---|---|---|
| `brace-expansion` | 28 high | `^5.0.8` override breaks 6 `minimatch` copies at runtime; dev-only | brace-expansion-watch |
| `shell-quote` | 4 high | Nested appium duplicate subtree; four remediation routes failed; dev-only | appium-shellquote-watch |
| `elliptic` | 18 low | No upstream fix at any version; hardware-wallet transport only, off the signing path | elliptic-upstream-watch + daily step 1b |
| `body-parser` | 1 low (2 mappings) | Same nested-duplicate mechanism; root copy already patched | appium-shellquote-watch |

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
