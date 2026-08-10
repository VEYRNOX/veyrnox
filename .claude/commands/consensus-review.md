---
description: Fan the current branch diff to Codex AND Gemini, keep only findings both models flag (≥2-confirm). Cuts single-model false positives. Use on high-stakes changes headed for merge — wallet-core, KEK, signing, SQL. INTERNAL only, never substitutes for the independent audit.
argument-hint: [focus] — optional extra instructions (e.g. "focus on zeroization" or "check AAD binding")
---

# Consensus review — Codex + Gemini

Second AND third opinion on the current branch diff. Fans the same
prompt to Codex and Gemini in parallel, then keeps only findings that
BOTH models flag (or a single-model finding severe enough to warrant
attention on its own).

Rationale: single-model reviews carry a false-positive tail. A finding
two independent models converge on is signal; a finding only one raises
is worth a look but rarely a block.

## Data-handling gate — READ FIRST

Gemini free tier trains on prompts. If the diff touches any of:

- `src/wallet-core/`, `src/lib/kek*`, `src/lib/vault*`, `src/lib/biometric*`,
- `src/lib/rasp*`, `src/lib/signing*`, `src/lib/hkdf*`, `src/lib/argon*`,
- `src/lib/shamir*`, `src/lib/panic*`,
- `sql/`, `supabase/functions/`,
- `android/app/src/main/java/`, `ios/App/App/`

...you must either (a) run against a paid Google Cloud project with
data-use opt-out, or (b) skip Gemini and use Codex alone.

The script below auto-detects and blocks by default. Override with
`CONSENSUS_ALLOW_SENSITIVE=1` if you have (a).

## Step 1 — Sanity

```bash
CURRENT=$(git branch --show-current)
[ "$CURRENT" = "main" ] && { echo "ERROR: switch to a feature branch"; exit 1; }

command -v codex  >/dev/null || { echo "ERROR: codex CLI missing (npm i -g @openai/codex)"; exit 1; }
command -v gemini >/dev/null || { echo "ERROR: gemini CLI missing (npm i -g @google/gemini-cli)"; exit 1; }

git fetch origin main --quiet 2>/dev/null || true
STAT=$(git diff origin/main...HEAD --stat 2>/dev/null | tail -1)
[ -z "$STAT" ] && { echo "WARN: empty diff"; exit 1; }
echo "Branch: $CURRENT"
echo "Diff:   $STAT"
```

## Step 2 — Data-handling check

```bash
SENSITIVE='(^|/)(src/wallet-core/|src/lib/(kek|vault|biometric|rasp|signing|hkdf|argon|shamir|panic)|sql/|supabase/functions/|android/app/src/main/java/|ios/App/App/)'
CHANGED_PATHS=$(git diff origin/main...HEAD --name-only)
HITS=$(echo "$CHANGED_PATHS" | grep -E "$SENSITIVE" || true)

USE_GEMINI=1
if [ -n "$HITS" ] && [ "${CONSENSUS_ALLOW_SENSITIVE:-0}" != "1" ]; then
  echo "SKIPPING GEMINI — sensitive paths touched:"
  echo "$HITS" | sed 's/^/  /'
  echo "Codex-only mode. Set CONSENSUS_ALLOW_SENSITIVE=1 on paid tier with"
  echo "data-use opt-out to include Gemini."
  USE_GEMINI=0
fi
```

## Step 3 — Fan Codex + Gemini in parallel

Shared prompt so both models get the same instructions.

```bash
FOCUS="${ARGUMENTS:-}"
PROMPT_BODY="You are one of two independent security reviewers for the Veyrnox self-custody wallet. Review the branch diff (git diff origin/main...HEAD) against invariants I1..I6 from CLAUDE.md.

Report findings only, in this exact format so a script can join them:
[SEVERITY] path/to/file.ext:LINE — <one-line what breaks> — <one-line fix>
Severities: CRITICAL, HIGH, MEDIUM, LOW.
No praise, no summary, no prose outside the finding lines. If none, say exactly: no defects found.${FOCUS:+

Extra focus: $FOCUS}"

CODEX_OUT=$(mktemp -t consensus-codex.XXXXXX)
GEMINI_OUT=$(mktemp -t consensus-gemini.XXXXXX)
trap 'rm -f "$CODEX_OUT" "$GEMINI_OUT"' EXIT

# Codex — runs its own git commands via exec
codex review "$PROMPT_BODY" -c 'model_reasoning_effort="high"' </dev/null >"$CODEX_OUT" 2>&1 &
CODEX_PID=$!

# Gemini — needs the diff piped in
if [ "$USE_GEMINI" = "1" ]; then
  git diff origin/main...HEAD | gemini -m gemini-2.5-pro -p "$PROMPT_BODY" >"$GEMINI_OUT" 2>&1 &
  GEMINI_PID=$!
fi

wait "$CODEX_PID"
CODEX_RC=$?
if [ "$USE_GEMINI" = "1" ]; then
  wait "$GEMINI_PID"
  GEMINI_RC=$?
fi

echo "codex exit: $CODEX_RC"
[ "$USE_GEMINI" = "1" ] && echo "gemini exit: $GEMINI_RC"
```

## Step 4 — Extract findings and consensus

Findings are lines matching `[SEVERITY] path:line`. Normalize by
`path:line` for the join.

```bash
extract() {
  # $1 = output file
  grep -oE '\[(CRITICAL|HIGH|MEDIUM|LOW)\][^[:cntrl:]]+' "$1" \
    | awk -F: '{
        # extract path:line as the join key
        match($0, /\] +([^:]+):([0-9]+)/, m);
        if (m[1] && m[2]) print m[1] ":" m[2] "\t" $0;
      }' \
    | sort -u
}

CODEX_FINDINGS=$(extract "$CODEX_OUT")
if [ "$USE_GEMINI" = "1" ]; then
  GEMINI_FINDINGS=$(extract "$GEMINI_OUT")
  CONSENSUS=$(comm -12 <(echo "$CODEX_FINDINGS" | cut -f1 | sort -u) \
                       <(echo "$GEMINI_FINDINGS" | cut -f1 | sort -u))
fi
```

## Step 5 — Report

Print in this order:

1. **Consensus findings (≥2-confirm)** — Codex AND Gemini flagged the
   same `path:line`. Treat as blocking. Quote BOTH models' wording so
   the reader sees where they agree/disagree on severity.
2. **Codex-only findings** — advisory. Read, decide.
3. **Gemini-only findings** — advisory. Gemini has broader recall but
   more false positives; verify against source before acting.
4. **Verdict**: BLOCK if any consensus finding is CRITICAL or HIGH; else
   PASS with advisories.

If Gemini was skipped (sensitive-path gate), state that explicitly. The
verdict then reads "PASS-Codex-only" or "BLOCK-Codex-only" — never
promote a Codex-only clean read to a full consensus PASS.

## Recording

Paste the consensus block into the PR description under a
`## Consensus review (Codex + Gemini)` heading. Full model outputs go
into `docs/consensus-review-<sha>.md` if the diff was substantive.
Keep both models' wording verbatim; never paraphrase.

## What this is NOT

- **Not the independent audit.** Two AIs voting is still two AIs.
- **Not a merge gate.** Manual, opt-in per PR.
- **Not a fix engine.** Read-only. Claude implements on a fresh worktree.
- **Not a silence machine.** A single-model finding can still be real —
  the consensus filter is a prioritization aid, not a dismissal.

# ponytail: no third model. Two independent voices already gives the
# consensus signal; a third adds cost and voting-paradox questions
# ("2-of-3? unanimous?") without measurably improving recall on the
# defect classes this repo cares about.
