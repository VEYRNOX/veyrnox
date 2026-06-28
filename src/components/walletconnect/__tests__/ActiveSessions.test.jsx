// src/components/walletconnect/__tests__/ActiveSessions.test.jsx
//
// The Active-sessions list must stay tidy with one OR many connected dApps:
// uniform cards, host (not full URL) shown, chains as chips, expired sessions
// marked, an icon fallback when a dApp has none, and a per-dApp accessible
// Revoke control. (No jest-dom — core matchers only.)

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ActiveSessions } from '@/components/walletconnect/ActiveSessions.jsx';

const disconnect = vi.fn();
let mockSessions = [];
vi.mock('@/lib/WalletConnectProvider.jsx', () => ({
  useWalletConnect: () => ({ sessions: mockSessions, disconnect, refreshSessions: vi.fn() }),
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: (id) => (
    { 11155111: { name: 'Sepolia Testnet' }, 1: { name: 'Ethereum Mainnet' } }[id] || { name: `Chain ${id}` }
  ),
}));

afterEach(() => { cleanup(); mockSessions = []; });

const FUTURE = Math.floor(Date.now() / 1000) + 86400;
const PAST = Math.floor(Date.now() / 1000) - 86400;

function session({ topic = 't1', name, url, icons, accounts = ['eip155:11155111:0xabc'], expiry = FUTURE } = {}) {
  return { topic, expiry, peer: { metadata: { name, url, icons } }, namespaces: { eip155: { accounts } } };
}

describe('ActiveSessions', () => {
  it('shows an empty state when no dApps are connected', () => {
    mockSessions = [];
    render(<ActiveSessions />);
    expect(screen.getByText(/no dapps connected yet/i)).toBeTruthy();
  });

  it('renders many dApps with name, bare host, chain chips and a per-dApp Revoke', () => {
    mockSessions = [
      session({ topic: 'a', name: 'Uniswap', url: 'https://app.uniswap.org/', accounts: ['eip155:11155111:0x1'] }),
      session({ topic: 'b', name: 'Aave', url: 'https://aave.com', accounts: ['eip155:1:0x2'] }),
    ];
    render(<ActiveSessions />);
    expect(screen.getByText('Uniswap')).toBeTruthy();
    expect(screen.getByText('app.uniswap.org')).toBeTruthy(); // scheme + trailing slash stripped
    expect(screen.getByText('Sepolia Testnet')).toBeTruthy();  // chain chip
    expect(screen.getByText('Ethereum Mainnet')).toBeTruthy();
    expect(screen.getAllByRole('button', { name: /revoke connection to/i }).length).toBe(2);
  });

  it('marks an expired session and gives Revoke an accessible per-dApp label', () => {
    mockSessions = [session({ topic: 'x', name: 'OldDapp', url: 'https://old.example', expiry: PAST })];
    render(<ActiveSessions />);
    expect(screen.getByText(/^Expired$/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Revoke connection to OldDapp' })).toBeTruthy();
  });

  it('falls back to an initial (no broken img) when a dApp has no icon', () => {
    mockSessions = [session({ topic: 'n', name: 'Zora', url: 'https://zora.co', icons: undefined })];
    render(<ActiveSessions />);
    expect(screen.getByText('Zora')).toBeTruthy();
    expect(document.querySelector('img')).toBeNull();
  });
});
