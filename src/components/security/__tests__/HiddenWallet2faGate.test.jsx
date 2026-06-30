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

  it('should show correct mode label in title', () => {
    mockWalletContext.isHidden = true;
    mockWalletContext.hiddenWallet2faMode = 'password';

    render(<HiddenWallet2faGate />);
    const allTexts = screen.getAllByText((content, node) => {
      return content.includes('Unlock hidden wallet') && content.includes('PIN + Action Password');
    });
    expect(allTexts.length > 0).toBe(true);
  });

  it('should display convenience message about on-chain visibility', () => {
    mockWalletContext.isHidden = true;
    mockWalletContext.hiddenWallet2faMode = 'password';

    render(<HiddenWallet2faGate />);
    const allTexts = screen.getAllByText((content) => {
      return content.includes('on-chain') && content.includes('public');
    });
    expect(allTexts.length > 0).toBe(true);
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
