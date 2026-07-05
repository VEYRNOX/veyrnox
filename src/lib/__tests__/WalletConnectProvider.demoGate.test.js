// src/lib/__tests__/WalletConnectProvider.demoGate.test.js
//
// Explicit DEMO gate on WalletConnect relay init (defense-in-depth).
//
// The init effect was previously safe in demo mode only by accident: it gates
// on !isUnlocked, and WalletProvider.isUnlocked happens never to flip true in
// a demo tour (the demo quick-lock is a separate Dashboard-local state). That
// is the same incidental safety fixed for usePriceAlertNotifier in PR #617.
// The relay WebSocket must never open during a demo tour even if isUnlocked
// semantics change — mirror the M-6 pattern (useReceiveDetector.js).
//
// Source-scan structural guards in the house style (no React render harness
// in this project).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../WalletConnectProvider.jsx'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('WalletConnectProvider — explicit DEMO gate on relay init (source scan)', () => {
  it('imports DEMO from @/api/demoClient', () => {
    expect(code).toMatch(/import\s*\{\s*DEMO\s*\}\s*from\s*['"]@\/api\/demoClient['"]/);
  });

  it('init guard includes DEMO alongside the I3 deniability checks', () => {
    expect(code).toMatch(
      /if\s*\(\s*!isUnlocked\s*\|\|\s*isDecoy\s*\|\|\s*isHidden\s*\|\|\s*DEMO\s*\|\|\s*!isWalletConnectConfigured\(\)\s*\)\s*return;/
    );
  });

  it('DEMO guard precedes initWalletConnect() in source order (gate before egress)', () => {
    const guardIdx = code.search(
      /!isUnlocked\s*\|\|\s*isDecoy\s*\|\|\s*isHidden\s*\|\|\s*DEMO/
    );
    const initIdx = code.indexOf('initWalletConnect()');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(initIdx).toBeGreaterThan(guardIdx);
  });

  it('I3 regression: decoy/hidden checks remain in the init guard', () => {
    expect(code).toMatch(/!isUnlocked\s*\|\|\s*isDecoy\s*\|\|\s*isHidden/);
  });
});
