// Focused render test for the Digital Shield send dialog flow.
// This mounts SendCrypto with the signer/network stack mocked just enough to
// exercise the UI path: form -> verify -> prepare QR dialog.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const {
  buildDigitalShieldEvmRequest,
  finalizeDigitalShieldEvmResponse,
  transactionCreate,
  broadcastTransaction,
  evaluateSendGate,
  toastError,
} = vi.hoisted(() => ({
  buildDigitalShieldEvmRequest: vi.fn(() => ({
    session: { requestId: '11111111-1111-4111-8111-111111111111' },
    unsignedHex: '0x02f8aa',
    ur: { type: 'eth-sign-request' },
    urParts: ['UR:ETH-SIGN-REQUEST/AAA'],
  })),
  finalizeDigitalShieldEvmResponse: vi.fn(() => ({
    signedHex: '0x02signed',
  })),
  transactionCreate: vi.fn(async () => ({})),
  broadcastTransaction: vi.fn(async () => ({
    hash: '0xabc',
    wait: vi.fn(async () => ({})),
  })),
  evaluateSendGate: vi.fn(() => /** @type {any} */ ({ allowed: true, code: 'ALLOW', message: null })),
  toastError: vi.fn(),
}));

vi.mock('motion/react', () => ({
  motion: new Proxy({}, { get: () => ({ children, ...props }) => <div {...props}>{children}</div> }),
  useReducedMotion: () => true,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key, opts) => {
      if (opts?.returnObjects) return ['check'];
      const map = {
        'send.heading': 'Send Crypto',
        'send.subheading': 'Send securely',
        'send.wallet_picker.label': 'From Wallet',
        'send.wallet_picker.placeholder': 'Choose wallet',
        'send.asset_picker.label': 'Asset',
        'send.asset_picker.placeholder': 'Choose asset',
        'send.recipient.label': 'Recipient',
        'send.recipient.placeholder': '0x...',
        'send.recipient.scan_qr': 'Scan QR',
        'send.amount.label': 'Amount',
        'send.amount.placeholder': '0.0',
        'send.note.label': 'Note',
        'send.note.placeholder': 'Optional note',
        'send.buttons.continue': 'Continue',
        'send.buttons.confirm_send': 'Confirm & Send',
        'send.buttons.back': 'Back',
        'send.verify.summary_label': 'Review',
        'send.fee.automatic': 'Automatic fee',
        'send.wallet_fallback': 'Wallet',
      };
      return map[key] ?? key;
    },
  }),
}));

vi.mock('@/components/BackButton', () => ({ default: () => <div /> }));
vi.mock('@/components/SuccessBeacon', () => ({ default: () => <div /> }));
vi.mock('@/components/RiskShield', () => ({ default: () => <div /> }));
vi.mock('@/components/ReferenceRateNote', () => ({ default: () => <div /> }));
vi.mock('@/components/ReferralPrompt', () => ({ default: () => <div /> }));
vi.mock('@/components/FeeSelector', () => ({ default: () => <div data-testid="fee-selector" /> }));
vi.mock('@/components/CoinLogo', () => ({ default: () => <div /> }));
vi.mock('@/components/TransactionPreview', () => ({ default: () => <div /> }));
vi.mock('@/components/TransactionSimulationDemo', () => ({ default: () => <div /> }));
vi.mock('@/components/TransactionIntelligencePanel', () => ({ default: () => <div /> }));
vi.mock('@/components/SecurityAdvisorBanner', () => ({ default: () => null }));
vi.mock('@/components/RiskVerdictBanner', () => ({ default: () => <div /> }));
vi.mock('@/components/security/TwoFactorGate', () => ({ default: () => <div /> }));
vi.mock('@/components/security/PinPad', () => ({ default: () => <div /> }));
vi.mock('@/components/QRCodeDisplay', () => ({
  default: ({ address }) => <div data-testid="qr-code-display">{address}</div>,
}));
vi.mock('../components/QRScanner', () => ({
  default: () => null,
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props) => <input {...props} />,
}));
vi.mock('@/components/ui/PasswordInput', () => ({
  PasswordInput: (props) => <input type="password" {...props} />,
}));
vi.mock('@/components/ui/button', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
}));
vi.mock('@/components/ui/label', () => ({
  Label: ({ children, ...props }) => <label {...props}>{children}</label>,
}));
vi.mock('@/components/ui/select', () => ({
  Select: ({ children }) => <div>{children}</div>,
  SelectContent: ({ children }) => <div>{children}</div>,
  SelectItem: ({ children }) => <div>{children}</div>,
  SelectTrigger: ({ children, ...props }) => <div {...props}>{children}</div>,
  SelectValue: ({ children }) => <div>{children}</div>,
}));
vi.mock('@/components/ui/switch', () => ({
  Switch: (props) => <input type="checkbox" {...props} />,
}));
vi.mock('@/components/ui/dialog', () => ({
  Dialog: ({ open, children }) => open ? <div>{children}</div> : null,
  DialogContent: ({ children }) => <div>{children}</div>,
  DialogHeader: ({ children }) => <div>{children}</div>,
  DialogTitle: ({ children }) => <h2>{children}</h2>,
}));

vi.mock('@/lib/toast', () => ({
  toast: Object.assign(vi.fn(), { error: toastError, info: vi.fn(), success: vi.fn() }),
}));
vi.mock('@/lib/haptics', () => ({
  successHaptic: vi.fn(),
  errorHaptic: vi.fn(),
  actionHaptic: vi.fn(),
}));

vi.mock('@/context/DigitalShieldContext', () => ({
  useDigitalShield: () => ({
    connected: true,
    evmAccount: {
      family: 'evm',
      address: '0x1111111111111111111111111111111111111111',
      accountPath: "m/44'/60'/0'/0/0",
      xfp: '1234abcd',
      xpub: 'xpub6CUGRU',
    },
    btcAccount: null,
    solAccount: null,
  }),
}));

vi.mock('@/lib/TierProvider', () => ({
  useTier: () => ({ currentTier: 'ai_security_protection' }),
}));

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({
    isUnlocked: true,
    wallets: [{ id: 'w1', name: 'Wallet 1', enabledAssets: ['ETH'] }],
    activeWalletId: 'w1',
    switchWallet: vi.fn(),
    accounts: [{ address: '0x1111111111111111111111111111111111111111', path: "m/44'/60'/0'/0/0", index: 0 }],
    btcAccount: null,
    solAccount: null,
    withPrivateKey: vi.fn(),
    withBtcPrivateKey: vi.fn(),
    withSolPrivateKey: vi.fn(),
    lock: vi.fn(),
    verifyActiveCredential: vi.fn(),
    verifyActiveCredentialDetailed: vi.fn(),
    isSendReauthRequired: () => false,
    actionPasswordConfigured: false,
    verifyActionPassword: vi.fn(),
    recordAudit: vi.fn(),
    isDecoy: false,
    isHidden: false,
    vaultExists: true,
    vaultChecking: false,
  }),
}));

vi.mock('@/api/base44Client', () => ({
  base44: {
    entities: {
      WhitelistedAddress: { list: vi.fn(async () => []) },
      TransactionLimit: { list: vi.fn(async () => []) },
      Transaction: { list: vi.fn(async () => []), create: transactionCreate },
      AddressBook: { list: vi.fn(async () => []) },
    },
  },
}));

vi.mock('@/wallet-core/assets', () => ({
  getAsset: (symbol) => ({ symbol, family: 'evm', chain: 'mainnet', name: 'Ether', status: 'live' }),
  canSend: () => true,
  canReceive: () => true,
  isEvmFamily: () => true,
}));

vi.mock('@/wallet-core/evm/networks', () => ({
  ALLOW_MAINNET: true,
  getNetworkInfo: () => ({ key: 'mainnet', chainId: 1, name: 'Ethereum', symbol: 'ETH', explorer: 'https://etherscan.io', decimals: 18 }),
}));
vi.mock('@/wallet-core/evm/provider', () => ({
  getBalanceEth: vi.fn(async () => 5),
  getProvider: () => ({
    getFeeData: vi.fn(async () => ({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n, gasPrice: 1n })),
    getTransactionCount: vi.fn(async () => 7),
    broadcastTransaction,
  }),
}));
vi.mock('@/wallet-core/evm/fees', () => ({
  MAX_BASE_FEE_GWEI: { mainnet: 5000n },
  evmFeeOverrides: () => ({ gasLimit: 21000n, maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }),
}));
vi.mock('@/wallet-core/evm/preflight.js', () => ({
  verifyLiveChainId: vi.fn(async () => {}),
  applyEstimatedGasLimit: vi.fn(async () => {}),
}));
vi.mock('@/wallet-core/evm/send', () => ({ signAndBroadcast: vi.fn() }));
vi.mock('@/wallet-core/evm/token-send', () => ({
  sendToken: vi.fn(),
  buildTokenTransfer: () => ({ to: '0x2222222222222222222222222222222222222222', data: '0x' }),
  getTokenBalance: vi.fn(async () => 0),
}));
vi.mock('@/wallet-core/evm/calldata', () => ({ describeErc20Call: vi.fn() }));
vi.mock('@/wallet-core/evm/simulate', () => ({
  simulateEvmTransaction: vi.fn(async () => ({ recipientCode: '0x', risks: [] })),
}));
vi.mock('@/wallet-core/evm/tokens', () => ({ getToken: () => ({ decimals: 18 }) }));
vi.mock('@/wallet-core/evm/poison', () => ({
  screenRecipient: () => ({ suspicious: false, lookAlikes: [] }),
}));
vi.mock('@/wallet-core/btc/provider.js', () => ({ getBalanceSats: vi.fn(async () => 0n) }));
vi.mock('@/wallet-core/sol/provider.js', () => ({ getBalanceSol: vi.fn(async () => 0) }));
vi.mock('@/wallet-core/btc/send', () => ({
  signAndBroadcastBtc: vi.fn(),
  estimateBtcSend: vi.fn(),
  broadcastBtcTx: vi.fn(),
}));
vi.mock('@/wallet-core/btc/networks.js', () => ({ getBtcNetwork: vi.fn() }));
vi.mock('@/wallet-core/btc/simulate', () => ({ describeBtcPlan: vi.fn() }));
vi.mock('@/wallet-core/sol/send', () => ({
  signAndBroadcastSol: vi.fn(),
  buildUnsignedSolTx: vi.fn(),
}));
vi.mock('@/wallet-core/sol/networks.js', () => ({ getSolNetwork: vi.fn() }));
vi.mock('@/wallet-core/sol/provider.js', () => ({
  broadcastRawTx: vi.fn(),
  confirmTx: vi.fn(),
  getConnection: vi.fn(),
}));

vi.mock('@/risk', () => ({
  score: () => ({ level: 'ok', sentence: 'OK', signalId: 'ok' }),
  buildRiskInputs: () => ({ unsignedTx: {}, activeSetLocalState: {}, chainData: {} }),
}));
vi.mock('@/risk/composeVerdict', () => ({
  composeTransactionVerdict: () => ({ level: 'ok', owner: 'tx', contributors: [], localSignals: [] }),
}));
vi.mock('@/risk/reviewContributor', () => ({ buildReviewContributor: () => null }));
vi.mock('@/rasp', () => ({
  TIER: { BLOCK: 'BLOCK', ALLOW: 'ALLOW' },
  useRaspArtifact: () => ({ tier: 'ALLOW', requiresBiometric: false }),
  getFreshRaspArtifact: vi.fn(async () => ({ tier: 'ALLOW', requiresBiometric: false })),
}));
vi.mock('@/sign-gate/presign', () => ({
  presignGate: () => ({ proceedAllowed: true, owner: 'tx', decision: 'allow' }),
}));
vi.mock('@/policy/signingPolicy', () => ({
  deriveSigningPolicy: () => ({ decision: 'allow', actionLabel: 'Continue' }),
}));
vi.mock('@/lib/addressValidation', () => ({
  isValidAddressForCurrency: (value) => /^0x[0-9a-fA-F]{40}$/.test(value),
}));
vi.mock('@/lib/sendAddressError', () => ({
  sendAddressErrorKind: ({ toAddress, addressFormatValid, addressTouched, showErrors }) => {
    if (!toAddress && showErrors) return 'missing';
    if (toAddress && !addressFormatValid && addressTouched) return 'malformed';
    return null;
  },
}));
vi.mock('@/lib/sendAmountError', () => ({
  sendAmountErrorKind: ({ amount, wellFormed, showErrors }) => {
    if (!amount && showErrors) return 'missing';
    if (amount && !wellFormed) return 'malformed';
    return null;
  },
}));
vi.mock('@/lib/selfSend', () => ({
  isSelfSend: () => false,
  addressesEqualForCurrency: () => false,
}));
vi.mock('@/lib/txLimits', () => ({
  evaluateSendAgainstLimits: () => ({ blocked: false, reasons: [], amountUSD: 0 }),
}));
vi.mock('@/lib/sendGate', () => ({
  SEND_GATE: { TWO_FACTOR: 'TWO_FACTOR' },
  evaluateSendGate,
}));
vi.mock('@/lib/ens', () => ({ resolveEnsName: vi.fn(async () => null) }));
vi.mock('@/lib/twoFactorGate', () => ({
  evaluateTwoFactor: vi.fn(),
}));
vi.mock('@/lib/send2faMethod', () => ({
  SEND_2FA: { NONE: 'none' },
}));
vi.mock('@/lib/useSend2faMethod', () => ({
  useSend2faMethod: () => 'none',
}));
vi.mock('@/lib/WalletConnectProvider', () => ({
  resolveMaxPriorityFeePerGas: () => 1n,
}));
vi.mock('@/lib/passkey', () => ({ verifyPasskeyAssertion: vi.fn() }));
vi.mock('@/lib/biometric', () => ({ verifyBiometric2fa: vi.fn() }));
vi.mock('@/lib/stepUpFactorOutcome.js', () => ({ evaluateBiometricSecondFactor: vi.fn() }));
vi.mock('@/notify/sources', () => ({
  notifySendConfirmed: vi.fn(),
  notifyRaspAlert: vi.fn(),
  notifyTxRiskAlert: vi.fn(),
  hasBiometricConsentBeenRecorded: () => true,
}));
vi.mock('@/lib/sendWalletSource', () => ({
  defaultWalletId: () => 'w1',
  sendAssetSymbols: () => ['ETH'],
  defaultAssetSymbol: () => 'ETH',
  buildSendWallet: ({ walletId, assetSymbol, accounts }) => ({
    id: walletId,
    name: 'Wallet 1',
    currency: assetSymbol,
    address: accounts[0].address,
    balance: 0,
  }),
  demoSendSource: () => null,
}));
vi.mock('@/api/demoClient', () => ({ DEMO: false, DEMO_POISON_ADDRESS: '0x0' }));
vi.mock('@/api/tipScreen', () => ({ screenTransaction: vi.fn() }));
vi.mock('@/lib/tipZeroFrom.js', () => ({ ZERO_FROM_ADDRESS: '0x0' }));
vi.mock('@/lib/remoteScreenPreference.js', () => ({
  persistRemoteScreenPreference: vi.fn(),
  readRemoteScreenPreference: () => false,
}));
vi.mock('../sendCryptoTipChain', () => ({ resolveTipChain: () => null }));
vi.mock('@/lib/authModel', () => ({ getAuthModel: () => 'pin' }));
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilitySessionActive: () => false,
  isDeniabilityOrDemoActive: () => false,
}));
vi.mock('@/api/trackEvent', () => ({
  EVENT: { SEND_COMPLETED: 'send_completed' },
  trackEvent: vi.fn(async () => {}),
}));
vi.mock('@/lib/seedVerifyGate', () => ({ requiresVerification: () => false }));
vi.mock('@/lib/tracking-integration', () => ({
  useSendFlowTracking: () => ({ start: vi.fn() }),
  useFirstSend: () => vi.fn(),
}));
vi.mock('@/lib/riskGateReady', () => ({ isRiskGateReady: () => true }));
vi.mock('@/lib/advisorBridge', () => ({
  openAdvisor: vi.fn(),
  publishAdvisorContext: vi.fn(),
}));
vi.mock('@/wallet-core/hw/digitalShield.js', () => ({
  buildDigitalShieldEvmRequest,
  buildDigitalShieldBtcPsbt: vi.fn(),
  buildDigitalShieldSolRequest: vi.fn(),
  finalizeDigitalShieldEvmResponse,
  finalizeDigitalShieldBtcResponse: vi.fn(),
  finalizeDigitalShieldSolResponse: vi.fn(),
}));

import SendCrypto from '../SendCrypto.jsx';

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/send']}>
        <SendCrypto />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

async function advanceToConfirm({ enableDigitalShield = true } = {}) {
  // Step 1 → Step 2
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  await waitFor(() => {
    // Step 2 renders its own Continue button too.
    expect(screen.getByRole('button', { name: 'Continue' })).toBeTruthy();
  });
  // Step 2 → Step 3
  fireEvent.click(screen.getByRole('button', { name: 'Continue' }));
  // Wait for the confirm step-3 CTA (Digital Shield row + Confirm/Prepare button).
  await waitFor(() => {
    expect(screen.getByTestId('digital-shield-row')).toBeTruthy();
  });
  if (enableDigitalShield) {
    // Digital Shield toggle moved to step 3 (progressive-disclosure wizard).
    fireEvent.click(screen.getByRole('checkbox', { name: /digital shield/i }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Prepare Digital Shield QR' })).toBeTruthy();
    });
  }
}

describe('SendCrypto — Digital Shield render flow', () => {
  beforeEach(() => {
    cleanup();
    vi.clearAllMocks();
    evaluateSendGate.mockReturnValue(/** @type {any} */ ({ allowed: true }));
    finalizeDigitalShieldEvmResponse.mockReturnValue({ signedHex: '0x02signed' });
    broadcastTransaction.mockResolvedValue({
      hash: '0xabc',
      wait: vi.fn(async () => ({})),
    });
    try {
      localStorage.setItem('veyrnox-sim-enabled', '0');
    } catch {}
  });

  it('opens the Digital Shield signing dialog after prepare on the confirm step', async () => {
    renderPage();

    fireEvent.change(screen.getByLabelText('Recipient'), {
      target: { value: '0x2222222222222222222222222222222222222222' },
    });
    fireEvent.blur(screen.getByLabelText('Recipient'));
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '0.5' },
    });
    fireEvent.blur(screen.getByLabelText('Amount'));

    await waitFor(() => {
      expect(screen.getByText('≈$16,000')).toBeTruthy();
    });

    await advanceToConfirm();

    fireEvent.click(screen.getByRole('button', { name: 'Prepare Digital Shield QR' }));

    await waitFor(() => {
      expect(screen.getByText('Digital Shield Signing')).toBeTruthy();
    });
    expect(buildDigitalShieldEvmRequest).toHaveBeenCalledTimes(1);
    expect(evaluateSendGate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('qr-code-display').textContent).toContain('UR:ETH-SIGN-REQUEST/AAA');
  });

  it('fails closed before preparing the QR when the shared send gate blocks', async () => {
    evaluateSendGate.mockReturnValueOnce(
      /** @type {any} */ ({ allowed: false, code: 'REAUTH', message: 'Re-enter your PIN or password to authorise this send.' })
    );
    renderPage();

    fireEvent.change(screen.getByLabelText('Recipient'), {
      target: { value: '0x2222222222222222222222222222222222222222' },
    });
    fireEvent.blur(screen.getByLabelText('Recipient'));
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '0.5' },
    });
    fireEvent.blur(screen.getByLabelText('Amount'));

    await waitFor(() => {
      expect(screen.getByText('≈$16,000')).toBeTruthy();
    });

    await advanceToConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Digital Shield QR' }));

    await waitFor(() => {
      expect(buildDigitalShieldEvmRequest).not.toHaveBeenCalled();
    });
    expect(toastError).toHaveBeenCalled();
    expect(screen.queryByText('Digital Shield Signing')).toBeNull();
  });

  it('re-checks the shared send gate before final broadcast', async () => {
    evaluateSendGate
      .mockReturnValueOnce(/** @type {any} */ ({ allowed: true, code: 'ALLOW', message: null }))
      .mockReturnValueOnce(
        /** @type {any} */ ({ allowed: false, code: 'REAUTH', message: 'Re-enter your PIN or password to authorise this send.' })
      );

    renderPage();

    fireEvent.change(screen.getByLabelText('Recipient'), {
      target: { value: '0x2222222222222222222222222222222222222222' },
    });
    fireEvent.blur(screen.getByLabelText('Recipient'));
    fireEvent.change(screen.getByLabelText('Amount'), {
      target: { value: '0.5' },
    });
    fireEvent.blur(screen.getByLabelText('Amount'));

    await waitFor(() => {
      expect(screen.getByText('≈$16,000')).toBeTruthy();
    });
    await advanceToConfirm();
    fireEvent.click(screen.getByRole('button', { name: 'Prepare Digital Shield QR' }));

    await waitFor(() => {
      expect(screen.getByText('Digital Shield Signing')).toBeTruthy();
    });

    fireEvent.change(screen.getByLabelText('Signed response UR'), {
      target: { value: 'UR:ETH-SIGNATURE/AAA' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Finalize and Broadcast' }));

    await waitFor(() => {
      expect(screen.getByText('Re-enter your PIN or password to authorise this send.')).toBeTruthy();
    });
    expect(evaluateSendGate).toHaveBeenCalledTimes(2);
    expect(finalizeDigitalShieldEvmResponse).not.toHaveBeenCalled();
    expect(broadcastTransaction).not.toHaveBeenCalled();
  });
});
