#!/usr/bin/env bash
# Codex peer-review Stop hook.
# Runs `codex review` over Claude's uncommitted work before the turn returns to
# the user. Blocks (exit 2) on HIGH/CRITICAL findings so Claude has to address
# them in the same turn instead of handing back a broken diff.
#
# Skip conditions (exit 0):
#   - no `codex` binary on PATH
#   - no uncommitted changes
#   - diff is docs-only (*.md, docs/**)
#
# Env overrides:
#   CODEX_REVIEW_DISABLE=1         skip entirely
#   CODEX_REVIEW_TIMEOUT=<sec>     default 180
#   CODEX_REVIEW_SEVERITY=<regex>  default matches Codex finding markers only,
#                                  not raw keywords in quoted source

set -u

[ "${CODEX_REVIEW_DISABLE:-0}" = "1" ] && exit 0
command -v codex >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

CHANGED=$(git status --porcelain 2>/dev/null)
[ -z "$CHANGED" ] && exit 0

# Extract the DESTINATION path from each porcelain record. Handles:
#   XY path                → path
#   R  old -> new          → new  (rename)
#   R100 old -> new        → new  (rename with score)
#   C  old -> new          → new  (copy)
# Using $2 alone silently skipped code renames of Markdown files
# (e.g. docs/guide.md -> src/guide.js), letting the review pass on
# net-new code. Codex P2 finding in this hook itself, fixed 2026-08-10.
NON_DOC=$(echo "$CHANGED" | awk '{
  if (match($0, / -> /)) {
    print substr($0, RSTART + RLENGTH);
  } else {
    sub(/^.. /, "");
    print;
  }
}' | grep -Ev '(^|/)(docs/|.*\.md$|CLAUDE\.md$|MEMORY\.md$)' || true)
[ -z "$NON_DOC" ] && exit 0

# Second filter: pre-existing untracked session baggage (bmad artifacts,
# serena state, installed skill packs, etc.). If ALL remaining non-doc
# changes fall in these paths, skip — Codex would review noise that
# predates this turn's work and block on stale findings forever.
# Override with CODEX_REVIEW_EXCLUDE='' to review everything.
EXCLUDE="${CODEX_REVIEW_EXCLUDE:-^(_bmad|_bmad-output|\.serena|\.claude/skills|\.agents/skills)/}"
IN_SCOPE=$(echo "$NON_DOC" | grep -Ev "$EXCLUDE" || true)
[ -z "$IN_SCOPE" ] && exit 0

TIMEOUT="${CODEX_REVIEW_TIMEOUT:-180}"
# Match markers Codex uses to LABEL a finding, not raw keyword mentions.
# Covers: `[HIGH]`, `**HIGH**`, `## HIGH`, `Severity: HIGH`, `- HIGH:`.
SEVERITY="${CODEX_REVIEW_SEVERITY:-(\[(CRITICAL|HIGH|P0|P1)\]|\*\*(CRITICAL|HIGH|P0|P1)\*\*|##[[:space:]]+(CRITICAL|HIGH|P0|P1)|[Ss]everity[[:space:]]*:[[:space:]]*(CRITICAL|HIGH|P0|P1|[Cc]ritical|[Hh]igh))}"
OUT=$(mktemp -t codex-review.XXXXXX)
FINAL=$(mktemp -t codex-final.XXXXXX)
trap 'rm -f "$OUT" "$FINAL"' EXIT

# `codex review --uncommitted` scans staged+unstaged+untracked.
# CLI (0.x) rejects ANY positional prompt with --uncommitted despite the help
# text — including `-`. Rely on Codex's default review behavior + AGENTS.md
# for project-specific rules.
if command -v timeout >/dev/null 2>&1; then
  timeout "$TIMEOUT" codex review --uncommitted >"$OUT" 2>&1
  RC=$?
else
  codex review --uncommitted >"$OUT" 2>&1 &
  PID=$!
  ( sleep "$TIMEOUT" && kill -TERM "$PID" 2>/dev/null ) &
  WATCH=$!
  wait "$PID" 2>/dev/null
  RC=$?
  kill "$WATCH" 2>/dev/null
fi

if [ "$RC" -ne 0 ] && [ "$RC" -ne 124 ]; then
  echo "[codex-peer-review] codex exited $RC — not blocking. Output:" >&2
  sed -n '1,40p' "$OUT" >&2
  exit 0
fi

if [ "$RC" -eq 124 ]; then
  echo "[codex-peer-review] timed out after ${TIMEOUT}s — not blocking." >&2
  exit 0
fi

# Isolate Codex's FINAL response (everything after the last "codex\n" marker)
# so grep only scans the review verdict, not the quoted exec output from
# Codex's exploration steps (which contains our own source keywords).
awk 'BEGIN{keep=""} /^codex$/{keep=""; next} {keep = keep $0 "\n"} END{printf "%s", keep}' "$OUT" > "$FINAL"

# Fallback: if the awk pass produced nothing (unexpected format), scan full output.
[ -s "$FINAL" ] || cp "$OUT" "$FINAL"

# Explicit clean sentinel — Codex's "no defect found" wording.
if grep -Eiq 'no (discrete )?(correctness|security|maintainability|.{0,30})?(defect|issue|finding|problem)s? (was|were) found' "$FINAL"; then
  echo "[codex-peer-review] clean (Codex reported no findings)." >&2
  exit 0
fi

if grep -Eq "$SEVERITY" "$FINAL"; then
  {
    echo "[codex-peer-review] BLOCKED — Codex flagged severity matching /$SEVERITY/."
    echo "Address the findings, or set CODEX_REVIEW_DISABLE=1 to override."
    echo "--- codex review (final response) ---"
    cat "$FINAL"
    echo "--- end ---"
  } >&2
  exit 2
fi

echo "[codex-peer-review] clean (no severity markers in final response)." >&2
exit 0
