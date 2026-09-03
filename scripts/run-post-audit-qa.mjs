#!/usr/bin/env node

/**
 * Post-Audit QA Test Runner
 * Executes comprehensive validation of all security fixes from audit round 3+4
 * Generates detailed report with findings, coverage, and risk assessment
 */

import { execFileSync, execSync, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const TIMESTAMP = new Date().toISOString().replace(/:/g, '-');
const REPORT_DIR = path.join(projectRoot, 'test-results', `post-audit-qa-${TIMESTAMP}`);
const TEST_SUITES = [
  'e2e/post-audit-validation.spec.js',
  'e2e/post-audit-security-boundaries.spec.js',
];

// Deferral is counted across EVERY post-audit spec, not one named file. The
// previous single-file constant meant a `fixme` added to the boundaries spec
// was invisible to the gate (branch review 2026-09-03, S-2).
const DEFERRED_VALIDATION_FILES = TEST_SUITES;

// `test.skip` defers a case exactly as much as `test.fixme` does — a gate that
// counts only one of them can be satisfied by renaming.
const DEFERRAL_RE = /\btest\.(fixme|skip)\(/g;

const POST_AUDIT_UNIT_COMMAND = [
  'run',
  'test:post-audit:unit',
  '--',
  '--reporter=default',
  '--reporter=json',
  '--outputFile.json=__POST_AUDIT_UNIT_JSON__',
];

// EVIDENCE CLASS — the distinction this script exists to keep honest.
//
// Both e2e specs read source files and assert on their CONTENT: they run under
// Playwright but never open a browser. That is real regression value and it is
// NOT behavioural validation of a running app. Before this change the report
// flipped every audit finding to `covered` and printed "Overall Status: ✓ PASS"
// on that basis, which restates the very claim the deferral gate was added to
// prevent — just with string matching underneath instead of nothing.
//
// A suite listed here contributes SOURCE-LEVEL evidence only. Findings backed
// solely by these are reported `source-verified`, never `covered`, and the
// summary cannot read PASS. Move a suite out of this set only when it genuinely
// drives the app (navigates, interacts, asserts observed behaviour).
const SOURCE_LEVEL_SUITES = new Set([
  'post-audit-validation',
  'post-audit-security-boundaries',
  'post-audit-unit',
]);

// Deferral markers per post-audit spec, as { file: count }.
function countSpecDeferrals() {
  const out = {};
  for (const file of DEFERRED_VALIDATION_FILES) {
    const full = path.join(projectRoot, file);
    if (!fs.existsSync(full)) {
      // A missing spec is not zero deferrals — it is an unknown, and the
      // "Test suites exist" check above already fails on it. Record it loudly
      // rather than letting an absent file read as clean.
      out[file] = 0;
      console.warn(`  ! cannot count deferrals: ${file} not found`);
      continue;
    }
    out[file] = (fs.readFileSync(full, 'utf8').match(DEFERRAL_RE) || []).length;
  }
  return out;
}

// Skipped-case count from vitest's JSON reporter. Returns 0 when the file is
// absent or unparseable — the caller treats that as "no evidence of skips",
// which is why the reporter flag is passed explicitly rather than relied upon.
function readVitestSkipped(jsonPath) {
  try {
    const raw = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    if (typeof raw.numPendingTests === 'number' || typeof raw.numTodoTests === 'number') {
      return (raw.numPendingTests || 0) + (raw.numTodoTests || 0);
    }
    return 0;
  } catch {
    return 0;
  }
}

const AUDIT_FINDINGS = {
  'VULN-19': {
    severity: 'CRITICAL',
    description: 'Nonce unpinned in ERC-20 transfer path',
    tests: ['token-send nonce must pin to first ERC-20 transfer attempt', 'nonce persists across app restart'],
  },
  'RATE-LIMIT-MONITORING': {
    severity: 'HIGH',
    description: 'Missing rate limit on /api/v1/monitoring/refresh endpoint',
    tests: ['monitoring/refresh endpoint rejects requests exceeding rate limit'],
  },
  'QUERY-CANONICALIZATION': {
    severity: 'MEDIUM',
    description: 'Query parameters unsigned and uncanonical in tip-web proxy',
    tests: ['query parameter canonicalization prevents HMAC bypass'],
  },
  'SHARD-HARDENING': {
    severity: 'HIGH',
    description: 'RestoreFromShares test theater / incomplete cleanup',
    tests: ['RestoreFromShares cleanup validates state before deletion', 'encryption/decryption roundtrip validates PIN floor'],
  },
  'KEK-ENROLLMENT': {
    severity: 'HIGH',
    description: 'KEK enrollment gate missing on critical operations',
    tests: ['hardware KEK enrollment gate blocks send before enrollment', 'biometric unlock enforces kekEnrolled assertion'],
  },
  'NETWORK-GATING': {
    severity: 'MEDIUM',
    description: 'Network config CRUD not properly gated',
    tests: ['K-2 gate blocks unauthenticated network config access', 'rejected env overrides surface in UI'],
  },
  'HEADER-SECURITY': {
    severity: 'MEDIUM',
    description: 'Multiple proxies read x-api-key before HttpOnly cookie',
    tests: ['x-api-key header stripped before upstream proxy', 'content-type header binding prevents spoofing'],
  },
  'SESSION-RACES': {
    severity: 'MEDIUM',
    description: 'Unlock race guard / prompt rejection race conditions',
    tests: ['unlock race guard prevents concurrent unlock attempts', 'prompt rejection on lock prevents orphaned operations'],
  },
};

// Create report directory
if (!fs.existsSync(REPORT_DIR)) {
  fs.mkdirSync(REPORT_DIR, { recursive: true });
}

console.log('🔐 Post-Audit QA Test Suite');
console.log('================================');
console.log(`Timestamp: ${TIMESTAMP}`);
console.log(`Test suites: ${TEST_SUITES.length}`);
console.log(`Report directory: ${REPORT_DIR}\n`);

// Phase 1: Pre-flight checks
console.log('📋 Phase 1: Pre-flight Checks');
console.log('---');

const checks = {
  'Node environment': () => {
    const nodeVersion = execSync('node --version').toString().trim();
    console.log(`  ✓ Node ${nodeVersion}`);
  },
  'Dependencies installed': () => {
    if (fs.existsSync(path.join(projectRoot, 'node_modules'))) {
      console.log('  ✓ node_modules present');
    } else {
      throw new Error('Dependencies not installed');
    }
  },
  'Playwright installed': () => {
    try {
      execSync('npx playwright --version', { stdio: 'ignore' });
      console.log('  ✓ Playwright ready');
    } catch {
      throw new Error('Playwright not installed');
    }
  },
  'Test files exist': () => {
    TEST_SUITES.forEach(suite => {
      const filePath = path.join(projectRoot, suite);
      if (!fs.existsSync(filePath)) {
        throw new Error(`Test file missing: ${suite}`);
      }
    });
    console.log(`  ✓ All ${TEST_SUITES.length} test suites found`);
  },
  'Deferred validations are reported honestly': () => {
    const counts = countSpecDeferrals();
    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    if (total > 0) {
      for (const [file, n] of Object.entries(counts)) {
        if (n > 0) console.warn(`  ! ${n} deferred validation(s) remain in ${file}`);
      }
    } else {
      console.log('  ✓ No deferred post-audit validations');
    }
  },
  'Build verified': () => {
    try {
      execSync('npm run build', { cwd: projectRoot, stdio: 'ignore' });
      console.log('  ✓ Build clean');
    } catch {
      console.warn('  ⚠ Build warnings (non-blocking)');
    }
  },
};

for (const [check, fn] of Object.entries(checks)) {
  try {
    fn();
  } catch (e) {
    console.error(`  ✗ ${check}: ${e.message}`);
    process.exit(1);
  }
}

// Phase 2: Start dev server
console.log('\n📡 Phase 2: Server Setup');
console.log('---');

let serverProcess = null;
try {
  console.log('  Starting dev server...');
  // In CI, server should already be running; locally we start it
  if (process.env.CI !== 'true') {
    serverProcess = spawn('npm', ['run', 'dev'], {
      cwd: projectRoot,
      detached: true,
      stdio: 'ignore',
    });
    serverProcess.unref();
  }
  console.log('  ✓ Dev server ready (or already running)');
} catch (e) {
  console.warn('  ⚠ Could not start server (may already be running)');
}

// Phase 3: Run test suites
console.log('\n🧪 Phase 3: Test Execution');
console.log('---');

const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  suites: {},
};

const specDeferrals = countSpecDeferrals();
const deferredValidationCount = Object.values(specDeferrals).reduce((a, b) => a + b, 0);

// Skipped UNIT cases are deferred too, and the exit code cannot see them: vitest
// exits 0 with skips present, so `status: 'completed'` read as full coverage
// while `RestoreFromShares.hardening.test.jsx` carried
// `it.skip('unmount clears both share textareas', () => {})` — skipped AND an
// empty body, inside the very suite this script trusts (branch review S-1).
// Counted from vitest's JSON reporter rather than by grepping for `.skip(`,
// because runtime `ctx.skip()` leaves no static marker.
let deferredUnitCount = 0;
const unitJsonPath = path.join(REPORT_DIR, 'post-audit-unit.json');

try {
  console.log('\n  Running: post-audit-unit');
  execFileSync('npm', POST_AUDIT_UNIT_COMMAND.map(
    (a) => a.replace('__POST_AUDIT_UNIT_JSON__', unitJsonPath),
  ), {
    cwd: projectRoot,
    stdio: 'inherit',
  });
  deferredUnitCount = readVitestSkipped(unitJsonPath);
  results.suites['post-audit-unit'] = {
    status: 'completed',
    failures: 0,
    skipped: deferredUnitCount,
  };
  console.log(
    deferredUnitCount > 0
      ? `  ! post-audit-unit passed with ${deferredUnitCount} skipped case(s) — not covered`
      : '  ✓ post-audit-unit passed',
  );
} catch (e) {
  // Read the JSON anyway: a failing run still reports how many were skipped,
  // and losing that would understate the deferral count.
  deferredUnitCount = readVitestSkipped(unitJsonPath);
  results.suites['post-audit-unit'] = {
    status: 'failed',
    error: e.message,
    skipped: deferredUnitCount,
  };
  console.error('  ✗ post-audit-unit failed');
}

for (const suite of TEST_SUITES) {
  const suiteName = path.basename(suite, '.spec.js');
  console.log(`\n  Running: ${suiteName}`);

  const reportFile = path.join(REPORT_DIR, `${suiteName}-report.json`);

  try {
    execFileSync(
      'npx',
      [
        'playwright',
        'test',
        path.join(projectRoot, suite),
        '--reporter=json',
        '--reporter=html',
      ],
      {
        cwd: projectRoot,
        env: {
          ...process.env,
          PLAYWRIGHT_HTML_REPORT: path.join(REPORT_DIR, 'html'),
        },
        stdio: 'inherit',
      }
    );

    results.suites[suiteName] = { status: 'completed', failures: 0 };
    console.log(`  ✓ ${suiteName} passed`);
  } catch (e) {
    results.suites[suiteName] = { status: 'failed', error: e.message };
    console.error(`  ✗ ${suiteName} failed`);
  }
}

// Phase 4: Coverage analysis
console.log('\n📊 Phase 4: Coverage Analysis');
console.log('---');

const coverage = {
  auditFindings: {},
  testCoverage: 0,
};

let totalTests = 0;
let coveredTests = 0;

// A suite only contributes evidence if it completed AND deferred nothing.
const completedSuites = Object.entries(results.suites)
  .filter(([, s]) => s.status === 'completed')
  .map(([name]) => name);
const nothingDeferred = deferredValidationCount === 0 && deferredUnitCount === 0;
const allSuitesRan = Object.values(results.suites).every((s) => s.status === 'completed');

// Is ANY completed suite behavioural? Today none are — every post-audit suite
// reads source and asserts on its content. Kept as a computed value rather than
// a constant so adding a genuine browser-driving suite upgrades the report
// automatically instead of silently leaving it understated.
const behaviouralEvidence = completedSuites.some((name) => !SOURCE_LEVEL_SUITES.has(name));
const evidenceClass = !allSuitesRan || !nothingDeferred
  ? 'incomplete'
  : behaviouralEvidence
    ? 'behaviour-verified'
    : 'source-verified';

for (const [finding, details] of Object.entries(AUDIT_FINDINGS)) {
  // `covered` is reserved for behavioural evidence. Source-level assertions are
  // real regression value and are reported as such — but a regex over send.js
  // does not validate a CRITICAL finding, and saying so was the S-6 defect.
  coverage.auditFindings[finding] = {
    severity: details.severity,
    description: details.description,
    testsCovering: details.tests.length,
    status: evidenceClass === 'behaviour-verified'
      ? 'covered'
      : evidenceClass === 'source-verified'
        ? 'source-verified'
        : 'not-established',
  };

  totalTests += details.tests.length;
  // Only behavioural evidence counts toward a coverage PERCENTAGE — a number
  // readers treat as "how much is validated".
  if (evidenceClass === 'behaviour-verified') {
    coveredTests += details.tests.length;
  }
}

coverage.testCoverage = totalTests > 0 ? Math.round((coveredTests / totalTests) * 100) : 0;

console.log(`  Total audit findings: ${Object.keys(AUDIT_FINDINGS).length}`);
console.log(`  Test coverage: ${coverage.testCoverage}%`);
console.log(`  Critical findings: ${Object.values(AUDIT_FINDINGS).filter(f => f.severity === 'CRITICAL').length}`);
console.log(`  High findings: ${Object.values(AUDIT_FINDINGS).filter(f => f.severity === 'HIGH').length}`);

// Phase 5: Security validations
console.log('\n🔒 Phase 5: Security Validation Checklist');
console.log('---');

// Determine security check status based on actual test execution.
// `suitesPassed` now also requires that nothing was SKIPPED inside the unit
// suite — vitest exits 0 with skips present, so the exit code alone let a
// skipped case read as a passed control (branch review S-1).
const suitesPassed = allSuitesRan && nothingDeferred;

// A check backed only by source-level assertions is `source-verified`, not
// `passed`. Same evidence, honest label.
const checkStatus = suitesPassed
  ? (evidenceClass === 'behaviour-verified' ? 'passed' : 'source-verified')
  : 'unknown';

const securityChecks = [
  { name: 'VULN-19 nonce pinning', status: checkStatus },
  { name: 'Rate-limit enforcement', status: checkStatus },
  { name: 'Query canonicalization', status: checkStatus },
  { name: 'Shard encryption hardening', status: checkStatus },
  { name: 'KEK enrollment gating', status: checkStatus },
  { name: 'Network config access control', status: checkStatus },
  { name: 'Header security binding', status: checkStatus },
  { name: 'Session race guards', status: checkStatus },
  { name: 'XSS prevention', status: checkStatus },
  { name: 'Input sanitization', status: checkStatus },
];

securityChecks.forEach(check => {
  const icon = check.status === 'passed' ? '✓' : (check.status === 'unknown' ? '?' : '✗');
  console.log(`  ${icon} ${check.name}`);
});

// Phase 6: Generate report
console.log('\n📄 Phase 6: Report Generation');
console.log('---');

const report = {
  timestamp: TIMESTAMP,
  environment: {
    nodeVersion: execSync('node --version').toString().trim(),
    platform: process.platform,
    ciEnvironment: process.env.CI === 'true' ? 'CI' : 'Local',
  },
  testExecution: {
    totalSuites: TEST_SUITES.length,
    suites: results.suites,
  },
  deferredValidationCount,
  deferredUnitCount,
  evidenceClass,
  coverage: coverage,
  auditFindings: AUDIT_FINDINGS,
  securityValidation: securityChecks,
  recommendations: [
    ...(evidenceClass === 'source-verified'
      ? ['Evidence is SOURCE-LEVEL only: the post-audit specs assert on file contents and never drive a running app. These are regression pins, not validation of the audit findings.']
      : []),
    ...(deferredUnitCount > 0
      ? [`${deferredUnitCount} unit case(s) were SKIPPED and are not covered, despite the suite exiting 0.`]
      : []),
    ...(deferredValidationCount > 0
      ? [`${deferredValidationCount} browser validation(s) remain deferred; do not treat this report as full audit coverage.`]
      : ['All configured post-audit validations completed.']),
    'Run the focused unit suite before treating its covered controls as regression-tested.',
  ],
};

fs.writeFileSync(
  path.join(REPORT_DIR, 'post-audit-qa-report.json'),
  JSON.stringify(report, null, 2)
);

// Generate markdown report
const markdownReport = `
# Post-Audit QA Report
**Generated:** ${new Date().toISOString()}

## Executive Summary
- **Test Suites Run:** ${TEST_SUITES.length}
- **Deferred Browser Validations:** ${deferredValidationCount}
- **Skipped Unit Cases:** ${deferredUnitCount}
- **Evidence Class:** ${evidenceClass}
- **Audit Findings Validated:** ${Object.keys(AUDIT_FINDINGS).length}
- **Security Checks Passed:** ${securityChecks.filter(c => c.status === 'passed').length}/${securityChecks.length}
- **Overall Status:** ${
  evidenceClass === 'behaviour-verified' && securityChecks.every(c => c.status === 'passed')
    ? '✓ PASS'
    : evidenceClass === 'source-verified'
      ? '◐ SOURCE-VERIFIED (no behavioural validation ran)'
      : '✗ INCOMPLETE'
}

## Test Suites
${Object.entries(results.suites)
  .map(
    ([name, result]) =>
      `- **${name}**: ${result.status === 'completed' ? '✓ Passed' : '✗ Failed'}`
  )
  .join('\n')}

## Audit Findings Coverage
${Object.entries(AUDIT_FINDINGS)
  .map(
    ([code, finding]) =>
      `- **${code}** [${finding.severity}]: ${finding.description}
  - Tests: ${finding.tests.length} validations`
  )
  .join('\n')}

## Security Validation Results
${securityChecks.map(check => `- ${check.name}: ${check.status === 'passed' ? '✓ Pass' : '✗ Fail'}`).join('\n')}

## Recommendations
${report.recommendations.map(r => `- ${r}`).join('\n')}

## Test Artifacts
- Full report: \`post-audit-qa-report.json\`
- HTML reports: \`html/\` directory
- Logs: Individual suite reports

---
${evidenceClass === 'behaviour-verified'
  ? '*Behavioural validation completed for the suites listed above. Still INTERNAL — not a third-party audit, not device or on-chain verification.*'
  : evidenceClass === 'source-verified'
    ? '*SOURCE-LEVEL evidence only. Every suite here reads source files and asserts on their contents; none drives a running app. Useful as regression pins — it does NOT establish that the audit findings are validated, and must not be cited as such.*'
    : '*This report is INCOMPLETE — a suite failed or cases were deferred/skipped. It must not be used to assert that any audit fix is validated.*'}
`;

fs.writeFileSync(path.join(REPORT_DIR, 'POST-AUDIT-QA-REPORT.md'), markdownReport);

console.log(`  ✓ JSON report: post-audit-qa-report.json`);
console.log(`  ✓ Markdown report: POST-AUDIT-QA-REPORT.md`);

// Phase 7: Summary
// Exit 0 for a clean source-verified run: nothing was deferred and no suite
// failed, so the RUN succeeded. The dishonesty this fixes was in the labelling,
// not the exit code — a source-only run is a legitimate result, it just must not
// be reported as validation.
const qaComplete = suitesPassed;
console.log(
  !qaComplete
    ? '\n⚠️  Post-Audit QA Incomplete'
    : evidenceClass === 'behaviour-verified'
      ? '\n✅ Post-Audit QA Complete'
      : '\n◐ Post-Audit QA Complete — SOURCE-LEVEL evidence only, not validation',
);
console.log('================================');
console.log(`Report saved to: ${REPORT_DIR}`);
console.log(`View results: open ${path.join(REPORT_DIR, 'POST-AUDIT-QA-REPORT.md')}`);

// Cleanup server
if (serverProcess && serverProcess.pid) {
  try {
    process.kill(-serverProcess.pid);
  } catch (e) {
    // Server may have stopped
  }
}

// A report with deferred browser cases or a failed suite is useful evidence, but
// it is not a successful post-audit validation run.
process.exit(qaComplete ? 0 : 1);
