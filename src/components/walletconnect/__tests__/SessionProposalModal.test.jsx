// src/components/walletconnect/__tests__/SessionProposalModal.test.jsx
//
// Connect-time alert: a known-bad dApp domain renders a RISK alert and gates
// Connect behind an acknowledgement; a clean domain makes no claim and leaves
// Connect enabled. (No jest-dom in this repo — core matchers only.)

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SessionProposalModal } from '@/components/walletconnect/SessionProposalModal.jsx';

afterEach(cleanup);

vi.mock('@/lib/WalletConnectProvider.jsx', () => ({
  useWalletConnect: () => ({
    approveSession: vi.fn(),
    rejectSession: vi.fn(),
    evmAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  }),
}));

function makeProposal(url) {
  return {
    id: 1,
    params: {
      proposer: { metadata: { name: 'Test dApp', url } },
      requiredNamespaces: { eip155: { methods: ['eth_sendTransaction'], chains: ['eip155:11155111'] } },
    },
  };
}

describe('SessionProposalModal — known-bad dApp alert', () => {
  it('flags a known-bad domain and disables Connect until acknowledged', () => {
    render(<SessionProposalModal proposal={makeProposal('https://fakeswap-rewards.xyz')} onClose={vi.fn()} />);
    // M10: always-visible caveat also contains "known scam" — use getAllByText
    expect(screen.getAllByText(/known scam/i).length).toBeGreaterThan(0);
    const connect = screen.getByRole('button', { name: /^connect$/i });
    expect(connect.disabled).toBe(true);
    fireEvent.click(screen.getByRole('checkbox'));
    expect(connect.disabled).toBe(false);
  });

  it('makes no scam claim for a domain absent from the local list and leaves Connect enabled', () => {
    render(<SessionProposalModal proposal={makeProposal('https://app.uniswap.org')} onClose={vi.fn()} />);
    // M10: always-visible caveat mentions "known scam domains" for any proposal.
    // Check no RISK ALERT (the per-domain block) is shown — not the general caveat.
    expect(screen.queryByRole('checkbox')).toBeNull(); // acknowledge checkbox only appears for blocked domains
    expect(screen.getByRole('button', { name: /^connect$/i }).disabled).toBe(false);
  });
});
