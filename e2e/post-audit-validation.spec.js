/**
 * Post-audit regression validation.
 *
 * The previous version was a wall of `test.fixme` cases built around retired
 * routes, storage keys, and test ids. These are source-level regression checks
 * for the controls that ship today. They are intentionally not represented as
 * real-device, Play Console, or live-chain validation.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const read = (...parts) => readFileSync(join(root, ...parts), 'utf8');
const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

const ethSend = read('src', 'wallet-core', 'evm', 'send.js');
const tokenSend = read('src', 'wallet-core', 'evm', 'token-send.js');
const edgeProxy = read('functions', 'api', 'edge', '[fn].js');
const rateLimit = read('functions', 'api', '_lib', 'rate-limit.js');
const restoreShares = read('src', 'pages', 'RestoreFromShares.jsx');
const walletEntry = read('src', 'components', 'WalletEntry.jsx');
const biometricUnlock = read('src', 'lib', 'biometricUnlock.js');
const walletProvider = read('src', 'lib', 'WalletProvider.jsx');
const rpcUrl = read('src', 'wallet-core', 'netUrl.js');
const sendCrypto = read('src', 'pages', 'SendCrypto.jsx');
const addressValidation = read('src', 'lib', 'addressValidation.js');
const headers = read('public', '_headers');

test.describe('Post-Audit Validation: transaction and proxy boundaries', () => {
  test('#2275 pins the checked native-ETH nonce into the signed transaction', async () => {
    expect(ethSend).toMatch(/getTransactionCount\(wallet\.address, 'pending'\)/);
    expect(ethSend).toMatch(/nonce:\s*pendingNonce/);
    expect(ethSend).toMatch(/implausible nonce/);
  });

  test('#2275 pins the checked ERC-20 nonce into transfer overrides', async () => {
    expect(tokenSend).toMatch(/getTransactionCount\(wallet\.address, 'pending'\)/);
    expect(tokenSend).toMatch(/overridesWithNonce = \{ \.\.\.overrides, nonce: pendingNonce \}/);
    expect(tokenSend).toMatch(/c\.transfer\(to, value, overridesWithNonce\)/);
  });

  test('#2275 retains nonce pinning at the signing boundary rather than browser state', async () => {
    for (const src of [ethSend, tokenSend]) {
      expect(src).not.toMatch(/localStorage\.(get|set)Item\([^\n]*nonce/);
      expect(src).toMatch(/refusing to sign/);
    }
  });

  test('#2275 does not re-expose the retired monitoring refresh endpoint', async () => {
    expect(edgeProxy).not.toContain('monitoring/refresh');
    expect(edgeProxy).not.toContain('monitoring');
    expect(edgeProxy).toMatch(/const ALLOWED_FUNCTIONS = new Set/);
  });

  test('#2275 enforces a function allowlist before proxying requests', async () => {
    expect(edgeProxy).toMatch(/if \(!ALLOWED_FUNCTIONS\.has\(fn\)\) err\(403, 'Function not allowed'\)/);
    expect(edgeProxy).toMatch(/encodeURIComponent\(fn\)/);
  });

  test('#2275 rate-limits proxy requests and fails closed without a trusted client IP', async () => {
    expect(edgeProxy).toMatch(/await enforceRateLimit\(\{ bucket: `edge-\$\{fn\}`, clientIp: clientIpOf\(request\) \}\)/);
    expect(rateLimit).toMatch(/return request\.headers\.get\('CF-Connecting-IP'\) \|\| ''/);
    expect(rateLimit).toMatch(/if \(!clientIp \|\| clientIp === '0\.0\.0\.0'\) throw rlError\(\)/);
  });
});

test.describe('Post-Audit Validation: recovery and KEK boundaries', () => {
  test('#2275 clears share and credential state on restore-page unmount', async () => {
    for (const setter of [
      'setShareA', 'setShareB', 'setPassphraseA', 'setPassphraseB',
      'setNewPassphrase', 'setNewPassphraseConfirm', 'setNewPin', 'setNewPinConfirm',
    ]) expect(restoreShares).toContain(`${setter}("")`);
  });

  test('#2275 keeps the native restore credential floor at eight PIN digits', async () => {
    expect(restoreShares).toMatch(/const RESTORE_PIN_LENGTH = 8/);
    expect(restoreShares).toMatch(/newPin\.length !== RESTORE_PIN_LENGTH/);
  });

  test('#2275 holds restored native wallets at the hardware-KEK enrollment gate', async () => {
    expect(walletEntry).toMatch(/useKekEnrollmentGate\(\{ isUnlocked \}\)/);
    expect(walletEntry).toMatch(/<KekEnrollmentGate/);
    expect(walletEntry).toMatch(/gateActive: kekGatePending/);
    expect(walletEntry).toMatch(/if \(kekGatePending && isUnlocked && !generatedSeed\)/);
  });

  test('#2275 rejects biometric cache access without an explicit KEK assertion', async () => {
    expect(biometricUnlock).toMatch(/!assert \|\| assert\.kekEnrolled !== true/);
    expect(biometricUnlock).toMatch(/requires an explicit `\{ kekEnrolled: true \}` assertion/);
  });

  test('#2275 independently verifies the KEK wrap before unauthenticated cache access', async () => {
    expect(biometricUnlock).toMatch(/await ks\.hasVaultKekWrap\(\)/);
    expect(biometricUnlock).toMatch(/if \(!kekWrapped\) \{/);
    expect(biometricUnlock).toMatch(/return nativeReadSecretUnauth\(\)/);
  });
});

test.describe('Post-Audit Validation: configuration, session, and output boundaries', () => {
  test('#2275 rejects RPC URL fragments rather than forwarding them', async () => {
    expect(rpcUrl).toMatch(/RPC URL must not contain a fragment/);
    expect(rpcUrl).toMatch(/parsed\.hash/);
  });

  test('#2275 supersedes an in-flight unlock when the wallet locks', async () => {
    expect(walletProvider).toMatch(/unlockGenRef\.current \+= 1/);
    expect(walletProvider).toMatch(/UNLOCK_SUPERSEDED/);
  });

  test('#2275 rejects app-layer biometric and passkey prompts when the wallet locks', async () => {
    expect(walletProvider).toMatch(/Biometric authentication cancelled by lock/);
    expect(walletProvider).toMatch(/passkeyResolverRef\.current = null/);
  });

  test('#2275 keeps browser API keys out of the upstream edge-proxy request', async () => {
    expect(codeOnly(sendCrypto)).not.toMatch(/x-api-key/i);
    expect(codeOnly(edgeProxy)).not.toMatch(/x-api-key/i);
    expect(edgeProxy).toMatch(/'Authorization': `Bearer \$\{supabaseKey\}`/);
  });

  test('#2275 binds proxy request and response content types explicitly', async () => {
    expect(edgeProxy).toMatch(/'Content-Type': 'application\/json'/);
    expect(edgeProxy).toMatch(/res\.headers\.get\('Content-Type'\) \|\| 'application\/json'/);
  });

  test('#2275 validates send recipients and preserves CSP against HTML injection', async () => {
    expect(addressValidation).toMatch(/return isAddress\(address\)/);
    expect(codeOnly(sendCrypto)).not.toMatch(/dangerouslySetInnerHTML/);
    expect(headers).toMatch(/Content-Security-Policy:/);
    expect(headers).toMatch(/default-src 'self'/);
  });
});
