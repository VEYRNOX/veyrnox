// ─────────────────────────────────────────────────────────────────────────────
// I3 no-egress proof for a decoy/hidden session — fully automated, no human.
//
// CLAUDE.md I3: "deniability mode makes zero backend calls." This asserts that
// while a real decoy/hidden (deniability) session is active, the app makes ZERO
// HTTP requests to ANY of the known third-party egress hosts — not just the news
// hosts, but the chain RPC endpoints, the BTC Esplora host, the SOL RPC, and the
// price feed. Playwright network capture stands in for an on-device egress trace.
//
// ── HOW THE DECOY SESSION IS TRIGGERED (honest note) ──────────────────────────
// The previous version drove DuressPin.jsx's demo "Live demonstration" panel to
// reach a real decoy unlock. That panel is now UNREACHABLE on the web test
// surface: the 2026-07-12 plans-tier update moved /duress-pin into
// SAFETY_PLUS_ROUTES, and web entitlement.js always resolves 'free' (web is
// testing-only), so FeatureGate renders TierLockedPage instead of the panel.
// Forging a paid web tier is explicitly off-limits (entitlement.js exists to
// prevent exactly that self-report).
//
// Instead we activate the REAL deniability marker directly. The e2e webServer is
// the Vite DEV server (see playwright.config.ts), which serves ESM modules
// individually and keeps ONE module instance per graph node. So a
// `page.evaluate(import('/src/wallet-core/deniabilitySession.js'))` resolves to
// the SAME module singleton WalletProvider and every wallet-core egress gate
// read from — calling `setDeniabilitySession(true)` flips the genuine in-memory
// flag the production guards check. This is NOT a mock and NOT a forged control:
// the real `isDeniabilitySessionActive()` guard runs against real state. Only the
// TRIGGER differs (a test hook vs. a duress-PIN unlock), which is what this note
// discloses.
//
// ── HONEST LIMITATION: this proves "decoy = 0", NOT "real > 0, decoy = 0" ─────
// The harness runs under `?demo=1` (the only way to reach an unlocked wallet on
// web without full onboarding). Demo mode folds `!DEMO` into several `enabled`
// gates, so a REAL (non-decoy) demo session ALSO makes zero calls to some of
// these hosts. The real-vs-decoy CONTRAST therefore cannot be established here.
// We assert ONLY the decoy-session zero-egress invariant, across the EXPANDED
// host list — we do not pretend to prove the full contrast. Closing the contrast
// needs a non-demo run driven through the real PinPad unlock, out of scope here.
//
// IMPORTANT: unlock/session state lives only in React memory + the module
// singleton, never localStorage — a `page.goto()` is a document reload that
// re-locks the SPA AND resets the module flag. After activating the flag,
// navigate ONLY via the in-app client-side router (nav links), never page.goto.
//
// Run:
//   npx playwright test e2e/i3-deniability-egress.spec.js
// ─────────────────────────────────────────────────────────────────────────────

import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';

// Expanded gated-host list: news feeds + price feed + all chain egress endpoints.
// A decoy/hidden session must reach NONE of these.
//   - news:   cointelegraph.com, decrypt.co, api.rss2json.com
//   - price:  api.coingecko.com, coincap / cryptocompare price feeds
//   - EVM RPC: ethereum-rpc.publicnode.com + any sepolia/publicnode RPC
//   - BTC:    mempool.space / blockstream esplora
//   - SOL:    *.solana.com RPC
const EGRESS_HOST_PATTERN =
  /cointelegraph\.com|decrypt\.co|api\.rss2json\.com|coingecko\.com|coincap\.io|cryptocompare\.com|publicnode\.com|infura\.io|alchemy\.com|mempool\.space|blockstream\.info|solana\.com|ankr\.com/i;

test.describe('I3 deniability — zero egress in a decoy/hidden session (no human)', () => {
  test.setTimeout(60 * 1000);

  test('a decoy session makes ZERO requests to any gated third-party host', async ({ page }) => {
    // Land on the seeded demo dashboard (unlocked wallet, real UI, no onboarding).
    await page.goto(`${BASE}/?demo=1`);
    await page.evaluate(() => {
      try { localStorage.setItem('veyrnox-demo', '1'); } catch { /* best-effort */ }
    });
    await page.goto(`${BASE}/?demo=1`);

    // Activate the REAL deniability marker via the app's own module singleton
    // (Vite dev serves one instance — see header note). Not a mock, not a forged
    // tier: the genuine isDeniabilitySessionActive() guard now returns true.
    const flagSet = await page.evaluate(async () => {
      const m = await import('/src/wallet-core/deniabilitySession.js');
      m.setDeniabilitySession(true);
      return m.isDeniabilitySessionActive();
    });
    expect(flagSet, 'the real deniability marker must be active before the egress capture').toBe(true);

    // Begin capturing every outbound request from this point.
    const requests = [];
    page.on('request', (req) => requests.push(req.url()));

    // Dwell on the dashboard (CryptoNewsFeed + price widgets live here) so any
    // background fetch would have fired, then client-side navigate to the
    // history + fee-analytics views this session's fixes gate (each would
    // otherwise disclose address -> indexer). Client-side nav only — a goto
    // would reload and clear the module flag.
    await page.waitForTimeout(3000);
    for (const href of ['/transaction-history', '/fee-analytics', '/']) {
      const link = page.locator(`a[href="${href}"]`).first();
      if (await link.count()) {
        await link.click();
        await page.waitForTimeout(1500);
        // Re-assert the flag survived the client-side navigation.
        const still = await page.evaluate(async () => {
          const m = await import('/src/wallet-core/deniabilitySession.js');
          return m.isDeniabilitySessionActive();
        });
        expect(still, `deniability flag must stay active across nav to ${href}`).toBe(true);
      }
    }

    const egress = requests.filter((u) => EGRESS_HOST_PATTERN.test(u));
    if (egress.length > 0) {
      console.log('❌ EGRESS IN DECOY SESSION:', egress);
    } else {
      console.log('✓ Decoy session made zero requests to any gated third-party host (news/price/RPC/BTC/SOL)');
    }
    expect(egress).toEqual([]);

    // Honest limitation restated in-run: demo mode also suppresses egress for a
    // real session, so this is a decoy-side-only assertion, not the full
    // "real > 0, decoy = 0" contrast (see header note).
    console.warn(
      'ℹ️  decoy = 0 asserted across the expanded host list; the real-vs-decoy ' +
      'CONTRAST is out of scope under demo mode (demo suppresses egress for all ' +
      'sessions).'
    );
  });
});
