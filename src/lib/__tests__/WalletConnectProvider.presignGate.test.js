// src/lib/__tests__/WalletConnectProvider.presignGate.test.js
//
// Security gate tests: presignGate wired into all three WalletConnect signing handlers.
//
// Security fix: C3/H11 audit remediation — wire presignGate into all three
// WalletConnect signing handlers so RASP environment checks cannot be bypassed
// via WalletConnect.

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Hoisted mocks (avoid top-level variable hoisting issues) ──────────────────

const {
  mockPresignGate,
  mockDetect,
  mockDegrade,
  mockRespondToRequest,
  mockRejectRequest,
  mockWithPrivateKey,
  TIER,
} = vi.hoisted(() => ({
  mockPresignGate: vi.fn(),
  mockDetect: vi.fn(),
  mockDegrade: vi.fn(),
  mockRespondToRequest: vi.fn(),
  mockRejectRequest: vi.fn(),
  mockWithPrivateKey: vi.fn(),
  TIER: { ALLOW: 'allow', WARN: 'warn', BLOCK: 'block' },
}));

vi.mock('@/sign-gate/presign', () => ({
  presignGate: mockPresignGate,
}));

vi.mock('@/rasp', () => ({
  detect: mockDetect,
  degrade: mockDegrade,
  browserProbeSource: {},
  TIER,
}));

vi.mock('@/wallet-core/evm/walletconnect/session.js', () => ({
  initWalletConnect: vi.fn().mockResolvedValue(undefined),
  onWalletConnectEvent: vi.fn(() => () => {}),
  getActiveSessions: vi.fn(() => []),
  destroyWalletConnect: vi.fn(),
  isWalletConnectConfigured: vi.fn(() => true),
  approveSession: vi.fn(),
  rejectSession: vi.fn(),
  respondToRequest: mockRespondToRequest,
  rejectRequest: mockRejectRequest,
  disconnectSession: vi.fn(),
  pairWithDapp: vi.fn(),
}));

vi.mock('@/wallet-core/evm/walletconnect/router.js', () => ({
  classifyRequest: vi.fn(() => 'personal_sign'),
  isBlocked: vi.fn(() => false),
  REQUEST_TYPES: {
    PERSONAL_SIGN: 'personal_sign',
    SIGN_TYPED_DATA: 'sign_typed_data',
    SEND_TRANSACTION: 'send_transaction',
  },
}));

vi.mock('@/wallet-core/evm/typed-data.js', () => ({
  parseTypedData: vi.fn(() => ({
    valid: true,
    error: null,
    types: { EIP712Domain: [], Order: [{ name: 'amount', type: 'uint256' }] },
    domain: { name: 'Test', chainId: 1 },
    message: { amount: '100' },
  })),
  detectAssetAuthorising: vi.fn(() => null),
  describeTypedData: vi.fn(() => 'test'),
}));

vi.mock('@/wallet-core/evm/provider.js', () => ({
  getProvider: vi.fn(() => ({
    send: vi.fn().mockResolvedValue('0xaa36a7'),
  })),
}));

vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: vi.fn(() => ({ key: 'sepolia', chainId: 11155111 })),
}));

vi.mock('@/lib/WalletProvider.jsx', () => ({
  useWallet: vi.fn(() => ({
    accounts: [{ address: '0xDeAdBeEf' }],
    isUnlocked: true,
    withPrivateKey: mockWithPrivateKey,
    isSendReauthRequired: vi.fn(() => false),
  })),
}));

vi.mock('ethers', () => {
  const signMessage = vi.fn().mockResolvedValue('0xsig');
  const signTypedData = vi.fn().mockResolvedValue('0xsig');
  const sendTransaction = vi.fn().mockResolvedValue({ hash: '0xhash' });
  return {
    ethers: {
      Wallet: vi.fn().mockImplementation(() => ({ signMessage, signTypedData, sendTransaction })),
      getBytes: vi.fn((x) => x),
    },
  };
});

vi.mock('sonner', () => ({ toast: { error: vi.fn() } }));

// ── Imports (after mocks) ─────────────────────────────────────────────────────

import { renderHook, act } from '@testing-library/react';
import React from 'react';
import { WalletConnectProvider, useWalletConnect } from '../WalletConnectProvider.jsx';

function wrapper({ children }) {
  return React.createElement(WalletConnectProvider, null, children);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('WalletConnectProvider — presignGate wiring (C3/H11)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDegrade.mockReturnValue({ tier: TIER.ALLOW });
    mockDetect.mockReturnValue({});
    mockRespondToRequest.mockResolvedValue(undefined);
    mockRejectRequest.mockResolvedValue(undefined);
  });

  // ── handlePersonalSign ────────────────────────────────────────────────────

  describe('handlePersonalSign', () => {
    it('A: proceeds (calls withPrivateKey) when presignGate returns proceedAllowed: true', async () => {
      mockPresignGate.mockReturnValue({ proceedAllowed: true });
      mockWithPrivateKey.mockResolvedValue('0xsig');

      const { result } = renderHook(() => useWalletConnect(), { wrapper });
      await act(async () => {
        await result.current.signPersonal('topic1', 1, ['0xdeadbeef', '0xaddr']);
      });

      expect(mockPresignGate).toHaveBeenCalledTimes(1);
      expect(mockWithPrivateKey).toHaveBeenCalledTimes(1);
    });

    it('B: rejects with RASP_BLOCK and does NOT call withPrivateKey when proceedAllowed: false', async () => {
      mockPresignGate.mockReturnValue({ proceedAllowed: false });

      const { result } = renderHook(() => useWalletConnect(), { wrapper });
      await act(async () => {
        await result.current.signPersonal('topic1', 1, ['0xdeadbeef', '0xaddr']);
      });

      expect(mockPresignGate).toHaveBeenCalledTimes(1);
      expect(mockWithPrivateKey).not.toHaveBeenCalled();
      expect(mockRejectRequest).toHaveBeenCalledTimes(1);
      const [topic, id, reason] = mockRejectRequest.mock.calls[0];
      expect(topic).toBe('topic1');
      expect(id).toBe(1);
      expect(String(reason ?? '')).toMatch(/RASP_BLOCK/);
    });
  });

  // ── handleSignTypedData ───────────────────────────────────────────────────

  describe('handleSignTypedData', () => {
    const typedDataJson = JSON.stringify({
      types: { EIP712Domain: [], Order: [{ name: 'amount', type: 'uint256' }] },
      domain: { name: 'Test', chainId: 1 },
      message: { amount: '100' },
      primaryType: 'Order',
    });

    it('A: proceeds when presignGate returns proceedAllowed: true', async () => {
      mockPresignGate.mockReturnValue({ proceedAllowed: true });
      mockWithPrivateKey.mockResolvedValue('0xsig');

      const { result } = renderHook(() => useWalletConnect(), { wrapper });
      await act(async () => {
        await result.current.signTypedData('topic2', 2, ['0xaddr', typedDataJson]);
      });

      expect(mockPresignGate).toHaveBeenCalledTimes(1);
      expect(mockWithPrivateKey).toHaveBeenCalledTimes(1);
    });

    it('B: rejects with RASP_BLOCK and does NOT call withPrivateKey when proceedAllowed: false', async () => {
      mockPresignGate.mockReturnValue({ proceedAllowed: false });

      const { result } = renderHook(() => useWalletConnect(), { wrapper });
      await act(async () => {
        await result.current.signTypedData('topic2', 2, ['0xaddr', typedDataJson]);
      });

      expect(mockPresignGate).toHaveBeenCalledTimes(1);
      expect(mockWithPrivateKey).not.toHaveBeenCalled();
      expect(mockRejectRequest).toHaveBeenCalledTimes(1);
      const [topic, id, reason] = mockRejectRequest.mock.calls[0];
      expect(topic).toBe('topic2');
      expect(id).toBe(2);
      expect(String(reason ?? '')).toMatch(/RASP_BLOCK/);
    });
  });

  // ── handleSendTransaction ─────────────────────────────────────────────────

  describe('handleSendTransaction', () => {
    const txParams = [{ to: '0xrecipient', value: '0x0', data: '0x' }];

    it('A: proceeds when presignGate returns proceedAllowed: true', async () => {
      mockPresignGate.mockReturnValue({ proceedAllowed: true });
      mockWithPrivateKey.mockResolvedValue('0xhash');

      const { result } = renderHook(() => useWalletConnect(), { wrapper });
      await act(async () => {
        await result.current.sendTransaction('topic3', 3, txParams, 'eip155:11155111');
      });

      expect(mockPresignGate).toHaveBeenCalledTimes(1);
      expect(mockWithPrivateKey).toHaveBeenCalledTimes(1);
    });

    it('B: rejects with RASP_BLOCK and does NOT call withPrivateKey when proceedAllowed: false', async () => {
      mockPresignGate.mockReturnValue({ proceedAllowed: false });

      const { result } = renderHook(() => useWalletConnect(), { wrapper });
      await act(async () => {
        await result.current.sendTransaction('topic3', 3, txParams, 'eip155:11155111');
      });

      expect(mockPresignGate).toHaveBeenCalledTimes(1);
      expect(mockWithPrivateKey).not.toHaveBeenCalled();
      expect(mockRejectRequest).toHaveBeenCalledTimes(1);
      const [topic, id, reason] = mockRejectRequest.mock.calls[0];
      expect(topic).toBe('topic3');
      expect(id).toBe(3);
      expect(String(reason ?? '')).toMatch(/RASP_BLOCK/);
    });
  });
});
