import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Companion to scripts/check-spm-paths.mjs (wired into CI `verify`). This test
// gives the same guard local signal: `npm test` catches a corrupted manifest
// before it is pushed, without waiting for CI.
//
// WHY: `npx cap sync` on Windows rewrites ios/App/CapApp-SPM/Package.swift with
// backslash paths. Backslash is Swift's escape character, so the manifest stops
// parsing — but only on macOS, and no CI job compiles it. Windows-primary repo
// + Mac-only iOS build means this reaches main silently (observed 2026-07-22).

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const MANIFEST = 'ios/App/CapApp-SPM/Package.swift';

describe('iOS SPM manifest path separators', () => {
  const src = readFileSync(resolve(root, MANIFEST), 'utf8');
  const paths = [...src.matchAll(/path:\s*"([^"]*)"/g)].map(([, p]) => p);

  it('declares at least one local package path', () => {
    // Guards the guard: if the manifest is restructured so no `path:` argument
    // matches, the backslash assertion below would pass vacuously.
    expect(paths.length).toBeGreaterThan(0);
  });

  it('uses POSIX separators in every package path', () => {
    const windowsPaths = paths.filter((p) => p.includes('\\'));
    expect(
      windowsPaths,
      `${MANIFEST} contains Windows-style paths — almost certainly written by running ` +
        'a Capacitor CLI command on Windows. Backslash is Swift\'s escape character, so ' +
        'this manifest will not parse on macOS and the iOS build fails. Replace \\ with / ' +
        `(or \`git checkout -- ${MANIFEST}\` if unintentional).`,
    ).toEqual([]);
  });
});
