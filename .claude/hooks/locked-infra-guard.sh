#!/usr/bin/env bash
# PreToolUse (Edit/Write) — block edits to locked infrastructure files.
#
# The TIP Worker chain, Supabase Edge Functions, SecurityAdvisor TIP wiring,
# RevenueCat offer IDs, and Cloudflare Pages env bindings were broken and
# re-fixed across ~7 PRs on 2026-08-11. This hook prevents silent "cleanup"
# edits to those paths without explicit user confirmation.
#
# Env overrides:
#   LOCKED_INFRA_GUARD_DISABLE=1  skip entirely

set -u

[ "${LOCKED_INFRA_GUARD_DISABLE:-0}" = "1" ] && exit 0

# Hook receives JSON on stdin: {"tool_name":"Edit","tool_input":{"file_path":"..."}}
INPUT=$(cat)
FILE=$(echo "$INPUT" | jq -r '.tool_input.file_path // empty' 2>/dev/null)
[ -z "$FILE" ] && exit 0

# Locked paths — from CLAUDE.md "DO NOT TOUCH" section.
LOCKED_PATTERNS=(
  "src/components/SecurityAdvisor.jsx"
  "supabase/functions/tip-chat"
  "supabase/functions/tip-screen"
  "supabase/functions/rc-webhook"
  "functions/api/edge/[fn].js"
  "src/lib/purchases.js"
)

LOCKED_SEGMENTS=(
  "veyrnox-tip/"
  "wrangler.toml"
)

for pat in "${LOCKED_PATTERNS[@]}"; do
  if [[ "$FILE" == *"$pat"* ]]; then
    echo "[locked-infra-guard] BLOCKED — $FILE is locked infrastructure." >&2
    echo "Read CLAUDE.md 'DO NOT TOUCH THE CORE INFRA WIRING' section and" >&2
    echo "docs/Feature-Status.md 2026-08-11 entry before changing this file." >&2
    echo "Confirm the specific change with the user first." >&2
    echo "Override: LOCKED_INFRA_GUARD_DISABLE=1" >&2
    exit 2
  fi
done

for seg in "${LOCKED_SEGMENTS[@]}"; do
  if [[ "$FILE" == *"$seg"* ]]; then
    echo "[locked-infra-guard] BLOCKED — $FILE matches locked segment '$seg'." >&2
    echo "Read CLAUDE.md 'DO NOT TOUCH THE CORE INFRA WIRING' section first." >&2
    echo "Override: LOCKED_INFRA_GUARD_DISABLE=1" >&2
    exit 2
  fi
done

exit 0
