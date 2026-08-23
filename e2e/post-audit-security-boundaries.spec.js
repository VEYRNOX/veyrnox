/**
 * Post-audit security boundary regression guards.
 *
 * Issue #2021 tracked 13 stale `fixme` browser tests in this file. The app now
 * has source-level guards and focused unit coverage for these boundaries, so
 * this suite asserts against the shipped controls directly instead of carrying a
 * dead `fixme` wall in Playwright.
 */

import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();

const sendCryptoSrc = readFileSync(join(root, 'src', 'pages', 'SendCrypto.jsx'), 'utf8');
const sendAmountErrorSrc = readFileSync(join(root, 'src', 'lib', 'sendAmountError.js'), 'utf8');
const sendAddressErrorSrc = readFileSync(join(root, 'src', 'lib', 'sendAddressError.js'), 'utf8');
const addressValidationSrc = readFileSync(join(root, 'src', 'lib', 'addressValidation.js'), 'utf8');
const pinStrengthSrc = readFileSync(join(root, 'src', 'lib', 'pinStrength.js'), 'utf8');
const walletProviderSrc = readFileSync(join(root, 'src', 'lib', 'WalletProvider.jsx'), 'utf8');
const evmSendSrc = readFileSync(join(root, 'src', 'wallet-core', 'evm', 'send.js'), 'utf8');
const evmTokenSendSrc = readFileSync(join(root, 'src', 'wallet-core', 'evm', 'token-send.js'), 'utf8');
const edgeProxySrc = readFileSync(join(root, 'functions', 'api', 'edge', '[fn].js'), 'utf8');
const headersSrc = readFileSync(join(root, 'public', '_headers'), 'utf8');

const codeOnly = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((line) => !line.trim().startsWith('//'))
  .join('\n');

const sendCryptoCode = codeOnly(sendCryptoSrc);
const edgeProxyCode = codeOnly(edgeProxySrc);
const txCreateBlock = sendCryptoSrc.match(/Transaction\.create\(\{[\s\S]*?\n\s*\}\);/)?.[0] ?? '';

test.describe('Security Boundary: Input Validation & Sanitization', () => {
  test('#2021 rejects oversized transaction amounts', async () => {
    expect(sendAmountErrorSrc).toMatch(/return 'over-balance'/);
    expect(sendCryptoSrc).toMatch(/send-amount-error/);
    expect(sendCryptoSrc).toMatch(/usableAmountNum > effectiveBalance/);
    expect(sendCryptoSrc).toMatch(/setShowErrors\(true\)/);
  });

  test('#2021 rejects dangerous recipient payloads through validation, not HTML rendering', async () => {
    expect(addressValidationSrc).toMatch(/isAddress\(address\)/);
    expect(sendAddressErrorSrc).toMatch(/return 'malformed'/);
    expect(sendCryptoCode).not.toMatch(/dangerouslySetInnerHTML/);
    expect(sendCryptoCode).not.toMatch(/innerHTML\s*=/);
  });

  test('#2021 rejects invalid ethereum addresses', async () => {
    expect(addressValidationSrc).toMatch(/import \{ isAddress \} from "ethers"/);
    expect(addressValidationSrc).toMatch(/case "evm":\s+return isAddress\(address\)/);
  });

  test('#2021 memo field rejects plaintext leakage & HTML persistence', async () => {
    expect(sendCryptoSrc).toMatch(/DO NOT persist `note` plaintext/);
    expect(sendCryptoSrc).toMatch(/has_note:/);
    expect(sendCryptoCode).not.toMatch(/\bnote:/);
    expect(sendCryptoCode).not.toMatch(/pending_tx/);
  });
});

test.describe('Security Boundary: Nonce & Double-Spend Prevention', () => {
  test('#2021 prevents double-broadcast via latch mechanism', async () => {
    expect(sendCryptoSrc).toMatch(/broadcastInFlightRef = useRef\(false\)/);
    expect(sendCryptoSrc).toMatch(/BROADCAST_IN_FLIGHT/);
    expect(sendCryptoSrc).toMatch(/broadcastInFlightRef\.current = true/);
    expect(sendCryptoSrc).toMatch(/broadcastInFlightRef\.current = false/);
  });

  test('#2021 nonce shape assertion rejects malformed nonces', async () => {
    for (const src of [evmSendSrc, evmTokenSendSrc]) {
      expect(src).toMatch(/provider\.getTransactionCount\([^,]+,\s*'pending'\)/);
      expect(src).toMatch(/!Number\.isInteger\(pendingNonce\) \|\| pendingNonce < 0 \|\| pendingNonce > 1_000_000/);
      expect(src).toMatch(/refusing to sign/);
      expect(src).toMatch(/nonce:\s*pendingNonce/);
    }
  });
});

test.describe('Security Boundary: Session & Authentication', () => {
  test('#2021 session expires after inactivity timeout', async () => {
    expect(walletProviderSrc).toMatch(/lockTimer\.current = setTimeout\(lock, ms\)/);
    expect(walletProviderSrc).toMatch(/absoluteLockTimer\.current = setTimeout\(lock, MAX_SESSION_MS\)/);
    expect(walletProviderSrc).toMatch(/clearTimeout\(lockTimer\.current\)/);
  });

  test('#2021 PIN validation rejects weak PINs', async () => {
    expect(pinStrengthSrc).toMatch(/MIN_PIN_LENGTH = 8/);
    expect(pinStrengthSrc).toMatch(/isAllSameDigit/);
    expect(pinStrengthSrc).toMatch(/isSequential/);
    expect(pinStrengthSrc).toMatch(/COMMON_PINS/);
    expect(pinStrengthSrc).toMatch(/Avoid a sequential PIN/);
  });

  test('#2021 concurrent unlock attempts fail gracefully', async () => {
    expect(walletProviderSrc).toMatch(/unlockGenRef/);
    expect(walletProviderSrc).toMatch(/UNLOCK_SUPERSEDED/);
    expect(walletProviderSrc).toMatch(/including a second concurrent unlock/);
    expect(walletProviderSrc).toMatch(/never re-mount containerRef/);
  });
});

test.describe('Security Boundary: Key & Secret Exposure', () => {
  test('#2021 private keys never appear in send-side storage records', async () => {
    expect(sendCryptoSrc).toMatch(/Transaction\.create\(\{/);
    expect(txCreateBlock).toBeTruthy();
    expect(txCreateBlock).not.toMatch(/privateKey/);
    expect(txCreateBlock).not.toMatch(/mnemonic/);
    expect(txCreateBlock).not.toMatch(/\bnote:/);
  });

  test('#2021 API keys not sent to upstream services from the browser path', async () => {
    expect(sendCryptoCode).not.toMatch(/x-api-key/);
    expect(edgeProxySrc).toContain("'Authorization': `Bearer ${supabaseKey}`");
    expect(edgeProxyCode).not.toMatch(/x-api-key/);
  });
});

test.describe('Security Boundary: CSP & XSS Prevention', () => {
  test('#2021 content security policy headers present and enforced', async () => {
    expect(headersSrc).toMatch(/Content-Security-Policy:/);
    expect(headersSrc).toMatch(/default-src 'self'/);
    expect(headersSrc).toMatch(/object-src 'none'/);
    expect(headersSrc).toMatch(/frame-ancestors 'none'/);
    expect(headersSrc).toMatch(/form-action 'self'/);
  });

  test('#2021 rejects XSS payloads in input fields', async () => {
    expect(sendCryptoCode).not.toMatch(/dangerouslySetInnerHTML/);
    expect(sendCryptoCode).not.toMatch(/innerHTML\s*=/);
    expect(sendCryptoCode).toMatch(/<Input id="send-note"/);
    expect(sendCryptoCode).toMatch(/<Input[\s\S]*id="send-amount"/);
  });
});
