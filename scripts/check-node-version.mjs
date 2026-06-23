#!/usr/bin/env node
// Fail-closed Node version guard for the test suite.
//
// Why this exists: the project targets Node 22. On Node >= 23 (seen with Node 26)
// the global `localStorage` shadows jsdom's, so the Vitest suite hangs or mass-fails
// while LOOKING green/red for the wrong reason. That is a silent-correctness trap, so
// we fail closed rather than let `npm test` run on an unsupported runtime.
//
// Pin source of truth: .nvmrc / .node-version (both "22") and package.json "engines".
// Escape hatch (intentional, explicit): ALLOW_NODE_MISMATCH=1 npm test

const REQUIRED_MAJOR = 22;
const major = Number(process.versions.node.split('.')[0]);

if (major === REQUIRED_MAJOR) {
  process.exit(0);
}

if (process.env.ALLOW_NODE_MISMATCH === '1') {
  console.warn(
    `[check-node-version] WARNING: running on Node ${process.versions.node}, ` +
      `expected Node ${REQUIRED_MAJOR}. Override active (ALLOW_NODE_MISMATCH=1) — ` +
      `results on this runtime are NOT trustworthy.`,
  );
  process.exit(0);
}

console.error(
  '\n[check-node-version] BLOCKED: this project targets Node ' +
    `${REQUIRED_MAJOR}, but you are on Node ${process.versions.node}.\n` +
    'Node >= 23 silently breaks the jsdom localStorage test environment ' +
    '(hangs / false results).\n\n' +
    'Fix: switch to Node ' + REQUIRED_MAJOR + ' before running tests, e.g.\n' +
    '  nvm install 22 && nvm use 22      # or:  fnm use 22\n' +
    '  node -v                            # must print v22.x\n\n' +
    'The pinned version lives in .nvmrc / .node-version.\n' +
    'To override anyway (not recommended): ALLOW_NODE_MISMATCH=1 npm test\n',
);
process.exit(1);
