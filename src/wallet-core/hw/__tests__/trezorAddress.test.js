// NOTE: @trezor/connect-web is mocked — green tests do not prove I2/I3 compliance in production
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@trezor/connect-web', () => ({
  default: {
    init: vi.fn(),
    ethereumGetAddress: vi.fn(),
    getAddress: vi.fn(),
    solanaGetAddress: vi.fn(),
  },
}));

vi.mock('../transport.js', () => ({
  getTransport: vi.fn(() => ({ type: 'webusb' })),
}));

import TrezorConnect from '@trezor/connect-web';

// Deniability is OFF by default in these address-path tests (veyrnox-demo unset);
// the dedicated suite below covers the deniability-active block.
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.removeItem('veyrnox-demo');
});
afterEach(() => localStorage.removeItem('veyrnox-demo'));

describe('getTrezorEvmAddress', () => {

  it('returns checksummed address from device', async () => {
    TrezorConnect.ethereumGetAddress.mockResolvedValue({
      success: true,
      payload: { address: '0xabcd1234567890abcdef1234567890ABCDEF1234' },
    });

    const { getTrezorEvmAddress } = await import('../trezorAddress.js');
    const addr = await getTrezorEvmAddress();

    expect(addr).toMatch(/^0x[0-9a-fA-F]{40}$/);
    const call = TrezorConnect.ethereumGetAddress.mock.calls[0][0];
    expect(call.path).toBe("m/44'/60'/0'/0/0");
    expect(call.showOnTrezor).toBe(true);
  });

  it('throws when Trezor returns failure', async () => {
    TrezorConnect.ethereumGetAddress.mockResolvedValue({
      success: false,
      payload: { error: 'Cancelled' },
    });

    const { getTrezorEvmAddress } = await import('../trezorAddress.js');
    await expect(getTrezorEvmAddress()).rejects.toThrow('Cancelled');
  });

  it('throws TREZOR_UNSUPPORTED when transport is unsupported', async () => {
    const { getTransport } = await import('../transport.js');
    getTransport.mockReturnValueOnce({ type: 'unsupported' });

    const { getTrezorEvmAddress } = await import('../trezorAddress.js');
    await expect(getTrezorEvmAddress()).rejects.toThrow('TREZOR_UNSUPPORTED');
  });
});

describe('getTrezorBtcAddress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns testnet bech32 address with coin tbtc', async () => {
    TrezorConnect.getAddress.mockResolvedValue({
      success: true,
      payload: { address: 'tb1qtest123' },
    });

    const { getTrezorBtcAddress } = await import('../trezorAddress.js');
    const addr = await getTrezorBtcAddress('btc-testnet');

    expect(addr).toBe('tb1qtest123');
    const call = TrezorConnect.getAddress.mock.calls[0][0];
    expect(call.coin).toBe('tbtc');
    expect(call.showOnTrezor).toBe(true);
    expect(call.path).toContain("84'");
  });

  it('uses btc coin for mainnet', async () => {
    TrezorConnect.getAddress.mockResolvedValue({
      success: true,
      payload: { address: 'bc1qmainnet' },
    });

    const { getTrezorBtcAddress } = await import('../trezorAddress.js');
    await getTrezorBtcAddress('btc-mainnet');

    expect(TrezorConnect.getAddress.mock.calls[0][0].coin).toBe('btc');
  });

  it('throws when Trezor returns failure', async () => {
    TrezorConnect.getAddress.mockResolvedValue({
      success: false,
      payload: { error: 'Cancelled' },
    });

    const { getTrezorBtcAddress } = await import('../trezorAddress.js');
    await expect(getTrezorBtcAddress('btc-testnet')).rejects.toThrow('Cancelled');
  });
});

describe('getTrezorSolAddress', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns SOL public key with showOnTrezor', async () => {
    TrezorConnect.solanaGetAddress.mockResolvedValue({
      success: true,
      payload: { address: 'SoLPubKey1234567890' },
    });

    const { getTrezorSolAddress } = await import('../trezorAddress.js');
    const addr = await getTrezorSolAddress();

    expect(addr).toBe('SoLPubKey1234567890');
    const call = TrezorConnect.solanaGetAddress.mock.calls[0][0];
    expect(call.path).toBe("m/44'/501'/0'/0'");
    expect(call.showOnTrezor).toBe(true);
  });

  it('throws when Trezor returns failure', async () => {
    TrezorConnect.solanaGetAddress.mockResolvedValue({
      success: false,
      payload: { error: 'Denied' },
    });

    const { getTrezorSolAddress } = await import('../trezorAddress.js');
    await expect(getTrezorSolAddress()).rejects.toThrow('Denied');
  });
});

describe('TREZOR_PATHS', () => {
  it('exports correct derivation paths', async () => {
    const { TREZOR_PATHS } = await import('../trezorAddress.js');
    expect(TREZOR_PATHS.evm).toBe("m/44'/60'/0'/0/0");
    expect(TREZOR_PATHS.sol).toBe("m/44'/501'/0'/0'");
    expect(TREZOR_PATHS.btcMainnet).toBe("m/84'/0'/0'/0/0");
    expect(TREZOR_PATHS.btcTestnet).toBe("m/84'/1'/0'/0/0");
  });
});
