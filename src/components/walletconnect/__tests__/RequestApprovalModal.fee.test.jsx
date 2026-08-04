// src/components/walletconnect/__tests__/RequestApprovalModal.fee.test.jsx
//
// Audit 2026-08-03 H-7 — the SEND_TRANSACTION block rendered Network, To, Value
// and a calldata prefix, and NO fee row anywhere. M9 / F-02-GASCAP bound the
// worst case, but the bound was never disclosed.
//
// The attack the caps permit and the UI hid: a dApp requests `value: 0x0` with
// maxFeePerGas AND maxPriorityFeePerGas pinned at the per-chain ceiling and a
// callee crafted to burn its gas limit. The modal showed "0 ETH" and a truncated
// calldata hex; the user ticked the two acknowledgement boxes believing the risk
// was bounded by the displayed value, and paid up to ~1 native token in fees.
//
// These tests assert the ceiling is SHOWN, and — just as importantly — that it
// is NOT shown when it cannot be derived honestly (I4: render nothing rather
// than a fabricated figure).

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
  return {
    ...actual,
    useTranslation: (ns) => ({ t: (k, o) => resolve(k, { ns, ...(o || {}) }) }),
  };
});

import { render, screen, cleanup } from '@testing-library/react';
import { RequestApprovalModal } from '@/components/walletconnect/RequestApprovalModal.jsx';
import { MAX_BASE_FEE_GWEI } from '@/wallet-core/evm/fees.js';

vi.mock('@/wallet-core/evm/simulate.js', () => ({
  simulateEvmTransaction: vi.fn(async () => ({ recipientCode: '0x' })), // an EOA — keeps risk quiet
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: (id) => (id === 1
    ? { key: 'mainnet', name: 'Ethereum Mainnet', symbol: 'ETH', isTestnet: false }
    : { key: 'sepolia', name: 'Sepolia Testnet', symbol: 'ETH', isTestnet: true }),
}));

let mockSessions = [];
function resolvePersonalSignMessage() { return { ok: false, code: 'PERSONAL_SIGN_NO_WALLET' }; }
vi.mock('@/lib/WalletConnectProvider.jsx', () => ({
  resolvePersonalSignMessage,
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

const GWEI = 1_000_000_000n;

function sendTxRequest(txOverrides, chainId = 'eip155:11155111') {
  mockSessions.push({ topic: 't', peer: { metadata: { name: 'Some dApp', url: 'https://app.example.org' } } });
  return {
    topic: 't', id: 9, type: 'send_transaction', blocked: false, typedDataMeta: null,
    params: {
      chainId,
      request: {
        method: 'eth_sendTransaction',
        params: [{ to: '0x1111111111111111111111111111111111111111', value: '0x0', ...txOverrides }],
      },
    },
  };
}

describe('RequestApprovalModal — worst-case fee disclosure (H-7)', () => {
  it('shows a max-fee row for a dApp-specified fee', async () => {
    render(<RequestApprovalModal request={sendTxRequest({ maxFeePerGas: '0x' + (10n * GWEI).toString(16), gas: '0x5208' })} onClose={vi.fn()} />);
    // 10 gwei × 21000 = 0.00021 ETH
    expect(await screen.findByText(/max fee/i)).toBeTruthy();
    expect(screen.getByText(/0\.00021/)).toBeTruthy();
  });

  it('discloses the ~1 ETH ceiling for the 0-value fee-griefing shape the caps allow', async () => {
    // value 0, fee pinned above the mainnet ceiling, `gas` omitted so the full
    // WC_GAS_CAP applies. Previously this rendered "0 ETH" and nothing else.
    render(<RequestApprovalModal
      request={sendTxRequest({ maxFeePerGas: '0xffffffffffffffffff', maxPriorityFeePerGas: '0xffffffffffffffffff' }, 'eip155:1')}
      onClose={vi.fn()}
    />);
    await screen.findByText(/max fee/i);

    // The mainnet ceiling × the 1,000,000 gas cap, in ether.
    const expectedEth = String(MAX_BASE_FEE_GWEI.mainnet * GWEI * 1_000_000n / (10n ** 18n));
    const rendered = screen.getByTestId('wc-max-fee').textContent;
    expect(rendered).toContain(expectedEth);
    expect(rendered).toContain('ETH');
    // It must be presented as a ceiling, never as an estimate.
    expect(screen.getByText(/max fee/i).textContent.toLowerCase()).not.toContain('estimate');
  });

  it('renders NO fee row when the dApp supplies no fee field (I4 — no fabricated figure)', async () => {
    render(<RequestApprovalModal request={sendTxRequest({ gas: '0x5208' })} onClose={vi.fn()} />);
    // Wait for the tx box so we know the block rendered before asserting absence.
    await screen.findByText(/^To$/i);
    expect(screen.queryByTestId('wc-max-fee')).toBeNull();
  });

  it('renders NO fee row when the fee is unparseable', async () => {
    render(<RequestApprovalModal request={sendTxRequest({ maxFeePerGas: 'not-a-number', gas: '0x5208' })} onClose={vi.fn()} />);
    await screen.findByText(/^To$/i);
    expect(screen.queryByTestId('wc-max-fee')).toBeNull();
  });

  it('still shows the value row alongside the fee row (fee row does not replace it)', async () => {
    render(<RequestApprovalModal request={sendTxRequest({ maxFeePerGas: '0x' + (10n * GWEI).toString(16), gas: '0x5208' })} onClose={vi.fn()} />);
    await screen.findByText(/max fee/i);
    expect(screen.getByText(/^Value$/i)).toBeTruthy();
  });
});
