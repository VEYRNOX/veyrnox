#!/usr/bin/env node
// Emit a SARIF record stating that the Swift CodeQL analysis did NOT run.
//
// Why this exists: the repo's code_scanning ruleset gates on the CodeQL TOOL
// and has no per-language granularity (verified against the live ruleset — the
// rule's only parameter is a list of {tool, alerts_threshold,
// security_alerts_threshold}, with no language or category field). After
// PR #1368 scoped the Swift scan to PRs that touch iOS/Swift sources, a typical
// PR uploads five of six languages, the tool's result set is incomplete, and
// the gate can never be satisfied — so every non-iOS PR was blocked
// indefinitely with --admin the only exit. See issue #1375.
//
// What this is NOT: a fake clean result. The distinction is the entire point
// (I4, and CLAUDE.md's "never mock a security control to look real"):
//
//   executionSuccessful: false  -> "this analysis did not run"   <- what we emit
//   executionSuccessful: true   -> "it ran and found nothing"    <- a lie, never emit
//
// A SARIF claiming a successful run with an empty results array would make an
// unscanned PR indistinguishable from a clean one. This says, in the security
// data itself, that Swift was not looked at.
//
// Usage: node scripts/build-swift-skip-sarif.mjs > out.sarif
// Env:   COMMIT_SHA, REF_NAME, RUN_URL (all optional; omitted fields are dropped
//        rather than filled with placeholder values).

const REPO_URI = 'https://github.com/VEYRNOX/veyrnox';

const NOTICE = [
  'Swift was NOT analysed on this pull request.',
  'The Swift extractor needs a macOS runner and a full Capacitor + xcodebuild compile',
  '(CodeQL has no build-mode: none for Swift), costing 60-90 minutes end to end, so',
  'PR #1368 scoped it to runs that touch iOS/Swift sources. This run touched none, so the',
  'iOS sources — including EnclaveKeyService.swift and VeyrnoxEnclavePlugin.swift — are',
  'unscanned here; they are covered by the push-to-main and weekly scans instead.',
  'This record exists so the gap is visible rather than silent:',
  'it reports a SKIPPED analysis, not a clean one.',
].join(' ');

export function buildSarif({ commitSha, refName, runUrl } = {}) {
  const invocation = {
    // The load-bearing field. False = "did not run". Never set this true here.
    executionSuccessful: false,
    toolExecutionNotifications: [
      {
        descriptor: { id: 'swift-analysis-skipped' },
        level: 'warning',
        message: { text: runUrl ? `${NOTICE} Run: ${runUrl}` : NOTICE },
      },
    ],
  };

  const run = {
    tool: {
      driver: {
        name: 'CodeQL',
        informationUri: 'https://codeql.github.com/',
        rules: [],
      },
    },
    automationDetails: { id: '/language:swift' },
    invocations: [invocation],
    // No findings are claimed, because none were looked for.
    results: [],
  };

  // Only assert provenance we actually have — a placeholder sha would be a
  // small lie in the same file whose whole purpose is not lying.
  if (commitSha) {
    const provenance = { repositoryUri: REPO_URI, revisionId: commitSha };
    if (refName) provenance.branch = refName;
    run.versionControlProvenance = [provenance];
  }

  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [run],
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(
  process.argv[1].replace(/\\/g, '/').split('/').pop()
);

if (isMain) {
  const sarif = buildSarif({
    commitSha: process.env.COMMIT_SHA || '',
    refName: process.env.REF_NAME || '',
    runUrl: process.env.RUN_URL || '',
  });
  process.stdout.write(`${JSON.stringify(sarif, null, 2)}\n`);
}
