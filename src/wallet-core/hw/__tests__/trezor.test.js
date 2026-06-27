import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @trezor/connect-web
vi.mock('@trezor/connect-web', () => ({
  default: {
    init: vi.fn(),
    ethereumSignTransaction: vi.fn(),
    signTransaction: vi.fn(),
    solanaSignTransaction: vi.fn(),
  },
}));

// Mock transport
vi.mock('../transport.js', () => ({
  getTransport: vi.fn(() => ({ type: 'webusb' })),
}));

import TrezorConnect from '@trezor/connect-web';
import { ethers } from 'ethers';

describe('trezorSignEvmTx', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns a signed transaction hex on success', async () => {
    // Trezor returns v/r/s for the signature
    TrezorConnect.ethereumSignTransaction.mockResolvedValue({
      success: true,
      payload: {
        v: '0x1',
        r: '0x' + 'a'.repeat(64),
        s: '0x' + 'b'.repeat(64),
      },
    });

    const { trezorSignEvmTx } = await import('../trezor.js');

    const result = await trezorSignEvmTx({
      chainId: 11155111,
      nonce: 0,
      to: '0x1234567890123456789012345678901234567890',
      value: ethers.parseEther('0.001'),
      gasLimit: 21000n,
      maxFeePerGas: ethers.parseUnits('20', 'gwei'),
      maxPriorityFeePerGas: ethers.parseUnits('1', 'gwei'),
    });

    expect(result).toMatch(/^0x/);
    expect(TrezorConnect.ethereumSignTransaction).toHaveBeenCalledOnce();
    const call = TrezorConnect.ethereumSignTransaction.mock.calls[0][0];
    expect(call.path).toBe("m/44'/60'/0'/0/0");
    expect(call.transaction.chainId).toBe(11155111);
    expect(call.transaction.to).toBe('0x1234567890123456789012345678901234567890');
  });

  it('throws when Trezor returns failure', async () => {
    TrezorConnect.ethereumSignTransaction.mockResolvedValue({
      success: false,
      payload: { error: 'Action cancelled' },
    });

    const { trezorSignEvmTx } = await import('../trezor.js');

    await expect(trezorSignEvmTx({
      chainId: 11155111,
      nonce: 0,
      to: '0x1234567890123456789012345678901234567890',
      value: 1000n,
      gasLimit: 21000n,
      maxFeePerGas: 1000000000n,
      maxPriorityFeePerGas: 100000000n,
    })).rejects.toThrow('Action cancelled');
  });

  it('throws TREZOR_UNSUPPORTED when transport type is unsupported', async () => {
    const { getTransport } = await import('../transport.js');
    getTransport.mockReturnValueOnce({ type: 'unsupported' });

    const { trezorSignEvmTx } = await import('../trezor.js');

    await expect(trezorSignEvmTx({
      chainId: 1,
      nonce: 0,
      to: '0x1234567890123456789012345678901234567890',
      value: 1n,
      gasLimit: 21000n,
      maxFeePerGas: 1n,
      maxPriorityFeePerGas: 1n,
    })).rejects.toThrow('TREZOR_UNSUPPORTED');
  });
});
