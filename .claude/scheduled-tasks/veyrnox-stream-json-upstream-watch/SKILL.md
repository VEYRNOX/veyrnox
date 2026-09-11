---
name: veyrnox-stream-json-upstream-watch
description: Weekly watch for upstream resolution of the Veyrnox stream-json moderate residual (a widened jayson range, a 1.x backport, or @solana/web3.js dropping jayson)
---

Upstream watcher for the Veyrnox wallet's accepted `stream-json` security residual
(GHSA-528h-pc64-c93x). Signals come from read-only `npm view` registry queries and one read
of `origin/main`'s committed lockfile. Do NOT modify files, run `npm install`, add an
`overrides` entry, or read the shared checkout's working tree.

> **Shared-checkout note.** The primary checkout is shared by ~10 worktrees and several
> other scheduled tasks, and is frequently on a detached HEAD or an unrelated branch. This
> task needs no worktree, but it DOES read repo files — the lockfile and `package.json` —
> and it must read them from the ref, never the tree:
> `git show origin/main:package-lock.json`. Sanity-check with
> `git cat-file -s origin/main:package-lock.json` that the byte count is non-zero. Every
> failure mode of that read is silent, and an empty result looks exactly like "no matches
> found", which here would read as "the residual is gone".

## Background (why this task exists)

`stream-json` GHSA-528h-pc64-c93x — the `pick`/`ignore`/`filter`/`replace` filters are
O(depth²) on nested input, so small crafted JSON blocks the event loop for seconds to
minutes (DoS). Vulnerable `<= 3.4.0`; the tree carries `1.9.1`.

Full rationale, the reachability analysis, and the rejected-`overrides` measurement live in
the `### stream-json` entry of
`.claude/scheduled-tasks/veyrnox-daily-dep-audit/SKILL.md`. That entry is the source of
truth — do not restate or re-litigate it here. The three facts this task exists to
re-check weekly:

1. **No backport.** `1.9.1` is the last release on the 1.x line; the fix landed only in
   `3.5.0`. `jayson` declares `stream-json: ^1.9.1`, so no range resolution anywhere
   reaches a patched version.
2. **An `overrides` entry to 3.x BREAKS `jayson`.** 3.x removed the `streamers/` tree
   entirely while `jayson/lib/utils.js:3` still requires
   `stream-json/streamers/StreamValues`. Under the override, `require('jayson')` throws.
   Measured 2026-09-03 — do not re-derive, and do not propose the override as a fix.
3. **The vulnerable code is not reachable in any build of this app.** Every
   `@solana/web3.js` entry point imports `jayson/lib/client/browser`, whose complete
   require closure never reaches `lib/utils.js` — the only file in `jayson` that touches
   `stream-json`.

**Read consequence 2 before reporting anything as fixable.** `npm audit` gets CLEANER
under the broken override (4 moderate → 2) and `npm run build` still exits 0, so neither a
green build nor a quiet audit is evidence the override is safe.

## The chain, as of this task's creation (2026-09-10, `origin/main` `54b99ba3`)

```
(dependencies — production, not dev)
  └─ @solana/web3.js ^1.98.4                        -> 1.98.4   (jayson "^4.1.1")
       └─ jayson 4.3.0                              (stream-json "^1.9.1")
            └─ stream-json 1.9.1                     GHSA-528h-pc64-c93x
```

`jayson` is not separately vulnerable — it has no advisory of its own and appears in
`npm audit` only as `stream-json`'s `effects` entry. Fixing `stream-json` clears both.

## Step 0 — re-derive the chain before probing

Do this first, every run. If it does not reproduce, the baseline below is stale and the
signals may be probing the wrong packages — say so in the report rather than reporting a
clean result.

```bash
cd /Users/aljobson/Documents/GitHub/veyrnox && git fetch origin main
git cat-file -s origin/main:package-lock.json    # must be non-zero
SCRATCH="${TMPDIR:-/tmp}/veyrnox-stream-json-watch"; rm -rf "$SCRATCH"; mkdir -p "$SCRATCH"
git show origin/main:package-lock.json > "$SCRATCH/package-lock.json"
git show origin/main:package.json      > "$SCRATCH/package.json"
SCRATCH="$SCRATCH" node -e '
const l=require(process.env.SCRATCH+"/package-lock.json");
for (const [k,v] of Object.entries(l.packages)) if (/(^|\/)(stream-json|jayson)$/.test(k)) console.log(v.version, k);
const j=l.packages["node_modules/jayson"];
console.log("jayson declares stream-json:", j && j.dependencies && j.dependencies["stream-json"]);
const w=l.packages["node_modules/@solana/web3.js"];
console.log("web3.js:", w && w.version, "declares jayson:", w && w.dependencies && w.dependencies["jayson"]);
'
```

**`SCRATCH` must not be `${TMPDIR}/veyrnox-dep-audit`** (the WEEKLY dependency-audit task
uses that path as a git worktree and this task's `rm -rf` would delete it) **nor
`${TMPDIR}/veyrnox-daily-dep-audit`** (the daily audit's scratch) **nor
`${TMPDIR}/veyrnox-morgan-watch`** (the morgan watcher's). Keep it distinct.

Expected: one `stream-json` at `1.9.1`, one `jayson` at `4.3.0`, `jayson` declaring
`^1.9.1`, `@solana/web3.js` at `1.98.4` declaring `^4.1.1`.

If a SECOND `stream-json` entry appears at a nested path, that is a new chain this entry
never analysed — report it rather than folding it into the existing baseline.

## Signals

Each is a separate probe. Report every one as FIRED or NOT FIRED with the value observed —
never a bare "no movement" summary, because the value is what the next run compares
against.

### SIGNAL 1 — `jayson` widens its `stream-json` range to admit `>= 3.5.0`

```bash
npm view jayson@latest version dependencies.stream-json
```

Baseline (2026-09-10): version `4.3.0` — equal to the resolved version — with
`dependencies.stream-json = '^1.9.1'`.

**FIRES** if the declared range admits `>= 3.5.0`. This is the cleanest resolution: the fix
becomes a plain lockfile update with no override and no manifest change, because
`@solana/web3.js` declares `jayson ^4.1.1` and any `4.x` satisfies it.

**Caveat that must be checked in the same breath:** a `jayson` that widens its range must
ALSO have stopped requiring `stream-json/streamers/StreamValues`, or it is broken at
runtime for exactly the reason consequence 2 describes. Verify before reporting it as
resolved:

```bash
cd "$SCRATCH" && npm pack jayson@latest >/dev/null 2>&1
tar xzf jayson-*.tgz && grep -n "stream-json" package/lib/utils.js
```

A surviving `require('stream-json/streamers/StreamValues')` alongside a 3.x-admitting
range is an upstream bug, not a fix — report it as FIRED-BUT-BROKEN.

### SIGNAL 2 — `stream-json` backports the fix to a 1.x release

```bash
npm view stream-json versions --json
```

Baseline (2026-09-10): 56 versions published. The 1.x line ends at `1.9.1`
(2024-11-12); `latest` is `3.6.0`. The published list tail is `3.3.0, 3.4.0, 3.5.0, 3.6.0`.

The 2.x line exists and is NOT a backport: `2.0.0` (2026-03-19) and `2.1.0` (2026-03-31),
both inside the affected range (`<= 3.4.0`) and both outside `jayson`'s `^1.9.1`, so they
neither carry the fix nor resolve through the tree. They predate this baseline — do not
report them as a new release. (Omitted from the original baseline; added after the
2026-09-11 run noticed them.)

**FIRES** if any `1.9.2+` appears, or any 2.x after `2.1.0`. Only a 1.x release reaches
the tree unaided; a patched 2.x would still need `jayson` to widen (SIGNAL 1). A backport clears the residual
through ordinary range resolution — `jayson`'s `^1.9.1` would reach it with no override —
and is the `brace-expansion` shape, which is the one shape that has actually resolved a
residual in this repo without a manifest change.

Confirm the release genuinely carries the fix before reporting resolution; a version number
above the vulnerable floor is not evidence on its own, per the daily audit's own rule.

### SIGNAL 3 — `@solana/web3.js` drops `jayson`

```bash
npm view @solana/web3.js@latest version dependencies.jayson
```

Baseline (2026-09-10): `latest` is `1.99.0` — NEWER than the resolved `1.98.4` — and it
still declares `jayson ^4.3.0`. So a web3.js bump is available but buys nothing; do not
propose one as a remediation.

**FIRES** if `dependencies.jayson` is absent. The whole chain leaves the tree and the entry
retires.

Note the shape of this baseline: it is the one signal where `latest` already moved without
firing. Re-read the declared dependency each run rather than inferring from the version
number.

### SIGNAL 4 — the advisory is re-rated

```bash
npm audit --json   # in the daily audit's scratch resolve, or read its report
```

**FIRES** if `stream-json`'s severity is above `moderate`. Per the daily audit's step 2a, a
residual at a HIGHER severity than recorded must NOT be suppressed — it surfaces as a
normal finding. Say so explicitly if this fires.

### SIGNAL 5 — the reachability argument stops holding

This is the signal that does not come from the registry, and it is the one that would turn
an unreachable advisory into a live one.

```bash
cd /Users/aljobson/Documents/GitHub/veyrnox
git grep -nF "jayson" origin/main -- src functions supabase | grep -v "lib/client/browser"
```

**FIRES** if any code in `src/`, `functions/`, or `supabase/` imports `jayson`'s main entry
rather than `jayson/lib/client/browser`, or if a new dependency pulls `jayson` in on a path
that reaches `lib/utils.js`. Either would make the advisory reachable AND be broken by the
override, so the two mitigations fail together.

Expected: no output. If the resolved `@solana/web3.js` MAJOR version changes (1.x → 2.x),
re-run the daily audit entry's bundle check rather than trusting this grep — the entry
points are what the reachability argument rests on:

```bash
grep -rlE "stream-json|streamValues|makeFilter|jsonFilter" dist/assets/*.js
```

(That check needs a production build and is out of scope for a read-only weekly probe —
name it in the report as the follow-up rather than running it here.)

## What to do when a signal fires

Report it. Do not open a PR, do not edit `package.json`, do not edit the residual entry —
this task is read-only, exactly like the daily audit it supports.

State which signal fired, the observed value, and whether it is sufficient to retire the
residual. Only SIGNAL 1 (with its caveat clear), SIGNAL 2, or SIGNAL 3 can clear it;
SIGNAL 4 changes how the daily audit must report it, and SIGNAL 5 is an escalation rather
than a resolution. Per the daily audit's own rule, retirement requires the vulnerable
package to be gone from the **INSTALLED** tree — confirmed with `npm ci` and an on-disk
version check — not merely from a resolved lockfile and not on the strength of npm's
`fixAvailable`, which for this advisory already reports `true` while every available route
is either absent or breaks `jayson`.

## Output

Chat output only; this task writes no report file. That asymmetry has bitten before — a
watcher's `lastRunAt` is queryable state while its verdict is not, so a later reader can
know THAT it ran without knowing WHAT it said. Include the observed value for every signal
in the report so the transcript itself carries the baseline forward.
