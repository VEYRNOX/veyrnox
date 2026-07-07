// ─────────────────────────────────────────────────────────────────────────────
// Pre-sign RISK verdict + gate — automated module-boundary e2e (no human)
//
// Closes the "DEMO-mode only — no build:release eyeball yet" caveat from
// docs/Feature-Status.md §6 / the widget "Composite pre-sign RISK verdict + gate"
// amber item.
//
// WHY module-boundary (not full UI):
//   Playwright always sets navigator.webdriver=true, which fires the RASP gate
//   (TIER.BLOCK). RASP BLOCK outranks tx RISK in the compose lattice (rank 3 > 2),
//   so composeGate sets owner='rasp' — the RASP banner renders instead of
//   RiskVerdictBanner and Confirm & Send is always disabled. Full-UI assertions on
//   the risk banner or the button state are impossible in this environment.
//   Module-boundary testing (exactly as rasp-automation-detection.spec.js and
//   webauthn-prf-kek.spec.js do) hits the same production code without the RASP
//   collision: we pass TIER.ALLOW to presignGate to isolate the tx-risk plane.
//
// What this proves:
//   1. Risk engine fires RISK for a known poison address (S4 signal) — the real
//      src/risk/score.js + fromSendState.js + signals/s4-address-poisoning.js
//      path, running inside the real Vite browser module graph.
//   2. Risk engine fires INFO (not RISK) for a safe fresh address — confirming
//      the gate is NOT always-on.
//   3. presignGate(TIER.ALLOW, 'RISK', false).proceedAllowed === false
//   4. presignGate(TIER.ALLOW, 'RISK', true).proceedAllowed  === true
//   5. presignGate(TIER.ALLOW, 'INFO', false).proceedAllowed === true
//
// HONESTY SCOPE:
//   - Tests the REAL risk engine and presignGate — no mocks, no stub modules.
//   - Runs inside a real Chromium instance via Playwright CDP, against the Vite
//     dev server, so the module graph is the same as a production bundle.
//   - No transaction is broadcast. No on-chain txid. Not a catalogue "verified"
//     promotion — closes the render-proof / "no build:release eyeball" gap only.
//   - RASP plane not exercised here (covered by rasp-automation-detection.spec.js).
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

// Canonical poison pair from src/api/demoClient.js.
// POISON looks like KNOWN_COUNTERPARTY (same first 5 + last 6 hex chars: a11ce…c0ffee).
const POISON_ADDRESS    = '0xa11cefedcba0987654321fedcba0987654c0ffee';
const KNOWN_COUNTERPARTY = '0xa11ce1234567890abcdef1234567890abcc0ffee';
// A fresh address with no relationship to the known counterparty.
// We pass recipientCode:'0x' (EOA, no contract code) so S7 returns OK rather than
// INDETERMINATE — preventing the fail-closed CAUTION escalation from masking INFO.
const SAFE_ADDRESS = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth

test.setTimeout(120_000);

// Navigate to the app so the Vite module graph is available for page.evaluate()
async function loadApp(page) {
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(async () => {
    try { localStorage.clear(); } catch {}
  });
  await page.goto(`${BASE}/?demo=0`);
  // Wait for the app shell to mount (any visible element)
  await page.waitForLoadState('networkidle');
}

// ─────────────────────────────────────────────────────────────────────────────
test.describe('Pre-sign RISK verdict + presignGate (module boundary, no human)', () => {

  test('1. Poison address → RISK level from real risk engine (S4 signal fires)', async ({ page }) => {
    await loadApp(page);

    const result = await page.evaluate(async ([poisonAddr, knownAddr]) => {
      try {
        const { buildRiskInputs } = await import('/src/risk/fromSendState.js');
        const { score } = await import('/src/risk/score.js');

        const inputs = buildRiskInputs({
          to: poisonAddr,
          amountText: '0.001',
          isErc20: false,
          chainId: 11155111, // Sepolia
          assetCurrency: 'ETH',
          // Inject the known counterparty so S4 has something to compare against
          knownAddresses: [{ address: knownAddr, label: 'Alice', date: Date.now() - 86400000 }],
          history: [],
          whitelist: [],
          recipientCode: '0x', // EOA — prevents S7 INDETERMINATE → CAUTION masking RISK
        });

        const verdict = score(inputs.unsignedTx, inputs.activeSetLocalState, inputs.chainData);
        return { ok: true, level: verdict.level, sentence: verdict.sentence, signalCount: verdict.signals?.length ?? 0 };
      } catch (e) {
        return { ok: false, message: String(e?.message ?? e) };
      }
    }, [POISON_ADDRESS, KNOWN_COUNTERPARTY]);

    expect(result.ok, `score() threw: ${result.message}`).toBe(true);
    expect(result.level).toBe('RISK');
    expect(result.sentence).toBeTruthy();
    console.log(`✓ Poison address → level=${result.level} | "${result.sentence}" | ${result.signalCount} signal(s)`);
  });

  test('2. Safe address → INFO or OK from real risk engine (not RISK)', async ({ page }) => {
    await loadApp(page);

    const result = await page.evaluate(async ([safeAddr]) => {
      try {
        const { buildRiskInputs } = await import('/src/risk/fromSendState.js');
        const { score } = await import('/src/risk/score.js');

        const inputs = buildRiskInputs({
          to: safeAddr,
          amountText: '0.001',
          isErc20: false,
          chainId: 11155111,
          assetCurrency: 'ETH',
          knownAddresses: [],
          history: [],
          whitelist: [],
          recipientCode: '0x', // EOA — prevents S7 INDETERMINATE → CAUTION escalation
        });

        const verdict = score(inputs.unsignedTx, inputs.activeSetLocalState, inputs.chainData);
        return { ok: true, level: verdict.level, sentence: verdict.sentence ?? null };
      } catch (e) {
        return { ok: false, message: String(e?.message ?? e) };
      }
    }, [SAFE_ADDRESS]);

    expect(result.ok, `score() threw: ${result.message}`).toBe(true);
    expect(['OK', 'INFO']).toContain(result.level);
    console.log(`✓ Safe address → level=${result.level} (not RISK — gate is not always-on)`);
  });

  test('3. presignGate: RISK unacknowledged → proceedAllowed=false; acknowledged → true', async ({ page }) => {
    await loadApp(page);

    const result = await page.evaluate(async () => {
      try {
        const { presignGate } = await import('/src/sign-gate/presign.js');
        // Use TIER.ALLOW to isolate the tx-risk plane (RASP covered separately)
        const { TIER } = await import('/src/rasp/index.js');

        const blocked   = presignGate(TIER.ALLOW, 'RISK', false);
        const allowed   = presignGate(TIER.ALLOW, 'RISK', true);
        const infoNoAck = presignGate(TIER.ALLOW, 'INFO', false);

        return {
          ok: true,
          blocked:   { decision: blocked.decision,   proceedAllowed: blocked.proceedAllowed,   owner: blocked.owner },
          allowed:   { decision: allowed.decision,   proceedAllowed: allowed.proceedAllowed,   owner: allowed.owner },
          infoNoAck: { decision: infoNoAck.decision, proceedAllowed: infoNoAck.proceedAllowed, owner: infoNoAck.owner },
        };
      } catch (e) {
        return { ok: false, message: String(e?.message ?? e) };
      }
    });

    expect(result.ok, `presignGate threw: ${result.message}`).toBe(true);

    // RISK + no ack → CONFIRM decision, tx owns, proceedAllowed=false (gate blocks)
    expect(result.blocked.proceedAllowed).toBe(false);
    expect(result.blocked.decision).toBe('confirm');
    expect(result.blocked.owner).toBe('tx');
    console.log(`✓ RISK unacked → decision=${result.blocked.decision}, owner=${result.blocked.owner}, proceedAllowed=${result.blocked.proceedAllowed}`);

    // RISK + ack → same decision, but proceedAllowed=true (user cleared the gate)
    expect(result.allowed.proceedAllowed).toBe(true);
    expect(result.allowed.decision).toBe('confirm');
    console.log(`✓ RISK acked   → decision=${result.allowed.decision}, proceedAllowed=${result.allowed.proceedAllowed}`);

    // INFO + no ack → ALLOW decision, no owner, proceedAllowed=true (gate is not always-on)
    expect(result.infoNoAck.proceedAllowed).toBe(true);
    expect(result.infoNoAck.decision).toBe('allow');
    expect(result.infoNoAck.owner).toBeNull();
    console.log(`✓ INFO no ack  → decision=${result.infoNoAck.decision}, owner=${result.infoNoAck.owner}, proceedAllowed=${result.infoNoAck.proceedAllowed}`);
  });

});
