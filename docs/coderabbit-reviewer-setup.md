# CodeRabbit Reviewer Setup

This repo now includes a root [`.coderabbit.yaml`](/Users/aljobson/Documents/GitHub/veyrnox/.coderabbit.yaml) and a PR template that steer CodeRabbit toward architecture, security, logic, and honesty review instead of style-only feedback.

## What The Repo Config Does

- Enables automatic review on every PR, including drafts.
- Asks for inline comments and a risk-oriented summary.
- Pushes the reviewer toward trust boundaries, fail-closed behaviour, downgrade paths, and verification gaps.
- Adds path-specific instructions for `src/wallet-core/`, native code, workflows, backend code, scripts, tests, docs, and dependency changes.
- Enables CodeRabbit `ast-grep` essential security rules.

## GitHub-Side Step Still Required

The repo config alone does not install the reviewer. To activate it:

1. Install the CodeRabbit GitHub app for this repository or organization.
2. Open a PR and confirm the bot posts a walkthrough comment and inline findings.
3. Optionally require the CodeRabbit review/status check in branch protection if you want it to gate merges.

## Notes For Veyrnox

- `AGENTS.md` and `.github/copilot-instructions.md` are already present in the repo. CodeRabbit documents that it can use files like these as review criteria automatically, so the new YAML config is additive, not a replacement.
- The reviewer is instructed to flag misuse of `verified`, `audited`, `independent`, and `live` based on the repo's existing honesty rules.
- This setup is intentionally biased toward high-signal findings. It should still comment inline, but it is asked to de-emphasise pure style nits unless they hide a real risk.
