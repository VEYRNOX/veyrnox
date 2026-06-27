// src/lib/__tests__/WalletProvider.m6.test.js
//
// M6 — revealWalletMnemonic must enforce a staleness (re-auth) gate and return a
// shaped { mnemonic, reauthRequired } object rather than a raw string.
//
// Root cause: revealWalletMnemonic returned the raw mnemonic with zero internal
// gate. The only protection was requireTwoFactor at the call sites, which is a
// no-op when no 2FA factor is configured (the default). An idle-but-unlocked
// session could extract seeds freely — unlike the Send flow, which honours
// isSendReauthRequired() / REAUTH_WINDOW_MS.
//
// These are STRUCTURAL assertions over the provider source (the established
// pattern for provider-internal callbacks that are awkward to render in jsdom).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const providerSrc = readFileSync(resolve(here, '../WalletProvider.jsx'), 'utf8');

// Isolate the revealWalletMnemonic callback body.
const fnStart = providerSrc.indexOf('const revealWalletMnemonic = useCallback');
const body = providerSrc.slice(fnStart, providerSrc.indexOf('}, [', fnStart) + 80);

describe('M6 — revealWalletMnemonic staleness gate + shaped return', () => {
  it('defines revealWalletMnemonic', () => {
    expect(fnStart).toBeGreaterThan(-1);
  });

  it('checks isSendReauthRequired() BEFORE touching containerRef (fail closed)', () => {
    const reauthIdx = body.indexOf('isSendReauthRequired()');
    const containerIdx = body.indexOf('containerRef.current');
    expect(reauthIdx).toBeGreaterThan(-1);
    expect(containerIdx).toBeGreaterThan(-1);
    expect(reauthIdx).toBeLessThan(containerIdx);
  });

  it('returns reauthRequired:true when the session is stale', () => {
    expect(body).toMatch(/reauthRequired:\s*true/);
  });

  it('returns a shaped object (mnemonic + reauthRequired:false) on success', () => {
    expect(body).toMatch(/mnemonic:\s*w\s*\?\s*w\.mnemonic\s*:\s*null/);
    expect(body).toMatch(/reauthRequired:\s*false/);
  });

  it('returns a shaped object (mnemonic:null) when the wallet is not found', () => {
    expect(body).toMatch(/mnemonic:\s*null,\s*reauthRequired:\s*false/);
  });

  it('declares isSendReauthRequired in its dependency array', () => {
    expect(body).toMatch(/\[isSendReauthRequired\]/);
  });
});

describe('M6 — call sites consume the shaped return', () => {
  const seedQr = readFileSync(resolve(here, '../../pages/WalletSeedQR.jsx'), 'utf8');
  const portfolio = readFileSync(resolve(here, '../../pages/WalletPortfolioPage.jsx'), 'utf8');

  it('WalletSeedQR destructures { mnemonic, reauthRequired } and short-circuits', () => {
    expect(seedQr).toMatch(/const\s*\{\s*mnemonic[\s\S]*reauthRequired\s*\}\s*=\s*revealWalletMnemonic/);
    expect(seedQr).toMatch(/reauthRequired/);
  });

  it('WalletPortfolioPage no longer uses the raw-string return of revealWalletMnemonic', () => {
    // The old shape `mnemonic: revealWalletMnemonic(w.id)` must be gone.
    expect(portfolio).not.toMatch(/mnemonic:\s*revealWalletMnemonic\(/);
  });

  it('WalletPortfolioPage handles reauthRequired at its call sites', () => {
    const count = (portfolio.match(/reauthRequired/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
  });
});
