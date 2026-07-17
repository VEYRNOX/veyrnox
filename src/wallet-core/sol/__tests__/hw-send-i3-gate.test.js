// wallet-core/sol/__tests__/hw-send-i3-gate.test.js
//
// I-4 (this session): sol/hw-send.js `sendSolHw` invoked `getPubkeyFn()` — a
// physical Trezor/Ledger prompt — BEFORE the guarded RPC read in provider.js.
// In a decoy/hidden (or persisted demo) session with a Trezor/Ledger connected,
// the device would light up: a visible coercion tell BEFORE the deniability
// gate ever fired.
//
// EVM path fixed the same class in PR #963/#978 by adding
// `assertNotDeniabilitySession()` (calling the LIVE `isDeniabilityOrDemoActive`
// helper, throwing 'TREZOR_DENIABILITY_BLOCKED') as the FIRST statement of each
// exported entrypoint. SOL missed. This test pins both SOL Trezor + Ledger
// entrypoints to the same discipline: the device pubkey fn (spy) must NEVER be
// called under an active deniability marker OR the persisted demo flag.
//
// Fail-closed (I4): the throw MUST land before getPubkeyFn(), before any
// provider RPC, and before any signFn call.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  ledgerGetAddressSpy: null,
  ledgerSignSpy: null,
  trezorGetAddressSpy: null,
  trezorSignSpy: null,
}));

vi.mock('../provider.js', () => ({
  getBalanceLamports: vi.fn(),
  getRentExemptMinimum: vi.fn(),
  getLamportsPerSignature: vi.fn(),
  getConnection: vi.fn(),
  broadcastRawTx: vi.fn(),
  confirmTx: vi.fn(),
}));

vi.mock('@ledgerhq/hw-app-solana', () => ({
  default: class MockAppSolana {
    constructor(transport) { this.transport = transport; }
    async getAddress(...args) { return h.ledgerGetAddressSpy(...args); }
    async signTransaction(...args) { return h.ledgerSignSpy(...args); }
  },
}));

vi.mock('@trezor/connect-web', () => ({
  default: {
    solanaGetAddress: (...args) => h.trezorGetAddressSpy(...args),
    solanaSignTransaction: (...args) => h.trezorSignSpy(...args),
  },
}));

import {
  getBalanceLamports, getRentExemptMinimum, getLamportsPerSignature,
  getConnection, broadcastRawTx,
} from '../provider.js';
import { setDeniabilitySession } from '../../deniabilitySession.js';
import { signAndBroadcastSolLedger, signAndBroadcastSolTrezor } from '../hw-send.js';

const FROM = '11111111111111111111111111111111'; // any base58; guard fires before we validate
const TO   = '11111111111111111111111111111112';

describe('sol/hw-send — I3 deniability gate fires BEFORE device prompt (parity with EVM PR #963/#978)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    h.ledgerGetAddressSpy = vi.fn(async () => ({ address: FROM }));
    h.ledgerSignSpy       = vi.fn(async () => ({ signature: Buffer.alloc(64) }));
    h.trezorGetAddressSpy = vi.fn(async () => ({ success: true, payload: { address: FROM } }));
    h.trezorSignSpy       = vi.fn(async () => ({ success: true, payload: { signature: '00'.repeat(64) } }));
    setDeniabilitySession(false);
    try { localStorage.removeItem('veyrnox-demo'); } catch { /* jsdom */ }
  });
  afterEach(() => {
    setDeniabilitySession(false);
    try { localStorage.removeItem('veyrnox-demo'); } catch { /* jsdom */ }
  });

  describe('under an active decoy/hidden session', () => {
    beforeEach(() => setDeniabilitySession(true));

    it('signAndBroadcastSolTrezor throws TREZOR_DENIABILITY_BLOCKED and never prompts the device', async () => {
      await expect(signAndBroadcastSolTrezor({
        networkKey: 'devnet', fromAddress: FROM, toAddress: TO, amountLamports: 100_000n,
      })).rejects.toThrow('TREZOR_DENIABILITY_BLOCKED');

      expect(h.trezorGetAddressSpy).not.toHaveBeenCalled();
      expect(h.trezorSignSpy).not.toHaveBeenCalled();
      expect(getBalanceLamports).not.toHaveBeenCalled();
      expect(getRentExemptMinimum).not.toHaveBeenCalled();
      expect(getLamportsPerSignature).not.toHaveBeenCalled();
      expect(getConnection).not.toHaveBeenCalled();
      expect(broadcastRawTx).not.toHaveBeenCalled();
    });

    it('signAndBroadcastSolLedger throws TREZOR_DENIABILITY_BLOCKED and never prompts the device', async () => {
      await expect(signAndBroadcastSolLedger({
        transport: {}, networkKey: 'devnet', fromAddress: FROM, toAddress: TO, amountLamports: 100_000n,
      })).rejects.toThrow('TREZOR_DENIABILITY_BLOCKED');

      expect(h.ledgerGetAddressSpy).not.toHaveBeenCalled();
      expect(h.ledgerSignSpy).not.toHaveBeenCalled();
      expect(getBalanceLamports).not.toHaveBeenCalled();
      expect(getConnection).not.toHaveBeenCalled();
      expect(broadcastRawTx).not.toHaveBeenCalled();
    });
  });

  describe('under the persisted demo flag (veyrnox-demo=1)', () => {
    beforeEach(() => { localStorage.setItem('veyrnox-demo', '1'); });

    it('signAndBroadcastSolTrezor fails closed (LIVE helper catches post-import flip)', async () => {
      await expect(signAndBroadcastSolTrezor({
        networkKey: 'devnet', fromAddress: FROM, toAddress: TO, amountLamports: 100_000n,
      })).rejects.toThrow('TREZOR_DENIABILITY_BLOCKED');
      expect(h.trezorGetAddressSpy).not.toHaveBeenCalled();
      expect(h.trezorSignSpy).not.toHaveBeenCalled();
    });

    it('signAndBroadcastSolLedger fails closed (LIVE helper catches post-import flip)', async () => {
      await expect(signAndBroadcastSolLedger({
        transport: {}, networkKey: 'devnet', fromAddress: FROM, toAddress: TO, amountLamports: 100_000n,
      })).rejects.toThrow('TREZOR_DENIABILITY_BLOCKED');
      expect(h.ledgerGetAddressSpy).not.toHaveBeenCalled();
      expect(h.ledgerSignSpy).not.toHaveBeenCalled();
    });
  });
});
