import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';

// Composed gate for opt-in bug-report screen recording. Slice 1a — nothing
// runtime consumes this module yet; tests pin the contract so Slice 1b's UI
// wiring and Slice 3's flag-flip cannot regress it silently.
//
// The mutation defence for each row is spelled out inline. If a row goes
// green under its named mutation, DO NOT relax it — see CLAUDE.md
// "Mutation-check every new test pin".

const deniabilityActive = vi.fn(() => false);
const capacitorPlatform = vi.fn(() => true); // isNativePlatform()

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => deniabilityActive(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => capacitorPlatform(),
  },
}));

const IMPORT_META_ENV_KEY = 'VITE_BUG_REPORT_ENABLED';

let enabledMod;
async function loadWithFlag(value) {
  // Vite's import.meta.env is a Proxy in vitest; assigning + resetModules
  // is the shape the rest of the suite uses for VITE_* flags.
  if (value === undefined) delete import.meta.env[IMPORT_META_ENV_KEY];
  else import.meta.env[IMPORT_META_ENV_KEY] = value;
  vi.resetModules();
  enabledMod = await import('../bugReportEnabled');
}

beforeEach(() => {
  deniabilityActive.mockReturnValue(false);
  capacitorPlatform.mockReturnValue(true);
});

afterEach(() => {
  delete import.meta.env[IMPORT_META_ENV_KEY];
});

describe('ship gate — VITE_BUG_REPORT_ENABLED', () => {
  it('is OFF by default (flag unset)', async () => {
    // The single most important test in this file. If the default is ever
    // ON, a build that forgot to opt out ships screen capture without the
    // matching store disclosures — instant Play/Apple rejection risk.
    await loadWithFlag(undefined);
    expect(enabledMod.isBugReportEnabled()).toBe(false);
  });

  it('rejects every falsy-looking value except the literal "1"', async () => {
    // Mutation defence: if strict === '1' becomes truthy(),
    // '0'/'true'/'yes'/'' will ALL open the gate.
    // Only string values here — Vite always exposes VITE_* env vars as strings
    // in production. Non-string vitest assignments get coerced by
    // import.meta.env's setter and don't reflect a real ship risk.
    for (const v of ['', '0', 'true', 'false', 'yes', 'no', '2', 'on']) {
      await loadWithFlag(v);
      expect(enabledMod.isBugReportEnabled()).toBe(false);
    }
  });

  it('opens when the literal string "1" is set AND all other gates pass', async () => {
    await loadWithFlag('1');
    expect(enabledMod.isBugReportEnabled()).toBe(true);
  });
});

describe('deniability gate (I3)', () => {
  it('is OFF in a decoy/duress/stealth session even with the flag on', async () => {
    // If this test goes green, decoy sessions can see the "Report a
    // problem" button — which either proves a hidden wallet exists to a
    // coercer (I3 break) or lets one screen-capture a real user's decoy
    // flow believing it is their real wallet.
    deniabilityActive.mockReturnValue(true);
    await loadWithFlag('1');
    expect(enabledMod.isBugReportEnabled()).toBe(false);
  });
});

describe('platform gate — native only', () => {
  it('is OFF on the web platform even with the flag on', async () => {
    // Capacitor's webview cannot reliably capture the screen; a partial
    // web implementation would leak the "recording available" signal
    // without the safety net of ReplayKit / MediaProjection.
    capacitorPlatform.mockReturnValue(false);
    await loadWithFlag('1');
    expect(enabledMod.isBugReportEnabled()).toBe(false);
  });

  it('is OFF if Capacitor throws (I4 — unknown platform state → DENY)', async () => {
    capacitorPlatform.mockImplementation(() => {
      throw new Error('Capacitor runtime not yet initialised');
    });
    await loadWithFlag('1');
    expect(enabledMod.isBugReportEnabled()).toBe(false);
  });
});

describe('exception hygiene (I4)', () => {
  it('any thrown check falls through to false', async () => {
    // Mutation defence: if the outer try/catch is removed, the isBugReportEnabled
    // call throws (leaving the caller to render whatever their fallback is —
    // usually "show the button anyway"). Catching + returning false pins the
    // fail-closed behaviour at the topmost layer.
    deniabilityActive.mockImplementation(() => {
      throw new Error('unexpected');
    });
    await loadWithFlag('1');
    expect(enabledMod.isBugReportEnabled()).toBe(false);
  });
});
