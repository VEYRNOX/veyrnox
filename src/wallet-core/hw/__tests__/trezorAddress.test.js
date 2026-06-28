import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// NOTE: @trezor/connect-web is mocked — green tests do NOT prove I2/I3 compliance.
// The real module bootstraps a remote iframe from https://connect.trezor.io on every
// call (silent off-device egress). Mocking it ERASES that egress path, so a passing
// suite here cannot demonstrate the feature is deniability/egress safe. The feature is
// HONEST-DISABLED in source for exactly this reason.
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

beforeEach(() => {
  vi.clearAllMocks();
  try {
    localStorage.removeItem('veyrnox-demo');
  } catch {
    /* no-op */
  }
});

afterEach(() => {
  try {
    localStorage.removeItem('veyrnox-demo');
  } catch {
    /* no-op */
  }
});

describe('Trezor integration — HONEST-DISABLED (I2/I3 egress)', () => {
  it('getTrezorEvmAddress throws HONEST_DISABLED', async () => {
    const { getTrezorEvmAddress } = await import('../trezorAddress.js');
    await expect(getTrezorEvmAddress()).rejects.toMatchObject({ code: 'HONEST_DISABLED' });
  });

  it('getTrezorBtcAddress throws HONEST_DISABLED', async () => {
    const { getTrezorBtcAddress } = await import('../trezorAddress.js');
    await expect(getTrezorBtcAddress('btc-testnet')).rejects.toMatchObject({
      code: 'HONEST_DISABLED',
    });
  });

  it('getTrezorSolAddress throws HONEST_DISABLED', async () => {
    const { getTrezorSolAddress } = await import('../trezorAddress.js');
    await expect(getTrezorSolAddress()).rejects.toMatchObject({ code: 'HONEST_DISABLED' });
  });

  it('never calls the remote-bootstrapping TrezorConnect when disabled', async () => {
    const TrezorConnect = (await import('@trezor/connect-web')).default;
    const { getTrezorEvmAddress } = await import('../trezorAddress.js');
    await getTrezorEvmAddress().catch(() => {});
    expect(TrezorConnect.init).not.toHaveBeenCalled();
    expect(TrezorConnect.ethereumGetAddress).not.toHaveBeenCalled();
  });
});

describe('Trezor integration — deniability guard (I3) survives re-enable', () => {
  // The deniability guard runs BEFORE the HONEST_DISABLED throw, so when the
  // feature is later re-enabled it still fails closed in deniability/demo mode.
  it('throws DENIABILITY_BLOCKED when veyrnox-demo is active (EVM)', async () => {
    localStorage.setItem('veyrnox-demo', '1');
    const { getTrezorEvmAddress } = await import('../trezorAddress.js');
    await expect(getTrezorEvmAddress()).rejects.toMatchObject({ code: 'DENIABILITY_BLOCKED' });
  });

  it('throws DENIABILITY_BLOCKED when veyrnox-demo is active (BTC)', async () => {
    localStorage.setItem('veyrnox-demo', '1');
    const { getTrezorBtcAddress } = await import('../trezorAddress.js');
    await expect(getTrezorBtcAddress('btc-testnet')).rejects.toMatchObject({
      code: 'DENIABILITY_BLOCKED',
    });
  });

  it('throws DENIABILITY_BLOCKED when veyrnox-demo is active (SOL)', async () => {
    localStorage.setItem('veyrnox-demo', '1');
    const { getTrezorSolAddress } = await import('../trezorAddress.js');
    await expect(getTrezorSolAddress()).rejects.toMatchObject({ code: 'DENIABILITY_BLOCKED' });
  });
});

// Derivation-path contract — these pin the paths that the re-enabled implementation
// MUST use (the constants live outside the disabled functions and stay testable).
// They must agree with the app's own derivation (SOL: wallet-core/sol/derivation.js
// solPath(0) === m/44'/501'/0'/0').
describe('Trezor derivation paths (contract for re-enable)', () => {
  it('exports the expected EVM / SOL / BTC paths', async () => {
    const mod = await import('../trezorAddress.js');
    expect(mod.TREZOR_PATHS.evm).toBe("m/44'/60'/0'/0/0");
    expect(mod.TREZOR_PATHS.sol).toBe("m/44'/501'/0'/0'");
    expect(mod.TREZOR_PATHS.btcMainnet).toBe("m/84'/0'/0'/0/0");
    expect(mod.TREZOR_PATHS.btcTestnet).toBe("m/84'/1'/0'/0/0");
  });

  it('SOL path matches the app derivation (wallet-core/sol/derivation.js)', async () => {
    const { solPath } = await import('../../sol/derivation.js');
    const { TREZOR_PATHS } = await import('../trezorAddress.js');
    expect(TREZOR_PATHS.sol).toBe(solPath(0));
  });
});
