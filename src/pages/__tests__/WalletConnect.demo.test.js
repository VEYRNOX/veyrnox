// src/pages/__tests__/WalletConnect.demo.test.js
//
// Demo-tour UX + honesty guards for the dApp Connector page.
//
// During a demo tour (veyrnox-demo=1, no unlocked vault) the page previously
// rendered only the heading plus "Unlock your wallet to connect to dApps." —
// a near-blank dead-end. The locked branch must now (a) explain honestly in
// demo that dApp connections are disabled (no fake pairing — no-fake-security
// rule), and (b) still show the network-silent PopularDapps grid so the page
// is not blank. The page requires a React render harness (not available in
// this project), so these are source-scan structural guards in the house
// style (see useReceiveDetector.test.js).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../WalletConnect.jsx'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

// The locked-branch return: from `if (!isUnlocked)` to the `handlePair`
// function that follows it in source order.
const lockedIdx = code.indexOf('if (!isUnlocked)');
const afterLockedIdx = code.indexOf('function handlePair');
const lockedBranch = code.slice(lockedIdx, afterLockedIdx);

describe('WalletConnect page — demo-mode locked branch (source scan)', () => {
  it('imports DEMO from @/api/demoClient', () => {
    expect(code).toMatch(/import\s*\{\s*DEMO\s*\}\s*from\s*['"]@\/api\/demoClient['"]/);
  });

  it('locked branch exists and precedes the pairing UI', () => {
    expect(lockedIdx).toBeGreaterThan(-1);
    expect(afterLockedIdx).toBeGreaterThan(lockedIdx);
  });

  it('locked branch shows a DEMO-aware disclosure instead of the unlock prompt', () => {
    expect(lockedBranch).toMatch(/DEMO/);
    expect(lockedBranch).toMatch(/disabled in demo/i);
    expect(lockedBranch).toMatch(/no real signing/i);
  });

  it('locked branch keeps the honest unlock prompt for non-demo sessions', () => {
    expect(lockedBranch).toMatch(/Unlock your wallet to connect to dApps\./);
  });

  it('locked branch renders the PopularDapps grid (page is not blank)', () => {
    expect(lockedBranch).toMatch(/<PopularDapps\s*\/>/);
  });

  it('honesty: no simulated/fake pairing is introduced anywhere in the page', () => {
    expect(code).not.toMatch(/fakePair|mockPair|simulatedSession|demoSession/);
  });
});
