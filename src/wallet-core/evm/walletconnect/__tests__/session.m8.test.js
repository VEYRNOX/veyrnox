// M8 — structural validation of WalletConnect pairing URIs before client.pair().
// A malformed, v1, or param-missing URI must never reach the SDK pair() call
// (fail closed, I4). These tests pin the guard behaviour in pairWithDapp.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const pairMock = vi.fn().mockResolvedValue(undefined);

// Mock the WalletConnect SDK so initWalletConnect() yields a client with a spyable pair().
vi.mock('@walletconnect/core', () => ({
  Core: class {},
}));
vi.mock('@walletconnect/web3wallet', () => ({
  Web3Wallet: {
    init: vi.fn().mockResolvedValue({
      pair: pairMock,
      on: vi.fn(),
    }),
  },
}));
vi.mock('@walletconnect/utils', () => ({
  getSdkError: vi.fn(),
  buildApprovedNamespaces: vi.fn(),
}));
vi.mock('../router.js', () => ({ SUPPORTED_CHAIN_IDS: new Set([1]) }));

// PROJECT_ID must be truthy so initWalletConnect() returns a client.
vi.stubEnv('VITE_WALLETCONNECT_PROJECT_ID', 'test-project-id');

const { pairWithDapp } = await import('../session.js');

const SYM = 'a'.repeat(64);
const VALID = `wc:topic123@2?relay-protocol=irn&symKey=${SYM}`;

describe('M8 — pairWithDapp validates the WC v2 URI before the SDK', () => {
  beforeEach(() => {
    pairMock.mockClear();
  });

  it('accepts a valid v2 URI with relay-protocol and symKey', async () => {
    await expect(pairWithDapp(VALID)).resolves.toBeUndefined();
    expect(pairMock).toHaveBeenCalledTimes(1);
    expect(pairMock).toHaveBeenCalledWith({ uri: VALID });
  });

  it('rejects a URI missing the wc: prefix and never calls pair', async () => {
    await expect(pairWithDapp(`topic123@2?relay-protocol=irn&symKey=${SYM}`)).rejects.toThrow(/wc:/);
    expect(pairMock).not.toHaveBeenCalled();
  });

  it('rejects a version 1 URI and never calls pair', async () => {
    await expect(pairWithDapp(`wc:topic123@1?relay-protocol=irn&symKey=${SYM}`)).rejects.toThrow(/version/i);
    expect(pairMock).not.toHaveBeenCalled();
  });

  it('rejects a URI missing relay-protocol and never calls pair', async () => {
    await expect(pairWithDapp(`wc:topic123@2?symKey=${SYM}`)).rejects.toThrow(/relay-protocol/);
    expect(pairMock).not.toHaveBeenCalled();
  });

  it('rejects a URI missing symKey and never calls pair', async () => {
    await expect(pairWithDapp('wc:topic123@2?relay-protocol=irn')).rejects.toThrow(/symKey/);
    expect(pairMock).not.toHaveBeenCalled();
  });

  it('rejects a malformed symKey (not 64 hex) and never calls pair', async () => {
    await expect(
      pairWithDapp('wc:topic123@2?relay-protocol=irn&symKey=not-hex'),
    ).rejects.toThrow(/symKey/);
    expect(pairMock).not.toHaveBeenCalled();
  });
});
