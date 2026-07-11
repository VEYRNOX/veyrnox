---
description: Run Codex as a second security reviewer on the current branch diff. Codex works on a separate read-only pass — it never edits files. Claude reads the report and decides whether to act.
argument-hint: [focus] — optional extra instructions for Codex (e.g. "focus on key derivation" or "check deniability paths")
---

# Codex security review

You are orchestrating Codex as a **second, independent security reviewer**. Codex does not
edit any files. It reads the diff, reports findings, and you (Claude) synthesise the result
and decide what to fix — on a separate worktree/branch so the two agents never touch the
same branch.

## Step 1 — Sanity checks

```bash
# Must be on a non-main branch
CURRENT=$(git branch --show-current)
[ "$CURRENT" = "main" ] && echo "ERROR: switch to a feature branch first" && exit 1
echo "Branch: $CURRENT"

# Codex must be present
command -v codex >/dev/null || { echo "ERROR: codex CLI not found. Install: npm install -g @openai/codex"; exit 1; }
codex --version
```

If the branch is `main`, stop and tell the user to switch to the correct branch.

## Step 2 — Collect the diff

```bash
git fetch origin main --quiet 2>/dev/null || true
DIFF=$(git diff origin/main...HEAD 2>/dev/null)
STAT=$(git diff origin/main...HEAD --stat 2>/dev/null | tail -1)
echo "Diff size: $STAT"
[ -z "$DIFF" ] && echo "WARN: empty diff — nothing to review"
```

If the diff is empty, warn the user and ask whether to continue.

## Step 3 — Run Codex security pass

Build a focused security prompt. Substitute `$ARGUMENTS` for the user's optional focus hint.

```bash
FOCUS="${ARGUMENTS:-}"
TMPERR=$(mktemp)

codex review "IMPORTANT: Do NOT read or execute any files under ~/.claude/, ~/.agents/, .claude/skills/, or agents/. Stay focused on the repository code only. Do NOT modify any files.

You are the second security reviewer for the Veyrnox self-custody wallet. Review the changes on this branch against main. Run: git diff origin/main...HEAD

Security invariants to enforce (flag violations as [P1]):
- I1: keys never leave the device. No key or seed material in network calls, logs, or IPC.
- I2: no silent data egress. No new fetch/axios/CapacitorHttp calls on a deniability path.
- I3: deniability mode makes zero backend calls. Decoy/hidden sessions must be network-silent.
- I4: fail honest, fail closed. Security controls must not be mocked or stubbed to look real.
- I5: backend untrusted by design.

Also flag [P1] for:
- Anything claiming 'verified' or flipping asset status to 'live' without an on-chain txid
- An internal audit presented as independent
- Wallet count or seed material rendered in the UI
- New attack surface on the send/sign path

Flag [P2] for advisory items (honesty gaps, missing tests, docs out of sync).${FOCUS:+

Extra focus: $FOCUS}" \
  -c 'model_reasoning_effort="high"' \
  --enable web_search_cached \
  < /dev/null 2>"$TMPERR"

CODEX_EXIT=$?
grep "tokens used" "$TMPERR" 2>/dev/null || true
[ "$CODEX_EXIT" != "0" ] && cat "$TMPERR" | head -20
```

## Step 4 — Report and gate

After Codex returns:

- List all `[P1]` findings first. If any exist, the gate is **FAIL**.
- List `[P2]` findings second.
- State the verdict: **PASS** (no P1s) or **FAIL** (P1s found).

For each [P1]:
1. State the file:line, the invariant violated, and Codex's exact finding.
2. Ask the user whether to fix it now. If yes, open a new worktree (do NOT edit the current
   branch while Codex's report is still open) and apply the fix via `veyrnox-security-tdd`.
3. Re-run `codex review` on the new branch after the fix to confirm the P1 is closed.

**Branch safety rule:** Claude fixes go on `claude/<slug>` worktrees. Codex's review pass
is always read-only against the current branch. The two never write to the same branch at
the same time.
