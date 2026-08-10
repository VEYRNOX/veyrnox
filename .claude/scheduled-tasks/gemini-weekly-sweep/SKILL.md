---
name: gemini-weekly-sweep
description: Weekly Gemini 2.5 Pro long-context sweep of one safe subsystem. Rotates targets across src/components/, src/pages/, src/hooks/, src/api/ so every safe path gets reviewed monthly. Writes a dated report and opens a PR to main.
---

You are running the weekly Gemini long-context sweep of the Veyrnox wallet
codebase. Veyrnox is a self-custody, coercion-resistant crypto wallet (Vite +
React + Capacitor). Mainnet is live as of 2026-06-17.

Working directory: `/Users/aljobson/Documents/GitHub/veyrnox`
Repo: `VEYRNOX/veyrnox`

> **This is NOT the independent third-party audit.** Gemini output is
> INTERNAL — same class as Claude and Codex output. Complements the per-turn
> Codex hook (adversarial security on the current diff) with a weekly
> repo-wide read (drift, dead code, inconsistent patterns).

## Data-handling gate — READ FIRST

Gemini free tier trains on prompts. This task ONLY sweeps safe paths (UI,
pages, hooks, API-client). Never sweeps `src/wallet-core/`, `src/lib/kek*`,
`src/lib/vault*`, `src/lib/biometric*`, `src/lib/rasp*`, `src/lib/signing*`,
`sql/`, `supabase/functions/`, `android/`, or `ios/`. Codex covers those.

## Step 0 — Preflight

```bash
command -v gemini >/dev/null || {
  echo "ERROR: gemini CLI missing — npm install -g @google/gemini-cli"
  exit 1
}
command -v gh >/dev/null || { echo "ERROR: gh CLI missing"; exit 1; }
gemini --version
```

If `gemini` is missing, stop and report — do NOT attempt install from the
scheduled task.

## Step 1 — Isolated worktree on a per-run branch

The primary checkout is racy (~13 branches across worktrees, several other
scheduled tasks touch it). Never `git checkout` in the shared tree.

```bash
cd /Users/aljobson/Documents/GitHub/veyrnox
git fetch origin main

DATE=$(date +%Y-%m-%d)
BRANCH="gemini-sweep/$DATE"
WT="/tmp/veyrnox-gemini-sweep-$DATE"

git worktree prune
[ -d "$WT" ] && git worktree remove --force "$WT"

# --no-track is REQUIRED — a bare `git push` from this branch would target MAIN otherwise.
git show-ref --verify --quiet "refs/heads/$BRANCH" || \
  git branch --no-track "$BRANCH" origin/main
git config --get "branch.$BRANCH.merge" >/dev/null 2>&1 && \
  git branch --unset-upstream "$BRANCH"

git worktree add "$WT" "$BRANCH"
cd "$WT"
```

If `git worktree add` fails, do NOT fall back to `git checkout`. Report and stop.

## Step 2 — Pick this week's target (rotation)

Rotate weekly across 4 safe subsystems so every path gets reviewed monthly.
Uses ISO week number `% 4` for deterministic rotation.

```bash
WEEK=$(date +%V)
IDX=$(( 10#$WEEK % 4 ))
case "$IDX" in
  0) TARGET="src/components/" ;;
  1) TARGET="src/pages/" ;;
  2) TARGET="src/hooks/" ;;
  3) TARGET="src/api/" ;;
esac
echo "Week $WEEK → target: $TARGET"

[ -d "$TARGET" ] || {
  echo "WARN: $TARGET missing — falling back to src/components/"
  TARGET="src/components/"
}
```

## Step 3 — Build corpus and run Gemini

```bash
FILES=$(find "$TARGET" -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' \) | sort)
COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
BYTES=$(echo "$FILES" | xargs wc -c 2>/dev/null | tail -1 | awk '{print $1}')
COMMIT=$(git rev-parse origin/main)

echo "Files: $COUNT   Bytes: $BYTES   Commit: $COMMIT"

# Warn if approaching Gemini 2.5 Pro's ~1M-token window.
if [ "$BYTES" -gt 3000000 ]; then
  echo "ERROR: target too large ($BYTES bytes ≈ $((BYTES / 4)) tokens). Split it." >&2
  cd /Users/aljobson/Documents/GitHub/veyrnox
  git worktree remove --force "$WT"
  exit 1
fi

CORPUS=$(mktemp -t gemini-corpus.XXXXXX)
trap 'rm -f "$CORPUS"' EXIT

for f in $FILES; do
  echo "=== $f ==="
  cat "$f"
  echo
done > "$CORPUS"

PROMPT="You are the weekly Veyrnox subsystem auditor. Every file under $TARGET is in this prompt. Look for:

1. Drift between related files (two components implementing the same guard differently, a helper called with mismatched signatures, dead code paths a per-diff review would never see together).
2. Missing coverage of shared invariants across the subsystem (every file that reads seed state must gate on isDeniabilityOrDemoActive; every file that writes to shared localStorage must check the same; every file that logs must not log I3-sensitive state).
3. Inconsistent patterns (some files fail-closed on X, others fail-open; some use lib/consent.js, others hit localStorage directly).
4. Dead files — no imports, no route, no test.

Report findings only, in the format:
[SEVERITY] file:line (cross-ref file:line if drift) — what breaks — how to fix
Severities: CRITICAL, HIGH, MEDIUM, LOW. No praise, no summary. If no findings, say exactly: no defects found."

REPORT="docs/audit-gemini-sweep-$DATE.md"
{
  echo "# Gemini weekly sweep — $DATE"
  echo
  echo "> **Internal long-context pass.** Conducted by Gemini 2.5 Pro."
  echo "> INTERNAL only. Does NOT close the independent audit gate."
  echo
  echo "- Target: \`$TARGET\`"
  echo "- Files: $COUNT"
  echo "- Bytes: $BYTES (~$((BYTES / 4)) tokens)"
  echo "- Model: gemini-2.5-pro"
  echo "- Base commit: \`$COMMIT\`"
  echo
  echo "## Findings"
  echo
  cat "$CORPUS" | gemini -m gemini-2.5-pro -p "$PROMPT"
} > "$REPORT"

echo "Report: $REPORT"
```

## Step 4 — Commit, push, PR, merge

Direct commits to `main` are blocked by the `Veyrnox Code Review` ruleset —
must go through a PR.

```bash
git add "$REPORT"
git commit -o "$REPORT" \
  -m "docs(audit): weekly Gemini long-context sweep $DATE"
git push -u origin "$BRANCH"

PR_URL=$(gh pr create --base main --head "$BRANCH" \
  --title "docs(audit): weekly Gemini long-context sweep $DATE" \
  --body "Automated weekly Gemini 2.5 Pro sweep of \`$TARGET\`. Static long-context read only — no dynamic testing, no on-device verification, no on-chain confirmation. INTERNAL: this is NOT the outstanding independent third-party audit.

Model: gemini-2.5-pro
Files: $COUNT | Bytes: $BYTES
Base: $COMMIT")

echo "PR: $PR_URL"
PR_NUM=$(echo "$PR_URL" | grep -oE '[0-9]+$')

gh pr merge "$PR_NUM" --squash --auto
```

`git add` must come first — `git commit -o` errors on an untracked path.
Never `git add -A`, `git add .`, or `commit -a`. Use `--auto`, never `--admin`.

## Step 5 — Confirm it landed

Do not report success until the PR merges. Watch it:

```bash
for i in $(seq 1 80); do
  s=$(gh pr view "$PR_NUM" --json state 2>/dev/null || true)
  case "$s" in
    *'"state":"MERGED"'*) echo "PR #$PR_NUM MERGED"; break ;;
    *'"state":"CLOSED"'*) echo "PR #$PR_NUM CLOSED unmerged"; break ;;
  esac
  f=$(gh pr checks "$PR_NUM" 2>/dev/null | grep -E "fail" || true)
  if [ -n "$f" ]; then echo "FAILING checks:"; echo "$f"; break; fi
  sleep 60
done
```

Report exactly one of: ✅ merged to `main` (give the squash commit);
⚠️ PR open, awaiting checks; 🔴 PR blocked by a failing check (name it).
Never describe an unmerged PR as landed.

## Step 6 — Cleanup

Always remove the worktree, including when the run aborts.

```bash
cd /Users/aljobson/Documents/GitHub/veyrnox
git worktree remove --force "$WT" 2>/dev/null || true
```

## Hard constraints

- Do NOT sweep sensitive paths (`src/wallet-core/`, `src/lib/kek*`, etc.) —
  free-tier Gemini trains on prompts. Rotation list is exhaustive.
- Do NOT mark anything "verified" — this is a static long-context read.
- Do NOT flip any asset status or feature status.
- Push ONLY the per-run `gemini-sweep/<DATE>` branch. NEVER push to `main`.
- NEVER merge with `--admin`.
- Do NOT `git checkout`/`git switch` in the primary working directory.
- Verify Gemini's `file:line` refs before treating a finding as actionable —
  Gemini can hallucinate line numbers. Report is a triage input, not a fix list.
- This is an INTERNAL audit — never describe it as "independent" in the report.

# ponytail: rotation via ISO week % 4 — deterministic, no config file,
# no state to persist. Miss a week (task fails) and the next run picks up
# the next slot naturally.
