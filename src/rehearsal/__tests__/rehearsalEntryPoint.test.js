// src/rehearsal/__tests__/rehearsalEntryPoint.test.js
//
// Build brief §4: the rehearsal is reachable ONLY from a Settings row mounted
// inside the already-unlocked session — never a standalone route (the /landing
// lesson). This source-scans the Settings page to confirm the row is wired there
// and that no new top-level <Route> for the rehearsal was introduced in App.jsx.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');
const stripComments = (src) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

const settingsCode = stripComments(read('../../pages/Settings.jsx'));
const appCode = stripComments(read('../../App.jsx'));

describe('rehearsal entry point — Settings row, no standalone route', () => {
  it('Settings imports the rehearsal row', () => {
    expect(settingsCode).toMatch(/RehearsalSettingsRow/);
  });

  it('Settings renders the rehearsal row', () => {
    expect(settingsCode).toMatch(/<RehearsalSettingsRow\b/);
  });

  it('App.jsx adds no reachable route for the rehearsal (overlay only)', () => {
    expect(appCode).not.toMatch(/path=["']\/?rehears/i);
    expect(appCode).not.toMatch(/RehearsalView/);
  });
});
