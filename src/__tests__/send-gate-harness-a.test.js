// ─────────────────────────────────────────────────────────────────────────────
// HARNESS A — dev-real send-path GATE-STATE ASSERTION (CI; NEVER signs)
//
// Tier: UNAUDITED-PROVISIONAL · Framing: PRE-AUDIT.
// Source of truth: the signed LLD "dev-real test harness — two-harness architecture"
// and dev-real-test-harness-brief.md §3. Where they disagree, the diagram wins.
//
// ⚠️ HARD RULE (carries into this file). Every address below is BURNED /
// TESTNET-ONLY / fully compromised — shown in plaintext on purpose. NEVER send
// mainnet or real value to them. There is NO seed phrase anywhere in this file
// and there must never be one — only PUBLIC addresses and PUBLIC txids are written
// down. Harness B (the broadcast leg) unlocks via the on-device vault path only;
// the seed never leaves the device (I1).
//
// WHAT THIS IS (and is NOT)
//   This proves the GATE LOGIC of the dev-real send path — the four STRUCTURAL
//   gates G1–G4 — with zero credentials and zero broadcast. It is pure,
//   deterministic, and safe to run on every PR in the `verify` gate.
//
//   It does NOT prove an asset is sendable. A printed txid is NOT verification;
//   only a real explorer-confirmed testnet send through `build:release` (no flag)
//   earns `live`. This harness ENCODES that rule (see the drift-guards below); it
//   never erodes it. The five SIGN-TIME re-checks (unlock / step-up / spend-limit
//   / pre-sign risk / approval-ack) are NOT here — they fire for real in Harness B.
//
// THE §4 HARD WALL — this file imports ONLY:
//   • the asset registry + capability gate (pure data + pure predicates),
//   • the EVM network registry + getNetwork (which THROWS for mainnet; no broadcast),
//   • isDevSendUngated (a pure boolean of an injected env), and
//   • source text (read-only) to assert wiring contracts.
//   It imports NO signer, NO vault/WalletProvider, NO keystore, NO faucet, NO
//   network client. A credential or broadcast code path must not exist in this
//   harness AT ALL — not behind a flag, not dead. Harness B lives in its own
//   entrypoint this file never imports.
// ─────────────────────────────────────────────────────────────────────────────

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import {
  ASSETS,
  getAsset,
  canSend,
  canReceive,
  ASSET_STATUS,
} from '../wallet-core/assets.js';
import {
  getNetwork,
  NETWORKS,
  ALLOW_MAINNET,
} from '../wallet-core/evm/networks.js';
import { isDevSendUngated } from '../lib/devSendOverride.js';

const read = (rel) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// ── PUBLIC FIXTURES (brief §2) — burned, testnet-only, no secrets ────────────
// Addresses are roles for Harness B; here they only label the negative fixtures.
const FIXTURE = Object.freeze({
  evm: '0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729', // EVM (A fixture; B sender)
  btc: 'tb1qztdfvzkdup458v6nk555ztzsgduh7lhggekx54', // BTC testnet (A negative fixture)
  sol: 'Cp5MYrCMbUe7wra4ziGsVN672ZjpeLi5CFNj4Je7yFWK', // SOL devnet (A negative fixture)
});

// Known txids and the ONLY meaning each is allowed to carry (brief §2 table).
// The load-bearing rule: a txid existing is NOT evidence an asset is sendable.
const TXID = Object.freeze({
  // Past the build:release bar — a genuine verified send. ETH is the one live asset.
  ethSepoliaVerified: '0x2d4d5df057c6f61abaf78383d6cad9d1f7f66abfa2b2aec6520a0be8811b8ea9',
  // MODULE-verified only — BTC stays receive_only despite this real txid existing.
  btcTestnetModuleOnly: 'd9cc113f2c9c94d7175e546e29b16920aeadd9d34baca7596a0394ab2362a62e',
  // MODULE-verified only — SOL stays receive_only despite this real txid existing.
  solDevnetModuleOnly:
    'cCqCiKMdfXDHJRc75bn8u2uDBReuo3rfT2NLXMx26W8eWp7omMnSU3gTu3RMMZkQuUdJMZoFYdpV2wR8zZTEXic',
});

// The dev-build env in which the send ungate is ACTIVE (both locks set). Injected,
// never read from import.meta.env, so this stays deterministic in CI.
const UNGATE_ON = Object.freeze({ DEV: true, VITE_DEV_UNGATE_SEND: '1' });
// A production build: DEV is statically false, so the ungate can never be active.
const PROD_ENV = Object.freeze({ DEV: false, VITE_DEV_UNGATE_SEND: '1' });

// Every EVM network key whose entry is NOT a testnet — the mainnet set G4 guards.
const MAINNET_KEYS = Object.entries(NETWORKS)
  .filter(([, n]) => n.isTestnet === false)
  .map(([k]) => k);

// ─────────────────────────────────────────────────────────────────────────────
// G1 — DEMO OFF.  demoActive === false with no trigger; true with any trigger.
// ─────────────────────────────────────────────────────────────────────────────
describe('Harness A · G1 — demo-active predicate (and the persisted-flag trap)', () => {
  // The real predicate at SendCrypto.jsx:130. Modelled here as a pure function so
  // its truth table is asserted without rendering React; the source-contract test
  // below pins this to the ACTUAL line so the model can't silently drift from it.
  const demoActive = (DEMO, wallets) => DEMO && wallets.length === 0;

  it('is FALSE when no demo trigger fired (DEMO=false), regardless of wallets', () => {
    expect(demoActive(false, [])).toBe(false);
    expect(demoActive(false, [{ id: 'w1' }])).toBe(false);
  });

  it('is TRUE only when a demo trigger fired AND the live vault is empty', () => {
    expect(demoActive(true, [])).toBe(true);
    // A real unlocked session has wallets → the live (real) source is used even if
    // the DEMO flag is on; demo never shadows a real session.
    expect(demoActive(true, [{ id: 'w1' }])).toBe(false);
  });

  it('SOURCE CONTRACT: SendCrypto uses exactly `DEMO && wallets.length === 0`', () => {
    const src = read('../pages/SendCrypto.jsx');
    expect(src).toContain('const demoActive = DEMO && wallets.length === 0;');
  });

  it('SOURCE CONTRACT: DEMO resolves from the full trigger set (R1)', () => {
    const demo = read('../api/demoClient.js');
    // (1) explicit build-time flag · (2) ?demo / persisted localStorage trap ·
    // (3) native dev build.
    expect(demo).toContain('import.meta.env.VITE_DEMO_MODE === "1"');
    expect(demo).toContain('localStorage.setItem("veyrnox-demo", "1")');
    expect(demo).toContain('localStorage.getItem("veyrnox-demo") === "1"');
    expect(demo).toContain('import.meta.env.DEV && Capacitor.isNativePlatform()');
  });

  it('SOURCE CONTRACT: the ?demo/persisted trap is DCE-d + hard-failed in a release build', () => {
    // The persisted-flag trap is live in dev/test (where this harness runs) but is
    // statically removed when VITE_RELEASE=1, and a release build that somehow
    // resolves demo true hard-throws rather than caching the vault password.
    const demo = read('../api/demoClient.js');
    expect(demo).toContain('import.meta.env.VITE_RELEASE !== "1"');
    expect(demo).toContain('import.meta.env.VITE_RELEASE === "1" && demo');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G2 — canSend().  false for every receive_only asset; true ONLY for the live set.
// ─────────────────────────────────────────────────────────────────────────────
describe('Harness A · G2 — canSend() is true only for the live set (ETH, ARB, OP, BTC, SOL)', () => {
  it('the live (sendable) set is exactly [ETH, ARB, OP, BTC, SOL]', () => {
    // Each earned `live` via a real explorer-confirmed UI-path send (NOT a script):
    //   ETH  0x3ebb8fd7c844cdb88455408a8a17a4cd242b61ea2c475444fa334ef8a0a2b5c3 (Sepolia)
    //   ARB  0x797928efdccfe85e858c4050c979b6b69b324c42b11eb642b8c5607109bdca39 (Arbitrum Sepolia)
    //   OP   0xc3fd1e145a6d37c18a211a1ff673251b42dd72a9d4d56c24c48483c25d3c1a47 (OP Sepolia)
    //   BTC  2da87a2755881de629c8a8a78627524b39f1235774ea215fbd58adfb0c09df27 (testnet, block 4990901)
    //   SOL  5KGXAGTJTdYj2bQdemNY6CAtFQuBcVra8nsnNSSpnL4YESAfeiMCAzDHAuX7i6s47WonPwhMMkUXocRTcKTWEBVv (devnet, finalized)
    const sendable = ASSETS.filter(canSend).map((a) => a.symbol);
    expect(sendable).toEqual(['ETH', 'ARB', 'OP', 'BTC', 'SOL']);
  });

  it('canSend() is FALSE for every receive_only asset', () => {
    const receiveOnly = ASSETS.filter((a) => a.status === ASSET_STATUS.RECEIVE_ONLY);
    expect(receiveOnly.length).toBeGreaterThan(0); // sanity: the set is non-empty
    for (const a of receiveOnly) {
      expect(canSend(a)).toBe(false);
      expect(canReceive(a)).toBe(true); // receivable, just not sendable
    }
  });

  it('a coming_soon asset is blocked from BOTH send and receive', () => {
    const fake = { symbol: 'X', status: ASSET_STATUS.COMING_SOON };
    expect(canSend(fake)).toBe(false);
    expect(canReceive(fake)).toBe(false);
  });

  it('SOURCE CONTRACT: canSend is status===LIVE only (no other capability path)', () => {
    const src = read('../wallet-core/assets.js');
    expect(src).toContain('asset.status === ASSET_STATUS.LIVE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G3 — UNGATE.  With the ungate active, devUngated is true AND the asset's status
// is UNCHANGED AND canSend's live-classification is UNCHANGED. (R3/R4 — the
// load-bearing assertion is the NEGATIVE: status is never mutated.)
// ─────────────────────────────────────────────────────────────────────────────
describe('Harness A · G3 — the dev ungate relaxes the FLOW, never the status', () => {
  it('isDevSendUngated is TRUE only with both locks (dev build + opt-in env)', () => {
    expect(isDevSendUngated(UNGATE_ON)).toBe(true);
    expect(isDevSendUngated(PROD_ENV)).toBe(false); // prod build → impossible
    expect(isDevSendUngated({ DEV: true })).toBe(false); // opt-in absent
    expect(isDevSendUngated({})).toBe(false);
    // SEAL: an absent env fails closed WITHOUT reaching ambient import.meta.env —
    // upholding this file's "injected, never read from import.meta.env" contract
    // (§ UNGATE_ON above). The function is pure with no ambient default, so these
    // exercise the real predicate (not the runner's env) and go RED if a permissive
    // or ambient default is ever reintroduced.
    expect(isDevSendUngated(undefined)).toBe(false);
    expect(isDevSendUngated(null)).toBe(false);
  });

  it('with the ungate ACTIVE, every receive_only asset KEEPS its status + stays unsendable', () => {
    // The keystone negative: the ungate is a pure boolean of the env; it has no
    // handle on the asset registry, so an active ungate cannot mutate status or
    // re-classify canSend(). We assert the registry is identical to the gate-off
    // reading even while the ungate evaluates true.
    expect(isDevSendUngated(UNGATE_ON)).toBe(true); // ungate is "on" for this block
    for (const a of ASSETS) {
      if (a.status === ASSET_STATUS.RECEIVE_ONLY) {
        const fresh = getAsset(a.symbol);
        expect(fresh.status).toBe(ASSET_STATUS.RECEIVE_ONLY); // status untouched
        expect(canSend(fresh)).toBe(false); // live-classification untouched
      }
    }
    // And the live set is STILL exactly the verified set — the ungate didn't widen it.
    expect(ASSETS.filter(canSend).map((a) => a.symbol)).toEqual(['ETH', 'ARB', 'OP', 'BTC', 'SOL']);
  });

  it('SOURCE CONTRACT: ungate relaxes the UI flow + the sign-time gate, nothing else', () => {
    const src = read('../pages/SendCrypto.jsx');
    // flow gate is canSend OR ungate …
    expect(src).toContain('const flowSendEnabled = sendEnabled || devUngated;');
    // … and the HARD sign-time gate STILL feeds the live canSend() truth + the
    // devUngated flag into the pure ordered gate (lib/sendGate.js) — relaxing only
    // on devUngated, never reading status from the flag. The capability check was
    // extracted into evaluateSendGate(); the call site passes both in.
    expect(src).toContain('const gate = evaluateSendGate({');
    expect(src).toContain('canSend: canSend(selectedAsset),');
    expect(src).toContain('devUngated,');
    // The capability logic itself (block unless canSend OR ungate) lives in the pure
    // helper, exhaustively unit-tested in lib/__tests__/sendGate.test.js.
    const gateSrc = read('../lib/sendGate.js');
    expect(gateSrc).toContain('if (!canSend && !devUngated) {');
  });

  it('SOURCE CONTRACT: assets.js (the status source of truth) is ungate-free', () => {
    // If the ungate ever leaked into the registry, status could drift with a flag.
    const src = read('../wallet-core/assets.js');
    expect(src).not.toContain('devUngated');
    expect(src).not.toContain('isDevSendUngated');
    expect(src).not.toContain('DEV_UNGATE');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// G4 — MAINNET.  getNetwork(mainnetKey) throws regardless of ungate state (R5).
// ─────────────────────────────────────────────────────────────────────────────
describe('Harness A · G4 — mainnet is gated, un-bypassable by the ungate', () => {
  it('ALLOW_MAINNET is false', () => {
    expect(ALLOW_MAINNET).toBe(false);
  });

  it('there IS a mainnet set to guard (sanity)', () => {
    expect(MAINNET_KEYS).toContain('mainnet');
    expect(MAINNET_KEYS.length).toBeGreaterThanOrEqual(6);
  });

  it('getNetwork() THROWS for every mainnet key', () => {
    for (const key of MAINNET_KEYS) {
      expect(() => getNetwork(key)).toThrow();
    }
  });

  it('the throw is INDEPENDENT of ungate state (getNetwork takes no ungate handle)', () => {
    // Evaluate the ungate both ways; getNetwork('mainnet') throws regardless — the
    // ungate plane and the network-gate plane are wired separately, so no ungate
    // value can reach a mainnet RPC. (And no asset chain key is even a mainnet.)
    for (const ungated of [isDevSendUngated(UNGATE_ON), isDevSendUngated(PROD_ENV)]) {
      void ungated; // the boolean cannot influence the line below — that's the point
      expect(() => getNetwork('mainnet')).toThrow(/Mainnet is gated/i);
    }
  });

  it('every receivable EVM asset is wired to an ENABLED testnet (no dangling/gated key)', () => {
    for (const a of ASSETS) {
      if ((a.family === 'evm' || a.family === 'erc20') && canReceive(a)) {
        expect(() => getNetwork(a.chain)).not.toThrow();
        expect(NETWORKS[a.chain].isTestnet).toBe(true);
      }
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// DRIFT-GUARDS — the part that earns its keep.
//
// canSend() is status-only: a txid sitting in HISTORY can never, by itself, flip an
// asset to sendable — only a real UI-PATH on-chain verification (which sets
// status=live) can. BTC and SOL each carried a real MODULE/script txid for a long
// time and CORRECTLY stayed receive_only on that basis alone; they became `live`
// only once a real UI-path send was verified on-chain (see the G2 live-set txids).
// The negative guard below uses a still-receive_only asset to pin that a bare txid
// is not enough — the same class of bug as the Audit-Log "Built" vs HONEST-DISABLED
// contradiction.
// ─────────────────────────────────────────────────────────────────────────────
describe('Harness A · drift-guard — a txid in history does NOT, by itself, make an asset sendable', () => {
  it('a still-receive_only asset (AVAX) with a txid in history stays unsendable', () => {
    const history = [{ currency: 'AVAX', address: FIXTURE.evm, txid: `0x${'a'.repeat(64)}`, source: 'scripts/probe.mjs' }];
    expect(history[0].txid).toMatch(/^0x[0-9a-f]{64}$/i); // a txid genuinely exists…
    expect(canSend(getAsset('AVAX'))).toBe(false); // …and changes nothing
    expect(getAsset('AVAX').status).toBe(ASSET_STATUS.RECEIVE_ONLY);
  });

  it('BTC/SOL: their MODULE/script txid alone was never what flipped them — the UI-path send was', () => {
    // Both carried these real module-only txids WHILE still receive_only; the flip to
    // `live` came from a real UI-PATH send verified on-chain (G2 comment), NOT these.
    expect(TXID.btcTestnetModuleOnly).toBeTruthy();
    expect(TXID.solDevnetModuleOnly).toBeTruthy();
    expect(getAsset('BTC').status).toBe(ASSET_STATUS.LIVE); // now live — via the UI txid
    expect(getAsset('SOL').status).toBe(ASSET_STATUS.LIVE);
  });

  it('the live set (ETH, ARB, OP, BTC, SOL) each passed the bar; a verified UI txid is the reference', () => {
    // A real explorer-confirmed UI-path txid is what "live" actually looks like
    // (brief §2). It is the reference, not the cause: canSend() is true because the
    // status is `live`. All five cleared that bar via a UI-path send; the remaining
    // receive_only assets (USDC/USDT/MATIC/AVAX/BNB) have not.
    expect(TXID.ethSepoliaVerified).toMatch(/^0x[0-9a-f]{64}$/i);
    for (const sym of ['ETH', 'ARB', 'OP', 'BTC', 'SOL']) {
      expect(canSend(getAsset(sym))).toBe(true);
      expect(getAsset(sym).status).toBe(ASSET_STATUS.LIVE);
    }
  });

  it('the public fixtures are well-formed testnet addresses (shape only; B decodes on-device)', () => {
    expect(FIXTURE.evm).toMatch(/^0x[0-9a-fA-F]{40}$/); // EVM
    expect(FIXTURE.btc).toMatch(/^tb1[0-9a-z]+$/); // BTC testnet bech32
    expect(FIXTURE.sol).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/); // SOL base58 shape
  });
});
