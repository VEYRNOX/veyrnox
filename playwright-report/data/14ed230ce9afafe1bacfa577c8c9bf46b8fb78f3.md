# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: webauthn-prf-tier2-send.spec.js >> WebAuthn PRF Tier 2 — CDP Virtual Authenticator + Sepolia Send >> enroll PRF, unlock with platform auth, send 0.001 ETH Sepolia + capture txid
- Location: webauthn-prf-tier2-send.spec.js:75:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByText('Choose a 6-digit PIN')
Expected: visible
Timeout: 10000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 10000ms
  - waiting for getByText('Choose a 6-digit PIN')

```

```yaml
- img "Veyrnox"
- text: VEYRNOX
- paragraph: Your seed phrase is your account. We never hold your keys.
- button "Back":
  - img
  - text: Back
- paragraph: Set a vault password
- img
- text: "Web vault: your password is the only protection for your seed. Use a strong passphrase of at least 12 characters. The native app adds a hardware layer. Vault Password"
- textbox "At least 12 characters"
- paragraph: At least 12 characters · any characters allowed.
- button "Continue" [disabled]
- region "Notifications alt+T"
```

# Test source

```ts
  1   | // ─────────────────────────────────────────────────────────────────────────────
  2   | // WebAuthn PRF Tier 2 — Fully Automated CDP Virtual Authenticator Test
  3   | //
  4   | // Scope: Web wallet WebAuthn PRF unlock + Sepolia ETH send, fully automated
  5   | // without human interaction. Uses Chrome DevTools Protocol (CDP) virtual
  6   | // authenticator to simulate platform biometric + PRF evaluation.
  7   | //
  8   | // Test Sequence:
  9   | //   1. Import throwaway seed (h1_test from test-fixtures.json)
  10  | //   2. Set PIN (6-digit)
  11  | //   3. Enroll WebAuthn PRF hardware factor
  12  | //   4. Lock + unlock to validate persistence across session
  13  | //   5. Send 0.001 Sepolia ETH to a test recipient
  14  | //   6. Capture on-chain txid from success screen
  15  | //   7. Print txid for verification on Sepolia Explorer
  16  | //
  17  | // Status: BUILT (code-complete) — NOT DEVICE-VERIFIED (no real platform auth)
  18  | // Environment: Requires dev server + .env.local with VITE_DEV_UNGATE_SEND=1
  19  | //
  20  | // Run:
  21  | //   npm i -D @playwright/test && npx playwright install chromium
  22  | //   npx playwright test e2e/webauthn-prf-tier2-send.spec.js --headed --workers=1
  23  | // ─────────────────────────────────────────────────────────────────────────────
  24  | 
  25  | import { test, expect } from '@playwright/test';
  26  | 
  27  | const BASE = process.env.BASE_URL || 'http://localhost:5173';
  28  | const TEST_SEED = 'legal winner thank year wave sausage worth useful legal winner thank yellow'; // h1_test from test-fixtures.json
  29  | const TEST_PIN = '123456';
  30  | const SEPOLIA_RECIPIENT = '0x82D0Fa1ec7a5c1B0B3B8B2B5B2B5B2B5B82D0Fa'; // test fixture
  31  | const SEND_AMOUNT = '0.001';
  32  | 
  33  | // Add CDP virtual authenticator to the page (one-time setup per browser context)
  34  | async function setupVirtualAuthenticator(page) {
  35  |   const client = await page.context().newCDPSession(page);
  36  |   await client.send('WebAuthn.enable');
  37  |   await client.send('WebAuthn.addVirtualAuthenticator', {
  38  |     options: {
  39  |       protocol: 'ctap2',
  40  |       transport: 'internal',
  41  |       hasUserVerification: true,
  42  |       hasResidentKey: true,
  43  |       hasLargeBlob: false,
  44  |     },
  45  |   });
  46  |   return client;
  47  | }
  48  | 
  49  | // Helper: clear demo flag + localStorage for fresh state (exact copy from onboarding.spec.js)
  50  | async function freshLocalBuild(page) {
  51  |   await page.goto(`${BASE}/?demo=0`);
  52  |   await page.evaluate(() => { try { localStorage.removeItem('veyrnox-demo'); } catch {} });
  53  |   // Best-effort: clear any existing vault so we land on first-run welcome.
  54  |   await page.evaluate(async () => {
  55  |     try { for (const db of await indexedDB.databases?.() || []) indexedDB.deleteDatabase(db.name); } catch {}
  56  |   });
  57  |   await page.goto(`${BASE}/?demo=0`);
  58  | }
  59  | 
  60  | // Helper: enter PIN by clicking digit buttons
  61  | async function enterPin(page, digits) {
  62  |   for (const d of digits) {
  63  |     await page.getByRole('button', { name: d, exact: true }).click();
  64  |   }
  65  | }
  66  | 
  67  | // Helper: click a button by exact text
  68  | async function clickButton(page, text) {
  69  |   await page.getByRole('button', { name: new RegExp(`^${text}$`, 'i') }).click();
  70  | }
  71  | 
  72  | test.describe('WebAuthn PRF Tier 2 — CDP Virtual Authenticator + Sepolia Send', () => {
  73  |   test.setTimeout(120 * 1000); // 2 min timeout for network + UI interactions
  74  | 
  75  |   test('enroll PRF, unlock with platform auth, send 0.001 ETH Sepolia + capture txid', async ({
  76  |     page,
  77  |   }) => {
  78  |     // ── Setup: fresh state + CDP virtual authenticator ────────────────────────
  79  |     await freshLocalBuild(page);
  80  |     const cdpClient = await setupVirtualAuthenticator(page);
  81  |     console.log('✓ CDP virtual authenticator configured');
  82  | 
  83  |     // ── STEP 1: Start onboarding ───────────────────────────────────────────
  84  |     await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible({
  85  |       timeout: 10000,
  86  |     });
  87  |     await page.getByRole('button', { name: 'Get Started' }).click();
  88  |     console.log('✓ Started onboarding');
  89  |     await page.waitForTimeout(500); // wait for transition
  90  | 
  91  |     // ── STEP 2: Set PIN (6-digit) ───────────────────────────────────────────
> 92  |     await expect(page.getByText('Choose a 6-digit PIN')).toBeVisible({ timeout: 10000 });
      |                                                          ^ Error: expect(locator).toBeVisible() failed
  93  |     await enterPin(page, TEST_PIN);
  94  |     console.log('✓ PIN created');
  95  | 
  96  |     // ── STEP 3: Confirm PIN ────────────────────────────────────────────────
  97  |     await expect(page.getByText('Confirm your PIN')).toBeVisible();
  98  |     await enterPin(page, TEST_PIN);
  99  |     console.log('✓ PIN confirmed');
  100 | 
  101 |     // ── STEP 4: Create Wallet (after PIN, choice screen appears) ──────────────
  102 |     // After PIN confirmation, the UI shows "Create Wallet" and "Import an existing seed"
  103 |     // For simplicity, create a new wallet (throwaway seed will be generated)
  104 |     await expect(page.getByRole('button', { name: /Create Wallet/i })).toBeVisible({
  105 |       timeout: 5000,
  106 |     });
  107 |     await page.getByRole('button', { name: /Create Wallet/i }).click();
  108 |     console.log('✓ Wallet creation started');
  109 | 
  110 |     // ── STEP 5: Wallet unlocked → dashboard visible ──────────────────────────
  111 |     // Wait for the portfolio page to render (proves unlock success)
  112 |     await expect(page.getByText(/in this portfolio/i)).toBeVisible({ timeout: 15000 });
  113 |     console.log('✓ Wallet imported and unlocked');
  114 | 
  115 |     // ── STEP 6: Navigate to Settings → Security → Hardware Encryption ────────
  116 |     // Look for a settings nav link (varies by route, use the link text)
  117 |     const settingsLink = page.getByRole('link', { name: /settings/i }).or(
  118 |       page.getByRole('button', { name: /settings/i }),
  119 |     );
  120 |     if (await settingsLink.isVisible({ timeout: 2000 }).catch(() => false)) {
  121 |       await settingsLink.click();
  122 |     } else {
  123 |       // Fallback: navigate directly if no visible link
  124 |       await page.goto(`${BASE}/settings`);
  125 |     }
  126 | 
  127 |     // Wait for settings page + look for Hardware Encryption or Security section
  128 |     await expect(page.locator('h2, h3', { hasText: /Security|Hardware/i }).first()).toBeVisible({
  129 |       timeout: 10000,
  130 |     });
  131 |     console.log('✓ Settings page loaded');
  132 | 
  133 |     // ── STEP 7: Click Hardware Encryption toggle/button ────────────────────────
  134 |     // The UI may show a toggle, a button, or a link — find the control that says
  135 |     // "Hardware Encryption" or "Enable Hardware" or similar.
  136 |     const hwButton = page.locator('button, [role="switch"]', {
  137 |       hasText: /Hardware|WebAuthn|PRF/i,
  138 |     }).first();
  139 |     await expect(hwButton).toBeVisible({ timeout: 10000 });
  140 |     await hwButton.click();
  141 |     console.log('✓ Hardware Encryption enrollment started');
  142 | 
  143 |     // ── STEP 8: Platform authenticator prompt (CDP handles it) ───────────────
  144 |     // The browser will call navigator.credentials.create() with PRF extension.
  145 |     // CDP intercepts this and auto-succeeds (no human biometric needed in test).
  146 |     // Wait for success message + localStorage entry indicating enrollment.
  147 |     await expect(
  148 |       page.getByText(
  149 |         /Hardware encryption enabled|Hardware protected|device.*secure|PRF.*enrolled/i,
  150 |       ),
  151 |     ).toBeVisible({ timeout: 10000 });
  152 |     console.log('✓ WebAuthn PRF enrollment completed (CDP virtual auth)');
  153 | 
  154 |     // ── STEP 9: Verify localStorage has PRF credential ID ────────────────────
  155 |     const prfCredId = await page.evaluate(() =>
  156 |       localStorage.getItem('veyrnox-prf-cred-id'),
  157 |     );
  158 |     expect(prfCredId).toBeTruthy();
  159 |     console.log(`✓ PRF credential stored: ${prfCredId?.substring(0, 20)}…`);
  160 | 
  161 |     // ── STEP 10: Navigate to Send screen ──────────────────────────────────────
  162 |     const sendLink = page.getByRole('link', { name: /Send/i });
  163 |     await expect(sendLink).toBeVisible({ timeout: 5000 });
  164 |     await sendLink.click();
  165 | 
  166 |     // Wait for send form to load
  167 |     const recipientField = page.getByPlaceholder(/0x\.\.\. or .*\.eth/i);
  168 |     await expect(recipientField).toBeVisible({ timeout: 10000 });
  169 |     console.log('✓ Send form loaded');
  170 | 
  171 |     // ── STEP 11: Fill in send details ───────────────────────────────────────
  172 |     // Recipient
  173 |     await recipientField.fill(SEPOLIA_RECIPIENT);
  174 | 
  175 |     // Amount
  176 |     const amountField = page.getByPlaceholder('0.00');
  177 |     await amountField.fill(SEND_AMOUNT);
  178 | 
  179 |     // Asset (should default to ETH, but verify/select if needed)
  180 |     // Gas tier defaults to Standard, which is fine for testnet.
  181 | 
  182 |     console.log(`✓ Send form filled: ${SEND_AMOUNT} ETH to ${SEPOLIA_RECIPIENT}`);
  183 | 
  184 |     // ── STEP 12: Click Continue → Review screen ───────────────────────────────
  185 |     const continueBtn = page.getByRole('button', { name: /^Continue$/ });
  186 |     await expect(continueBtn).toBeEnabled({ timeout: 10000 });
  187 |     await continueBtn.click();
  188 | 
  189 |     // Wait for review screen (shows "You're sending...")
  190 |     await expect(page.getByText(/You're sending/i)).toBeVisible({ timeout: 10000 });
  191 |     console.log('✓ Review screen rendered');
  192 | 
```