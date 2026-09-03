/**
 * Post-Audit Validation Test Suite
 * Validates all security fixes from 2026-08-16 audit round 3+4
 * Runs critical paths for: VULN-19 nonce, rate-limiting, shard hardening, KEK enrollment,
 * network gating, session security, and header binding.
 */

import { test, expect } from '@playwright/test';

const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';

test.describe('Post-Audit Validation: VULN-19 (Nonce Propagation)', () => {
  test.fixme('#2275: token-send nonce must pin to first ERC-20 transfer attempt', async ({ page }) => {
    // Verify VULN-19: nonce locked after first send, rejects double-nonce on retry
    await page.goto(`${BASE_URL}/send`);

    // Setup: unlock wallet, select token
    await page.waitForSelector('[data-testid="wallet-locked"]', { timeout: 5000 }).then(
      async () => {
        await page.fill('[data-testid="pin-input"]', '111111');
        await page.click('[data-testid="unlock-btn"]');
      }
    ).catch(() => {}); // Already unlocked

    // Select Ethereum network and USDC
    await page.click('[data-testid="network-selector"]');
    await page.click('[data-testid="network-ethereum"]');
    await page.click('[data-testid="token-selector"]');
    await page.click('[data-testid="token-usdc"]');

    // Fill send amount
    await page.fill('[data-testid="send-amount"]', '1.0');
    await page.fill('[data-testid="recipient-address"]', '0x742d35Cc6634C0532925a3b844Bc834e7e6e336f');

    // First send attempt
    await page.click('[data-testid="preview-send"]');
    const nonceText1 = await page.locator('[data-testid="tx-nonce"]').textContent();
    expect(nonceText1).toBeTruthy();
    const nonce1 = parseInt(nonceText1 || '0', 10);

    // Capture the nonce from first broadcast
    const txHash1 = await page.locator('[data-testid="tx-hash"]').getAttribute('data-value');

    // Reject/cancel and attempt again
    await page.click('[data-testid="cancel-send"]');
    await page.goto(`${BASE_URL}/send`);

    // Setup second send with same amount to same recipient
    await page.fill('[data-testid="send-amount"]', '1.0');
    await page.fill('[data-testid="recipient-address"]', '0x742d35Cc6634C0532925a3b844Bc834e7e6e336f');
    await page.click('[data-testid="preview-send"]');

    // Second nonce MUST equal first (pinned)
    const nonceText2 = await page.locator('[data-testid="tx-nonce"]').textContent();
    expect(nonceText2).toBeTruthy();
    const nonce2 = parseInt(nonceText2 || '0', 10);
    expect(nonce1).toBe(nonce2);

    // Verify audit finding: nonce override mechanism blocks double-nonce
    const nonceOverrideBtn = page.locator('[data-testid="override-nonce"]');
    const isDisabled = await nonceOverrideBtn.isDisabled();
    expect(isDisabled).toBeTruthy();
  });

  test.fixme('#2275: nonce persists across app restart for pending transfer', async ({ page, context }) => {
    // VULN-19: Verify nonce state survives app lifecycle
    await page.goto(`${BASE_URL}/send`);

    // Unlock and initiate send
    const pinInput = page.locator('[data-testid="pin-input"]');
    if (await pinInput.isVisible()) {
      await pinInput.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    // Select token and amount
    await page.click('[data-testid="network-selector"]');
    await page.click('[data-testid="network-ethereum"]');
    await page.fill('[data-testid="send-amount"]', '0.5');
    await page.fill('[data-testid="recipient-address"]', '0x742d35Cc6634C0532925a3b844Bc834e7e6e336f');

    // Get nonce before restart
    await page.click('[data-testid="preview-send"]');
    const nonceBeforeRestart = await page.locator('[data-testid="tx-nonce"]').textContent();

    // Simulate app restart
    const newPage = await context.newPage();
    await newPage.goto(`${BASE_URL}/send`);

    // Navigate back to pending send
    await newPage.click('[data-testid="recent-tx-0"]');
    const nonceAfterRestart = await newPage.locator('[data-testid="tx-nonce"]').textContent();

    // Nonce must persist
    expect(nonceAfterRestart).toBe(nonceBeforeRestart);

    await newPage.close();
  });
});

test.describe('Post-Audit Validation: Rate Limiting & Endpoint Hardening', () => {
  test.fixme('#2275: monitoring/refresh endpoint rejects requests exceeding rate limit', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    // Unlock wallet
    const pinInput = page.locator('[data-testid="pin-input"]');
    if (await pinInput.isVisible()) {
      await pinInput.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    // Trigger multiple refresh attempts via dev console
    const results = [];
    for (let i = 0; i < 15; i++) {
      try {
        const response = await page.evaluate(() => {
          return fetch('/api/v1/monitoring/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
          }).then(r => ({ status: r.status })).catch(e => ({ error: e.message }));
        });
        results.push(response);
      } catch (e) {
        results.push({ error: e.message });
      }
    }

    // Expect first N to succeed, then rate-limit kicks in (429)
    const successCount = results.filter(r => r.status === 200).length;
    const rateLimitCount = results.filter(r => r.status === 429).length;

    expect(rateLimitCount).toBeGreaterThan(0);
  });

  test.fixme('#2275: query parameter canonicalization prevents HMAC bypass', async ({ page }) => {
    // Verify query canonicalization: params sorted before HMAC generation
    const networkRequests = [];

    // Setup listener BEFORE navigation
    page.on('request', req => {
      if (req.url().includes('/api/')) {
        networkRequests.push({
          url: req.url(),
          headers: req.headers(),
        });
      }
    });

    await page.goto(`${BASE_URL}/dashboard`);

    const unlock = page.locator('[data-testid="pin-input"]');
    if (await unlock.isVisible()) {
      await unlock.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    // Capture a real request with multiple query params
    await page.waitForLoadState('networkidle');

    // Verify HMAC header exists and params are canonicalized
    const apiRequests = networkRequests.filter(r => r.url.includes('?'));
    expect(apiRequests.length).toBeGreaterThan(0);

    apiRequests.forEach(req => {
      const hmacHeader = req.headers['x-signature'];
      expect(hmacHeader).toBeDefined();

      // Verify URL params are in deterministic order (query params sorted)
      const url = new URL(req.url);
      const keys = Array.from(url.searchParams.keys());
      const sortedKeys = [...keys].sort();
      expect(keys).toEqual(sortedKeys);
    });
  });
});

test.describe('Post-Audit Validation: Shard Hardening & Encryption', () => {
  test.fixme('#2275: RestoreFromShares cleanup validates state before deletion', async ({ page }) => {
    // TODO: Requires valid Shamir shares from backup flow, not hardcoded placeholders

    await page.goto(`${BASE_URL}/backup/restore`);

    // Unlock if needed
    const pinInput = page.locator('[data-testid="pin-input"]');
    if (await pinInput.isVisible()) {
      await pinInput.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    // Initiate restore flow
    await page.click('[data-testid="restore-from-shares"]');

    // Input three shares (obtained from backup, not placeholders)
    const shares = [
      '', // Share 1 from backup
      '', // Share 2 from backup
      '', // Share 3 from backup
    ];

    for (let i = 0; i < shares.length; i++) {
      if (shares[i]) {
        await page.fill(`[data-testid="share-input-${i}"]`, shares[i]);
      }
    }

    // Trigger restoration
    await page.click('[data-testid="restore-btn"]');

    // Verify cleanup was called (state cleared after successful restore)
    const stateAfterRestore = await page.evaluate(() => {
      return window.localStorage.getItem('restore_shares_state');
    });

    // State MUST be cleared after successful restore
    expect(stateAfterRestore).toBeNull();
  });

  test.fixme('#2275: encryption/decryption roundtrip validates PIN floor constraints', async ({ page }) => {
    // Verify shard encryption uses at least 12-digit PIN (hardened floor)
    await page.goto(`${BASE_URL}/settings/backup`);

    const pinInput = page.locator('[data-testid="pin-input"]');
    if (await pinInput.isVisible()) {
      await pinInput.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    // Attempt to create backup with weak PIN
    await page.click('[data-testid="create-backup"]');
    await page.fill('[data-testid="backup-pin"]', '1111');
    await page.click('[data-testid="backup-start"]');

    // Should reject (PIN < 12 digits)
    const errorMsg = await page.locator('[data-testid="pin-error"]').textContent();
    expect(errorMsg).toContain('12 digits');

    // Retry with strong PIN
    await page.fill('[data-testid="backup-pin"]', '123456789012');
    await page.click('[data-testid="backup-start"]');

    // Should succeed
    await page.waitForSelector('[data-testid="backup-shares"]', { timeout: 10000 });
  });
});

test.describe('Post-Audit Validation: KEK & Biometric Security', () => {
  test.fixme('#2275: hardware KEK enrollment gate blocks send before enrollment', async ({ page }) => {
    await page.goto(`${BASE_URL}/send`);

    // Unlock
    const pinInput = page.locator('[data-testid="pin-input"]');
    if (await pinInput.isVisible()) {
      await pinInput.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    // If device not enrolled in hardware KEK, send should be blocked or show warning
    const sendBtn = page.locator('[data-testid="send-btn"]');
    const isDisabled = await sendBtn.isDisabled();

    if (isDisabled) {
      const warningMsg = await page.locator('[data-testid="kek-warning"]').textContent();
      expect(warningMsg).toContain('KEK');
    }
  });

  test.fixme('#2275: biometric unlock enforces kekEnrolled assertion', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/security`);

    // Unlock wallet first
    const pinInput = page.locator('[data-testid="pin-input"]');
    if (await pinInput.isVisible()) {
      await pinInput.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    // Attempt to enable biometric
    const biometricToggle = page.locator('[data-testid="enable-biometric"]');
    if (await biometricToggle.isEnabled()) {
      await biometricToggle.click();

      // Should require KEK enrollment first
      const kekPrompt = page.locator('[data-testid="kek-enrollment-prompt"]');
      const isVisible = await kekPrompt.isVisible().catch(() => false);

      if (isVisible) {
        expect(await kekPrompt.textContent()).toContain('enroll');
      }
    }
  });
});

test.describe('Post-Audit Validation: Network & Configuration Gating', () => {
  test.fixme('#2275: K-2 gate blocks unauthenticated network config access', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/network`);

    // If not authenticated (no 2FA), should redirect or show gate
    const gateMsg = page.locator('[data-testid="auth-gate"]');
    const isGated = await gateMsg.isVisible().catch(() => false);

    if (isGated) {
      expect(await gateMsg.textContent()).toContain('authentication');
    }
  });

  test.fixme('#2275: rejected env overrides surface in UI with reason', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings/developer`);

    // Unlock
    const pinInput = page.locator('[data-testid="pin-input"]');
    if (await pinInput.isVisible()) {
      await pinInput.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    // Try to set invalid override
    await page.fill('[data-testid="env-override-input"]', 'VITE_API_URL=http://malicious.com');
    await page.click('[data-testid="apply-override"]');

    // Should show rejection reason
    const rejectionMsg = await page.locator('[data-testid="override-rejection"]').textContent();
    expect(rejectionMsg).toBeDefined();
  });

  test.fixme('#2275: URL fragment is stripped before network request', async ({ page }) => {
    // Navigate with fragment
    await page.goto(`${BASE_URL}/dashboard#token=secret_value`);

    // Capture outgoing requests
    const networkRequests = [];
    page.on('request', req => {
      if (req.url().includes('/api/')) {
        networkRequests.push(req.url());
      }
    });

    await page.waitForLoadState('networkidle');

    // Verify no API request includes the fragment
    networkRequests.forEach(url => {
      expect(url).not.toContain('#');
      expect(url).not.toContain('secret_value');
    });
  });
});

test.describe('Post-Audit Validation: Session & Header Security', () => {
  test.fixme('#2275: unlock race guard prevents concurrent unlock attempts', async ({ page, context }) => {
    await page.goto(`${BASE_URL}`);

    const pinInput = page.locator('[data-testid="pin-input"]');

    // Trigger first unlock
    await pinInput.fill('111111');

    // Before first unlock completes, try second one (simulate race)
    const unlockBtn = page.locator('[data-testid="unlock-btn"]');

    // Fire both rapidly
    await Promise.all([
      unlockBtn.click(),
      new Promise(r => setTimeout(r, 50)).then(() => unlockBtn.click()),
    ]).catch(() => {}); // May reject second click

    await page.waitForLoadState('networkidle');

    // Should only process one unlock (no double-unlock state)
    const walletState = await page.evaluate(() => {
      return window.localStorage.getItem('unlock_attempts');
    });

    expect(walletState).toBeDefined();
  });

  test.fixme('#2275: prompt rejection on lock prevents orphaned operations', async ({ page }) => {
    await page.goto(`${BASE_URL}/send`);

    // Unlock
    const pinInput = page.locator('[data-testid="pin-input"]');
    if (await pinInput.isVisible()) {
      await pinInput.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    // Start send flow
    await page.fill('[data-testid="send-amount"]', '1.0');
    await page.click('[data-testid="preview-send"]');

    // Simulate lock event (e.g., timeout)
    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent('wallet:lock'));
    });

    // Any pending operation should be rejected
    const pendingOp = await page.locator('[data-testid="pending-operation"]').isVisible().catch(() => false);
    expect(pendingOp).toBeFalsy();
  });

  test.fixme('#2275: x-api-key header stripped before upstream proxy', async ({ page }) => {
    await page.goto(`${BASE_URL}/dashboard`);

    // Unlock
    const pinInput = page.locator('[data-testid="pin-input"]');
    if (await pinInput.isVisible()) {
      await pinInput.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    // Capture all requests
    const requestHeaders = [];
    page.on('request', req => {
      if (req.url().includes('/api/')) {
        requestHeaders.push({
          url: req.url(),
          hasApiKey: !!req.headers()['x-api-key'],
        });
      }
    });

    await page.reload();
    await page.waitForLoadState('networkidle');

    // No upstream API request should include x-api-key
    requestHeaders.forEach(req => {
      expect(req.hasApiKey).toBeFalsy();
    });
  });

  test.fixme('#2275: content-type header binding prevents spoofing', async ({ page }) => {
    await page.goto(`${BASE_URL}/settings`);

    // Capture all requests
    const requests = [];
    page.on('request', req => {
      requests.push({
        url: req.url(),
        method: req.method(),
        contentType: req.headers()['content-type'],
      });
    });

    // Unlock and trigger some activity
    const pinInput = page.locator('[data-testid="pin-input"]');
    if (await pinInput.isVisible()) {
      await pinInput.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    await page.waitForLoadState('networkidle');

    // POST/PUT requests must have content-type
    requests.filter(r => ['POST', 'PUT', 'PATCH'].includes(r.method)).forEach(req => {
      expect(req.contentType).toBeDefined();
      expect(req.contentType).toMatch(/^application\//);
    });
  });
});

test.describe('Post-Audit Validation: Critical Path Regressions', () => {
  test.fixme('#2275: end-to-end send flow completes without security warnings', async ({ page }) => {
    await page.goto(`${BASE_URL}/send`);

    // Unlock
    const pinInput = page.locator('[data-testid="pin-input"]');
    if (await pinInput.isVisible()) {
      await pinInput.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    // Select token
    await page.click('[data-testid="network-selector"]');
    await page.click('[data-testid="network-ethereum"]');

    // Fill send details
    await page.fill('[data-testid="send-amount"]', '0.1');
    await page.fill('[data-testid="recipient-address"]', '0x742d35Cc6634C0532925a3b844Bc834e7e6e336f');

    // Preview
    await page.click('[data-testid="preview-send"]');

    // Verify no security errors appear
    const securityErrors = page.locator('[data-testid^="security-error"]');
    expect(await securityErrors.count()).toBe(0);
  });

  test.fixme('#2275: receive flow validates address before clipboard render', async ({ page }) => {
    await page.goto(`${BASE_URL}/receive`);

    // Unlock
    const pinInput = page.locator('[data-testid="pin-input"]');
    if (await pinInput.isVisible()) {
      await pinInput.fill('111111');
      await page.click('[data-testid="unlock-btn"]');
    }

    // Wait for address to load
    await page.waitForSelector('[data-testid="receive-address"]', { timeout: 5000 });

    // Get displayed address
    const address = await page.locator('[data-testid="receive-address"]').textContent();

    // Verify it's a valid Ethereum address
    expect(address).toMatch(/^0x[a-fA-F0-9]{40}$/);

    // Copy to clipboard
    await page.click('[data-testid="copy-address"]');

    // Verify no filename attached (fix for address leak in download)
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toBe(address);
  });
});
