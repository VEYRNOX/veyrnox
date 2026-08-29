#!/usr/bin/env bash
# PostToolUse (Edit/Write) — block bare console.log in security-sensitive paths.
#
# Real incident: WalletEntry.jsx logged `isDemo` to console, leaking whether
# the session was a decoy (I3 violation). Only `import.meta.env.DEV && console.error`
# is acceptable in these paths.
#
# Env overrides:
#   CONSOLE_LOG_GUARD_DISABLE=1  skip entirely

set -u

[ "${CONSOLE_LOG_GUARD_DISABLE:-0}" = "1" ] && exit 0

# Hook receives JSON on stdin: {"tool_name":"Edit","tool_input":{"file_path":"..."}}
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // .tool_response.filePath // empty' 2>/dev/null)
[ -z "$FILE" ] && exit 0

SENSITIVE_PATTERN='(WalletEntry|consent|deniability|panic|kek|vault|biometric|rasp|signing|unlock|duress|stealth)'

case "$FILE" in
  */src/*) ;;
  *) exit 0 ;;
esac

case "$FILE" in
  *__tests__*|*.test.*|*.spec.*) exit 0 ;;
esac

BASENAME=$(basename "$FILE")
if ! echo "$BASENAME" | grep -Eiq "$SENSITIVE_PATTERN"; then
  exit 0
fi

[ -f "$FILE" ] || exit 0

BARE_LOGS=$(grep -nE '^\s*console\.log\(' "$FILE" 2>/dev/null || true)

if [ -n "$BARE_LOGS" ]; then
  echo "[console-log-i3-guard] BLOCKED — bare console.log in security path $BASENAME:" >&2
  echo "$BARE_LOGS" | head -5 | sed 's/^/  /' >&2
  echo "[console-log-i3-guard] In security-sensitive files, use:" >&2
  echo "  import.meta.env.DEV && console.error(...)" >&2
  echo "[console-log-i3-guard] Bare console.log risks I3 deniability leaks." >&2
  echo "Override: CONSOLE_LOG_GUARD_DISABLE=1" >&2
  exit 2
fi

exit 0
