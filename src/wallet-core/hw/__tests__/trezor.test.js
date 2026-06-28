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

describe('trezorSignBtcTx', () => {
  beforeEach(() => vi.clearAllMocks());

  it('calls TrezorConnect.signTransaction with correct coin for testnet', async () => {
    TrezorConnect.signTransaction.mockResolvedValue({
      success: true,
      payload: { serializedTx: 'deadbeef01' },
    });

    const { trezorSignBtcTx } = await import('../trezor.js');

    const result = await trezorSignBtcTx({
      plan: {
        inputs: [{
          txid: 'abc123',
          vout: 0,
          amountSats: 100000n,
          scriptPubKey: '0014' + '00'.repeat(20),
        }],
        outputs: [{ address: 'tb1qtest', amountSats: 90000n }],
        changeAddress: 'tb1qchange',
        changeAmountSats: 9000n,
      },
      networkKey: 'btc-testnet',
    });

    expect(result).toBe('deadbeef01');
    const call = TrezorConnect.signTransaction.mock.calls[0][0];
    expect(call.coin).toBe('tbtc');
    expect(call.inputs[0].prev_hash).toBe('abc123');
    expect(call.inputs[0].amount).toBe('100000');
    expect(call.inputs[0].script_type).toBe('SPENDWITNESS');
    expect(call.outputs[0].address).toBe('tb1qtest');
    expect(call.outputs[0].amount).toBe('90000');
  });

  it('uses btc coin for mainnet', async () => {
    TrezorConnect.signTransaction.mockResolvedValue({
      success: true,
      payload: { serializedTx: 'cafebabe' },
    });

    const { trezorSignBtcTx } = await import('../trezor.js');

    await trezorSignBtcTx({
      plan: {
        inputs: [{ txid: 'abc', vout: 0, amountSats: 50000n, scriptPubKey: '0014' + '00'.repeat(20) }],
        outputs: [{ address: 'bc1qtest', amountSats: 49000n }],
        changeAddress: 'bc1qchange',
        changeAmountSats: 0n,
      },
      networkKey: 'btc-mainnet',
    });

    expect(TrezorConnect.signTransaction.mock.calls[0][0].coin).toBe('btc');
  });

  it('throws on Trezor failure', async () => {
    TrezorConnect.signTransaction.mockResolvedValue({
      success: false,
      payload: { error: 'Cancelled' },
    });

    const { trezorSignBtcTx } = await import('../trezor.js');

    await expect(trezorSignBtcTx({
      plan: {
        inputs: [{ txid: 'x', vout: 0, amountSats: 1000n, scriptPubKey: '0014' + '00'.repeat(20) }],
        outputs: [{ address: 'tb1q', amountSats: 900n }],
        changeAddress: 'tb1q2',
        changeAmountSats: 0n,
      },
      networkKey: 'btc-testnet',
    })).rejects.toThrow('Cancelled');
  });
});

describe('trezorSignSolTx', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns signed tx base64 on success', async () => {
    TrezorConnect.solanaSignTransaction.mockResolvedValue({
      success: true,
      payload: { signature: 'aabbcc' },
    });

    const { trezorSignSolTx } = await import('../trezor.js');

    const result = await trezorSignSolTx({
      serializedTxBase64: btoa('fakeunsignedtx'),
      networkKey: 'sol-devnet',
    });

    // Result is a base64 string
    expect(typeof result).toBe('string');
    const call = TrezorConnect.solanaSignTransaction.mock.calls[0][0];
    expect(call.path).toBe("m/44'/501'/0'/0'");
  });

  it('throws on Trezor failure', async () => {
    TrezorConnect.solanaSignTransaction.mockResolvedValue({
      success: false,
      payload: { error: 'Denied' },
    });

    const { trezorSignSolTx } = await import('../trezor.js');

    await expect(trezorSignSolTx({
      serializedTxBase64: btoa('tx'),
      networkKey: 'sol-devnet',
    })).rejects.toThrow('Denied');
  });
});
