// Veyrnox validation sweep — WALLETCONNECT LIVE PAIRING (Playwright, browser + live relay).
//
// SUPERVISED — requires live relay.walletconnect.com; set RUN_SUPERVISED_E2E=1.
// Not run in CI. Does not involve an on-chain txid.
//
// WHY SUPERVISED / WHY NOT IN THE VERIFY GATE
// -------------------------------------------
// A real WalletConnect pairing needs an external dApp peer AND a live relay
// round-trip (relay.walletconnect.com). The CI `verify` gate (vitest, no browser,
// no network) cannot exercise that, and even the default Playwright suite must not
// depend on an external relay. So every test here is gated twice:
//   1. testIgnore in playwright.config.ts (this file is excluded unless RUN_SUPERVISED_E2E=1)
//   2. test.skip(!process.env.RUN_SUPERVISED_E2E, SKIP_REASON) at the top of the describe
// When the relay is unavailable we skip HONESTLY — never expect(true).toBe(true).
//
// WHAT THIS PROVES (and what it does NOT)
// ---------------------------------------
// It drives a scripted @walletconnect/sign-client dApp peer through a REAL pairing
// against the running web build, and exercises four security controls end-to-end at
// the WC request boundary:
//   * H8 — personal_sign address binding (happy path + mismatch reject)
//   * M11 — session-expiry / disconnected-session reject
//   * H7 — EIP-712 domain.chainId vs session CAIP-2 chain binding
// It does NOT broadcast any on-chain transaction (tests stay offline after pairing),
// does NOT assert gas-cap math (unit-tested), and does NOT drive the re-auth gate.
// The pure-function contracts for every control live in the vitest suite alongside
// src/lib/WalletConnectProvider.jsx — this file confirms the wired UI + live protocol
// path actually enforce them.
//
// SELECTOR PROVENANCE (DISCOVER, NEVER INVENT) — read from src/ on 2026-07-13:
//   * URI input placeholder "wc:..."          — src/pages/WalletConnect.jsx:221
//   * "Pair" button                           — src/pages/WalletConnect.jsx:232
//   * "Connect" (session approve, .approveBtn) — src/components/walletconnect/SessionProposalModal.jsx:169
//   * "Approve" (request approve, .approveBtn) — src/components/walletconnect/RequestApprovalModal.jsx (Signing/Approve)
//   * "Reject" (.rejectBtn)                    — both modals
//   * onboarding helpers mirror e2e/onboarding.spec.js (unified PIN cohort).

import { test, expect } from '@playwright/test';
import SignClient from '@walletconnect/sign-client';
import { ethers } from 'ethers';

const BASE = 'http://localhost:5173';
const PROJECT_ID = 'f9d8b6cc36e18684ac1d2a76cdf54bea'; // baked-in public id (projectId.js)
const CHAIN_ID = 'eip155:11155111'; // Sepolia
const VAULT_PIN = '48273951'; // 8-digit, non-sequential (matches onboarding.spec.js)
const SKIP_REASON = 'Live WC relay required — set RUN_SUPERVISED_E2E=1';

// A throwaway, well-formed, NON-wallet EVM address used for the H8 mismatch test.
// It is deliberately NOT the wallet's own address — the signer param must not match.
const FOREIGN_ADDRESS = '0x00000000000000000000000000000000deadbeef';

// ── dApp peer (scripted, @walletconnect/sign-client) ───────────────────────────

/**
 * Create a scripted dApp SignClient. Returns { client } or throws if the relay is
 * unreachable — the caller converts that into an honest test.skip, never a fake pass.
 */
async function createDApp() {
  const client = await SignClient.init({
    projectId: PROJECT_ID,
    relayUrl: 'wss://relay.walletconnect.com',
    metadata: {
      name: 'Veyrnox E2E dApp Peer',
      description: 'Scripted WalletConnect peer for supervised E2E',
      url: 'https://example.invalid',
      icons: [],
    },
  });
  return client;
}

/** Begin a connect proposal on Sepolia; returns { uri, approval }. */
async function proposeConnection(client) {
  const { uri, approval } = await client.connect({
    requiredNamespaces: {
      eip155: {
        methods: ['personal_sign', 'eth_signTypedData_v4', 'eth_sendTransaction'],
        chains: [CHAIN_ID],
        events: [],
      },
    },
  });
  if (!uri) throw new Error('dApp connect() returned no URI');
  return { uri, approval };
}

/** Extract the wallet's own EVM address from an approved session. */
function walletAddressFromSession(session) {
  const accounts = session?.namespaces?.eip155?.accounts ?? [];
  const first = accounts[0]; // "eip155:11155111:0xabc..."
  if (!first) throw new Error('approved session carried no eip155 account');
  return first.split(':')[2];
}

// ── wallet-side browser helpers (mirror onboarding.spec.js, PIN cohort) ─────────

async function freshLocalBuild(page) {
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(() => { try { localStorage.clear(); } catch {} });
  await page.evaluate(async () => {
    try { for (const db of (await indexedDB.databases?.()) || []) indexedDB.deleteDatabase(db.name); } catch {}
  });
  await page.goto(`${BASE}/?demo=0`);
}

async function enterPin(page, pin) {
  const pad = page.getByRole('group', { name: /PIN entry/i });
  for (const digit of pin) {
    await pad.getByRole('button', { name: digit, exact: true }).click();
  }
  await pad.getByRole('button', { name: 'Submit PIN' }).click();
}

/**
 * Full onboarding through to an authed shell with a real (non-demo) vault, so the
 * WC connector has a live EVM address to bind against. Mirrors onboarding.spec.js.
 */
async function unlockWallet(page) {
  await freshLocalBuild(page);
  await page.getByRole('button', { name: 'Get Started' }).click();
  await expect(page.getByText('Choose an 8-digit PIN')).toBeVisible();
  await enterPin(page, VAULT_PIN);
  await expect(page.getByText('Confirm your PIN')).toBeVisible();
  await enterPin(page, VAULT_PIN);
  await expect(page.getByText('Exploring — view only', { exact: true })).toBeVisible({ timeout: 15000 });
  await page.getByRole('button', { name: 'Create or import', exact: true }).click();
  await page.getByRole('button', { name: /Create Wallet/i }).click();
  await expect(page.getByRole('link', { name: 'Send', exact: true })).toBeVisible({ timeout: 30000 });
}

/** Navigate to the dApp Connector screen and paste + pair a URI. */
async function pairWallet(page, uri) {
  await page.goto(`${BASE}/walletconnect?demo=0`);
  const input = page.locator('input[placeholder="wc:..."]');
  await expect(input).toBeVisible({ timeout: 15000 });
  await input.fill(uri);
  await page.getByRole('button', { name: /^Pair(ing…)?$/ }).click();
}

/** Approve the incoming session proposal modal ("Connect" in .approveBtn). */
async function approveSession(page) {
  const connect = page.locator('button.approveBtn', { hasText: /Connect/ });
  await expect(connect).toBeVisible({ timeout: 20000 });
  await connect.click();
}

/** Assert NO request-approval modal ever appears within `ms` (fail-closed reject). */
async function expectNoApprovalModal(page, ms = 8000) {
  const approve = page.locator('button.approveBtn', { hasText: /Approve|Signing/ });
  await expect(approve).toHaveCount(0, { timeout: ms });
}

// ── suite ──────────────────────────────────────────────────────────────────────

test.describe('WalletConnect live pairing — security controls (SUPERVISED)', () => {
  test.skip(!process.env.RUN_SUPERVISED_E2E, SKIP_REASON);
  test.describe.configure({ mode: 'serial' });

  test('H8: personal_sign with the wallet\'s own address returns a valid recoverable signature', async ({ page }) => {
    let dapp;
    try {
      dapp = await createDApp();
    } catch (e) {
      test.skip(true, `Relay unreachable (${e.message}) — ${SKIP_REASON}`);
      return;
    }
    try {
      await unlockWallet(page);
      const { uri, approval } = await proposeConnection(dapp);
      await pairWallet(page, uri);
      await approveSession(page);

      const session = await approval();
      const walletAddress = walletAddressFromSession(session);

      // Fire personal_sign with the wallet's OWN address as the signer (H8 happy path).
      const message = 'Veyrnox WC E2E — H8 happy path';
      const hexMsg = ethers.hexlify(ethers.toUtf8Bytes(message));
      const requestP = dapp.request({
        topic: session.topic,
        chainId: CHAIN_ID,
        request: { method: 'personal_sign', params: [hexMsg, walletAddress] },
      });

      // Approve in the wallet UI.
      const approveBtn = page.locator('button.approveBtn', { hasText: /Approve|Signing/ });
      await expect(approveBtn).toBeVisible({ timeout: 20000 });
      await approveBtn.click();

      const signature = await requestP;
      expect(typeof signature).toBe('string');
      expect(signature.startsWith('0x')).toBe(true);
      // 65-byte sig = 132 hex chars incl. 0x.
      expect(signature.length).toBe(132);
      const recovered = ethers.verifyMessage(message, signature);
      expect(recovered.toLowerCase()).toBe(walletAddress.toLowerCase());
    } finally {
      await dapp?.core?.relayer?.transportClose?.().catch(() => {});
    }
  });

  test('H8: personal_sign with a mismatched signer address is rejected (no approval modal)', async ({ page }) => {
    let dapp;
    try {
      dapp = await createDApp();
    } catch (e) {
      test.skip(true, `Relay unreachable (${e.message}) — ${SKIP_REASON}`);
      return;
    }
    try {
      await unlockWallet(page);
      const { uri, approval } = await proposeConnection(dapp);
      await pairWallet(page, uri);
      await approveSession(page);
      const session = await approval();

      const message = 'Veyrnox WC E2E — H8 mismatch';
      const hexMsg = ethers.hexlify(ethers.toUtf8Bytes(message));
      const requestP = dapp.request({
        topic: session.topic,
        chainId: CHAIN_ID,
        request: { method: 'personal_sign', params: [hexMsg, FOREIGN_ADDRESS] },
      }).then(() => ({ resolved: true }), (err) => ({ resolved: false, err }));

      // Fail-closed: the wallet must NOT surface an approval modal for a foreign signer.
      await expectNoApprovalModal(page);
      const outcome = await requestP;
      expect(outcome.resolved).toBe(false);
      expect(String(outcome.err?.message || outcome.err)).toMatch(/PERSONAL_SIGN_ADDRESS_MISMATCH|reject|error/i);
    } finally {
      await dapp?.core?.relayer?.transportClose?.().catch(() => {});
    }
  });

  test('M11: a request on a disconnected/expired session is rejected (no approval modal)', async ({ page }) => {
    let dapp;
    try {
      dapp = await createDApp();
    } catch (e) {
      test.skip(true, `Relay unreachable (${e.message}) — ${SKIP_REASON}`);
      return;
    }
    try {
      await unlockWallet(page);
      const { uri, approval } = await proposeConnection(dapp);
      await pairWallet(page, uri);
      await approveSession(page);
      const session = await approval();

      // Tear the session down from the dApp side, then try to sign on it.
      await dapp.disconnect({
        topic: session.topic,
        reason: { code: 6000, message: 'E2E: forced disconnect to exercise M11' },
      });

      const message = 'Veyrnox WC E2E — M11 expired';
      const hexMsg = ethers.hexlify(ethers.toUtf8Bytes(message));
      const requestP = dapp.request({
        topic: session.topic,
        chainId: CHAIN_ID,
        request: { method: 'personal_sign', params: [hexMsg, FOREIGN_ADDRESS] },
      }).then(() => ({ resolved: true }), (err) => ({ resolved: false, err }));

      await expectNoApprovalModal(page);
      const outcome = await requestP;
      expect(outcome.resolved).toBe(false);
    } finally {
      await dapp?.core?.relayer?.transportClose?.().catch(() => {});
    }
  });

  test('H7: eth_signTypedData_v4 whose domain.chainId mismatches the session chain is rejected', async ({ page }) => {
    let dapp;
    try {
      dapp = await createDApp();
    } catch (e) {
      test.skip(true, `Relay unreachable (${e.message}) — ${SKIP_REASON}`);
      return;
    }
    try {
      await unlockWallet(page);
      const { uri, approval } = await proposeConnection(dapp);
      await pairWallet(page, uri);
      await approveSession(page);
      const session = await approval();
      const walletAddress = walletAddressFromSession(session);

      // Session is on Sepolia (11155111) but the typed-data domain claims mainnet (1).
      const typedData = {
        types: {
          EIP712Domain: [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
          ],
          Mail: [{ name: 'contents', type: 'string' }],
        },
        primaryType: 'Mail',
        domain: { name: 'Veyrnox E2E', version: '1', chainId: 1 }, // mismatch → H7
        message: { contents: 'chain-mismatch probe' },
      };
      const requestP = dapp.request({
        topic: session.topic,
        chainId: CHAIN_ID,
        request: { method: 'eth_signTypedData_v4', params: [walletAddress, JSON.stringify(typedData)] },
      }).then(() => ({ resolved: true }), (err) => ({ resolved: false, err }));

      await expectNoApprovalModal(page);
      const outcome = await requestP;
      expect(outcome.resolved).toBe(false);
      expect(String(outcome.err?.message || outcome.err)).toMatch(/CHAIN_ID_MISMATCH|reject|error/i);
    } finally {
      await dapp?.core?.relayer?.transportClose?.().catch(() => {});
    }
  });
});
