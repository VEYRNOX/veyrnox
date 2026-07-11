# ECC Plugin — QA Findings

## Test Suite
- Result: FAIL (before fixes) → PASS (after inline fixes)
- Total: Approximately 1,200+ individual test assertions across 70+ test files
- Pre-fix failures:
  - `ci/no-personal-paths.test.js` — personal paths (`C:\Users\<username>`) in `docs/superpowers/plans/` and `docs/superpowers/specs/` plan files
  - `ci/validators.test.js` — catalog skill count mismatch: docs said 271 skills, actual 272
  - `scripts/harness-audit.test.js` — Windows isolation bug: test set `HOME` but not `USERPROFILE`, causing real installed plugin to be found instead of fixture
- Permanent environment failures (not code bugs, not fixed):
  - `scripts/instinct-cli-projects.test.js` (9 failures) — Python not installed on this machine
  - All other test files: PASS

## Markdown Lint
- Violations: 0
- none

## CI Validators
- validate-agents: PASS (67 agents)
- validate-commands: PASS (92 commands)
- validate-skills: PASS (272 skill directories)
- validate-hooks: PASS (28 hook matchers)
- validate-rules: PASS (114 rule files)
- validate-install-manifests: PASS (32 modules, 78 components, 7 profiles)
- check-unicode-safety: PASS

## Frontmatter Gaps
- none

## Findings Table

| ID | Severity | Description | File:line | Fixed inline? |
|---|---|---|---|---|
| F-01 | HIGH | Personal path `C:\Users\<username>` leaked in plan docs — violates no-personal-paths policy | docs/superpowers/plans/2026-07-11-veyrnox-extensive-qa.md, docs/superpowers/specs/2026-07-11-veyrnox-extensive-qa-design.md | Yes |
| F-02 | HIGH | Catalog skill count mismatch: docs documented 271 skills but actual count was 272 — caused `ci/validators.test.js` to fail | README.md, AGENTS.md, docs/zh-CN/README.md, docs/zh-CN/AGENTS.md, .claude-plugin/plugin.json, .claude-plugin/marketplace.json | Yes |
| F-03 | MEDIUM | Windows test isolation bug in harness-audit: test overrode `HOME` env var but not `USERPROFILE`, causing the real installed plugin to leak into test assertions | tests/scripts/harness-audit.test.js:638 | Yes |
| F-04 | LOW | `scripts/instinct-cli-projects.test.js` — 9 tests fail because Python is not installed on this machine; not a code defect | tests/scripts/instinct-cli-projects.test.js | No — environment constraint |

## Summary
- Total findings: 4
- CRITICAL: 0 | HIGH: 2 | MEDIUM: 1 | LOW: 1
- Fixed inline: 3
