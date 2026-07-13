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
import { SignClient } from '@walletconnect/sign-client';
import { ethers } from 'ethers';

// The dApp Connector relies on relay.walletconnect.com (WebSocket) and
// pulse.walletconnect.org (telemetry), which are not in the meta CSP — the CSP
// is defence-in-depth for the web build; WC lives on native (Capacitor).  For
// this supervised E2E test we bypass the meta CSP so the SignClient can connect
// to the real relay.  This does NOT change the app's security posture: the
// invariants (I1-I6, RASP) are enforced by code, not by the meta CSP tag.
test.use({ bypassCSP: true });

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
  // Use client-side history push to avoid a full page reload (which would lose the
  // in-memory WalletProvider unlock state). The /walletconnect nav link is gated
  // behind a feature flag and may not appear in the DOM for a fresh wallet.
  await page.evaluate(() => {
    window.history.pushState({}, '', '/walletconnect');
    window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
  });
  const input = page.locator('input[placeholder="wc:..."]');
  await expect(input).toBeVisible({ timeout: 15000 });
  // Wait for WalletKit to finish initialising before entering the URI.
  // Without this, the component's Suspense-resolution remount resets the `uri`
  // React state to '' even after the DOM input is filled via the native setter.
  // The page shows role="status" "Initialising dApp Connector…" while !initialized.
  await expect(page.locator('[role="status"]', { hasText: /Initialising/i })).toHaveCount(0, { timeout: 30000 });
  // React controlled input: use Playwright's fill() to focus + type, which triggers
  // React's synthetic onChange reliably.
  await input.fill(uri);
  // Wait for React to commit the update (setUri -> re-render -> button enabled).
  const pairBtn = page.getByRole('button', { name: /^Pair(ing…)?$/ });
  await expect(pairBtn).toBeEnabled({ timeout: 5000 });
  // The button cycles enabled/disabled during React's init effect cycle. Use the input's
  // onKeyDown Enter handler (fires handlePair() when the input is focused + uri set)
  // as a more reliable trigger than clicking the cycling button. The input has:
  //   onKeyDown={(e) => e.key === 'Enter' && handlePair()}
  // and is enabled when initialized=true (same condition as button, minus uri check).
  await input.press('Enter');
}

/** Approve the incoming session proposal modal ("Connect" button). */
async function approveSession(page) {
  // CSS module class names are mangled by Vite — use role + text instead.
  // The sidebar nav has a "Connect" section-header button (group label), so we scope
  // to the session proposal modal via its unique heading "Connect to dApp?", then
  // click the "Connect" button within that heading's container. Using .last() as a
  // fallback: the modal renders inside the page content area which comes after the
  // sidebar in the DOM, so the modal's "Connect" is always the last match.
  await expect(page.getByRole('heading', { name: 'Connect to dApp?' })).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Connect', exact: true }).last().click();
}

/** Assert NO request-approval modal ever appears within `ms` (fail-closed reject). */
async function expectNoApprovalModal(page, ms = 8000) {
  // "Approve" is the normal RequestApprovalModal label. "Signing…" / "Sending…" are
  // the busy-state labels. We check that NONE of these are ever visible — the wallet
  // must fail-closed without surfacing the UI (H8 mismatch, M11 expired session, H7).
  const approve = page.getByRole('button', { name: /^(Approve|Signing…|Sending…|Re-authenticate)$/ });
  await expect(approve).toHaveCount(0, { timeout: ms });
}

// ── suite ──────────────────────────────────────────────────────────────────────

test.describe('WalletConnect live pairing — security controls (SUPERVISED)', () => {
  test.skip(!process.env.RUN_SUPERVISED_E2E, SKIP_REASON);
  test.describe.configure({ mode: 'serial' });

  // ONE SignClient for all four tests.  SignClient uses a global Core singleton keyed
  // on projectId — calling init() twice in the same Node.js process reuses the Core and
  // can corrupt crypto state (seen as "No matching key" / "Pending session not found").
  // Keeping a single client avoids the singleton collision: each test just calls
  // dapp.connect() which creates a fresh pairing topic + symmetric key on the live Core.
  let dapp = null;

  test.beforeAll(async () => {
    try {
      dapp = await createDApp();
    } catch {
      dapp = null; // tests will skip() on null dapp
    }
  });

  test.afterAll(async () => {
    await dapp?.core?.relayer?.transportClose?.().catch(() => {});
    dapp = null;
  });

  // Spoof navigator.webdriver=false so RASP's browser probe doesn't detect Playwright.
  // Without this, navigator.webdriver=true → HOOKED → BLOCK → presignGate auto-rejects
  // every WC signing request before the wallet shows the approval modal (I4 fail-closed).
  // RASP detection is separately tested in e2e/rasp-automation-detection.spec.js.
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false, configurable: true });
    });
  });

  test('H8: personal_sign with the wallet\'s own address returns a valid recoverable signature', async ({ page }) => {
    if (!dapp) { test.skip(true, `Relay unreachable — ${SKIP_REASON}`); return; }

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

    // Approve in the wallet UI (RequestApprovalModal — "Approve" button).
    const approveBtn = page.getByRole('button', { name: 'Approve' });
    await expect(approveBtn).toBeVisible({ timeout: 20000 });
    await approveBtn.click();

    const signature = await requestP;
    expect(typeof signature).toBe('string');
    expect(signature.startsWith('0x')).toBe(true);
    // 65-byte sig = 132 hex chars incl. 0x.
    expect(signature.length).toBe(132);
    const recovered = ethers.verifyMessage(message, signature);
    expect(recovered.toLowerCase()).toBe(walletAddress.toLowerCase());
  });

  test('H8: personal_sign with a mismatched signer address is rejected (no approval modal)', async ({ page }) => {
    if (!dapp) { test.skip(true, `Relay unreachable — ${SKIP_REASON}`); return; }

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
  });

  test('M11: a request on a disconnected/expired session is rejected (no approval modal)', async ({ page }) => {
    if (!dapp) { test.skip(true, `Relay unreachable — ${SKIP_REASON}`); return; }

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
  });

  test('H7: eth_signTypedData_v4 whose domain.chainId mismatches the session chain is rejected', async ({ page }) => {
    if (!dapp) { test.skip(true, `Relay unreachable — ${SKIP_REASON}`); return; }

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
  });
});
