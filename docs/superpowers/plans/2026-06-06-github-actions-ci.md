# GitHub Actions CI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a GitHub Actions workflow that runs `lint`, `build`, and `test` on every pull request and on pushes to `main`, so the existing guard tests become enforceable PR checks.

**Architecture:** One workflow file (`.github/workflows/ci.yml`) with a single `ubuntu-latest` / Node 20 job: `npm ci → lint → build → test`. No production code changes. `typecheck` is deliberately excluded (1,584 pre-existing `checkJs` errors).

**Tech Stack:** GitHub Actions (`actions/checkout@v4`, `actions/setup-node@v4`), npm, the repo's existing `lint`/`build`/`test` scripts.

Spec: `docs/superpowers/specs/2026-06-06-github-actions-ci-design.md`

**Note on shape:** this is a config file, not testable code — there is no TDD red/green. Verification is (a) the YAML parses, and (b) the three gated commands are green locally on this branch. Authoritative validation is the live PR run, confirmed at finish time.

---

### Task 1: Add the CI workflow file

**Files:**
- Create: `.github/workflows/ci.yml`

- [ ] **Step 1: Create `.github/workflows/ci.yml` with EXACTLY this content**

```yaml
name: CI

on:
  pull_request:
  push:
    branches: [main]

# Cancel superseded runs on the same ref to save minutes.
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true

permissions:
  contents: read

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run build
      - run: npm test
```

- [ ] **Step 2: Verify the YAML parses**

Run: `npx --offline js-yaml .github/workflows/ci.yml`
Expected: exit 0; it prints the parsed structure (a JS object with `name`, `on`,
`concurrency`, `permissions`, `jobs`). A parse error would exit non-zero and name
the line — fix the YAML if so.

- [ ] **Step 3: Sanity-check the key fields**

Run: `npx --offline js-yaml .github/workflows/ci.yml | grep -E "verify|npm (ci|run|test)|node-version"`
Expected output contains the `verify` job and the steps `npm ci`, `npm run lint`,
`npm run build`, `npm test`, plus `node-version`. Confirms nothing was dropped.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: run lint + build + test on PRs and pushes to main"
```

---

### Task 2: Confirm the gate is green locally

CI will run `npm ci → lint → build → test`. Prove those pass on this branch
before relying on CI. (This worktree was created without installing deps, so
start with `npm ci` — the same command CI uses.)

**Files:** none (verification only).

- [ ] **Step 1: Install deps reproducibly (as CI does)**

Run: `npm ci`
Expected: completes without error (installs from `package-lock.json`).

- [ ] **Step 2: Lint**

Run: `npm run lint`
Expected: exit 0, no output (`eslint . --quiet`).

- [ ] **Step 3: Build**

Run: `npm run build`
Expected: exit 0; `vite build` completes and writes `dist/`.

- [ ] **Step 4: Test**

Run: `npm test`
Expected: PASS — 438 passed / 48 files, 0 failures (runs the `pretest`
crypto-RNG check first). Takes ~5–7 min (64 MiB Argon2id KDF).

- [ ] **Step 5: Confirm clean tree**

Run: `git status --short`
Expected: empty except possibly an untracked `dist/` (which `.gitignore` already
ignores) — so effectively empty. Do NOT commit `dist/`.

---

## Notes for the implementer

- This adds ONLY `.github/workflows/ci.yml`. If you find yourself editing any
  `src/` file or a script, stop — out of scope.
- Do NOT add `npm run typecheck` to the workflow. It has 1,584 pre-existing
  `checkJs` errors and would make CI red on every run (see spec).
- The workflow's real validation is the live PR run on GitHub (it parses the
  file authoritatively and runs the job). That happens when the branch is pushed
  and a PR is opened — at the finishing-a-development-branch step, confirm the
  `CI / verify` check appears and goes green.
- `node-version: 20` is intentional (no `engines` field pins one; 20 is current
  LTS).
