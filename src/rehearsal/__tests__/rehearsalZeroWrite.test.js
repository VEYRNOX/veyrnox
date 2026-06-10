// src/rehearsal/__tests__/rehearsalZeroWrite.test.js
//
// Build brief §2 (zero-write hard exclusion) + §8 (zero-write assertion). A
// deniability tool that leaves a trace defeats its own purpose: no walletMeta,
// no log, no disk, no localStorage, no telemetry, no network. This source-scans
// EVERY rehearsal module for any persistence or egress primitive. It is a static
// guard (the codebase convention) — the runtime spy described in §8 belongs to a
// later render-harness pass; this catches the introduction of a write at source.
//
// NOTE: the scan covers only src/rehearsal/* — RehearsalView renders the real
// dashboard, whose own (production) clipboard/network use lives in its own file
// and is out of scope here by design (the rehearsal layer itself writes nothing).
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const rehearsalDir = resolve(here, '..');
const stripComments = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

// Persistence + egress primitives. Any of these in a rehearsal module is a trace.
const WRITE_OR_EGRESS = /\b(localStorage|sessionStorage|setItem|removeItem|indexedDB|openDatabase|cookie|fetch|XMLHttpRequest|sendBeacon|WebSocket|EventSource|writeText|navigator\.clipboard)\b|\.persist\(/;

const moduleFiles = readdirSync(rehearsalDir)
  .filter((f) => /\.(js|jsx)$/.test(f) && f !== '__tests__')
  .map((f) => ({ name: f, code: stripComments(readFileSync(resolve(rehearsalDir, f), 'utf8')) }));

describe('rehearsal modules write nothing to disk and make no network call (§2)', () => {
  it('there is a rehearsal module surface to check (sentinel)', () => {
    expect(moduleFiles.length).toBeGreaterThan(0);
  });

  for (const { name } of moduleFiles) {
    it(`${name} performs no persistence or egress`, () => {
      const m = moduleFiles.find((x) => x.name === name);
      const offending = m.code.split('\n')
        .map((line, i) => ({ line: line.trim(), n: i + 1 }))
        .filter(({ line }) => WRITE_OR_EGRESS.test(line));
      expect(offending.map((o) => `L${o.n}: ${o.line}`)).toEqual([]);
    });
  }
});
