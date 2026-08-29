#!/usr/bin/env bash
# PostToolUse (Edit/Write on src/) — warn when new localStorage keys appear
# that may need adding to ALL_RESIDUE_KEYS in panic.js.
#
# Real incident: veyrnox-first-run-tour-armed/-seen survived panic wipe
# because the keys were never in the residue list. Every deleted component
# orphans its keys silently.
#
# Advisory only (exit 0) — warns, never blocks.
#
# Env overrides:
#   RESIDUE_DRIFT_DISABLE=1  skip entirely

set -u

[ "${RESIDUE_DRIFT_DISABLE:-0}" = "1" ] && exit 0

# Hook receives JSON on stdin: {"tool_name":"Edit","tool_input":{"file_path":"..."}}
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)
[ -z "$FILE" ] && exit 0

# Only check src/ files (not tests, not docs).
case "$FILE" in
  */src/*) ;;
  *) exit 0 ;;
esac

# Skip test files.
case "$FILE" in
  *__tests__*|*.test.*|*.spec.*) exit 0 ;;
esac

# Skip panic.js itself (that's where the list lives).
case "$FILE" in
  */panic.js) exit 0 ;;
esac

[ -f "$FILE" ] || exit 0

HITS=$(grep -nE "localStorage\.(setItem|getItem|removeItem)\(['\"]veyrnox-" "$FILE" 2>/dev/null || true)

if [ -n "$HITS" ]; then
  echo "[residue-key-drift] WARNING — $FILE uses veyrnox-* localStorage keys:" >&2
  echo "$HITS" | head -5 | sed 's/^/  /' >&2
  echo "[residue-key-drift] Cross-check these keys against ALL_RESIDUE_KEYS in" >&2
  echo "[residue-key-drift] src/wallet-core/panic.js. Missing keys survive panic wipe" >&2
  echo "[residue-key-drift] and betray a real wallet existed (deniability leak)." >&2
fi

exit 0
