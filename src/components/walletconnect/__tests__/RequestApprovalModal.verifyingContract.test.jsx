// src/components/walletconnect/__tests__/RequestApprovalModal.verifyingContract.test.jsx
//
// Audit 2026-08-03 M-1 — the EIP-712 verifyingContract was computed for display
// and then never rendered.
//
// describeTypedData() explicitly returns `contract: domain.verifyingContract`
// and `chainId: domain.chainId`, and its own test suite documents the intent:
// "surfaces chainId and verifyingContract so the user can tell chains apart",
// and "the SAME struct under a DIFFERENT verifyingContract produces a DIFFERENT
// description". But the modal rendered only `description.summary` — which is
// `${primaryType} on ${domain.name}`, and `domain.name` is a free-text string
// the dApp chooses — plus the message fields.
//
// So for a Permit, the only asset identity on screen was a NAME the attacker
// controls. The contract the signature actually authorises was invisible. A
// phishing dApp sets domain.name to "USD Coin" while verifyingContract points at
// something else entirely; H7 validates the chainId, so nothing rejects it, and
// the modal looks legitimate.
//
// H7 already binds and enforces domain.chainId (WalletConnectProvider), so the
// chain axis was never the gap — this is the contract-identity axis only.

import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('react-i18next', async () => {
  const actual = /** @type {any} */ (await vi.importActual('react-i18next'));
  const security = /** @type {any} */ (await import('@/i18n/locales/en/security.json'));
  const common = /** @type {any} */ (await import('@/i18n/locales/en/common.json'));
  const bundles = { security: security.default, common: common.default };
  const resolve = (key, opts = {}) => {
    const ns = opts.ns || 'common';
    let v = bundles[ns];
    for (const p of String(key).split('.')) v = v?.[p];
    if (opts.returnObjects) return v ?? [];
    if (typeof v !== 'string') return key;
    return v.replace(/\{\{(\w+)\}\}/g, (_, k) => (k in opts ? String(opts[k]) : `{{${k}}}`));
  };
  return { ...actual, useTranslation: (ns) => ({ t: (k, o) => resolve(k, { ns, ...(o || {}) }) }) };
});
vi.mock('@/lib/TierProvider', () => ({
  useTier: () => ({ currentTier: 'ai_security_protection' }),
}));

import { render, screen, cleanup } from '@testing-library/react';
import { RequestApprovalModal } from '@/components/walletconnect/RequestApprovalModal.jsx';

vi.mock('@/wallet-core/evm/simulate.js', () => ({
  simulateEvmTransaction: vi.fn(async () => ({ recipientCode: '0x' })),
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: () => ({ key: 'mainnet', name: 'Ethereum Mainnet', symbol: 'ETH', isTestnet: false }),
}));

let mockSessions = [];
vi.mock('@/lib/WalletConnectProvider.jsx', () => ({
  resolvePersonalSignMessage: () => ({ ok: false, code: 'PERSONAL_SIGN_NO_WALLET' }),
  useWalletConnect: () => ({
    signPersonal: vi.fn(),
    signTypedData: vi.fn(),
    sendTransaction: vi.fn(),
    rejectRequest: vi.fn(),
    isSendReauthRequired: () => false,
    evmAddress: '0x2222222222222222222222222222222222222222',
    sessions: mockSessions,
  }),
}));

afterEach(() => { cleanup(); mockSessions = []; });

const REAL_USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48';
const IMPOSTOR = '0xDEaDbeefDEadBEEFdeAdbEEfDeadBEeFdeadbEEF';

function typedDataRequest(contract, { name = 'USD Coin' } = {}) {
  mockSessions.push({ topic: 't', peer: { metadata: { name: 'Some dApp', url: 'https://app.example.org' } } });
  return {
    topic: 't', id: 11, type: 'sign_typed_data', blocked: false,
    typedDataMeta: {
      assetAuthorising: { isAssetAuthorising: false },
      description: {
        summary: `Permit on ${name}`,
        appName: name,
        chainId: 1,
        contract,
        primaryType: 'Permit',
        fields: [
          { name: 'spender', value: '0x1111111111111111111111111111111111111111' },
          { name: 'value', value: '1000000' },
        ],
      },
    },
    params: {
      chainId: 'eip155:1',
      request: { method: 'eth_signTypedData_v4', params: ['0x2222222222222222222222222222222222222222', '{}'] },
    },
  };
}

describe('RequestApprovalModal — the signed contract is shown (M-1)', () => {
  it('renders the verifyingContract for a Permit', () => {
    render(<RequestApprovalModal request={typedDataRequest(REAL_USDC)} onClose={vi.fn()} />);
    expect(screen.getByTestId('wc-verifying-contract').textContent).toContain(REAL_USDC);
  });

  it('shows the IMPOSTOR contract even when the dApp names itself "USD Coin"', () => {
    // The attack: a trustworthy-looking domain.name over an unrelated contract.
    // The name is attacker-controlled free text; the contract is the thing that
    // actually determines what the signature authorises.
    render(<RequestApprovalModal request={typedDataRequest(IMPOSTOR, { name: 'USD Coin' })} onClose={vi.fn()} />);
    const shown = screen.getByTestId('wc-verifying-contract').textContent;
    expect(shown).toContain(IMPOSTOR);
    expect(shown).not.toContain(REAL_USDC);
  });

  it('renders the contract in full, not truncated', () => {
    // A truncated address is exactly what address-poisoning defeats — the whole
    // point is that the user can compare it against what they expect.
    render(<RequestApprovalModal request={typedDataRequest(IMPOSTOR)} onClose={vi.fn()} />);
    expect(screen.getByTestId('wc-verifying-contract').textContent).toContain(IMPOSTOR);
  });

  it('renders the chainId alongside it', () => {
    render(<RequestApprovalModal request={typedDataRequest(REAL_USDC)} onClose={vi.fn()} />);
    expect(screen.getByTestId('wc-typed-chain').textContent).toContain('1');
  });

  it('renders NO contract row when the domain carries no verifyingContract', () => {
    // I4: render nothing rather than a placeholder that could read as "none
    // required". A domainless Permit is already rejected upstream by H7 on the
    // chainId axis; this is about not inventing a value.
    render(<RequestApprovalModal request={typedDataRequest(null)} onClose={vi.fn()} />);
    expect(screen.queryByTestId('wc-verifying-contract')).toBeNull();
  });

  it('still renders the message fields (the contract row does not displace them)', () => {
    render(<RequestApprovalModal request={typedDataRequest(REAL_USDC)} onClose={vi.fn()} />);
    expect(screen.getByText('spender')).toBeTruthy();
    expect(screen.getByText('value')).toBeTruthy();
  });
});
