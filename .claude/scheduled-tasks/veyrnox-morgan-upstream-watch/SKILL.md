---
name: veyrnox-morgan-upstream-watch
description: Weekly watch for upstream resolution of the Veyrnox morgan moderate residual (a widened @appium/base-driver pin, or an appium-uiautomator2-driver shrinkwrap carrying a patched morgan)
---

Upstream watcher for the Veyrnox wallet's accepted `morgan` security residual
(GHSA-jxfw-x594-9x9m). Signals come from read-only `npm view` registry queries, one read
of `origin/main`'s committed lockfile, and one `npm pack` of a published tarball into a
scratch directory. Do NOT modify files, run `npm install`, or read the shared checkout's
working tree.

> **Shared-checkout note.** The primary checkout is shared by ~10 worktrees and several
> other scheduled tasks, and is frequently on a detached HEAD or an unrelated branch. This
> task needs no worktree, but it DOES read one repo file — the lockfile — and it must read
> it from the ref, never the tree: `git show origin/main:package-lock.json`. Sanity-check
> with `git cat-file -s origin/main:package-lock.json` that the byte count is non-zero.
> Every failure mode of that read is silent, and an empty result looks exactly like "no
> matches found", which here would read as "the residual is gone".

## Background (why this task exists)

`morgan` GHSA-jxfw-x594-9x9m — log forging via unescaped Unicode line separators,
vulnerable `< 1.12.0`. Patched `1.12.0` exists and has since before this residual was
accepted; the problem is not that upstream has no fix, it is that **nothing in the
dependency graph resolves to it.**

Full rationale, blast radius, and the rejected-`overrides` analysis live in the
`### morgan` entry of `.claude/scheduled-tasks/veyrnox-daily-dep-audit/SKILL.md`. That
entry is the source of truth — do not restate or re-litigate it here. The two facts this
task exists to re-check weekly:

1. `@appium/base-driver` pins `morgan` at an **exact** `1.11.0`, and its `latest` is the
   version already resolved. No range resolution reaches `1.12.0`.
2. `appium-uiautomator2-driver` publishes its own `npm-shrinkwrap.json`, which pins a
   second, nested `morgan` at `1.11.0`. A published shrinkwrap outranks our
   `package-lock.json` AND our `overrides`, so the nested copy can only move when the
   DRIVER moves.

**Read consequence 2 before reporting anything as fixed.** A patched `@appium/base-driver`
clears the root copy only. The findings do not go away until the nested copy moves too,
and the audit will keep reporting all seven until then.

## The chain, as of acceptance (2026-09-09, `origin/main` `2d97a064`)

```
(devDependencies)
  ├─ appium ^3.7.0                                  -> 3.7.0
  │    └─ @appium/base-driver 10.8.0                (morgan "1.11.0", EXACT)
  │         └─ node_modules/morgan 1.11.0            GHSA-jxfw-x594-9x9m   [root copy]
  └─ appium-uiautomator2-driver ^8.5.0              -> 8.6.1
       └─ npm-shrinkwrap.json (265 entries, published)
            └─ node_modules/morgan 1.11.0            GHSA-jxfw-x594-9x9m   [nested copy]
```

## Step 0 — re-derive the chain before probing

Do this first, every run. If it does not reproduce, the baseline below is stale and the
signals may be probing the wrong packages — say so in the report rather than reporting a
clean result.

```bash
cd /Users/aljobson/Documents/GitHub/veyrnox && git fetch origin main
git cat-file -s origin/main:package-lock.json    # must be non-zero
SCRATCH="${TMPDIR:-/tmp}/veyrnox-morgan-watch"; rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"
git show origin/main:package-lock.json > "$SCRATCH/package-lock.json"
git show origin/main:package.json      > "$SCRATCH/package.json"
node -e '
const l=require(process.env.SCRATCH+"/package-lock.json");
for (const [k,v] of Object.entries(l.packages)) if (/(^|\/)morgan$/.test(k)) console.log(v.version, k);
for (const k of ["node_modules/@appium/base-driver","node_modules/appium","node_modules/appium-uiautomator2-driver"])
  console.log(k, l.packages[k] && l.packages[k].version);
'
```

**`SCRATCH` must not be `${TMPDIR}/veyrnox-dep-audit`** (the WEEKLY dependency-audit task
uses that path as a git worktree and this task's `rm -rf` would delete it) **nor
`${TMPDIR}/veyrnox-daily-dep-audit`** (the daily audit's scratch). Keep it distinct.

Expected: two `morgan` entries, both `1.11.0`; `@appium/base-driver` `10.8.0`; `appium`
`3.7.0`; `appium-uiautomator2-driver` `8.6.1`.

## Signals

Each is a separate probe. Report every one as FIRED or NOT FIRED with the value observed —
never a bare "no movement" summary, because the value is what the next run compares
against.

### SIGNAL 1 — `@appium/base-driver` widens or bumps its `morgan` pin

```bash
npm view @appium/base-driver@latest version dependencies.morgan
```

Baseline (2026-09-09): version `10.8.0`, `dependencies.morgan = '1.11.0'`.

**FIRES** if `dependencies.morgan` admits `>= 1.12.0` — any range, or an exact `1.12.0`+.
Effect if fired: the ROOT copy clears on a plain lockfile update once `appium` resolves the
newer base-driver. **The nested copy does not clear.** Do not report the residual as
resolved on this signal alone.

### SIGNAL 2 — a newer `appium-uiautomator2-driver` ships a patched shrinkwrap

```bash
npm view appium-uiautomator2-driver@latest version
```

Baseline (2026-09-09): `8.6.1` — equal to the resolved version, so there is nothing to
bump to.

If and only if `latest` is **newer than the resolved version** from step 0, inspect its
published shrinkwrap:

```bash
cd "$SCRATCH" && npm pack appium-uiautomator2-driver@<latest> >/dev/null 2>&1
tar xzf appium-uiautomator2-driver-<latest>.tgz
node -e '
const fs=require("fs");
const p="package/npm-shrinkwrap.json";
if (!fs.existsSync(p)) { console.log("NO SHRINKWRAP — see SIGNAL 3"); process.exit(0); }
const l=JSON.parse(fs.readFileSync(p,"utf8"));
for (const [k,v] of Object.entries(l.packages||{})) if (/(^|\/)morgan$/.test(k)) console.log(k, v.version);
'
```

**FIRES** if that shrinkwrap carries `morgan >= 1.12.0`. This is the ONLY signal that can
clear the nested copy, and the declared range in `package.json` is `^8.5.0`, so a newer
`8.x` needs no manifest change — just a lockfile update.

### SIGNAL 3 — the driver stops publishing a shrinkwrap

Detected by the `NO SHRINKWRAP` branch above, or by `hasShrinkwrap` disappearing from the
driver's lockfile entry. **FIRES** if absent: the nested subtree then becomes subject to
ordinary resolution and our `overrides`, which changes the remediation entirely — an
`overrides` entry would start working where today it is a no-op.

### SIGNAL 4 — the advisory is re-rated

```bash
npm audit --json   # in the daily audit's scratch resolve, or read its report
```

**FIRES** if `morgan`'s severity is above `moderate`. Per the daily audit's step 2a, a
residual at a HIGHER severity than recorded must NOT be suppressed — it surfaces as a
normal finding. Say so explicitly if this fires.

### SIGNAL 5 — the harness leaves the tree

**FIRES** if `appium` and `appium-uiautomator2-driver` are absent from `devDependencies` in
`origin/main`'s `package.json`. Both copies go with them and the entry retires.

## What to do when a signal fires

Report it. Do not open a PR, do not edit `package.json`, do not edit any residual entry —
this task is read-only, exactly like the daily audit it supports.

State which signal fired, the observed value, which of the two copies it would clear, and
whether that is sufficient to retire the residual (only SIGNAL 2, 3+action, or 5 can clear
the nested copy; SIGNAL 1 alone cannot). Per the daily audit's own rule, retirement
requires the vulnerable package to be gone from the **INSTALLED** tree — confirmed with
`npm ci` and an on-disk version check — not merely from a resolved lockfile and not on the
strength of npm's `fixAvailable`.

## Output

Chat output only; this task writes no report file. That asymmetry has bitten before — a
watcher's `lastRunAt` is queryable state while its verdict is not, so a later reader can
know THAT it ran without knowing WHAT it said. Include the observed value for every signal
in the report so the transcript itself carries the baseline forward.
