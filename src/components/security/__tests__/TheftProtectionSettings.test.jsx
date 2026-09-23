// TheftProtectionSettings — a device the gate would refuse at every unlock must not
// be able to opt in (#2515). The setting can only be turned off from inside the
// unlocked wallet, so enabling it on an unsupported device was a permanent lockout.
//
// Contract:
//   - Enable runs getTheftProtectionSupport first; unsupported → nothing persisted,
//     switch stays off, a reason is shown.
//   - Supported (iOS Face ID available, Android biometric available) → persisted.
//   - Disable on a device that CANNOT run the gate is never gated (#2515 escape
//     hatch). Disable on a supported device needs the Theft Protection
//     biometric — otherwise an unlocked-phone thief switches it off and sends.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';

const { platformMock, probeMock } = vi.hoisted(() => ({
  platformMock: vi.fn(() => 'ios'),
  probeMock: vi.fn(async () => null),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => platformMock() !== 'web', getPlatform: () => platformMock() },
}));
vi.mock('@/lib/biometricProbe', () => ({ getCachedBiometry: (...a) => probeMock(...a) }));
// The component now renders the spend-limit field, which uses useActionGuard
// for the second factor on a LOOSENING change. That pulls WalletProvider ->
// panic.js into the graph, and panic.js reads TWOFACTOR_BIOMETRIC_KEY from
// this module, so the mock has to carry it (and is2faBiometricEnabled, which
// useActionGuard itself reads) or the suite fails to load at import time.
vi.mock('@/lib/biometric', () => ({
  verifyBiometric2fa: vi.fn(),
  is2faBiometricEnabled: vi.fn(() => false),
  TWOFACTOR_BIOMETRIC_KEY: 'veyrnox-2fa-biometric',
}));
// useActionGuard calls useWallet(), which throws outside a WalletProvider.
// These specs render the component bare and are about the enable/disable
// capability gate, not the 2FA modal, so stub the hook. `twoFactorMock` is
// exposed so the spend-limit specs can assert the second factor was demanded
// on a loosening edit and NOT demanded on a tightening one.
const { twoFactorMock } = vi.hoisted(() => ({ twoFactorMock: vi.fn((run) => run()) }));
vi.mock('@/components/security/useActionGuard', () => ({
  useActionGuard: () => ({ requireTwoFactor: twoFactorMock, gateModal: null }),
}));
vi.mock('@/rasp', () => ({
  getFreshRaspArtifact: vi.fn(),
  TIER: Object.freeze({ ALLOW: 'allow', WARN: 'warn-before-sign', BLOCK: 'block-signing' }),
}));
const { deniableMock } = vi.hoisted(() => ({ deniableMock: vi.fn(() => false) }));
vi.mock('@/wallet-core/deniabilitySession', () => ({ isDeniabilityOrDemoActive: (...a) => deniableMock(...a) }));

// The entity layer behind the seeded starter cap (#2515 follow-up). Mocked so
// the test asserts WHAT was written, not that IndexedDB happened to work.
const { limitListMock, limitCreateMock, limitUpdateMock } = vi.hoisted(() => ({
  limitListMock: vi.fn(async () => []),
  limitCreateMock: vi.fn(async (r) => r),
  limitUpdateMock: vi.fn(async (_id, r) => r),
}));
vi.mock('@/api/base44Client', () => ({
  base44: { entities: { TransactionLimit: { list: (...a) => limitListMock(...a), create: (...a) => limitCreateMock(...a), update: (...a) => limitUpdateMock(...a) } } },
}));

import { THEFT_PROTECTION_KEY } from '@/lib/theftProtection';
import TheftProtectionSettings from '@/components/security/TheftProtectionSettings';

const toggle = () => screen.getByTestId('theft-protection-toggle');

beforeEach(() => {
  localStorage.clear();
  platformMock.mockReset().mockReturnValue('ios');
  probeMock.mockReset().mockResolvedValue(null);
  limitListMock.mockReset().mockResolvedValue([]);
  limitCreateMock.mockReset().mockImplementation(async (r) => r);
  limitUpdateMock.mockReset().mockImplementation(async (_id, r) => r);
  twoFactorMock.mockReset().mockImplementation((run) => run());
  deniableMock.mockReset().mockReturnValue(false);
});
afterEach(() => { cleanup(); });

async function expectRefused() {
  await waitFor(() => expect(screen.getByTestId('theft-protection-unsupported')).toBeTruthy());
  expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBeNull();
  expect(toggle().getAttribute('aria-checked')).toBe('false');
}

describe('TheftProtectionSettings — enable is capability-gated (#2515)', () => {
  it('web: refuses without probing', async () => {
    platformMock.mockReturnValue('web');
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await expectRefused();
    expect(probeMock).not.toHaveBeenCalled();
  });

  it('Touch ID iPhone: refuses', async () => {
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 1 });
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await expectRefused();
  });

  it('Face ID hardware but not set up: refuses', async () => {
    probeMock.mockResolvedValue({ isAvailable: false, biometryType: 2 });
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await expectRefused();
  });

  it('probe failure: refuses (fail closed on enable)', async () => {
    probeMock.mockRejectedValue(new Error('bridge down'));
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await expectRefused();
  });

  it('iPhone with Face ID available: enables', async () => {
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 2 });
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await waitFor(() => expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBe('1'));
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    expect(screen.queryByTestId('theft-protection-unsupported')).toBeNull();
  });

  it('Android with a biometric available: enables', async () => {
    platformMock.mockReturnValue('android');
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 3 });
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await waitFor(() => expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBe('1'));
  });

  it('disable is never gated, even on an unsupported device', async () => {
    localStorage.setItem(THEFT_PROTECTION_KEY, '1');
    platformMock.mockReturnValue('web');
    render(<TheftProtectionSettings />);
    expect(toggle().getAttribute('aria-checked')).toBe('true');
    fireEvent.click(toggle());
    await waitFor(() => expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBeNull());
    expect(probeMock).not.toHaveBeenCalled();
  });

  it('disable on a supported device is refused when the biometric fails', async () => {
    localStorage.setItem(THEFT_PROTECTION_KEY, '1');
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 'faceId' });
    const { getFreshRaspArtifact } = await import('@/rasp');
    getFreshRaspArtifact.mockResolvedValue({ tier: 'allow' });
    const { verifyBiometric2fa } = await import('@/lib/biometric');
    verifyBiometric2fa.mockRejectedValue(new Error('cancelled'));
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await waitFor(() => expect(screen.getByTestId('theft-protection-unsupported')).toBeTruthy());
    expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBe('1');
    expect(toggle().getAttribute('aria-checked')).toBe('true');
  });

  it('disable on a supported device proceeds once the biometric passes', async () => {
    localStorage.setItem(THEFT_PROTECTION_KEY, '1');
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 'faceId' });
    const { getFreshRaspArtifact } = await import('@/rasp');
    getFreshRaspArtifact.mockResolvedValue({ tier: 'allow' });
    const { verifyBiometric2fa } = await import('@/lib/biometric');
    verifyBiometric2fa.mockResolvedValue(true);
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());
    await waitFor(() => expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBeNull());
    expect(verifyBiometric2fa).toHaveBeenCalled();
  });
});

// Seeded starter cap. Theft Protection's send-side leg is inert with no enabled
// spend limit (sendGate only reaches THEFT_PROTECTION_REQUIRED when
// evaluateSendAgainstLimits blocks), so enabling the feature with an empty
// limit list used to protect unlock and nothing else.
describe('TheftProtectionSettings — default spend limit', () => {
  it('seeds one enabled $500 per-transaction limit when the user has none', async () => {
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 'faceId' });
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());

    await waitFor(() => expect(limitCreateMock).toHaveBeenCalledTimes(1));
    expect(limitCreateMock).toHaveBeenCalledWith({
      currency: 'ALL',
      daily_limit: null,
      per_transaction_limit: 500,
      enabled: true,
    });
    expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBe('1');
    expect(await screen.findByTestId('theft-protection-seeded-limit')).toBeTruthy();
  });

  it('never touches limits the user already configured — including a disabled one', async () => {
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 'faceId' });
    limitListMock.mockResolvedValue([{ id: 'l1', currency: 'ALL', per_transaction_limit: 25, enabled: false }]);
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());

    await waitFor(() => expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBe('1'));
    await waitFor(() => expect(limitListMock).toHaveBeenCalled());
    expect(limitCreateMock).not.toHaveBeenCalled();
    expect(screen.queryByTestId('theft-protection-seeded-limit')).toBeNull();
  });

  it('still enables Theft Protection when the entity layer throws', async () => {
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 'faceId' });
    limitListMock.mockRejectedValue(new Error('store unavailable'));
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());

    await waitFor(() => expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBe('1'));
    expect(limitCreateMock).not.toHaveBeenCalled();
  });

  it('writes no limit when the unsupported-device check refuses the opt-in', async () => {
    platformMock.mockReturnValue('ios');
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 'touchId' });
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());

    expect(await screen.findByTestId('theft-protection-unsupported')).toBeTruthy();
    expect(limitCreateMock).not.toHaveBeenCalled();
    expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBeNull();
  });

  // K-2 / I3: setTheftProtectionEnabled is already a no-op in a decoy or demo
  // session, and the seed hangs off what ACTUALLY persisted — so a coerced
  // session writes neither the setting nor a TransactionLimit row. A seeded
  // limit appearing in a decoy would be a tell about the real user's config.
  it('writes neither the setting nor a limit in a decoy/demo session', async () => {
    probeMock.mockResolvedValue({ isAvailable: true, biometryType: 'faceId' });
    deniableMock.mockReturnValue(true);
    render(<TheftProtectionSettings />);
    fireEvent.click(toggle());

    await waitFor(() => expect(probeMock).toHaveBeenCalled());
    expect(localStorage.getItem(THEFT_PROTECTION_KEY)).toBeNull();
    expect(limitCreateMock).not.toHaveBeenCalled();
    expect(limitListMock).not.toHaveBeenCalled();
  });
});

// ── Spend-limit field ───────────────────────────────────────────────────────
//
// The cap that decides when Theft Protection challenges a send was only
// editable in Security Center → Spend Limits, a different screen behind a tab.
// It is now editable here too, on the same TransactionLimit row.
//
// The security-relevant part is the loosening split, mirroring
// SecurityCenter.guardLoosening: RAISING the cap lets more value through
// without a biometric, so it must demand the second factor; LOWERING it only
// tightens and must not. Without that split this field would be a way to raise
// the cap from an unlocked phone and then send freely.

const limitInput = () => screen.getByTestId('theft-protection-limit-input');
const limitSave = () => screen.getByTestId('theft-protection-limit-save');

async function renderEnabledWithLimit(row) {
  localStorage.setItem(THEFT_PROTECTION_KEY, '1');
  limitListMock.mockResolvedValue(row ? [row] : []);
  render(<TheftProtectionSettings />);
  await waitFor(() => expect(limitInput()).toBeTruthy());
  return limitInput();
}

describe('TheftProtectionSettings — spend-limit field', () => {
  it('is hidden until Theft Protection is on', () => {
    render(<TheftProtectionSettings />);
    expect(screen.queryByTestId('theft-protection-limit-input')).toBeNull();
  });

  it('shows the existing cap', async () => {
    const input = await renderEnabledWithLimit({ id: 'l1', currency: 'ALL', enabled: true, per_transaction_limit: 500 });
    await waitFor(() => expect(input.value).toBe('500'));
  });

  it('LOWERING the cap is not gated by the second factor', async () => {
    const input = await renderEnabledWithLimit({ id: 'l1', currency: 'ALL', enabled: true, per_transaction_limit: 500 });
    await waitFor(() => expect(input.value).toBe('500'));
    fireEvent.change(input, { target: { value: '100' } });
    fireEvent.click(limitSave());
    await waitFor(() => expect(limitUpdateMock).toHaveBeenCalledWith('l1', expect.objectContaining({ per_transaction_limit: 100 })));
    expect(twoFactorMock).not.toHaveBeenCalled();
  });

  it('RAISING the cap demands the second factor before writing', async () => {
    twoFactorMock.mockImplementation(() => {}); // user has not satisfied it yet
    const input = await renderEnabledWithLimit({ id: 'l1', currency: 'ALL', enabled: true, per_transaction_limit: 500 });
    await waitFor(() => expect(input.value).toBe('500'));
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.click(limitSave());
    await waitFor(() => expect(twoFactorMock).toHaveBeenCalled());
    expect(limitUpdateMock).not.toHaveBeenCalled();
  });

  it('RAISING writes once the second factor is satisfied', async () => {
    const input = await renderEnabledWithLimit({ id: 'l1', currency: 'ALL', enabled: true, per_transaction_limit: 500 });
    await waitFor(() => expect(input.value).toBe('500'));
    fireEvent.change(input, { target: { value: '5000' } });
    fireEvent.click(limitSave());
    await waitFor(() => expect(limitUpdateMock).toHaveBeenCalledWith('l1', expect.objectContaining({ per_transaction_limit: 5000 })));
  });

  it('setting a cap where there was none only tightens, so it is ungated', async () => {
    const input = await renderEnabledWithLimit(null);
    fireEvent.change(input, { target: { value: '250' } });
    fireEvent.click(limitSave());
    await waitFor(() => expect(limitCreateMock).toHaveBeenCalledWith(expect.objectContaining({ currency: 'ALL', per_transaction_limit: 250, enabled: true })));
    expect(twoFactorMock).not.toHaveBeenCalled();
  });

  it('rejects junk without writing', async () => {
    const input = await renderEnabledWithLimit({ id: 'l1', currency: 'ALL', enabled: true, per_transaction_limit: 500 });
    for (const bad of ['', 'abc', '0', '-5']) {
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.click(limitSave());
      await waitFor(() => expect(screen.getByTestId('theft-protection-limit-note').textContent).toBeTruthy());
      expect(limitUpdateMock).not.toHaveBeenCalled();
      expect(twoFactorMock).not.toHaveBeenCalled();
    }
  });

  it('picks the SMALLEST enabled ALL cap — the one that actually fires first', async () => {
    const input = await renderEnabledWithLimit(null);
    void input;
    cleanup();
    localStorage.setItem(THEFT_PROTECTION_KEY, '1');
    limitListMock.mockResolvedValue([
      { id: 'big', currency: 'ALL', enabled: true, per_transaction_limit: 9000 },
      { id: 'small', currency: 'ALL', enabled: true, per_transaction_limit: 300 },
    ]);
    render(<TheftProtectionSettings />);
    await waitFor(() => expect(limitInput().value).toBe('300'));
  });
});
