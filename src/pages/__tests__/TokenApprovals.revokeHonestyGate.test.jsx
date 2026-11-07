// @ts-nocheck
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const state = vi.hoisted(() => ({
  rows: [],
  withPrivateKey: vi.fn(),
  sendRevoke: vi.fn(),
  update: vi.fn(),
  presignGateOrReject: vi.fn(),
  verifyBiometric2fa: vi.fn(),
  reauthRequired: vi.fn(() => false),
}));

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      TokenApproval: {
        list: vi.fn(async () => state.rows),
        update: (...args) => state.update(...args),
      },
    },
  },
}));
vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    isUnlocked: true,
    isSendReauthRequired: () => state.reauthRequired(),
    withPrivateKey: state.withPrivateKey,
    recordAudit: vi.fn(),
  }),
}));
vi.mock('@/wallet-core/evm/approvals', () => ({
  summarizeAllowance: () => ({ unlimited: true, amount: 'UNLIMITED' }),
  buildRevokeCalldata: () => ({ data: '0x095ea7b3', summary: { amount: '0' } }),
  sendRevoke: (...args) => state.sendRevoke(...args),
}));
vi.mock('@/lib/approvalRiskNotes', () => ({ fetchRiskNoteAsync: vi.fn(async () => null) }));
vi.mock('@/lib/TierProvider', () => ({ useTier: () => ({ currentTier: 'free' }) }));
vi.mock('@/hooks/useApprovalMonitor', () => ({
  useApprovalMonitor: () => ({
    alerts: [],
    highCount: 0,
    dismiss: vi.fn(),
    clearAll: vi.fn(),
  }),
}));
vi.mock('@/components/security/useActionGuard', () => ({
  useActionGuard: () => ({ requireTwoFactor: (run) => run(), gateModal: null }),
}));
vi.mock('@/rasp', () => ({
  useRaspArtifact: () => ({
    tier: 'allow',
    sentence: null,
    blockedActions: [],
    requiresBiometric: false,
  }),
  sensitiveGate: (artifact, action) => ({
    blocked: !artifact || artifact.blockedActions.includes(action),
    sentence: artifact?.sentence ?? null,
  }),
}));
vi.mock('@/lib/getFreshLocalRaspArtifact', () => ({
  getFreshLocalRaspArtifact: vi.fn(async () => ({
    tier: 'allow',
    sentence: null,
    blockedActions: [],
    requiresBiometric: false,
  })),
}));
vi.mock('@/lib/useAdvisorSnapshot', () => ({ useAdvisorSnapshot: vi.fn() }));
vi.mock('@/lib/biometric', () => ({
  verifyBiometric2fa: (...args) => state.verifyBiometric2fa(...args),
}));
vi.mock('@/lib/toast', () => ({ toast: { error: vi.fn() } }));
vi.mock('@/sign-gate/presignGateOrReject', () => ({
  presignGateOrReject: (...args) => state.presignGateOrReject(...args),
}));

import TokenApprovals from '../TokenApprovals.jsx';
import { TOKENS } from '@/wallet-core/evm/tokens.js';

function approval(network, tokenSymbol = 'USDC', decimals = 6) {
  return {
    id: `approval-${network}-${tokenSymbol}`,
    network,
    status: 'active',
    token_symbol: tokenSymbol,
    spender_name: 'Example spender',
    spender_address: '0x1234567890123456789012345678901234567890',
    allowance_raw: '1',
    decimals,
    trusted: false,
  };
}

function renderPage(props) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TokenApprovals {...props} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  state.rows = [];
  state.withPrivateKey.mockReset().mockImplementation(async (_index, run) => run('0xFAKE_PRIVATE_KEY'));
  state.sendRevoke.mockReset().mockResolvedValue({
    hash: '0xREVOKE_HASH',
    explorerUrl: 'https://etherscan.io/tx/0xREVOKE_HASH',
    summary: { amount: '0' },
  });
  state.update.mockReset().mockResolvedValue({});
  state.verifyBiometric2fa.mockReset().mockResolvedValue(true);
  state.reauthRequired.mockReset().mockReturnValue(false);
  state.presignGateOrReject.mockReset().mockResolvedValue({
    proceedAllowed: true,
    rejectCode: null,
  });
});

afterEach(() => cleanup());

describe('TokenApprovals — network-honest revoke confirmation', () => {
  it.each(['LINK', 'UNI', 'SHIB', 'LEO'])(
    'shows real Ethereum Mainnet and gas wording for a %s approval row',
    async (symbol) => {
      const token = TOKENS.mainnet[symbol];
      expect(token).toMatchObject({ symbol, decimals: 18, assetId: `${symbol}:mainnet` });
      state.rows = [approval('mainnet', symbol, token.decimals)];
      renderPage();

      expect(await screen.findByText(symbol)).toBeTruthy();
      fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));

      expect(await screen.findByText('Revoke on Ethereum Mainnet')).toBeTruthy();
      expect(screen.getByText(
        'This is a real Ethereum Mainnet transaction. It will be broadcast on-chain and costs real ETH in gas.',
      )).toBeTruthy();
    },
  );

  it('shows the selected mainnet chain and says it is a real transaction with a real gas cost', async () => {
    state.rows = [approval('mainnet')];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));

    expect(await screen.findByText('Revoke on Ethereum Mainnet')).toBeTruthy();
    expect(screen.getByText(
      'This is a real Ethereum Mainnet transaction. It will be broadcast on-chain and costs real ETH in gas.',
    )).toBeTruthy();
  });

  it('shows the selected testnet chain without claiming the revoke is on mainnet', async () => {
    state.rows = [approval('sepolia')];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));

    const explanation = await screen.findByText(
      'This is a Sepolia Testnet transaction. It will be broadcast on testnet and uses testnet ETH for gas.',
    );
    expect(explanation.textContent).not.toMatch(/mainnet/i);
  });

  it('keeps demo copy explicitly simulated with no broadcast', async () => {
    state.rows = [approval('mainnet')];
    renderPage({ demo: true });

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));

    expect(await screen.findByText('Simulate revoke on Ethereum Mainnet')).toBeTruthy();
    expect(screen.getByText(
      'Demo mode — this revoke on Ethereum Mainnet is simulated. No transaction will be broadcast and no gas will be charged.',
    )).toBeTruthy();
  });
});

describe('TokenApprovals — key callback stays behind the shared pre-sign result', () => {
  it.each([
    ['LINK', {
      proceedAllowed: false,
      rejectCode: 'RASP_WARN_ACK_REQUIRED',
      artifact: { sentence: 'This device needs extra caution.' },
      requiresBiometric: true,
    }],
    ['UNI', {
      proceedAllowed: false,
      rejectCode: 'RASP_BLOCK',
      artifact: { sentence: 'Signing is turned off.' },
    }],
    ['SHIB', undefined],
    ['LEO', {
      proceedAllowed: false,
      rejectCode: 'PRESIGN_GATE_ERROR',
      artifact: { sentence: 'The signing safety check errored.' },
    }],
  ])('%s never reaches the key callback on WARN/BLOCK/missing/errored pre-sign results', async (symbol, gateResult) => {
    const token = TOKENS.mainnet[symbol];
    state.rows = [approval('mainnet', symbol, token.decimals)];
    state.presignGateOrReject.mockResolvedValue(gateResult);
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to real transaction' }));

    await waitFor(() => expect(state.presignGateOrReject).toHaveBeenCalledTimes(1));
    expect(state.withPrivateKey).not.toHaveBeenCalled();
    expect(state.sendRevoke).not.toHaveBeenCalled();
  });

  it('keeps revocation available when the fresh shared gate allows', async () => {
    state.rows = [approval('mainnet')];
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to real transaction' }));

    await waitFor(() => expect(state.withPrivateKey).toHaveBeenCalledTimes(1));
    expect(state.presignGateOrReject).toHaveBeenCalledTimes(1);
    expect(state.sendRevoke).toHaveBeenCalledWith(expect.objectContaining({ networkKey: 'mainnet' }));
  });

  it('keeps WARN blocked until explicit acknowledgement and native biometric confirmation', async () => {
    state.rows = [approval('mainnet')];
    state.presignGateOrReject
      .mockResolvedValueOnce({
        proceedAllowed: false,
        rejectCode: 'RASP_WARN_ACK_REQUIRED',
        artifact: { sentence: 'This device needs extra caution.' },
        requiresBiometric: true,
      })
      .mockResolvedValueOnce({
        proceedAllowed: false,
        rejectCode: 'RASP_BLOCK',
        artifact: { sentence: 'Signing is turned off.' },
      });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to real transaction' }));

    const continueButton = await screen.findByRole('button', { name: 'Confirm and continue' });
    expect(continueButton.disabled).toBe(true);
    expect(state.withPrivateKey).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('checkbox'));
    expect(continueButton.disabled).toBe(false);
    fireEvent.click(continueButton);

    await waitFor(() => expect(state.presignGateOrReject).toHaveBeenCalledTimes(2));
    expect(state.verifyBiometric2fa).toHaveBeenCalledTimes(1);
    expect(state.presignGateOrReject).toHaveBeenLastCalledWith({
      acknowledged: true,
      biometricConfirmed: true,
    });
    expect(state.withPrivateKey).not.toHaveBeenCalled();
  });

  it('never invokes withPrivateKey when the fresh shared gate does not proceed', async () => {
    state.rows = [approval('mainnet')];
    state.presignGateOrReject.mockResolvedValue({
      proceedAllowed: false,
      rejectCode: 'RASP_BLOCK',
      artifact: { sentence: 'Signing is turned off.' },
    });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to real transaction' }));

    await waitFor(() => expect(state.presignGateOrReject).toHaveBeenCalledTimes(1));
    expect(state.withPrivateKey).not.toHaveBeenCalled();
  });
  it('re-checks recent authentication after the warning dialog and does not sign when it expired', async () => {
    state.rows = [approval('mainnet')];
    state.presignGateOrReject
      .mockResolvedValueOnce({
        proceedAllowed: false,
        rejectCode: 'RASP_WARN_ACK_REQUIRED',
        artifact: { sentence: 'This device needs extra caution.' },
        requiresBiometric: false,
      })
      .mockResolvedValueOnce({ proceedAllowed: true, rejectCode: null });
    renderPage();

    fireEvent.click(await screen.findByRole('button', { name: 'Revoke' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue to real transaction' }));
    const continueButton = await screen.findByRole('button', { name: 'Confirm and continue' });
    fireEvent.click(screen.getByRole('checkbox'));

    // The recent-auth window expires while the warning dialog is open.
    state.reauthRequired.mockReturnValue(true);
    fireEvent.click(continueButton);

    await waitFor(() => expect(state.presignGateOrReject).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByText(/Re-enter your PIN or password/)).toBeTruthy());
    expect(state.withPrivateKey).not.toHaveBeenCalled();
    expect(state.sendRevoke).not.toHaveBeenCalled();
  });
});
