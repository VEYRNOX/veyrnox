# Codex Review Runbook

Second-opinion read-only review of a working branch, using OpenAI Codex CLI
against ChatGPT Plus/Pro auth (no separate API key).

> **This is NOT the independent third-party audit.** Codex output is
> INTERNAL — same class as Claude output. The independent audit remains an
> outstanding release gate per `docs/Audit.scope.md`. This runbook adds a
> cheap "second developer" pass to catch defects before the audit's target
> is scoped, not to bypass the audit.

## When to invoke

Reach for Codex review when:

- The change touches `src/wallet-core/`, `src/lib/kek*`, `src/lib/vault*`,
  `src/lib/biometric*`, the RASP native bridge, or any signing chokepoint.
- The change adds a new caller to a cryptographic primitive (Shamir, KEK,
  vault AAD, HKDF, Argon2id).
- The change touches SQL migrations, Supabase RPC signatures, or Edge
  Function auth.
- CI has been red on a flake for more than one PR and you want an
  independent read on whether your PR made it worse.

Do NOT reach for Codex review on:

- Docs-only PRs.
- Test-only PRs where the tested code was previously reviewed.
- Trivial dependency bumps a Dependabot advisory already annotates.

## Install (once per machine)

Codex CLI ships as an npm package. On this Mac:

```bash
# use a user-local npm prefix so the install needs no sudo
npm config set prefix ~/.local
npm install -g @openai/codex

# ensure ~/.local/bin is on PATH (add to ~/.zshrc if not already there)
export PATH="$HOME/.local/bin:$PATH"

codex --version    # sanity
codex doctor       # confirms auth
```

Auth reuses the Codex desktop app's `~/.codex/auth.json` if the desktop app
is installed and logged in. Otherwise run `codex login` (opens a browser).

## Invoke on a branch

From the branch's worktree:

```bash
codex review --base main
```

Codex reads the diff, may `exec` a few read-only commands (git blame, ripgrep,
targeted `vitest run`, `npm run typecheck:core`), and prints a plain-text
verdict. Everything runs locally; nothing is posted to the PR.

Optional flags worth knowing:

- `--uncommitted` — review staged + unstaged + untracked instead of a branch
  diff. Useful mid-implementation before committing.
- `-c model="o3"` — force a specific model (default is the account default).
- Pass a custom prompt as the trailing argument to focus the review, e.g.
  `codex review --base main "focus on the zeroization contract and any KEK
  imports the wrapper might have added"`.

## Read the output

Codex reports as prose. Two things to look for:

1. **Concrete findings** — any file:line reference, "unsafe", "leaks",
   "missing zeroization", "fail-open path", "unbounded input". Treat as
   findings and open follow-up work.
2. **Silent skips** — Codex sometimes doesn't touch a file it should have.
   Confirm the review covered every file in the diff (Codex prints an
   `exec` line per command it ran; the diff header at the top lists what
   was fed in).

If Codex ran tests / lint / typecheck and reports them green, that is
**local** evidence — it does NOT stand in for CI. CI still gates the
merge.

## What Codex is NOT

- **Not the independent audit.** Codex is an AI running against your local
  auth — same category of trust as Claude. Do not describe a codex-clean
  PR as "audited" in commit messages, PR bodies, or release notes.
- **Not a merge gate.** There is no CI wiring that runs codex on every
  PR — this runbook is a manual invocation, opt-in by the author.
- **Not a fix engine here.** Per CLAUDE.md, Codex is read-only (`codex
  review` / `codex exec -s read-only`). Claude reads the report and
  implements.

## Recording the review

When invoking on a branch that will land, paste the codex report body into
the PR description under a `## Codex review` heading. Keep the exact
wording — never paraphrase to a rosier tone.

Example PR body fragment:

```
## Codex review

`codex review --base main` (v0.147.0, 2026-08-08):

> The new wrapper remains fail-closed and unreachable from production
> paths, validates the DEK before sharding, and delegates to the existing
> Shamir implementation. The targeted tests, lint, and wallet-core
> typecheck pass.

INTERNAL only — does not close the independent audit gate.
```

If Codex flagged something you chose not to fix, record the reason inline
next to the quoted finding. Never delete a finding to make the review
read cleaner.
