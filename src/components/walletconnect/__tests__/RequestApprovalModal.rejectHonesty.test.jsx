// src/components/walletconnect/__tests__/RequestApprovalModal.rejectHonesty.test.jsx
//
// Audit 2026-09-07 H-1 — the USER-FACING half of a pre-sign gate rejection.
//
// The gate itself was never broken: no key was touched and no signature was
// produced. What was broken is everything the user and the dApp were told about
// it. `_handlePersonalSign` / `_handleSignTypedData` / `_handleSendTransaction`
// rejected the WC request and then `return`ed. This modal wraps those calls in a
// try/catch, so a plain return fell through to the SUCCESS branch:
//
//     await signPersonal(...);   // resolved — it only "returned"
//     successHaptic();           // ← success buzz on a REFUSED request
//     onClose();                 // ← modal closes, request silently dequeued
//
// A RASP block on a hooked device therefore felt, looked, and sounded exactly
// like a completed signature, while the dApp received EIP-1193 code 4001 —
// literally "User Rejected Request" — so the dApp told the user they had
// rejected it. They had not; their device failed an integrity check.
//
// Why this file exists AT ALL: the four handler-level RASP suites already
// asserted that `rejectRequest` was called with the right code, and they all
// passed throughout. None of them could see the modal, so none could see that
// the refusal was being reported as a success. That is the specific coverage gap
// the audit named, and this file is it. Do not fold these into a handler test —
// the whole point is that it renders the component.
//
// WHAT THIS FILE DOES AND DOES NOT PIN — read before trusting it.
//
// It mocks '@/lib/WalletConnectProvider.jsx' wholesale, so it pins the MODAL's
// half of the contract only: given a signing call that REJECTS, the modal must
// not buzz success, must not close, and must render the reason. Reverting the
// handlers to `return` does NOT turn this file red — verified by doing it — and
// it would be false coverage to claim otherwise. The handlers' half is pinned in
// WalletConnectProvider.{presignGate,raspGate,raspNativeGate,c3}, which went red
// on exactly that mutation when the fix landed.
//
// Mutation-checked 2026-09-07 the honest way: replacing this modal's `catch`
// body with `successHaptic(); onClose();` turns the two rejection tests red and
// leaves the control green. If you change the modal's approve flow, re-run that
// mutation — a green suite here proves nothing about the handlers.

import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

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

// The observable under test. successHaptic firing on a refusal IS the defect.
const successHaptic = vi.fn();
const errorHaptic = vi.fn();
vi.mock('@/lib/haptics', () => ({
  successHaptic: (...a) => successHaptic(...a),
  errorHaptic: (...a) => errorHaptic(...a),
  tapHaptic: vi.fn(),
}));

vi.mock('@/wallet-core/evm/simulate.js', () => ({
  simulateEvmTransaction: vi.fn(async () => ({ recipientCode: '0x' })),
}));
vi.mock('@/wallet-core/evm/networks.js', () => ({
  getNetworkByChainId: () => ({ key: 'sepolia', name: 'Sepolia Testnet', symbol: 'ETH', isTestnet: true }),
}));

let mockSessions = [];
// The three signing entry points. Each test decides whether they reject.
const signPersonal = vi.fn();
const signTypedData = vi.fn();
const sendTransaction = vi.fn();

function resolvePersonalSignMessage(params, ownAddress) {
  if (!ownAddress) return { ok: false, code: 'PERSONAL_SIGN_NO_WALLET' };
  const arr = Array.isArray(params) ? params : [];
  const isOwn = (v) => typeof v === 'string' && v.toLowerCase() === ownAddress.toLowerCase();
  if (isOwn(arr[1])) return { ok: true, message: arr[0] };
  if (isOwn(arr[0])) return { ok: true, message: arr[1] };
  return { ok: true, message: arr[0] };
}

vi.mock('@/lib/WalletConnectProvider.jsx', () => ({
  resolvePersonalSignMessage,
  useWalletConnect: () => ({
    signPersonal: (...a) => signPersonal(...a),
    signTypedData: (...a) => signTypedData(...a),
    sendTransaction: (...a) => sendTransaction(...a),
    rejectRequest: vi.fn(),
    isSendReauthRequired: () => false,
    evmAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    sessions: mockSessions,
  }),
}));

import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react';
import { RequestApprovalModal } from '@/components/walletconnect/RequestApprovalModal.jsx';

beforeEach(() => {
  successHaptic.mockClear();
  errorHaptic.mockClear();
  signPersonal.mockReset();
  signTypedData.mockReset();
  sendTransaction.mockReset();
  mockSessions.length = 0;
  mockSessions.push({ topic: 't', peer: { metadata: { name: 'dApp', url: 'https://app.example.org' } } });
});
afterEach(() => { cleanup(); });

function personalSignRequest() {
  return {
    topic: 't', id: 1, type: 'personal_sign', blocked: false, typedDataMeta: null,
    params: { request: { method: 'personal_sign', params: ['0x48656c6c6f'] } },
  };
}

const approveBtn = () => screen.getByRole('button', { name: /approve|sign|send/i });

describe('RequestApprovalModal — a refused request must never read as a success (audit H-1)', () => {
  it('personal_sign: a thrown gate rejection fires NO success haptic and does not close', async () => {
    signPersonal.mockRejectedValue(
      new Error('Signing refused [RASP_BLOCK]: Veyrnox blocked this request and did not sign.'),
    );
    const onClose = vi.fn();
    render(<RequestApprovalModal request={personalSignRequest()} onClose={onClose} />);

    fireEvent.click(approveBtn());

    // The three things that were wrong before the fix.
    await waitFor(() => expect(errorHaptic).toHaveBeenCalled());
    expect(successHaptic).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('personal_sign: the reason is rendered to the user, not swallowed', async () => {
    signPersonal.mockRejectedValue(
      new Error('Signing refused [RASP_WARN_REJECTED]: Veyrnox blocked this request and did not sign.'),
    );
    render(<RequestApprovalModal request={personalSignRequest()} onClose={vi.fn()} />);

    fireEvent.click(approveBtn());

    // Before the fix this text existed nowhere on screen — the modal had closed.
    expect(await screen.findByText(/RASP_WARN_REJECTED/)).toBeTruthy();
    expect(screen.getByText(/did not sign/i)).toBeTruthy();
  });

  // No separate eth_sendTransaction / eth_signTypedData_v4 case here, deliberately.
  // `handleApprove` is type-agnostic — all three request types run through the SAME
  // try/catch, and it is that block (success branch vs catch branch) which was
  // wrong. A send_transaction case would additionally have to drive the tx
  // acknowledgement checkbox and settle the risk-simulation `codePending` state
  // before Approve even enables, so it would be exercising the fixture rather than
  // the contract. The handler-side throw for all three planes is pinned in
  // WalletConnectProvider.{presignGate,raspGate,raspNativeGate,c3} instead.

  it('control: a genuinely successful sign still buzzes and closes', async () => {
    // Bidirectional — without this, a modal that NEVER fired successHaptic or
    // NEVER closed would pass every assertion above for the wrong reason.
    signPersonal.mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<RequestApprovalModal request={personalSignRequest()} onClose={onClose} />);

    fireEvent.click(approveBtn());

    await waitFor(() => expect(successHaptic).toHaveBeenCalled());
    expect(onClose).toHaveBeenCalled();
    expect(errorHaptic).not.toHaveBeenCalled();
  });
});
