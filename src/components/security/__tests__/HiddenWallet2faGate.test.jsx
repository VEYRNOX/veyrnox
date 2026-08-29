import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import HiddenWallet2faGate from '../HiddenWallet2faGate';

// Mock WalletProvider context
let mockWalletContext = {
  isHidden: false,
  hiddenWallet2faMode: 'none',
  actionPasswordConfigured: false,
  verifyActiveCredentialDetailed: vi.fn(),
  verifyActionPassword: vi.fn(),
  lock: vi.fn(),
};

vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => mockWalletContext,
}));

vi.mock('@/lib/passkey', () => ({
  isPasskeyRegistered: vi.fn(() => false),
  verifyPasskeyAssertion: vi.fn(),
}));

vi.mock('@/lib/biometric', () => ({
  is2faBiometricEnabled: vi.fn(() => false),
  verifyBiometric2fa: vi.fn(),
  hasBiometricConsentBeenRecorded: () => true,
}));

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

describe('HiddenWallet2faGate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockWalletContext = {
      isHidden: false,
      hiddenWallet2faMode: 'none',
      actionPasswordConfigured: false,
      verifyActiveCredentialDetailed: vi.fn(),
      verifyActionPassword: vi.fn(),
      lock: vi.fn(),
    };
  });

  it('should not render when not in hidden session', () => {
    mockWalletContext.isHidden = false;
    mockWalletContext.hiddenWallet2faMode = 'password';

    const { container } = render(<HiddenWallet2faGate />);
    expect(container.firstChild).toBeNull();
  });

  it('should not render when 2FA mode is none', () => {
    mockWalletContext.isHidden = true;
    mockWalletContext.hiddenWallet2faMode = 'none';

    const { container } = render(<HiddenWallet2faGate />);
    expect(container.firstChild).toBeNull();
  });

  it('should render modal when in hidden session with password mode', () => {
    mockWalletContext.isHidden = true;
    mockWalletContext.hiddenWallet2faMode = 'password';

    const { container } = render(<HiddenWallet2faGate />);
    expect(container.querySelector('[role="dialog"]')).toBeDefined();
  });

  it('should render modal when in hidden session with passkey mode', () => {
    mockWalletContext.isHidden = true;
    mockWalletContext.hiddenWallet2faMode = 'passkey';

    const { container } = render(<HiddenWallet2faGate />);
    expect(container.querySelector('[role="dialog"]')).toBeDefined();
  });

  it('should render modal when in hidden session with biometric mode', () => {
    mockWalletContext.isHidden = true;
    mockWalletContext.hiddenWallet2faMode = 'biometric';

    const { container } = render(<HiddenWallet2faGate />);
    expect(container.querySelector('[role="dialog"]')).toBeDefined();
  });

  it('shows correct mode label in title (Codex P1 2026-08-15: neutral wording — no "hidden" tell)', () => {
    mockWalletContext.isHidden = true;
    mockWalletContext.hiddenWallet2faMode = 'password';

    render(<HiddenWallet2faGate />);
    // The gate no longer says "hidden wallet" anywhere in the visible copy —
    // a coercer looking at the screen must not be able to distinguish this
    // dialog from the primary send-time step-up gate. It DOES still surface
    // the mode label (PIN + Action Password) so the user knows what they're
    // being asked for.
    const allTexts = screen.getAllByText((content) => {
      return content.includes('Verify') && content.includes('PIN + Action Password');
    });
    expect(allTexts.length > 0).toBe(true);
  });

  it('does NOT render any "hidden wallet" tell-string (Codex P1 2026-08-15)', () => {
    mockWalletContext.isHidden = true;
    mockWalletContext.hiddenWallet2faMode = 'password';

    const { container } = render(<HiddenWallet2faGate />);
    // Case-insensitive: "hidden wallet" / "Hidden Wallet" / "hidden-wallet"
    // must not appear anywhere in the visible copy. On-chain-visibility line
    // was also dropped as an implicit tell (only a hidden-wallet gate would
    // reassure about on-chain public-ness).
    const text = container.textContent || '';
    expect(text.toLowerCase()).not.toContain('hidden wallet');
    expect(text.toLowerCase()).not.toContain('on-chain');
  });

  it('should prevent dismissing the dialog', () => {
    mockWalletContext.isHidden = true;
    mockWalletContext.hiddenWallet2faMode = 'password';

    const { container } = render(<HiddenWallet2faGate />);

    // The dialog should be present
    const dialogContent = container.querySelector('[role="dialog"]');
    expect(dialogContent).toBeDefined();
  });
});
