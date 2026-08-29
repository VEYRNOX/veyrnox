import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

describe('suspiciousAssetPrefs', () => {
  let mod;
  let isDeniabilityOrDemoActive;

  beforeEach(async () => {
    vi.resetModules();
    localStorage.clear();
    isDeniabilityOrDemoActive = (await import('@/wallet-core/deniabilitySession')).isDeniabilityOrDemoActive;
    isDeniabilityOrDemoActive.mockReturnValue(false);
    mod = await import('@/lib/suspiciousAssetPrefs.js');
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('stores contract-intel consent as a distinct opt-in decision', () => {
    expect(mod.getContractIntelConsentState()).toBeNull();
    mod.setContractIntelConsent(true);
    expect(mod.getContractIntelConsentState()).toBe('granted');
    expect(mod.hasContractIntelConsent()).toBe(true);
    mod.setContractIntelConsent(false);
    expect(mod.getContractIntelConsentState()).toBe('denied');
  });

  it('does not write consent or dismissals in a decoy/demo session', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    mod.setContractIntelConsent(true);
    mod.dismissSuspiciousNft('nft-1');
    expect(localStorage.getItem(mod.CONTRACT_INTEL_CONSENT_KEY)).toBeNull();
    expect(localStorage.getItem(mod.DISMISSED_SUSPICIOUS_NFTS_KEY)).toBeNull();
  });

  it('tracks dismissed suspicious NFTs and can restore them', () => {
    mod.dismissSuspiciousNft('nft-1');
    mod.dismissSuspiciousNft('nft-2');
    expect(mod.readDismissedSuspiciousNfts()).toEqual(['nft-1', 'nft-2']);
    mod.undismissSuspiciousNft('nft-1');
    expect(mod.readDismissedSuspiciousNfts()).toEqual(['nft-2']);
    mod.clearDismissedSuspiciousNfts();
    expect(mod.readDismissedSuspiciousNfts()).toEqual([]);
  });

  it('caches contract-intel results with a ttl', () => {
    const now = Date.UTC(2026, 7, 21, 12, 0, 0);
    const value = { verdict: 'warn', risks: [{ title: 'test' }] };
    mod.cacheContractIntel('token-1', value, now);
    expect(mod.readCachedContractIntel('token-1', now + 1_000)).toEqual(value);
    expect(mod.readCachedContractIntel('token-1', now + mod.CONTRACT_INTEL_CACHE_TTL_MS + 1)).toBeNull();
  });

  it('does not write contract-intel cache entries in a decoy/demo session', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    mod.cacheContractIntel('token-1', { verdict: 'warn' });
    expect(localStorage.getItem(mod.CONTRACT_INTEL_CACHE_KEY)).toBeNull();
  });
});

describe('suspiciousAssetPrefs — panic wipe coverage', () => {
  it('preference keys are listed in wallet-core/panic.js', async () => {
    const { CONTRACT_INTEL_CONSENT_KEY, CONTRACT_INTEL_CACHE_KEY, DISMISSED_SUSPICIOUS_NFTS_KEY } = await import('@/lib/suspiciousAssetPrefs.js');
    const here = dirname(fileURLToPath(import.meta.url));
    const panicSrc = readFileSync(join(here, '../../wallet-core/panic.js'), 'utf8');
    expect(panicSrc).toContain(CONTRACT_INTEL_CONSENT_KEY);
    expect(panicSrc).toContain(CONTRACT_INTEL_CACHE_KEY);
    expect(panicSrc).toContain(DISMISSED_SUSPICIOUS_NFTS_KEY);
  });
});
