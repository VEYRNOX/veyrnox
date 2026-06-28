// src/components/walletconnect/__tests__/RequestApprovalModal.test.jsx
//
// Request-time alerts. Part A (this file, first describe): a known-bad connected
// dApp domain surfaces a RISK alert on every request. (No jest-dom — core matchers.)

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { RequestApprovalModal } from '@/components/walletconnect/RequestApprovalModal.jsx';

// recipientCode comes from the tested simulation — mock it so no real RPC is hit.
vi.mock('@/wallet-core/evm/simulate.js', () => ({
  simulateEvmTransaction: vi.fn(async () => ({ recipientCode: '0x6080' })), // a contract
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: (id) => (id === 1
    ? { key: 'mainnet', name: 'Ethereum Mainnet', symbol: 'ETH', isTestnet: false }
    : { key: 'sepolia', name: 'Sepolia Testnet', symbol: 'ETH', isTestnet: true }),
}));

// The live sessions the modal looks up by topic. Tests mutate this before render.
let mockSessions = [];
// resolvePersonalSignMessage is a pure helper exported from WalletConnectProvider.
// Inline the implementation here so the modal can call it without pulling in
// @reown/walletkit (which is not installed in the test environment).
function resolvePersonalSignMessage(params, ownAddress) {
  if (!ownAddress) return { ok: false, code: 'PERSONAL_SIGN_NO_WALLET' };
  const arr = Array.isArray(params) ? params : [];
  const isOwn = (v) => typeof v === 'string' && v.toLowerCase() === ownAddress.toLowerCase();
  if (isOwn(arr[1])) return { ok: true, message: arr[0] };
  if (isOwn(arr[0])) return { ok: true, message: arr[1] };
  return { ok: false, code: 'PERSONAL_SIGN_ADDRESS_MISMATCH' };
}
vi.mock('@/lib/WalletConnectProvider.jsx', () => ({
  resolvePersonalSignMessage,
  useWalletConnect: () => ({
    signPersonal: vi.fn(),
    signTypedData: vi.fn(),
    sendTransaction: vi.fn(),
    rejectRequest: vi.fn(),
    isSendReauthRequired: () => false,
    evmAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    sessions: mockSessions,
  }),
}));

afterEach(() => { cleanup(); mockSessions.length = 0; });

function personalSignRequest(url) {
  // The dApp identity lives on the live session (looked up by topic), so register
  // it before returning the bare session_request the modal will receive.
  mockSessions.push({ topic: 't', peer: { metadata: { name: 'dApp', url } } });
  return {
    topic: 't', id: 1, type: 'personal_sign', blocked: false, typedDataMeta: null,
    params: {
      request: { method: 'personal_sign', params: ['0x48656c6c6f'] }, // "Hello"
    },
  };
}

// session_request events carry NO proposer; the dApp identity lives on the live
// session, looked up by topic, at session.peer.metadata. C4: the phishing check
// must read THAT, not request.params.proposer.metadata.
function sessionRequest(topic) {
  return {
    topic, id: 9, type: 'personal_sign', blocked: false, typedDataMeta: null,
    params: { request: { method: 'personal_sign', params: ['0x48656c6c6f'] } },
  };
}

describe('RequestApprovalModal — phishing check uses session.peer.metadata (C4)', () => {
  it('flags a known-bad dApp whose domain is on the live session, not on the request', () => {
    mockSessions.push({ topic: 'abc', peer: { metadata: { name: 'Bad dApp', url: 'https://airdrop-claim2024.io' } } });
    render(<RequestApprovalModal request={sessionRequest('abc')} onClose={vi.fn()} />);
    expect(screen.getByText(/known scam/i)).toBeTruthy();
  });

  it('shows no scam alert for a clean dApp domain on the live session', () => {
    mockSessions.push({ topic: 'abc', peer: { metadata: { name: 'Good dApp', url: 'https://app.example.org' } } });
    render(<RequestApprovalModal request={sessionRequest('abc')} onClose={vi.fn()} />);
    expect(screen.queryByText(/known scam/i)).toBeNull();
  });

  it('fails closed: no matching live session -> treated as suspicious (flagged)', () => {
    // mockSessions is empty; topic does not resolve.
    render(<RequestApprovalModal request={sessionRequest('missing')} onClose={vi.fn()} />);
    expect(screen.getByText(/known scam/i)).toBeTruthy();
  });
});

describe('RequestApprovalModal — connected known-bad dApp domain', () => {
  it('surfaces a RISK alert when the live session domain is known-bad', () => {
    render(<RequestApprovalModal request={personalSignRequest('https://airdrop-claim2024.io')} onClose={vi.fn()} />);
    expect(screen.getByText(/known scam/i)).toBeTruthy();
  });

  it('shows no scam alert for a clean live session domain', () => {
    render(<RequestApprovalModal request={personalSignRequest('https://app.example.org')} onClose={vi.fn()} />);
    expect(screen.queryByText(/known scam/i)).toBeNull();
  });

  it('fails closed when no live session matches the request topic', () => {
    // personalSignRequest with no url still pushes a session with undefined url;
    // test the case where no session matches at all by using sessionRequest directly.
    render(<RequestApprovalModal request={sessionRequest('no-match')} onClose={vi.fn()} />);
    expect(screen.getByText(/known scam/i)).toBeTruthy();
  });
});

// approve(spender=...dead, value=MaxUint256) — unlimited-approval drainer calldata.
const APPROVE_UNLIMITED =
  '0x095ea7b3' +
  '000000000000000000000000000000000000000000000000000000000000dead' +
  'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff';

function sendTxRequest(data) {
  mockSessions.push({ topic: 't', peer: { metadata: { name: 'Some dApp', url: 'https://app.example.org' } } });
  return {
    topic: 't', id: 2, type: 'send_transaction', blocked: false, typedDataMeta: null,
    params: {
      chainId: 'eip155:11155111',
      request: {
        method: 'eth_sendTransaction',
        params: [{ to: '0x1111111111111111111111111111111111111111', value: '0x0', data }],
      },
    },
  };
}

describe('RequestApprovalModal — eth_sendTransaction risk scoring', () => {
  it('scores an unlimited approval as RISK and blocks Approve until both acknowledgements are checked', async () => {
    render(<RequestApprovalModal request={sendTxRequest(APPROVE_UNLIMITED)} onClose={vi.fn()} />);

    // The risk verdict resolves after the (mocked) simulation; its sentence appears.
    await screen.findByText(/unlimited spending/i);

    const approve = screen.getByRole('button', { name: /^approve$/i });
    expect(approve.disabled).toBe(true);

    // Two gates now: the existing broadcast ack + the RISK ack in the banner.
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.length).toBe(2);
    boxes.forEach((b) => fireEvent.click(b));
    expect(approve.disabled).toBe(false);
  });
});

function sendTxOnChain(caip2) {
  mockSessions.push({ topic: 't', peer: { metadata: { name: 'Some dApp', url: 'https://app.example.org' } } });
  return {
    topic: 't', id: 3, type: 'send_transaction', blocked: false, typedDataMeta: null,
    params: {
      chainId: caip2,
      request: {
        method: 'eth_sendTransaction',
        params: [{ to: '0x1111111111111111111111111111111111111111', value: '0x16345785d8a0000', data: '0x' }],
      },
    },
  };
}

describe('RequestApprovalModal — network shown on send (mainnet vs testnet)', () => {
  it('shows the testnet network name and no real-funds warning', async () => {
    render(<RequestApprovalModal request={sendTxOnChain('eip155:11155111')} onClose={vi.fn()} />);
    expect(await screen.findByText(/sepolia testnet/i)).toBeTruthy();
    expect(screen.queryByText(/real funds/i)).toBeNull();
  });

  it('names the mainnet network AND flags it as REAL FUNDS', async () => {
    render(<RequestApprovalModal request={sendTxOnChain('eip155:1')} onClose={vi.fn()} />);
    expect(await screen.findByText(/ethereum mainnet/i)).toBeTruthy();
    expect(screen.getByText(/real funds/i)).toBeTruthy();
  });
});
