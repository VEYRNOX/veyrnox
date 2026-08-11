// Grep-guard: only backupNag.js may write the 3 backup-nag storage keys
// (Slice G+H plan §1 I3 chokepoint). Mirrors the K-2 rule for
// veyrnox-telemetry-consent enforced by src/lib/consent.js.
//
// A second writer to any of these keys re-introduces the class of bug that
// PR #1410 closed for telemetry consent: a decoy/duress session mutating a
// key the primary session reads. The one-and-only writer is backupNag.js;
// this test enforces it structurally.
//
// RED phase: passes vacuously today because no writers exist yet. The value
// of the test is that when the module ships, no OTHER file may sneak in a
// direct .setItem() for these keys. To keep it honestly RED for the right
// reason during the RED phase, we also assert backupNag.js EXISTS and
// contains the three key names — that fails now.

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');
const BACKUP_NAG_FILE = join(SRC, 'lib/backupNag.js');
const KEYS = [
  'veyrnox-backup-state-v1',
  'veyrnox-backup-nag-v1',
  'veyrnox-backup-nag-session-skip',
];

const EXCLUDE_PATHS = new Set([
  relative(ROOT, BACKUP_NAG_FILE),
  'src/lib/__tests__/backupNag.test.js',
  'src/lib/__tests__/useBackupNag.test.jsx',
]);

function* walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) {
      if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
      yield* walk(p);
    } else if (/\.(js|jsx|ts|tsx)$/.test(name)) {
      yield p;
    }
  }
}

describe('grep-guard — no external writers to backup-nag keys (I3 K-2 chokepoint)', () => {
  it('backupNag.js exists and holds all 3 key names', () => {
    expect(existsSync(BACKUP_NAG_FILE)).toBe(true);
    const src = readFileSync(BACKUP_NAG_FILE, 'utf8');
    for (const k of KEYS) expect(src).toContain(k);
  });

  it('no other source file writes any of the 3 keys via localStorage/sessionStorage.setItem', () => {
    const offending = [];
    // Match: localStorage.setItem('veyrnox-backup-...') or sessionStorage.setItem(...)
    const patterns = KEYS.map((k) => new RegExp(String.raw`(local|session)Storage\s*\.\s*(setItem|removeItem)\s*\(\s*['"\`]${k.replace(/[-]/g, '\\-')}['"\`]`));

    for (const file of walk(SRC)) {
      const rel = relative(ROOT, file).replace(/\\/g, '/');
      if (EXCLUDE_PATHS.has(rel)) continue;
      const src = readFileSync(file, 'utf8');
      for (const re of patterns) {
        if (re.test(src)) offending.push(rel);
      }
    }
    expect(offending).toEqual([]);
  });
});
