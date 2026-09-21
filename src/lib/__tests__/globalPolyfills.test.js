// Regression test for the dev-server-only Send crash (RSP-05/A11Y-04/MNY-01/
// MNY-02/RTE-01/SET-01, 2026-09-21). Root cause: @reown/appkit-polyfills sets
// `window.process = { env: {} }` during Vite's dev prebundle, and the old
// main.jsx shim only ran `if (typeof globalThis.process === 'undefined')` --
// so it saw appkit's partial object already there and skipped, leaving
// `process.browser` undefined. hash-base's readable-stream v2 then threw on
// `process.version.slice(0, 5)`. Fix: merge missing fields into whatever's
// already there instead of skipping. This file tests the pure merge function;
// globalPolyfills.js applies it to globalThis.process as an import side effect.
import { describe, it, expect } from 'vitest';
import { mergeProcessPolyfill } from '../globalPolyfills.js';

describe('mergeProcessPolyfill', () => {
  it('fills a full default shim when nothing existed before', () => {
    expect(mergeProcessPolyfill(undefined)).toEqual({
      env: {},
      browser: true,
      versions: {},
      version: '',
      platform: 'browser',
    });
  });

  // The actual bug: a partial object (like appkit-polyfills' `{ env: {} }`)
  // must not suppress browser/versions/version/platform from being filled in.
  it('fills in missing fields on a partial existing process object, mutation-checked shape', () => {
    const merged = mergeProcessPolyfill({ env: {} });
    expect(merged.browser).toBe(true);
    expect(merged.versions).toEqual({});
    expect(merged.version).toBe('');
    expect(merged.platform).toBe('browser');
  });

  it('never clobbers a field a prior shim already set', () => {
    const merged = mergeProcessPolyfill({
      env: { FOO: 'bar' },
      browser: false,
      versions: { node: '18.0.0' },
      version: 'v18.0.0',
      platform: 'linux',
    });
    expect(merged).toEqual({
      env: { FOO: 'bar' },
      browser: false,
      versions: { node: '18.0.0' },
      version: 'v18.0.0',
      platform: 'linux',
    });
  });

  it('treats a non-object existing value the same as nothing (fails closed to the safe default, never throws)', () => {
    expect(mergeProcessPolyfill(null)).toMatchObject({ browser: true });
    expect(mergeProcessPolyfill('not-an-object')).toMatchObject({ browser: true });
  });

  // This is the exact regression: readable-stream v2 does
  // `!process.browser && [...].indexOf(process.version.slice(0, 5))`, so
  // `browser: true` must short-circuit before `.slice()` is ever reached.
  it('reproduces the appkit-polyfills partial shim and confirms .version.slice(0, 5) no longer throws', () => {
    const merged = mergeProcessPolyfill({ env: {} }); // shape @reown/appkit-polyfills installs
    expect(() => merged.version.slice(0, 5)).not.toThrow();
    expect(!merged.browser && merged.version.slice(0, 5)).toBe(false); // short-circuits on browser:true
  });
});
