#!/usr/bin/env bash
# PreToolUse (Bash: git commit) — scan staged diff for bypass flags, secrets,
# and the Co-Authored-By trailer before committing.
#
# Real incidents this prevents:
#   - VITE_BYPASS_RASP:"1" in a built bundle (2026-08-15)
#   - Co-Authored-By trailer added against CLAUDE.md rule
#   - .env.local or secret patterns in staged files
#
# Env overrides:
#   PRE_COMMIT_SCAN_DISABLE=1  skip entirely

set -u

[ "${PRE_COMMIT_SCAN_DISABLE:-0}" = "1" ] && exit 0

# Hook receives JSON on stdin: {"tool_name":"Bash","tool_input":{"command":"git commit ..."}}
INPUT=$(cat)
CMD=$(echo "$INPUT" | jq -r '.tool_input.command // empty' 2>/dev/null)

# Only fire on git commit commands.
case "$CMD" in
  git\ commit*|git\ -C\ *commit*) ;;
  *) exit 0 ;;
esac

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || exit 0

ERRORS=""

# --- Check 1: Co-Authored-By trailer ---
if echo "$CMD" | grep -qi 'Co-Authored-By'; then
  ERRORS="${ERRORS}[pre-commit-scan] BLOCKED — commit message contains Co-Authored-By trailer.\n"
  ERRORS="${ERRORS}  CLAUDE.md rule: never add Co-Authored-By to commits in this project.\n"
fi

# --- Check 2: Bypass flags in staged diff ---
STAGED=$(git diff --cached --unified=0 2>/dev/null || true)
if [ -n "$STAGED" ]; then
  BYPASS_HITS=$(echo "$STAGED" | grep '^\+' | grep -v '^\+\+\+' | \
    grep -v '^\+[[:space:]]*//' | grep -v '^\+[[:space:]]*#' | grep -v '^\+[[:space:]]*\*' | \
    grep -E '(VITE_BYPASS_RASP|VITE_DEV_UNGATE_SEND|VITE_FORCE_TIER|VITE_DEMO_MODE)[[:space:]]*[=:][[:space:]]*["'"'"']?(1|true)' || true)

  if [ -n "$BYPASS_HITS" ]; then
    ERRORS="${ERRORS}[pre-commit-scan] BLOCKED — staged diff contains bypass flag set to truthy:\n"
    ERRORS="${ERRORS}$(echo "$BYPASS_HITS" | head -5 | sed 's/^/  /')\n"
    ERRORS="${ERRORS}  These flags must only live in .env.local (git-ignored), never committed.\n"
  fi

  # --- Check 3: Secret patterns in staged diff ---
  SECRET_HITS=$(echo "$STAGED" | grep '^\+' | grep -v '^\+\+\+' | \
    grep -v '^\+[[:space:]]*//' | grep -v '^\+[[:space:]]*#' | \
    grep -E '(sk_live_|sk_test_|eyJhbGciOi|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{36}|xoxb-|xoxp-)' || true)

  if [ -n "$SECRET_HITS" ]; then
    ERRORS="${ERRORS}[pre-commit-scan] BLOCKED — staged diff may contain secrets:\n"
    ERRORS="${ERRORS}$(echo "$SECRET_HITS" | head -3 | sed 's/^/  /')\n"
  fi

  # --- Check 4: .env.local or credential files staged ---
  STAGED_FILES=$(git diff --cached --name-only 2>/dev/null || true)
  ENV_HITS=$(echo "$STAGED_FILES" | grep -E '(\.env\.local|\.env\.production|credentials\.json|\.p8$|\.jks$|\.keystore$)' || true)

  if [ -n "$ENV_HITS" ]; then
    ERRORS="${ERRORS}[pre-commit-scan] BLOCKED — sensitive file staged for commit:\n"
    ERRORS="${ERRORS}$(echo "$ENV_HITS" | sed 's/^/  /')\n"
  fi
fi

if [ -n "$ERRORS" ]; then
  echo -e "$ERRORS" >&2
  echo "[pre-commit-scan] Fix the issues above or set PRE_COMMIT_SCAN_DISABLE=1." >&2
  exit 2
fi

exit 0
