#!/usr/bin/env node
// Fail-closed Node version guard for the test suite.
//
// Why this exists: the project targets Node 22. On Node >= 23 (seen with Node 26)
// the global `localStorage` shadows jsdom's, so the Vitest suite hangs or mass-fails
// while LOOKING green/red for the wrong reason. That is a silent-correctness trap, so
// we fail closed rather than let `npm test` run on an unsupported runtime.
//
// Pin source of truth: .nvmrc / .node-version and package.json "engines".
// Escape hatch (intentional, explicit): ALLOW_NODE_MISMATCH=1 npm test

import { readFileSync } from 'node:fs';

const pin = readFileSync(new URL('../.nvmrc', import.meta.url), 'utf8').trim();
const nodeVersionPin = readFileSync(new URL('../.node-version', import.meta.url), 'utf8').trim();
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const [REQUIRED_MAJOR, REQUIRED_MINOR, REQUIRED_PATCH] = pin.split('.').map(Number);
const expectedRange = `>=${pin} <${REQUIRED_MAJOR + 1}`;
if (nodeVersionPin !== pin || packageJson.engines?.node !== expectedRange) {
  console.error('[check-node-version] BLOCKED: Node version pins disagree.');
  process.exit(1);
}
const [major, minor, patch] = process.versions.node.split('.').map(Number);
const meetsFloor = minor > REQUIRED_MINOR ||
  (minor === REQUIRED_MINOR && patch >= REQUIRED_PATCH);

if (major === REQUIRED_MAJOR && meetsFloor) {
  process.exit(0);
}

if (process.env.ALLOW_NODE_MISMATCH === '1') {
  console.warn(
    `[check-node-version] WARNING: running on Node ${process.versions.node}, ` +
      `expected Node ${expectedRange}. ` +
      'Override active (ALLOW_NODE_MISMATCH=1) — ' +
      `results on this runtime are NOT trustworthy.`,
  );
  process.exit(0);
}

console.error(
  '\n[check-node-version] BLOCKED: this project targets Node ' +
    `${expectedRange}, ` +
    `but you are on Node ${process.versions.node}.\n` +
    'Node >= 23 silently breaks the jsdom localStorage test environment ' +
    '(hangs / false results).\n\n' +
    'Fix: switch to Node ' + REQUIRED_MAJOR + ' before running tests, e.g.\n' +
    '  nvm install && nvm use            # or:  fnm use\n' +
    `  node -v                            # must print v${REQUIRED_MAJOR}.${REQUIRED_MINOR}.${REQUIRED_PATCH}+\n\n` +
    'The pinned version lives in .nvmrc / .node-version.\n' +
    'To override anyway (not recommended): ALLOW_NODE_MISMATCH=1 npm test\n',
);
process.exit(1);
