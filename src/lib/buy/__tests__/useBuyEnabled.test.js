import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LOCALE_KEY, TIMEZONE_KEY } from '@/lib/locale.js';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession.js';

async function loadGateModule() {
  return import('../useBuyEnabled.js');
}

function clearBuyGateState() {
  localStorage.removeItem(LOCALE_KEY);
  localStorage.removeItem(TIMEZONE_KEY);
  localStorage.removeItem('veyrnox-demo');
  setDeniabilitySession(false);
}

describe('isUkBuyBlocked', () => {
  beforeEach(() => {
    clearBuyGateState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    clearBuyGateState();
  });

  it('blocks locale tags that resolve to the UK region', async () => {
    const { isUkBuyBlocked } = await loadGateModule();
    expect(isUkBuyBlocked({ locale: 'en-GB', timeZone: 'America/New_York' })).toBe(true);
    expect(isUkBuyBlocked({ locale: 'cy-GB', timeZone: 'Europe/Paris' })).toBe(true);
    expect(isUkBuyBlocked({ locale: 'en-UK', timeZone: 'Europe/Paris' })).toBe(true);
  });

  it('blocks the London timezone even if the locale is not GB-tagged', async () => {
    const { isUkBuyBlocked } = await loadGateModule();
    expect(isUkBuyBlocked({ locale: 'en-US', timeZone: 'Europe/London' })).toBe(true);
  });

  it('does not block non-UK locale/timezone pairs', async () => {
    const { isUkBuyBlocked } = await loadGateModule();
    expect(isUkBuyBlocked({ locale: 'en-US', timeZone: 'America/New_York' })).toBe(false);
    expect(isUkBuyBlocked({ locale: 'fr-FR', timeZone: 'Europe/Paris' })).toBe(false);
  });
});

describe('isBuyEnabled', () => {
  beforeEach(() => {
    clearBuyGateState();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
    clearBuyGateState();
  });

  it('returns true only when the ship gate is on and the device is not UK-flagged', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'true');
    localStorage.setItem(LOCALE_KEY, 'en-US');
    localStorage.setItem(TIMEZONE_KEY, 'America/New_York');
    const { isBuyEnabled } = await loadGateModule();
    expect(isBuyEnabled()).toBe(true);
  });

  it('returns false when the ship gate is off even outside the UK', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'false');
    localStorage.setItem(LOCALE_KEY, 'en-US');
    localStorage.setItem(TIMEZONE_KEY, 'America/New_York');
    const { isBuyEnabled } = await loadGateModule();
    expect(isBuyEnabled()).toBe(false);
  });

  it('returns false for UK locale users when the ship gate is on', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'true');
    localStorage.setItem(LOCALE_KEY, 'en-GB');
    const { isBuyEnabled } = await loadGateModule();
    expect(isBuyEnabled()).toBe(false);
  });

  it('returns false for London-timezone users when the ship gate is on', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'true');
    localStorage.setItem(LOCALE_KEY, 'en-US');
    localStorage.setItem(TIMEZONE_KEY, 'Europe/London');
    const { isBuyEnabled } = await loadGateModule();
    expect(isBuyEnabled()).toBe(false);
  });

  it('returns false in deniability mode even outside the UK', async () => {
    vi.stubEnv('VITE_BUY_ENABLED', 'true');
    localStorage.setItem(LOCALE_KEY, 'en-US');
    localStorage.setItem(TIMEZONE_KEY, 'America/New_York');
    setDeniabilitySession(true);
    const { isBuyEnabled } = await loadGateModule();
    expect(isBuyEnabled()).toBe(false);
  });
});
