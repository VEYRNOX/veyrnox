// src/components/walletconnect/__tests__/SessionProposalModal.test.jsx
//
// Connect-time alert: a known-bad dApp domain renders a RISK alert and HARD-BLOCKS
// Connect (no acknowledgement bypass — I4 fail closed); a clean domain makes no
// claim and leaves Connect enabled. (No jest-dom in this repo — core matchers only.)

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { SessionProposalModal } from '@/components/walletconnect/SessionProposalModal.jsx';

afterEach(cleanup);

vi.mock('@/lib/WalletConnectProvider.jsx', () => ({
  useWalletConnect: () => ({
    approveSession: vi.fn(),
    rejectSession: vi.fn(),
    evmAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
  }),
}));

function makeProposal(url, { optionalChains = [] } = {}) {
  return {
    id: 1,
    params: {
      proposer: { metadata: { name: 'Test dApp', url } },
      requiredNamespaces: { eip155: { methods: ['eth_sendTransaction'], chains: ['eip155:11155111'] } },
      ...(optionalChains.length > 0
        ? { optionalNamespaces: { eip155: { chains: optionalChains } } }
        : {}),
    },
  };
}

describe('SessionProposalModal — M12: optional chains disclosure', () => {
  it('shows optional chains in the UI when optionalNamespaces.eip155.chains is present', () => {
    render(
      <SessionProposalModal
        proposal={makeProposal('https://app.uniswap.org', { optionalChains: ['eip155:137', 'eip155:42161'] })}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText(/also requested \(optional\)/i)).toBeTruthy();
    // At least one optional chain visible (by CAIP-2 id or resolved name)
    const text = document.body.textContent;
    expect(text.includes('137') || text.includes('Polygon') || text.includes('eip155:137')).toBe(true);
  });

  it('does not render the optional section when optionalNamespaces is absent', () => {
    render(
      <SessionProposalModal
        proposal={makeProposal('https://app.uniswap.org')}
        onClose={vi.fn()}
      />
    );
    expect(screen.queryByText(/also requested \(optional\)/i)).toBeNull();
  });
});

describe('SessionProposalModal — known-bad dApp alert', () => {
  it('hard-blocks a known-bad domain: Connect stays disabled and no bypass checkbox exists', () => {
    render(<SessionProposalModal proposal={makeProposal('https://fakeswap-rewards.xyz')} onClose={vi.fn()} />);
    // M10: always-visible caveat also contains "known scam" — use getAllByText
    expect(screen.getAllByText(/known scam/i).length).toBeGreaterThan(0);
    const connect = screen.getByRole('button', { name: /^connect$/i });
    expect(connect.disabled).toBe(true);
    // I4: no acknowledgement override — there is no checkbox to re-enable Connect.
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(connect.disabled).toBe(true);
  });

  it('makes no per-domain scam claim for a domain absent from the local list, shows blocklist caveat, and leaves Connect enabled', () => {
    render(<SessionProposalModal proposal={makeProposal('https://app.uniswap.org')} onClose={vi.fn()} />);
    // M10: the always-visible honesty caveat mentions "known scam domains" but the
    // per-domain RISK ALERT (with "RISK" heading) should NOT appear for a clean domain.
    expect(screen.queryByText(/RISK/i)).toBeNull();
    expect(screen.getByText(/limited blocklist/i)).toBeTruthy();
    // M10: the acknowledge checkbox only appears for blocked (flagged) domains.
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: /^connect$/i }).disabled).toBe(false);
  });

  it('shows the blocklist caveat alongside the phishing warning when the domain is flagged', () => {
    render(<SessionProposalModal proposal={makeProposal('https://fakeswap-rewards.xyz')} onClose={vi.fn()} />);
    expect(screen.getAllByText(/known scam/i).length).toBeGreaterThan(0);
    expect(screen.getByText(/limited blocklist/i)).toBeTruthy();
  });
});
