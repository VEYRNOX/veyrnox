// src/__tests__/toaster-host-mounted.test.js
//
// Regression guard for the invisible-toast outage (PR #237).
//
// The whole app shows user feedback via `toast` from "sonner" (31+ files), but
// App.jsx once mounted the Radix `@/components/ui/toaster` instead — a DIFFERENT
// toast system whose store had zero writers. Net effect: every success/error
// toast in the app rendered nothing (the Encrypted Backup "downloaded" message,
// copy confirmations, error messages…), with no test catching it.
//
// This guard pins the invariant: the toast system the app CALLS must be the one
// the app MOUNTS. Concretely — components import `toast` from "sonner", so App
// must mount sonner's Toaster (components/ui/sonner), and must NOT mount the
// dead Radix host.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(resolve(here, '..', p), 'utf8');

const appSrc = read('App.jsx');

describe('the mounted Toaster matches the toast system the app uses (guards PR #237)', () => {
  it('App mounts a <Toaster /> host', () => {
    expect(/<Toaster\b/.test(appSrc)).toBe(true);
  });

  it('App imports its Toaster from the sonner host, not the dead Radix one', () => {
    const importsSonner = /import\s*\{\s*Toaster\s*\}\s*from\s*["']@\/components\/ui\/sonner["']/.test(appSrc);
    const importsRadix = /import\s*\{\s*Toaster\s*\}\s*from\s*["']@\/components\/ui\/toaster["']/.test(appSrc);
    expect(importsSonner, 'App must mount the sonner Toaster (matches `toast` from "sonner")').toBe(true);
    expect(importsRadix, 'App must NOT mount the Radix toaster — nothing writes to it').toBe(false);
  });

  it('the sonner host actually wraps sonner’s Toaster', () => {
    const sonner = read('components/ui/sonner.jsx');
    expect(/from\s*["']sonner["']/.test(sonner)).toBe(true);
    expect(/export\s*\{\s*Toaster\s*\}/.test(sonner)).toBe(true);
  });

  it('app code does use sonner toasts (so the host is load-bearing)', () => {
    // Spot-check a known caller so this guard stays meaningful if usage changes.
    const personalBackup = read('pages/PersonalBackup.jsx');
    expect(/import\s*\{\s*toast\s*\}\s*from\s*["']sonner["']/.test(personalBackup)).toBe(true);
  });
});
