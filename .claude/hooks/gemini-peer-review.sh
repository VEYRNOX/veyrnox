#!/usr/bin/env bash
# Gemini peer-review Stop hook — SAFE-PATH SCOPED.
#
# Runs `gemini` over Claude's uncommitted work before the turn returns.
# Blocks (exit 2) on HIGH/CRITICAL findings. Complements the Codex hook:
# Codex is stronger on adversarial security logic, Gemini adds long-context
# breadth and a second AI voice.
#
# CRITICAL DATA-HANDLING GATE
# Gemini free tier trains on prompts. This hook HARD-EXCLUDES paths that
# must never be sent out: wallet-core, KEK, vault, biometric, RASP native,
# signing chokepoints, Supabase migrations, Edge Functions, and anything
# under android/ios native. If ALL changes fall in excluded paths, skip.
# If ANY change is in an excluded path, skip (don't send a mixed diff —
# too easy to leak).
#
# Skip conditions (exit 0):
#   - no `gemini` binary on PATH
#   - no uncommitted changes
#   - diff is docs-only
#   - diff touches a hard-excluded (security-sensitive) path
#   - diff falls entirely in noise-excluded paths (bmad, serena, etc.)
#
# Env overrides:
#   GEMINI_REVIEW_DISABLE=1        skip entirely
#   GEMINI_REVIEW_TIMEOUT=<sec>    default 180
#   GEMINI_REVIEW_MODEL=<name>     default gemini-2.5-flash
#   GEMINI_REVIEW_SEVERITY=<regex> match finding labels only
#   GEMINI_REVIEW_ALLOW_SENSITIVE=1  bypass data-handling gate (paid-tier
#                                    project with data-use opt-out only)

set -u

[ "${GEMINI_REVIEW_DISABLE:-0}" = "1" ] && exit 0
command -v gemini >/dev/null 2>&1 || exit 0
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

CHANGED=$(git status --porcelain 2>/dev/null)
[ -z "$CHANGED" ] && exit 0

# Extract destination path per porcelain record (handles renames).
PATHS=$(echo "$CHANGED" | awk '{
  if (match($0, / -> /)) {
    print substr($0, RSTART + RLENGTH);
  } else {
    sub(/^.. /, "");
    print;
  }
}')

# Drop docs.
NON_DOC=$(echo "$PATHS" | grep -Ev '(^|/)(docs/|.*\.md$|CLAUDE\.md$|MEMORY\.md$)' || true)
[ -z "$NON_DOC" ] && exit 0

# Drop session/noise paths.
NOISE="${GEMINI_REVIEW_EXCLUDE:-^(_bmad|_bmad-output|\.serena|\.claude/skills|\.agents/skills)/}"
IN_SCOPE=$(echo "$NON_DOC" | grep -Ev "$NOISE" || true)
[ -z "$IN_SCOPE" ] && exit 0

# HARD DATA-HANDLING GATE — never send these paths to Gemini free tier.
SENSITIVE='(^|/)(src/wallet-core/|src/lib/kek|src/lib/vault|src/lib/biometric|src/lib/rasp|src/lib/signing|src/lib/hkdf|src/lib/argon|src/lib/shamir|src/lib/panic|sql/|supabase/functions/|android/app/src/main/java/|ios/App/App/)'
if [ "${GEMINI_REVIEW_ALLOW_SENSITIVE:-0}" != "1" ]; then
  HITS=$(echo "$IN_SCOPE" | grep -E "$SENSITIVE" || true)
  if [ -n "$HITS" ]; then
    echo "[gemini-peer-review] skipping — diff touches sensitive path(s):" >&2
    echo "$HITS" | sed 's/^/  /' >&2
    echo "[gemini-peer-review] Codex hook handles these. To force Gemini" >&2
    echo "[gemini-peer-review] on paid-tier project with data-use opt-out," >&2
    echo "[gemini-peer-review] set GEMINI_REVIEW_ALLOW_SENSITIVE=1." >&2
    exit 0
  fi
fi

TIMEOUT="${GEMINI_REVIEW_TIMEOUT:-180}"
MODEL="${GEMINI_REVIEW_MODEL:-gemini-2.5-flash}"
SEVERITY="${GEMINI_REVIEW_SEVERITY:-(\[(CRITICAL|HIGH|P0|P1)\]|\*\*(CRITICAL|HIGH|P0|P1)\*\*|##[[:space:]]+(CRITICAL|HIGH|P0|P1)|[Ss]everity[[:space:]]*:[[:space:]]*(CRITICAL|HIGH|P0|P1|[Cc]ritical|[Hh]igh))}"

DIFF=$(mktemp -t gemini-diff.XXXXXX)
OUT=$(mktemp -t gemini-review.XXXXXX)
trap 'rm -f "$DIFF" "$OUT"' EXIT

# Collect uncommitted diff (staged + unstaged + untracked) for in-scope paths only.
{
  git diff HEAD -- $IN_SCOPE 2>/dev/null
  # Untracked: show as new-file additions.
  echo "$CHANGED" | awk '/^\?\? /{sub(/^\?\? /, ""); print}' | while read -r f; do
    [ -f "$f" ] || continue
    echo "$IN_SCOPE" | grep -qxF "$f" || continue
    echo "diff --git a/$f b/$f"
    echo "new file"
    echo "--- /dev/null"
    echo "+++ b/$f"
    sed 's/^/+/' "$f"
  done
} > "$DIFF"

[ -s "$DIFF" ] && [ "$(wc -c < "$DIFF")" -gt 0 ] || exit 0

PROMPT="Review this diff against Veyrnox security invariants I1..I6 (see CLAUDE.md). Report findings only, in the format:
[SEVERITY] file:line — what breaks — how to fix
Severities: CRITICAL, HIGH, MEDIUM, LOW. No praise, no summary. If no findings, say exactly: no defects found."

run_gemini() {
  cat "$DIFF" | gemini -m "$MODEL" -p "$PROMPT" >"$OUT" 2>&1
}

if command -v timeout >/dev/null 2>&1; then
  timeout "$TIMEOUT" bash -c "$(declare -f run_gemini); run_gemini"
  RC=$?
else
  run_gemini &
  PID=$!
  ( sleep "$TIMEOUT" && kill -TERM "$PID" 2>/dev/null ) &
  WATCH=$!
  wait "$PID" 2>/dev/null
  RC=$?
  kill "$WATCH" 2>/dev/null
fi

if [ "$RC" -eq 124 ]; then
  echo "[gemini-peer-review] timed out after ${TIMEOUT}s — not blocking." >&2
  exit 0
fi
if [ "$RC" -ne 0 ]; then
  echo "[gemini-peer-review] gemini exited $RC — not blocking. Output:" >&2
  sed -n '1,20p' "$OUT" >&2
  exit 0
fi

if grep -Eiq 'no defects? found' "$OUT"; then
  echo "[gemini-peer-review] clean." >&2
  exit 0
fi

if grep -Eq "$SEVERITY" "$OUT"; then
  {
    echo "[gemini-peer-review] BLOCKED — Gemini flagged severity matching /$SEVERITY/."
    echo "Address the findings, or set GEMINI_REVIEW_DISABLE=1 to override."
    echo "--- gemini review ---"
    cat "$OUT"
    echo "--- end ---"
  } >&2
  exit 2
fi

echo "[gemini-peer-review] clean (no severity markers)." >&2
exit 0
# ponytail: no consensus logic here — Codex hook runs separately; consensus
# lives in .claude/commands/consensus-review.md for on-demand invocation.
