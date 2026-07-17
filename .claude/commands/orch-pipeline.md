---
description: Run the full local pipeline on the current branch — lint, targeted tests, typecheck, deniability-string check, IAP preflight, log-redaction patch check, and codex second-pass — surfacing a single PASS/FAIL verdict.
argument-hint: [optional focus — e.g. "skip codex", "skip iap", or a scope hint]
---

# orch-pipeline — full local verification pipeline

Focus / options: **$ARGUMENTS**

Execute in order. Do NOT skip a step unless the user's focus explicitly excludes it. Report
each step as PASS / FAIL / SKIP with the command output tail.

## 1. Lint on changed files only
```
git diff --name-only origin/main...HEAD | grep -E '\.(js|jsx|ts|tsx)$' | xargs -r npx eslint
```

## 2. Targeted tests
Identify test files near the diff, run just those. Only fall back to the full suite if the
diff is broad.
```
npm test -- --run
```

## 3. Deniability-string CI gate
```
node scripts/check-deniability-strings.mjs
```
Flags wallet-count / plural / raw-seed-clipboard tells (per PR #615).

## 4. Log-redaction patch check
```
node scripts/check-log-redaction-patch.mjs
```
Confirms LOG-1 redaction markers still present in both Android + iOS `native-bridge.js`.

## 5. IAP preflight (if IAP touched)
```
npm run check:iap-preflight
```
Needs `REVENUECAT_V2_SECRET_KEY` + `REVENUECAT_PROJECT_ID` for the remote leg; local leg
runs regardless.

## 6. Cert-pin manager safety
```
node scripts/check-cert-pin-manager-safety.mjs
```

## 7. Codex second-pass (skip if user said skip codex)
Delegate to `/codex-security-review` (which handles the branch/diff checks itself).

## 8. Verdict
- **PASS** iff every non-skipped step passed.
- **FAIL** otherwise — list each failing step with the tail of its output.
- Nothing here promotes any asset/feature to "verified" — that still requires an on-chain
  txid.
