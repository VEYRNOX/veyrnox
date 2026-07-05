// src/rasp/__tests__/browserProbeFresh.test.js
//
// RASP-A1 (2026-07-05 internal audit, HIGH): the browser probe signals must be
// sampled at SIGN TIME, not frozen at module-load. The original code computed
// `const _signals = sampleSignals()` once at import and wrapped that frozen object
// forever — a debugger / WebDriver attached AFTER load could never trip the probe.
//
// Contract: reading `browserProbeSource.signals` (and `.available`) must re-sample
// on every access. Two successive reads of `.signals` produce DISTINCT freshly-built
// objects (not one shared frozen reference), and a signal that flips AFTER
// module-load is reflected. Equality of contents is fine; identity must differ,
// proving a live re-sample rather than a cached snapshot.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { browserProbeSource } from '../browserProbe.js';

describe('RASP-A1 — browserProbeSource samples fresh per access (not module-load snapshot)', () => {
  const hadWindow = typeof globalThis.window !== 'undefined';
  const hadNavigator = typeof globalThis.navigator !== 'undefined';

  beforeEach(() => {
    // Provide a minimal browser-shaped environment so the probe returns
    // available:true (so we can compare the sampled signal objects).
    if (!hadWindow) globalThis.window = {};
    if (!hadNavigator) globalThis.navigator = { webdriver: false };
  });

  afterEach(() => {
    if (!hadWindow) delete globalThis.window;
    if (!hadNavigator) delete globalThis.navigator;
  });

  it('two successive reads of .signals yield DISTINCT object references (fresh sample)', () => {
    expect(browserProbeSource.available).toBe(true);
    const first = browserProbeSource.signals;
    const second = browserProbeSource.signals;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    // Fresh signals object each read — not one shared frozen reference.
    expect(first).not.toBe(second);
    expect(first).toEqual(second);
  });

  it('reflects a signal that changes AFTER module-load (debugger-attached-late case)', () => {
    globalThis.navigator = { webdriver: false };
    expect(browserProbeSource.available).toBe(true);
    expect(browserProbeSource.signals.hooked).toBe(false);

    // Attacker/automation flips webdriver on AFTER the module was first imported.
    globalThis.navigator = { webdriver: true };
    expect(browserProbeSource.available).toBe(true);
    expect(browserProbeSource.signals.hooked).toBe(true);
  });
});
