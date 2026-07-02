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

// The three reveal call sites (WalletSeedQR, WalletPortfolioPage's per-wallet menu,
// WalletPortfolioPage's global unbacked-wallet banner) used to each destructure
// { mnemonic, reauthRequired } from revealWalletMnemonic directly and toast a
// dead-end error on a stale session. That duplicated handling is now centralised
// in useRevealWithReauth (src/components/security/useRevealWithReauth.jsx), which
// turns reauthRequired into an inline "unlock again" prompt that retries the
// reveal on success instead of a dead-end toast. These assertions follow the
// logic to its new home rather than re-duplicating it back into the pages.
describe('M6 — call sites consume the shaped return', () => {
  const seedQr = readFileSync(resolve(here, '../../pages/WalletSeedQR.jsx'), 'utf8');
  const portfolio = readFileSync(resolve(here, '../../pages/WalletPortfolioPage.jsx'), 'utf8');
  const reauthHook = readFileSync(resolve(here, '../../components/security/useRevealWithReauth.jsx'), 'utf8');

  it('useRevealWithReauth destructures { mnemonic, reauthRequired } from revealWalletMnemonic and short-circuits on reauthRequired', () => {
    expect(reauthHook).toMatch(/const\s*\{\s*mnemonic[\s\S]*reauthRequired\s*\}\s*=\s*revealWalletMnemonic/);
    expect(reauthHook).toMatch(/reauthRequired/);
  });

  it('useRevealWithReauth never silently drops a stale session (no dead-end toast; sets up the inline prompt)', () => {
    const fnStart = reauthHook.indexOf('const attemptReveal = useCallback');
    const body = reauthHook.slice(fnStart, reauthHook.indexOf('}, [', fnStart));
    expect(fnStart).toBeGreaterThan(-1);
    expect(body).toMatch(/if\s*\(\s*reauthRequired\s*\)\s*\{/);
    // Must set pendingWalletId (drives the inline prompt) rather than just toasting.
    expect(body).toMatch(/setPendingWalletId\(walletId\)/);
  });

  it('WalletSeedQR no longer imports revealWalletMnemonic or requireTwoFactor directly (delegates to useRevealWithReauth)', () => {
    expect(seedQr).not.toMatch(/revealWalletMnemonic/);
    expect(seedQr).not.toMatch(/useActionGuard/);
    expect(seedQr).toMatch(/useRevealWithReauth/);
  });

  it('WalletPortfolioPage no longer uses the raw-string return of revealWalletMnemonic', () => {
    // The old shape `mnemonic: revealWalletMnemonic(w.id)` must be gone.
    expect(portfolio).not.toMatch(/mnemonic:\s*revealWalletMnemonic\(/);
  });

  it('WalletPortfolioPage delegates both reveal call sites (per-wallet menu + global banner) to the shared hook', () => {
    const count = (portfolio.match(/revealWithReauth\(/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(2);
    expect(portfolio).not.toMatch(/revealWalletMnemonic/);
  });
});
