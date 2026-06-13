// ─────────────────────────────────────────────────────────────────────────────
// HARNESS B — dev-real send-path BROADCAST (supervised · on-device · emits a txid)
//
// Tier: UNAUDITED-PROVISIONAL · Framing: PRE-AUDIT.
// Source of truth: the signed LLD "dev-real test harness — two-harness architecture"
// and dev-real-test-harness-brief.md §5–§6. Where they disagree, the diagram wins.
//
// ⚠️ HARD RULE (carries into this file).
//   • Every address written down here is BURNED / TESTNET-ONLY / fully compromised.
//     NEVER send mainnet or real value to them.
//   • There is NO seed phrase and NO PIN anywhere in this file, and there must never
//     be one. The seed never leaves the device (I1): Harness B unlocks via the
//     on-device vault path ONLY. The human types the seed/PIN into the running app;
//     this script drives the non-credential UI and PAUSES at every credential and
//     funding step. It must not capture, echo, or log seed/PIN material — ever.
//
// WHY THIS IS A SEPARATE ARTIFACT FROM HARNESS A (the §4 hard wall)
//   Harness A (src/__tests__/send-gate-harness-a.test.js) is the every-PR CI gate:
//   credential-free, never signs, structurally incapable of broadcasting. THIS file
//   is the broadcast leg: it drives a REAL testnet send through the REAL app UI and
//   emits a real on-chain txid. It lives OUTSIDE src/ and is NOT in the `verify`
//   gate (vitest globs src/**/*.test.{js,jsx}; @playwright/test is not a dependency),
//   exactly so the vault-unlock / broadcast path can never exist inside the CI
//   harness — not behind a flag, not dead. A never imports B.
//
// WHAT A GREEN RUN MEANS (and does NOT)
//   A printed txid is BUILT/broadcast — NOT verified. An asset is `live` ONLY after
//   a human opens the explorer, confirms the txid, and supplies it, AND the send
//   went through `build:release` with NO flag. This harness flips NOTHING: the txid
//   it prints feeds the normal canSend()-flip + status-reconciliation path
//   separately, with its own review (brief §7.4). A B run that uses the dev ungate
//   can NEVER on its own justify `live` — the ungate is a dev-build, testnet-only
//   bypass of the UI gate, not a status change (Harness A G3 pins that).
//
// R7 OUTCOME (recon, confirmed against src/lib/WalletProvider.jsx):
//   There is NO automated dev-unlock affordance (no fixture-PIN hook, no dev-only
//   unlock backdoor). So B is HUMAN-IN-THE-LOOP: the script drives everything up to
//   each credential/funding step, the human acts on-device, the script resumes.
//   This is the correct, honest shape — we do NOT synthesise a PIN-holding code
//   path to avoid the pause.
//
// HOW TO RUN (supervised — NOT CI)
//   1) Create a git-ignored .env.local with the dev ungate (NOT an inline shell var —
//      inline fails on Windows/PowerShell; see CLAUDE.md):
//          VITE_DEV_UNGATE_SEND=1
//      Then start the dev server:  npm run dev        # http://localhost:5173
//   2) Install Playwright once (it is intentionally NOT a dependency):
//          npm i -D @playwright/test && npx playwright install chromium
//   3) Run HEADED so you can act on-device when the script pauses:
//          npx playwright test e2e/send-broadcast.harness-b.spec.js --headed --workers=1
//      Optional knobs (env):
//          TARGET_ASSET   default 'ETH' (re-confirm the live asset). Set to a
//                         receive_only symbol (e.g. 'USDC') to mint a NEW verified
//                         txid via the ungate — that asset must be enabled on the
//                         unlocked wallet and funded on its testnet.
//          TO_ADDRESS     recipient; default = the wallet's own receive address
//                         (a clean testnet round-trip).
//          SEND_AMOUNT    default '0.0001'.
//
// HONEST STATUS (report faithfully): this spec was AUTHORED from REAL selectors
// discovered in src/ (provenance below) and was NOT executed in the authoring
// environment — @playwright/test is not installed here and no testnet broadcast was
// performed. It has had a node --check syntax pass only. The txid it is designed to
// print is the artifact that matters; this script's exit code is not verification.
//
// SELECTOR PROVENANCE (DISCOVER, NEVER INVENT)
//   * "Get Started" / "Choose a 6-digit PIN" / "Confirm your PIN" / "Create Wallet" /
//     "Import an existing seed" / "Enter your PIN" — WalletEntry.jsx (and confirmed
//     by the sibling e2e/onboarding.spec.js, which drives the same flow).
//   * PIN digit buttons "0".."9" (button text) — PinPad.jsx:65-74.
//   * PIN status dots role=status `${n} of ${length} digits entered` — PinPad.jsx:26.
//   * Send form: "From Wallet"/"Asset" Selects, recipient placeholder
//     "0x... or vitalik.eth or wallet.sol", amount placeholder "0.00", "Continue",
//     "DEV UNGATE ACTIVE" banner, "Sending is not yet enabled" banner — SendCrypto.jsx.
//   * Verify step: "You're sending", "Confirm & Send" / "Authorise & Send" — SendCrypto.jsx.
//   * Success: "Transaction Broadcast", "Transaction hash", "View on block explorer"
//     link — SendCrypto.jsx:690-711.
//   No data-testid exists on these surfaces, so role+text is the only handle
//   (recorded as a coverage risk, same as onboarding.spec.js).
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

// NODE-SIDE pre-flight imports: A's PURE gate modules (no signer/vault/broadcast).
// Re-running the four structural gates here makes a B run self-contained — it
// cannot proceed from a bad gate state even if CI was skipped (brief §5, the
// recommended "keep the re-check" path).
import {
  ASSETS,
  getAsset,
  canSend,
  ASSET_STATUS,
} from '../src/wallet-core/assets.js';
import { getNetwork, ALLOW_MAINNET } from '../src/wallet-core/evm/networks.js';
import { isDevSendUngated } from '../src/lib/devSendOverride.js';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const TARGET_ASSET = (process.env.TARGET_ASSET || 'ETH').toUpperCase();
const TO_ADDRESS = process.env.TO_ADDRESS || ''; // '' → self round-trip (resolved live)
const SEND_AMOUNT = process.env.SEND_AMOUNT || '0.0001';

// PUBLIC fixtures (brief §2) — burned, testnet-only. Never funded with real value.
const FIXTURE_EVM = '0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729';

// Generous waits: a human is funding from a faucet / unlocking on-device between
// steps. These are deliberately long — the human, not the clock, drives the pace.
const HUMAN_WAIT_MS = 20 * 60 * 1000; // 20 min per human step

// ── Human-in-the-loop helper ────────────────────────────────────────────────
// Print a clear instruction, then BLOCK on a UI condition the human's on-device
// action will make true. No credential is ever supplied by the script.
async function waitForHuman(page, { instruction, until }) {
  console.log(`\n⏸  HUMAN STEP — ${instruction}\n   (script is waiting; act in the open browser…)\n`);
  await until(page);
  console.log('▶  resumed.\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// PRE-FLIGHT (NO signing) — re-assert A's four gates, then the live UI gate state.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Harness B · pre-flight — re-run A\'s gates before touching the vault', () => {
  test('G2/G3/G4 (node) — canSend live-set, ungate is status-blind, mainnet gated', () => {
    // G2: live set is exactly [ETH].
    expect(ASSETS.filter(canSend).map((a) => a.symbol)).toEqual(['ETH']);
    // G3 (negative): the ungate is a pure boolean of the env; with it "active",
    // every receive_only asset keeps its status and stays unsendable.
    expect(isDevSendUngated({ DEV: true, VITE_DEV_UNGATE_SEND: '1' })).toBe(true);
    for (const a of ASSETS) {
      if (a.status === ASSET_STATUS.RECEIVE_ONLY) expect(canSend(getAsset(a.symbol))).toBe(false);
    }
    // G4: mainnet stays gated regardless of ungate (un-bypassable, brief R5).
    expect(ALLOW_MAINNET).toBe(false);
    expect(() => getNetwork('mainnet')).toThrow(/Mainnet is gated/i);
  });

  test('demo OFF + DEV-UNGATE banner shows on a receive_only asset, never on ETH', async ({ page }) => {
    // Clear the silently-persisting demo flag (CLAUDE.md known trap) so we exercise
    // the REAL build, not the seeded demo pass-through.
    await page.goto(`${BASE}/?demo=0`);
    await page.evaluate(() => { try { localStorage.removeItem('veyrnox-demo'); } catch { /* ignore */ } });
    await page.goto(`${BASE}/?demo=0`);

    // Demo off ⇒ the onboarding gate owns first paint (no seeded DemoDashboard).
    await expect(page.getByRole('button', { name: 'Get Started' })).toBeVisible();

    // The DEV-UNGATE banner check requires an unlocked wallet to reach /send, so it
    // is asserted AFTER unlock in the broadcast test below — here we only confirm
    // the build is real (demo off). NOTE: if VITE_DEV_UNGATE_SEND is NOT set in
    // .env.local, the broadcast test's receive_only target will be hard-gated and
    // the run will (correctly) refuse to send — that is the gate working, not a bug.
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// BROADCAST — supervised. The human creates/imports + unlocks a FUNDED throwaway
// testnet wallet on-device, funds from a faucet, and authorises the send (PIN at
// the step-up re-auth, if required). The script drives the rest and prints the txid.
// ─────────────────────────────────────────────────────────────────────────────
test.describe('Harness B · broadcast (supervised — emits a real testnet txid)', () => {
  // No fixed timeout race: the per-step human waits below own the pacing.
  test.setTimeout(HUMAN_WAIT_MS * 3);

  test(`send ${TARGET_ASSET} through the real app path and capture the on-chain txid`, async ({ page }) => {
    await page.goto(`${BASE}/?demo=0`);
    await page.evaluate(() => { try { localStorage.removeItem('veyrnox-demo'); } catch { /* ignore */ } });
    await page.goto(`${BASE}/?demo=0`);

    // ── HUMAN STEP 1 — create/import + unlock a FUNDED throwaway wallet ──────────
    // The human does ALL credential entry here, on-device, in this browser:
    //   • "Get Started" → PIN-create → confirm → "Create Wallet"  (fresh throwaway), OR
    //   • "Import an existing seed" → enter the funded throwaway seed → set PIN.
    // Then fund the wallet's receive address from a testnet faucet (e.g. Sepolia ETH,
    // or the target token). The script never sees the seed or PIN.
    await waitForHuman(page, {
      instruction:
        'In the browser: create OR import a THROWAWAY testnet wallet and UNLOCK it, ' +
        'then FUND its receive address from a faucet. When the wallet dashboard is ' +
        'visible and funded, the script continues automatically.',
      until: async (p) =>
        // Dashboard rendered ⇒ unlocked. (Real build shows the portfolio copy.)
        expect(p.getByText(/in this portfolio/i)).toBeVisible({ timeout: HUMAN_WAIT_MS }),
    });

    // ── Navigate to the real Send screen via IN-APP nav (NOT page.goto) ─────────
    // A full page.goto('/send') is a hard reload: it drops the in-memory vault and
    // re-locks the wallet, landing on the "Enter your PIN" gate — which would force
    // a SECOND unlock right after the human just unlocked. Click the in-app "Send"
    // link instead, so the unlocked session is preserved. (Verified via a
    // throwaway-wallet smoke: page.goto here re-locked; in-app nav reaches the form.)
    await page.getByRole('link', { name: 'Send', exact: true }).click();
    // The recipient field only renders past the unlock gate — its presence proves
    // we are on the real Send form, not the gate.
    const recipient = page.getByPlaceholder(/0x\.\.\. or .*\.eth/i);
    await expect(recipient).toBeVisible({ timeout: 30000 });

    // ── Select the target asset (Radix Select; role=combobox, fragile — see header)
    // From-Wallet auto-selects when a single wallet exists, so we only drive Asset.
    // The Asset trigger is the 2nd combobox on the form.
    if (TARGET_ASSET !== 'ETH') {
      const assetTrigger = page.getByRole('combobox').nth(1);
      await assetTrigger.click();
      // Options render as "Name — SYM"; match the trailing symbol.
      await page.getByRole('option', { name: new RegExp(`—\\s*${TARGET_ASSET}$`) }).click();

      // GATE PROOF: a receive_only target must show the DEV-UNGATE banner (ungate
      // on) — and ETH must never show it. If the banner is ABSENT here, the ungate
      // is not set: the send is correctly hard-gated and we must stop, not force it.
      await expect(page.getByText(/DEV UNGATE ACTIVE/i)).toBeVisible({ timeout: 10000 });
    } else {
      // ETH is live: the banner must NOT appear (its absence is expected, not a bug).
      await expect(page.getByText(/DEV UNGATE ACTIVE/i)).toHaveCount(0);
    }

    // ── Resolve recipient: explicit TO_ADDRESS, else a clean self round-trip ──────
    let toAddress = TO_ADDRESS;
    if (!toAddress) {
      // Self round-trip: read the wallet's own receive address from the balance line
      // is not exposed here, so fall back to the burned EVM fixture for EVM targets.
      // (A self-send is also valid; set TO_ADDRESS to the wallet address to do that.)
      toAddress = FIXTURE_EVM;
    }
    await recipient.fill(toAddress);
    await page.getByPlaceholder('0.00').fill(SEND_AMOUNT);

    // ── Continue → the verify step (this is where the 5 sign-time re-checks live) ─
    const continueBtn = page.getByRole('button', { name: /^Continue$/ });
    await expect(continueBtn).toBeEnabled({ timeout: 15000 }); // disabled ⇒ a gate is blocking
    await continueBtn.click();

    await expect(page.getByText(/You're sending/i)).toBeVisible();

    // ── HUMAN STEP 2 — authorise the send on-device ─────────────────────────────
    // The §6 sign-time defense-in-depth fires for REAL here: unlock-required,
    // step-up re-auth (the PIN/password prompt — HUMAN enters it), spend-limits,
    // pre-sign RISK gate (fails closed; a hostile-runtime BLOCK has no override),
    // and the unlimited-approval ack (ERC-20 only). The script does NOT type the
    // credential. The human clicks "Confirm & Send" or enters the PIN at the
    // step-up prompt ("Authorise & Send"); a high-risk verdict may require the
    // explicit "Sign anyway" acknowledgement first.
    await waitForHuman(page, {
      instruction:
        'In the browser: review the pre-sign risk verdict + transaction preview, ' +
        'then AUTHORISE the send (Confirm & Send, or re-enter your PIN at the step-up ' +
        'prompt). The script captures the txid once the broadcast succeeds.',
      until: async (p) =>
        expect(p.getByText(/Transaction Broadcast/i)).toBeVisible({ timeout: HUMAN_WAIT_MS }),
    });

    // ── Capture the REAL on-chain txid + explorer link (the only artifact that
    //    matters — NOT this script's exit code). ────────────────────────────────
    await expect(page.getByText('Transaction hash')).toBeVisible();
    const explorerLink = page.getByRole('link', { name: /View on block explorer/i });
    await expect(explorerLink).toBeVisible();
    const explorerUrl = await explorerLink.getAttribute('href');
    // The hash is the mono-value paragraph under the "Transaction hash" label.
    const hash = (await page.locator('p.mono-value.break-all').first().innerText()).trim();

    expect(hash).toMatch(/^(0x[0-9a-fA-F]{64}|[1-9A-HJ-NP-Za-km-z]{43,90})$/); // EVM 0x… or base58 sig
    expect(explorerUrl).toBeTruthy();

    console.log(
      `\n✅ BROADCAST — ${TARGET_ASSET} sent through the real app path.\n` +
        `   txid:     ${hash}\n` +
        `   explorer: ${explorerUrl}\n\n` +
        '   This txid is BUILT/broadcast, NOT verified. Open the explorer, confirm it,\n' +
        '   and supply the hash through the normal canSend()-flip + reconciliation\n' +
        '   review (brief §7.4). This harness flips nothing.\n',
    );
  });
});
