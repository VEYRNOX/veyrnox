/**
 * useRaspArtifact — mount-time probe is deferred past first paint via
 * requestIdleCallback (fallback: setTimeout). Pins the intent so a future
 * "cleanup" that inlines the useEffect body without idle scheduling is caught.
 *
 * getFreshRaspArtifact() (the pre-sign chokepoint) runs its own fresh probe,
 * so this hook's mount-time cache is a UI/read model only — safe to defer.
 * The initial null → { available: false } transient before the idle callback
 * fires yields WARN via detect()/degrade() (fail-closed default).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(here, '../useRaspArtifact.js'), 'utf8');

describe('useRaspArtifact — cold-unlock defer', () => {
  it('exports a scheduleIdle helper that prefers requestIdleCallback with a setTimeout fallback', () => {
    expect(src).toMatch(/function\s+scheduleIdle/);
    expect(src).toMatch(/requestIdleCallback/);
    expect(src).toMatch(/setTimeout\(\s*cb\s*,\s*16\s*\)/);
  });

  it('wraps the OS-probe effect body in scheduleIdle so it does not compete with paint', () => {
    const idx = src.indexOf('nativeProbeSource()');
    expect(idx).toBeGreaterThan(-1);
    // Look at the enclosing effect: the effect's setup body must include
    // scheduleIdle BEFORE the await, and the cleanup must call cancelIdle.
    const region = src.slice(Math.max(0, idx - 600), idx + 400);
    expect(region).toMatch(/scheduleIdle\s*\(/);
    expect(region).toMatch(/cancelIdle\s*\(/);
  });

  it('wraps the attestation effect body in scheduleIdle as well', () => {
    const idx = src.indexOf('attestationProbeSource()');
    expect(idx).toBeGreaterThan(-1);
    const region = src.slice(Math.max(0, idx - 600), idx + 400);
    expect(region).toMatch(/scheduleIdle\s*\(/);
    expect(region).toMatch(/cancelIdle\s*\(/);
  });

  it('preserves I4 fail-closed default while the idle callback is pending', () => {
    // Both effects must still setNativeProbe({ available: false }) / setAttestationResult({ available: false })
    // on error, so a stuck bridge cannot silently allow.
    expect(src).toMatch(/setNativeProbe\s*\(\s*\{\s*available:\s*false\s*\}\s*\)/);
    expect(src).toMatch(/setAttestationResult\s*\(\s*\{\s*available:\s*false\s*\}\s*\)/);
  });
});
