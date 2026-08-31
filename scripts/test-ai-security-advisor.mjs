#!/usr/bin/env node

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { spawnSync } from 'node:child_process';

const ROOT = process.cwd();
const REPORT_DIR = join(ROOT, 'reports', 'ai-security-advisor');
const JSON_REPORT_PATH = join(REPORT_DIR, 'vitest-results.json');
const PLAYWRIGHT_REPORT_PATH = join(REPORT_DIR, 'playwright-results.json');
const MARKDOWN_REPORT_PATH = join(REPORT_DIR, 'latest-report.md');
const MACHINE_REPORT_PATH = join(REPORT_DIR, 'latest-report.json');

const SUITE_FILES = [
  'src/components/__tests__/SecurityAdvisor.test.jsx',
  'src/components/__tests__/SecurityAdvisor.consent.test.jsx',
  'src/components/__tests__/SecurityAdvisor.interactions.test.jsx',
  'src/components/__tests__/SecurityAdvisor.abort-on-deniability.test.jsx',
  'src/api/__tests__/tipScreen.test.js',
  'src/api/__tests__/tipScreen.proxy.test.js',
  'src/api/__tests__/tipScreen.schema.test.js',
  'src/api/__tests__/tipEdge.chatRoute.test.js',
  'src/lib/__tests__/advisorConsent.test.js',
  'src/lib/__tests__/advisorScrubber.test.js',
  'src/lib/__tests__/tipDisclosure.test.js',
  'src/lib/__tests__/threatIntelStore.test.js',
  'src/lib/__tests__/localIocCache.test.js',
  'src/lib/__tests__/advisoriesBlock.test.js',
  'src/lib/__tests__/riskGateReady.test.js',
];

const CAPABILITY_GROUPS = [
  {
    id: 'advisor-ui-routing',
    name: 'Advisor UI, routing, and suggested flows',
    capabilities: [
      'Global Vigil FAB renders outside deniability mode',
      'Advisor route-to-screen mapping is stable',
      'Screen-specific suggested questions are available',
      'Remote prompt includes page snapshot context',
    ],
    files: [
      'src/components/__tests__/SecurityAdvisor.test.jsx',
    ],
  },
  {
    id: 'advisor-consent-tiering',
    name: 'Consent, paywall, and local-only fallback',
    capabilities: [
      'Remote advisor chat requires explicit consent',
      'Denied or unanswered consent keeps all answers local',
      'Free tier stays local and shows the AI Security Protection paywall',
      'Advisor consent persistence survives remounts and panic-sweep rules',
    ],
    files: [
      'src/components/__tests__/SecurityAdvisor.consent.test.jsx',
      'src/lib/__tests__/advisorConsent.test.js',
    ],
  },
  {
    id: 'advisor-chat-safety',
    name: 'Advisor chat safety and no-egress controls',
    capabilities: [
      'Secrets are scrubbed before remote chat send',
      'Only allowed message roles are forwarded upstream',
      'In-flight advisor streams abort on deniability flip',
      'Advisor never starts in deniability mode',
    ],
    files: [
      'src/components/__tests__/SecurityAdvisor.abort-on-deniability.test.jsx',
      'src/lib/__tests__/advisorScrubber.test.js',
      'src/api/__tests__/tipEdge.chatRoute.test.js',
    ],
  },
  {
    id: 'screening-verdicts',
    name: 'TIP screening, verdicts, and fail-closed behavior',
    capabilities: [
      'Address questions are screened before chat answers',
      'Local seeded hits still work with remote consent denied',
      'Structured allow, warn, block, unknown, and error handling stay honest',
      'Malformed or drifted TIP responses degrade to CAUTION',
      'Risk gate waits for TIP contributors before declaring ready',
    ],
    files: [
      'src/components/__tests__/SecurityAdvisor.interactions.test.jsx',
      'src/api/__tests__/tipScreen.test.js',
      'src/api/__tests__/tipScreen.schema.test.js',
      'src/lib/__tests__/riskGateReady.test.js',
    ],
  },
  {
    id: 'proxy-and-edge-wiring',
    name: 'Proxy wiring, secret handling, and edge-route hardening',
    capabilities: [
      'TIP signing secrets stay server-side only',
      'Client screening disables itself if forbidden VITE secrets appear',
      'tip-screen carries screening only, not chat',
      'tip-chat validates messages and preserves streaming proxy behavior',
    ],
    files: [
      'src/api/__tests__/tipScreen.proxy.test.js',
      'src/api/__tests__/tipEdge.chatRoute.test.js',
    ],
  },
  {
    id: 'local-threat-intel',
    name: 'Local threat intelligence store and offline cache',
    capabilities: [
      'Seeded threat data stays available locally',
      'Learned IOC data persists and merges correctly',
      'Signed local IOC cache behavior remains available without network',
    ],
    files: [
      'src/lib/__tests__/threatIntelStore.test.js',
      'src/lib/__tests__/localIocCache.test.js',
    ],
  },
  {
    id: 'honesty-disclosure',
    name: 'User disclosure and advisory honesty checks',
    capabilities: [
      'TIP disclosure matches the actual fields sent',
      'Safety Plus copy does not falsely sell free screening as paid',
      'Recent advisories block can still be built into advisor context',
    ],
    files: [
      'src/lib/__tests__/tipDisclosure.test.js',
      'src/lib/__tests__/advisoriesBlock.test.js',
    ],
  },
];

mkdirSync(REPORT_DIR, { recursive: true });

const vitestArgs = [
  './node_modules/vitest/vitest.mjs',
  'run',
  '--reporter=json',
  `--outputFile=${JSON_REPORT_PATH}`,
  ...SUITE_FILES,
];

const run = spawnSync(process.execPath, vitestArgs, {
  cwd: ROOT,
  encoding: 'utf8',
  env: process.env,
});

const smokeArgs = [
  './node_modules/playwright/cli.js',
  'test',
  'e2e/security-advisor-smoke.spec.js',
  '--reporter=json',
];

const smokeRun = spawnSync(process.execPath, smokeArgs, {
  cwd: ROOT,
  encoding: 'utf8',
  env: process.env,
});

const jsonReport = loadVitestReport(JSON_REPORT_PATH);
const parsed = summariseVitest(jsonReport);
const smokeParsed = summarisePlaywright(smokeRun.stdout, smokeRun.stderr);
const grouped = buildCapabilityGroups(parsed.fileStatus);
const now = new Date().toISOString();
const smokeIsRequired = !!process.env.CI;
const smokePassedOrSkipped = smokeParsed.status === 'passed' || (!smokeIsRequired && smokeParsed.status === 'skipped');
const overallPass =
  parsed.failed === 0
  && (run.status ?? 1) === 0
  && smokePassedOrSkipped
  && ((smokeRun.status ?? 1) === 0 || (!smokeIsRequired && smokeParsed.status === 'skipped'));

const machineReport = {
  generated_at: now,
  command: ['node', 'scripts/test-ai-security-advisor.mjs'],
  suite_files: SUITE_FILES,
  summary: {
    passed: parsed.passed,
    failed: parsed.failed,
    total: parsed.total,
    duration_ms: parsed.durationMs,
    process_exit_code: run.status ?? 1,
    smoke_passed: smokeParsed.passed,
    smoke_failed: smokeParsed.failed,
    smoke_total: smokeParsed.total,
    smoke_duration_ms: smokeParsed.durationMs,
    smoke_exit_code: smokeRun.status ?? 1,
    smoke_status: smokeParsed.status,
  },
  failed_tests: parsed.failedTests,
  browser_smoke: smokeParsed,
  file_status: Array.from(parsed.fileStatus.entries()).map(([file, status]) => ({ file, ...status })),
  capability_groups: grouped,
  stdout_tail: tail(run.stdout, 80),
  stderr_tail: tail(run.stderr, 80),
  smoke_stdout_tail: tail(smokeRun.stdout, 80),
  smoke_stderr_tail: tail(smokeRun.stderr, 80),
};

const markdown = renderMarkdown(machineReport);

writeFileSync(MACHINE_REPORT_PATH, `${JSON.stringify(machineReport, null, 2)}\n`);
writeFileSync(MARKDOWN_REPORT_PATH, markdown);
writeFileSync(PLAYWRIGHT_REPORT_PATH, smokeRun.stdout || '');

process.stdout.write(`${markdown}\n`);
process.stdout.write(`\nSaved Markdown report to ${relative(ROOT, MARKDOWN_REPORT_PATH)}\n`);
process.stdout.write(`Saved JSON report to ${relative(ROOT, MACHINE_REPORT_PATH)}\n`);
if (process.env.GITHUB_STEP_SUMMARY) {
  writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${markdown}\n`);
}

process.exit(overallPass ? 0 : 1);

function loadVitestReport(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    return { parse_error: String(error) };
  }
}

function summariseVitest(report) {
  const fileStatus = new Map();
  const failedTests = [];

  const discovered = [];
  if (Array.isArray(report.testResults)) {
    for (const suite of report.testResults) {
      const file = normalizeFilePath(suite.name);
      const assertions = Array.isArray(suite.assertionResults) ? suite.assertionResults : [];
      for (const assertion of assertions) {
        discovered.push({
          name: assertion.title || assertion.fullName || '(unnamed test)',
          file,
          path: [file, ...(assertion.ancestorTitles || []), assertion.title || assertion.fullName || '(unnamed test)']
            .filter(Boolean)
            .join(' > '),
          state: assertion.status,
          durationMs: Number(assertion.duration || 0),
          errors: Array.isArray(assertion.failureMessages) ? assertion.failureMessages : [],
        });
      }
    }
  } else {
    walkTasks(report, [], discovered);
  }

  for (const item of discovered) {
    const file = item.file;
    if (!file) continue;
    const current = fileStatus.get(file) || {
      passed: 0,
      failed: 0,
      skipped: 0,
      todo: 0,
      durationMs: 0,
    };
    const state = normaliseState(item.state);
    current.durationMs += item.durationMs;
    if (state === 'passed') current.passed += 1;
    else if (state === 'failed') current.failed += 1;
    else if (state === 'skipped') current.skipped += 1;
    else if (state === 'todo') current.todo += 1;
    fileStatus.set(file, current);

    if (state === 'failed') {
      failedTests.push({
        file,
        name: item.name,
        path: item.path,
        errors: item.errors,
      });
    }
  }

  const passed = Number(report.numPassedTests ?? sumStatus(fileStatus, 'passed'));
  const failed = Number(report.numFailedTests ?? sumStatus(fileStatus, 'failed'));
  const total = Number(report.numTotalTests ?? sumAllStatus(fileStatus));
  const durationMs = Number(
    report.duration
      ?? report.durationMs
      ?? ((report.startTime && report.testResults?.length)
        ? Math.max(...report.testResults.map((suite) => Number(suite.endTime || 0))) - Number(report.startTime)
        : 0),
  );

  return {
    passed,
    failed,
    total,
    durationMs,
    failedTests,
    fileStatus,
  };
}

function walkTasks(node, ancestry, out) {
  if (!node || typeof node !== 'object') return;

  const children = []
    .concat(Array.isArray(node.tasks) ? node.tasks : [])
    .concat(Array.isArray(node.testResults) ? node.testResults : [])
    .concat(Array.isArray(node.results) ? node.results : []);

  const state = node.result?.state ?? node.state ?? node.status;
  const durationMs = Number(node.result?.duration ?? node.duration ?? 0);
  const errors = []
    .concat(Array.isArray(node.result?.errors) ? node.result.errors : [])
    .concat(Array.isArray(node.errors) ? node.errors : [])
    .filter(Boolean)
    .map((err) => {
      if (typeof err === 'string') return err;
      if (typeof err?.message === 'string') return err.message;
      return JSON.stringify(err);
    });

  const isLeaf = children.length === 0 && typeof node.name === 'string';
  if (isLeaf) {
    out.push({
      name: node.name,
      file: normalizeFilePath(
        node.file?.name
          || node.file?.filepath
          || node.file
          || node.moduleId
          || node.id
          || inferFileFromAncestors(ancestry),
      ),
      path: ancestry.concat(node.name).filter(Boolean).join(' > '),
      state,
      durationMs,
      errors,
    });
    return;
  }

  const nextAncestry = typeof node.name === 'string' ? ancestry.concat(node.name) : ancestry;
  for (const child of children) walkTasks(child, nextAncestry, out);
}

function inferFileFromAncestors(ancestry) {
  return ancestry.find((part) => typeof part === 'string' && part.includes('__tests__')) || null;
}

function normalizeFilePath(file) {
  if (!file) return null;
  const text = String(file);
  return text.startsWith(ROOT) ? relative(ROOT, text) : text;
}

function normaliseState(state) {
  if (state === 'pass' || state === 'passed') return 'passed';
  if (state === 'fail' || state === 'failed') return 'failed';
  if (state === 'skip' || state === 'skipped') return 'skipped';
  if (state === 'todo') return 'todo';
  return 'unknown';
}

function buildCapabilityGroups(fileStatus) {
  return CAPABILITY_GROUPS.map((group) => {
    const fileSummaries = group.files.map((file) => {
      const status = fileStatus.get(file) || {
        passed: 0,
        failed: 0,
        skipped: 0,
        todo: 0,
        durationMs: 0,
      };
      return {
        file,
        ...status,
      };
    });
    const failed = fileSummaries.some((file) => file.failed > 0);
    return {
      id: group.id,
      name: group.name,
      status: failed ? 'failed' : 'passed',
      capabilities: group.capabilities,
      files: fileSummaries,
    };
  });
}

function summarisePlaywright(stdout, stderr) {
  const text = `${String(stdout || '')}\n${String(stderr || '')}`;
  if (
    !process.env.CI
    && /listen EPERM|operation not permitted|Process from config\.webServer was not able to start/i.test(text)
  ) {
    return {
      status: 'skipped',
      passed: 0,
      failed: 0,
      total: 0,
      durationMs: 0,
      failedTests: [],
      files: [],
      note: 'Skipped locally: this sandbox does not allow binding the Vite dev server port (listen EPERM). CI will still run the browser smoke.',
    };
  }

  let parsed;
  try {
    parsed = JSON.parse(extractJson(text || '{}'));
  } catch (error) {
    return {
      status: 'failed',
      passed: 0,
      failed: 1,
      total: 1,
      durationMs: 0,
      failedTests: [`Could not parse Playwright JSON output: ${String(error)}`],
      files: [],
    };
  }

  const files = [];
  walkPlaywrightSuites(parsed.suites || [], [], files);

  let passed = 0;
  let failed = 0;
  let durationMs = 0;
  const failedTests = [];

  for (const file of files) {
    for (const spec of file.specs) {
      for (const test of spec.tests) {
        durationMs += Number(test.duration || 0);
        if (test.outcome === 'expected' || test.status === 'passed') passed += 1;
        else {
          failed += 1;
          failedTests.push(`${file.file}: ${spec.title}`);
        }
      }
    }
  }

  return {
    status: failed === 0 ? 'passed' : 'failed',
    passed,
    failed,
    total: passed + failed,
    durationMs,
    failedTests,
    files,
  };
}

function walkPlaywrightSuites(suites, ancestry, out) {
  for (const suite of suites) {
    const title = suite.title || '';
    const nextAncestry = title ? ancestry.concat(title) : ancestry;
    if (suite.file) {
      out.push({
        file: normalizeFilePath(suite.file),
        titlePath: nextAncestry,
        specs: Array.isArray(suite.specs) ? suite.specs : [],
      });
    }
    if (Array.isArray(suite.suites) && suite.suites.length) {
      walkPlaywrightSuites(suite.suites, nextAncestry, out);
    }
  }
}

function renderMarkdown(report) {
  const lines = [];
  lines.push('# AI Security Advisor Automation Report');
  lines.push('');
  lines.push(`Generated: ${report.generated_at}`);
  lines.push(`Command: \`node scripts/test-ai-security-advisor.mjs\``);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- Result: ${overallPass ? 'PASS' : 'FAIL'}`);
  lines.push(`- Tests: ${report.summary.passed}/${report.summary.total} passed`);
  lines.push(`- Failures: ${report.summary.failed}`);
  lines.push(`- Duration: ${report.summary.duration_ms} ms`);
  lines.push(`- Suite files: ${report.suite_files.length}`);
  lines.push(`- Browser smoke: ${report.summary.smoke_passed}/${report.summary.smoke_total} passed`);
  lines.push('');
  lines.push('## Browser Smoke');
  lines.push('');
  lines.push(`- Result: ${report.browser_smoke.status.toUpperCase()}`);
  lines.push(`- Tests: ${report.summary.smoke_passed}/${report.summary.smoke_total} passed`);
  lines.push(`- Failures: ${report.summary.smoke_failed}`);
  lines.push(`- Duration: ${report.summary.smoke_duration_ms} ms`);
  if (report.browser_smoke.note) lines.push(`- Note: ${report.browser_smoke.note}`);
  if (report.browser_smoke.failedTests.length) {
    for (const failure of report.browser_smoke.failedTests) {
      lines.push(`- ${failure}`);
    }
  }
  lines.push('');
  lines.push('## Capability Groups');
  lines.push('');

  for (const group of report.capability_groups) {
    lines.push(`### ${group.name} — ${group.status.toUpperCase()}`);
    lines.push('');
    for (const capability of group.capabilities) {
      lines.push(`- ${capability}`);
    }
    lines.push('');
    for (const file of group.files) {
      lines.push(`- ${file.file}: ${file.failed === 0 ? 'pass' : 'fail'} (${file.passed} passed, ${file.failed} failed, ${file.skipped} skipped, ${file.todo} todo)`);
    }
    lines.push('');
  }

  lines.push('## Failed Tests');
  lines.push('');
  if (report.failed_tests.length === 0) {
    lines.push('- None');
  } else {
    for (const failure of report.failed_tests) {
      lines.push(`- ${failure.file}: ${failure.path}`);
      for (const err of failure.errors.slice(0, 2)) {
        lines.push(`  ${err}`);
      }
    }
  }
  lines.push('');
  lines.push('## Raw Output Tail');
  lines.push('');
  lines.push('```text');
  for (const line of report.stdout_tail) lines.push(line);
  if (report.stderr_tail.length) {
    lines.push('');
    lines.push('[stderr]');
    for (const line of report.stderr_tail) lines.push(line);
  }
  if (report.smoke_stdout_tail.length) {
    lines.push('');
    lines.push('[playwright]');
    for (const line of report.smoke_stdout_tail) lines.push(line);
  }
  if (report.smoke_stderr_tail.length) {
    lines.push('');
    lines.push('[playwright stderr]');
    for (const line of report.smoke_stderr_tail) lines.push(line);
  }
  lines.push('```');
  return lines.join('\n');
}

function tail(text, maxLines) {
  return String(text || '')
    .trim()
    .split('\n')
    .filter(Boolean)
    .slice(-maxLines);
}

function sumStatus(fileStatus, key) {
  let total = 0;
  for (const value of fileStatus.values()) total += Number(value[key] || 0);
  return total;
}

function sumAllStatus(fileStatus) {
  let total = 0;
  for (const value of fileStatus.values()) {
    total += Number(value.passed || 0);
    total += Number(value.failed || 0);
    total += Number(value.skipped || 0);
    total += Number(value.todo || 0);
  }
  return total;
}

function extractJson(text) {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return text;
  return text.slice(start, end + 1);
}
