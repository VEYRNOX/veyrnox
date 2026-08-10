---
description: Weekly Gemini long-context sweep of a whole subsystem. Uses Gemini 2.5 Pro's 1M-context window to review every file in a directory at once — catches drift and inconsistency the Codex per-diff hook cannot see. Read-only. INTERNAL only, never substitutes for the independent audit.
argument-hint: [subsystem-path] — default src/components/ (safe path). For sensitive paths (src/wallet-core/, sql/, etc.), see the data-handling gate.
---

# Gemini weekly sweep

Cron-friendly long-context audit of a whole subsystem. Complements the
per-turn Codex hook (adversarial security on the current diff) with a
weekly repo-wide read (drift, dead code, inconsistent patterns).

## Data-handling gate — READ FIRST

Gemini free tier trains on prompts. Default target is `src/components/`
(UI, safe). To sweep a sensitive path (`src/wallet-core/`, `src/lib/kek*`,
`sql/`, `supabase/functions/`, `android/`, `ios/`), you MUST either:

- (a) run against a paid Google Cloud project with data-use opt-out
  configured (`gcloud auth application-default login` with the project
  set), OR
- (b) skip this sweep — Codex covers per-diff review of these paths.

If in doubt, sweep a safe path only. Never mix.

## Step 1 — Pick and validate the target

```bash
TARGET="${ARGUMENTS:-src/components/}"
TARGET="${TARGET%/}/"

[ -d "$TARGET" ] || { echo "ERROR: $TARGET is not a directory"; exit 1; }

SENSITIVE_RE='^(src/wallet-core/|src/lib/(kek|vault|biometric|rasp|signing|hkdf|argon|shamir|panic)|sql/|supabase/functions/|android/|ios/)'
if echo "$TARGET" | grep -Eq "$SENSITIVE_RE"; then
  if [ "${GEMINI_PAID_TIER:-0}" != "1" ]; then
    echo "ERROR: $TARGET is sensitive. Set GEMINI_PAID_TIER=1 to confirm you"
    echo "are running against a paid project with data-use opt-out."
    exit 1
  fi
fi

FILES=$(find "$TARGET" -type f \( -name '*.js' -o -name '*.jsx' -o -name '*.ts' -o -name '*.tsx' -o -name '*.sql' -o -name '*.swift' -o -name '*.kt' \) | sort)
COUNT=$(echo "$FILES" | wc -l | tr -d ' ')
BYTES=$(echo "$FILES" | xargs wc -c 2>/dev/null | tail -1 | awk '{print $1}')
echo "Target: $TARGET"
echo "Files:  $COUNT"
echo "Bytes:  $BYTES (~$((BYTES / 4)) tokens estimated)"

# Gemini 2.5 Pro window is ~1M tokens. Warn if we're close.
if [ "$BYTES" -gt 3000000 ]; then
  echo "WARN: >~750k tokens. Consider narrowing the target."
fi
```

## Step 2 — Build the corpus and prompt

```bash
CORPUS=$(mktemp -t gemini-sweep.XXXXXX)
trap 'rm -f "$CORPUS"' EXIT

for f in $FILES; do
  echo "=== $f ==="
  cat "$f"
  echo
done > "$CORPUS"

PROMPT="You are the weekly Veyrnox subsystem auditor. You have every file under $TARGET in one prompt. Look for:

1. Drift between related files (two components implementing the same guard differently, a helper called with mismatched signatures, dead code paths a per-diff review would never see together).
2. Missing coverage of shared invariants across the subsystem (every file that reads seed state must gate on isDeniabilityOrDemoActive; every file that writes to shared localStorage must check the same; every file that logs must not log I3-sensitive state).
3. Inconsistent patterns (some files fail-closed on X, others fail-open; some use lib/consent.js, others hit localStorage directly).
4. Dead files — no imports, no route, no test.

Report findings only, in the format:
[SEVERITY] file:line (and cross-reference file:line if drift) — what breaks — how to fix
Severities: CRITICAL, HIGH, MEDIUM, LOW. No praise, no summary. If no findings, say exactly: no defects found."
```

## Step 3 — Run

```bash
STAMP=$(date +%Y-%m-%d)
REPORT="docs/audit-gemini-sweep-${STAMP}.md"

{
  echo "# Gemini weekly sweep — $STAMP"
  echo
  echo "Target: \`$TARGET\`"
  echo "Files: $COUNT   Bytes: $BYTES"
  echo "Model: gemini-2.5-pro"
  echo
  echo "> INTERNAL only. Does NOT close the independent audit gate."
  echo
  echo "## Findings"
  echo
  cat "$CORPUS" | gemini -m gemini-2.5-pro -p "$PROMPT"
} > "$REPORT"

echo "Report: $REPORT"
```

## Step 4 — Triage

Read the report. For each finding:

1. Verify with a quick source read — Gemini can hallucinate `file:line`.
2. If real, open an issue or fix it via `veyrnox-security-tdd` /
   `veyrnox-ui` on a fresh worktree. Never edit from the sweep report
   alone.
3. If false, note it in the report inline (`# false positive — X exists at
   line N`). Do not delete the finding.
4. If real but out of scope for this cycle, open an issue with the
   report link and move on.

## Wiring cron

This project already has a scheduled-loops registry (`docs/scheduled-loops.md`).
To add this sweep as a weekly loop:

- Loop name: `gemini-weekly-sweep`
- Cadence: weekly, Sunday 03:00 GMT
- Command: `/gemini-weekly-sweep src/components/`
- Owner: security wave
- Rotate the target week-to-week (`src/components/`, `src/pages/`,
  `src/hooks/`) so every safe path gets reviewed monthly.

## Cost

Free tier (Flash): 1000 req/day, but Pro (`gemini-2.5-pro`) is
rate-limited lower — a weekly one-shot fits well within free tier if the
corpus stays under the daily quota. Paid tier only needed for sensitive
paths (see gate above).
