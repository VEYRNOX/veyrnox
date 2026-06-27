// H-NEW-1 — APK tamper detection must read the real release cert SHA256 from
// BuildConfig, not a hardcoded placeholder that short-circuits the check.
//
// These are source-scan tests: they pin the wiring that makes the native
// detectTamper() check meaningful. We assert on structure (no placeholder value
// assignment, BuildConfig field injected, plugin reads BuildConfig) so the
// control cannot silently regress to a no-op.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '../../..');

const KT = resolve(
  repoRoot,
  'android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt',
);
const GRADLE = resolve(repoRoot, 'android/app/build.gradle');

const PLACEHOLDER = 'VEYRNOX_RELEASE_CERT_SHA256_PLACEHOLDER';

function readNonCommentLines(path) {
  // Strip whole-line // comments so a documented mention of the old placeholder
  // in prose does not count as a live value assignment.
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('//'))
    .join('\n');
}

describe('H-NEW-1 RASP tamper cert config', () => {
  it('RaspIntegrityPlugin.kt has no placeholder value assignment', () => {
    const code = readNonCommentLines(KT);
    expect(code).not.toContain(PLACEHOLDER);
  });

  it('build.gradle injects a RELEASE_CERT_SHA256 BuildConfig field', () => {
    const gradle = readFileSync(GRADLE, 'utf8');
    expect(gradle).toContain('RELEASE_CERT_SHA256');
    expect(gradle).toMatch(/buildConfigField\s+"String",\s*"RELEASE_CERT_SHA256"/);
  });

  it('RaspIntegrityPlugin.kt reads BuildConfig.RELEASE_CERT_SHA256', () => {
    const code = readNonCommentLines(KT);
    expect(code).toContain('BuildConfig.RELEASE_CERT_SHA256');
  });
});
