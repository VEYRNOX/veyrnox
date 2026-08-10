# Gemini Review Runbook

Long-context second-opinion review of a working branch, using Google's
`gemini` CLI against a free Google account (no API key needed on the free
tier: 60 req/min, 1000 req/day on Flash).

> **This is NOT the independent third-party audit.** Gemini output is
> INTERNAL — same class as Claude and Codex output. The independent audit
> remains an outstanding release gate per `docs/Audit.scope.md`. This
> runbook adds a cheap long-context "third developer" pass complementary to
> the Codex runbook, not a substitute for the audit.

## When to invoke

Reach for Gemini review when:

- The change touches **more files than Codex/Claude can hold in one
  window** — repo-wide refactors, cross-cutting renames, whole-subsystem
  reviews where the reviewer needs to see all callers at once.
- You want a **second AI voice** on a security-sensitive change Codex
  already reviewed (multi-vote confirmation before merge into wallet-core,
  KEK, signing, SQL, or Edge Function paths).
- You need a **whole-directory sweep** (e.g. "review every file under
  `src/wallet-core/` for zeroization contract adherence") that would
  exceed Codex's practical context.

Do NOT reach for Gemini review on:

- Docs-only PRs.
- Changes small enough for Codex alone — running both is noise, not
  signal, unless the change is high-stakes.
- Anything that would send private wallet-core source out. Gemini free
  tier trains on your prompts by default (see "Data handling" below).

## Install (once per machine)

Gemini CLI ships as an npm package:

```bash
npm config set prefix ~/.local
npm install -g @google/gemini-cli

export PATH="$HOME/.local/bin:$PATH"
gemini --version
```

First run opens a browser for Google OAuth. Free tier hits Gemini 2.5
Flash by default; `-m gemini-2.5-pro` upgrades to the 1M-context Pro
model (still free-tier eligible, lower rate limits).

## Invoke on a branch

From the branch's worktree:

```bash
git diff main...HEAD | gemini -p "Review this diff against Veyrnox
security invariants I1..I6 in CLAUDE.md. Report findings only:
file:line, severity (CRITICAL/HIGH/MEDIUM/LOW), what breaks, how to
fix. No praise, no summary."
```

For a whole-subsystem sweep (bigger than a diff):

```bash
find src/wallet-core -type f \( -name '*.js' -o -name '*.ts' \) \
  -exec sh -c 'echo "=== $1 ==="; cat "$1"' _ {} \; \
  | gemini -m gemini-2.5-pro -p "Audit every file for zeroization
    contract adherence. Report only files that violate the contract."
```

Optional flags:

- `-m gemini-2.5-pro` — 1M-context, better reasoning, lower rate limit.
- `-m gemini-2.5-flash` — default; fast, cheap, 1000/day free.
- `--sandbox` / `-s` — read-only sandbox mode; blocks writes.
- `--yolo` — auto-approve tool calls. **Never use in this repo.**

## Read the output

Gemini reports as prose. Two things to look for:

1. **Concrete findings** — any `file:line` reference, "unsafe", "leaks",
   "missing zeroization", "fail-open path", "unbounded input". Treat as
   findings and open follow-up work.
2. **Confirmation vs Codex** — if Codex flagged X and Gemini did too, the
   signal strengthens. If Gemini flagged X and Codex missed it, treat as
   a new finding, not a tiebreaker.

If Gemini reports "no issues found", that is **one model's local view** —
not clearance to merge. CI still gates the merge.

## Data handling — READ BEFORE PIPING SOURCE

Google's free tier for `gemini-cli` **uses your prompts and responses to
improve their products** (per Gemini Code Assist for Individuals terms as
of 2026). Consequences for Veyrnox:

- **Never send wallet-core, KEK, vault, biometric, signing, RASP native,
  or Supabase service-role code through the free tier.** Even a diff
  fragment of these paths is off-limits.
- Docs, UI components, tests, CI, and non-security code are acceptable.
- To review security-sensitive paths, either (a) use the **paid API tier**
  with a Google Cloud project (data-use opt-out available), or (b) skip
  Gemini and use Codex only.
- Verify current terms before every session — Google changes this.

## What Gemini is NOT

- **Not the independent audit.** Same category of trust as Claude/Codex.
  Do not describe a gemini-clean PR as "audited" anywhere.
- **Not a merge gate.** No CI wiring. Manual, opt-in.
- **Not a fix engine here.** Read-only review. Claude implements.
- **Not a Codex replacement.** Codex is stronger on adversarial security
  logic; Gemini wins on breadth. Use both on high-stakes changes.

## Recording the review

When invoking on a branch that will land, paste the Gemini report body
into the PR description under a `## Gemini review` heading. Keep the
exact wording — never paraphrase to a rosier tone. If Codex was also
run, both reports live in the PR body, each under its own heading.

Example PR body fragment:

```
## Gemini review

`gemini -m gemini-2.5-pro` (v0.x.x, 2026-08-10) over 47 files under
src/wallet-core/:

> No zeroization violations found. Two style notes (unused imports in
> hd.js:14, hd.js:22) — non-security.

INTERNAL only — does not close the independent audit gate.
Data handling: reviewed files are UI/logic only, no seed/KEK paths.
```

If Gemini flagged something you chose not to fix, record the reason
inline next to the quoted finding. Never delete a finding to make the
review read cleaner.
