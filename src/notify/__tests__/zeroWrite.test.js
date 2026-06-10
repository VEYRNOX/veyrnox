// src/notify/__tests__/zeroWrite.test.js
//
// Build brief §1/§2 (no disk write, no persistence, no backend, no push) + §7
// (no-persistence assertion). This is THE guard for the Path A boundary: the
// property that lets v1 ship ahead of the audit is that nothing is written to
// disk, so there is no metadata residual to forensically recover. Erode it and
// the deniability guarantee is gone.
//
// Static source-scan (the codebase convention — see rehearsalZeroWrite.test.js):
// every notify module + its UI surface is scanned for any persistence or egress
// primitive. Catches the introduction of a write/network call at source.
//
// KNOWN COVERAGE LIMIT (brief §7): this matches localStorage / IndexedDB / fetch /
// fs etc. BY NAME, in-module only. It does NOT follow aliased or transitive imports
// (e.g. a helper that wraps localStorage under another name, imported from elsewhere).
// Acceptable for v1 — these modules are small, self-contained, and untracked — but
// this is a guard against introducing a write at source, NOT a proof of no-write.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const notifyDir = resolve(here, '..');
const componentsDir = resolve(here, '../../components');
const libDir = resolve(here, '../../lib');

const stripComments = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

// Persistence + egress primitives. Any of these in a notify module is a trace.
const WRITE_OR_EGRESS =
  /\b(localStorage|sessionStorage|setItem|removeItem|indexedDB|openDatabase|cookie|fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|writeText|navigator\.clipboard)\b|\.persist\(/;

// Every notify module (excluding the __tests__ dir) + the v1 UI surface + the
// shared address helper this PR introduces.
const moduleFiles = [
  ...readdirSync(notifyDir)
    .filter((f) => /\.(js|jsx)$/.test(f))
    .map((f) => resolve(notifyDir, f)),
  resolve(componentsDir, 'NotificationToast.jsx'),
  resolve(componentsDir, 'NotificationBell.jsx'),
  resolve(libDir, 'address.js'),
].map((path) => ({ path, code: stripComments(readFileSync(path, 'utf8')) }));

describe('notify modules write nothing to disk and make no network call (§1/§2/§7)', () => {
  it('there is a notify module surface to check (sentinel)', () => {
    expect(moduleFiles.length).toBeGreaterThan(0);
  });

  for (const { path } of moduleFiles) {
    const name = path.split(/[\\/]/).pop();
    it(`${name} performs no persistence or egress`, () => {
      const m = moduleFiles.find((x) => x.path === path);
      const offending = m.code
        .split('\n')
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(({ line }) => WRITE_OR_EGRESS.test(line));
      expect(offending.map((o) => `L${o.n}: ${o.line}`)).toEqual([]);
    });
  }
});
