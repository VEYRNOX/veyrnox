// Brief A, Lane 2 wiring (source scan, same pattern as copySecret.harden.test.js):
// WalletProvider.lock() must dispatch APP_LOCK_EVENT so any sensitive value still
// on the OS clipboard is wiped THE MOMENT the wallet locks — covering every lock
// path (panic, duress, idle, background, session ceiling) through the one lock()
// choke point, even while the page stays visible (where the visibilitychange
// trigger never fires).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../WalletProvider.jsx'), 'utf8');
const stripComments = (s) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const code = stripComments(src);

describe('WalletProvider.lock() — clipboard wipe on lock (Brief A Lane 2)', () => {
  it('imports APP_LOCK_EVENT from copySecret', () => {
    expect(code).toMatch(/import\s*{[^}]*APP_LOCK_EVENT[^}]*}\s*from\s*['"]@\/lib\/copySecret['"]/);
  });

  it('dispatches APP_LOCK_EVENT on window', () => {
    expect(code).toMatch(/dispatchEvent\(\s*new\s+Event\(\s*APP_LOCK_EVENT\s*\)\s*\)/);
  });
});
