// src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx
//
// Request-time alerts. Part A (this file, first describe): a known-bad connected
// dApp domain surfaces a RISK alert on every request. (No jest-dom — core matchers.)

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { RequestApprovalModal } from '@/components/walletconnect/RequestApprovalModal.jsx';

vi.mock('@/lib/WalletConnectProvider.jsx', () => ({
  useWalletConnect: () => ({
    signPersonal: vi.fn(),
    signTypedData: vi.fn(),
    sendTransaction: vi.fn(),
    rejectRequest: vi.fn(),
    isSendReauthRequired: () => false,
    evmAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  }),
}));

afterEach(cleanup);

function personalSignRequest(url) {
  return {
    topic: 't', id: 1, type: 'personal_sign', blocked: false, typedDataMeta: null,
    params: {
      request: { method: 'personal_sign', params: ['0x48656c6c6f'] }, // "Hello"
      proposer: { metadata: { name: 'Bad dApp', url } },
    },
  };
}

describe('RequestApprovalModal — connected known-bad dApp domain', () => {
  it('surfaces a RISK alert when the connected dApp domain is known-bad', () => {
    render(<RequestApprovalModal request={personalSignRequest('https://airdrop-claim2024.io')} onClose={vi.fn()} />);
    expect(screen.getByText(/known scam/i)).toBeTruthy();
  });

  it('shows no scam alert for a clean connected dApp domain', () => {
    render(<RequestApprovalModal request={personalSignRequest('https://app.example.org')} onClose={vi.fn()} />);
    expect(screen.queryByText(/known scam/i)).toBeNull();
  });
});
