// src/components/security/__tests__/HardwareKekSettings.upgrade.test.jsx
//
// Covers the one-time, user-consented "Upgrade protection" re-enroll of a legacy
// (< v3) hardware-KEK vault to a genuinely per-enrollment salt-bound v3 wrap (C-1).
// This is the settings-UI half of the fix that removed the silent per-unlock v2→v3
// migration (PR #662). Native branch only (isNative=true).
//
// Pins:
//   (a) the "Upgrade available" section renders ONLY for an enrolled vault whose
//       getVaultKekVersion() < 3;
//   (b) it does NOT render for a v3 vault (nothing to upgrade);
//   (c) confirming the flow calls keyStore.upgradeKekToV3(pin, { getHardwareFactor });
//   (d) success announces + records audit + hides the section (now v3);
//   (e) a failure is classified by STABLE code, never rendering raw thrown text (I4).
//
// getKeyStore / hardware.js are mocked so no real crypto or native plugin runs.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react';

// Force the NATIVE branch.
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true },
}));

const mockRecordAudit = vi.fn();
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ isDecoy: false, isHidden: false, recordAudit: mockRecordAudit }),
}));

// Native keystore facade. getVaultKekVersion drives whether the upgrade shows.
const upgradeKekToV3Fn = vi.fn(async () => ({ upgraded: true, version: 3 }));
let vaultVersion = 2;
vi.mock('@/wallet-core/keystore', () => ({
  getKeyStore: () => ({
    hasVaultKekWrap: async () => true,
    getVaultKekTier: async () => 'STRONGBOX',
    getVaultKekVersion: async () => vaultVersion,
    upgradeKekToV3: upgradeKekToV3Fn,
    enrollKek: vi.fn(async () => {}),
    unenrollKek: vi.fn(async () => {}),
  }),
}));

// hardware.js — the component imports getHardwareFactor + isHardwareEnrolled from here.
const getHardwareFactorFn = vi.fn(async () => new Uint8Array(32));
vi.mock('@/wallet-core/keystore/hardware.js', () => ({
  isHardwareEnrolled: vi.fn(async () => true),
  clearHardwareCredential: vi.fn(async () => {}),
  getHardwareFactor: getHardwareFactorFn,
  enrollHardwareCredential: vi.fn(async () => ({ securityLevelName: 'STRONGBOX' })),
}));

// PinPad stub: a submit button labelled with submitLabel that fires onComplete(value).
vi.mock('@/components/security/PinPad', () => ({
  default: ({ onComplete, submitLabel }) => (
    <button onClick={() => onComplete('12345678')}>{submitLabel}</button>
  ),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const { KEK_ERR } = await import('@/wallet-core/keystore/kek.js');
const { toast } = await import('sonner');
const HardwareKekSettings = (await import('@/components/security/HardwareKekSettings')).default;

async function renderEnrolled() {
  await act(async () => { render(<HardwareKekSettings />); });
  // Wait for the native useEffect chain (enrolled + tier + version) to settle.
  await screen.findByText('Active on this device');
}

function codeErr(code) {
  return Object.assign(new Error('internal detail that must not leak'), { code });
}

beforeEach(() => { vi.clearAllMocks(); vaultVersion = 2; });
afterEach(() => cleanup());

describe('Upgrade protection (legacy < v3 vault)', () => {
  it('shows the upgrade section for a v2 vault', async () => {
    await renderEnrolled();
    expect(screen.getByText('Upgrade available')).toBeTruthy();
    expect(screen.getByText('Upgrade hardware protection')).toBeTruthy();
  });

  it('does NOT show the upgrade section for a v3 vault', async () => {
    vaultVersion = 3;
    await renderEnrolled();
    expect(screen.queryByText('Upgrade available')).toBeNull();
    expect(screen.queryByText('Upgrade hardware protection')).toBeNull();
  });

  it('confirming calls upgradeKekToV3(pin, { getHardwareFactor }) and announces success', async () => {
    await renderEnrolled();
    // First click opens the PIN flow; second click is the PinPad stub's submit.
    await act(async () => { fireEvent.click(screen.getByText('Upgrade hardware protection')); });
    await act(async () => { fireEvent.click(screen.getByText('Upgrade hardware protection')); });

    expect(upgradeKekToV3Fn).toHaveBeenCalledTimes(1);
    const [pinArg, optsArg] = upgradeKekToV3Fn.mock.calls[0];
    expect(pinArg).toBe('12345678');
    expect(optsArg.getHardwareFactor).toBe(getHardwareFactorFn);
    expect(toast.success).toHaveBeenCalled();
    expect(mockRecordAudit).toHaveBeenCalledWith('settings_changed');
  });

  it('a failed upgrade is classified by code, never rendering raw thrown text (I4)', async () => {
    upgradeKekToV3Fn.mockRejectedValueOnce(codeErr(KEK_ERR.UNWRAP_FAILED));
    await renderEnrolled();
    await act(async () => { fireEvent.click(screen.getByText('Upgrade hardware protection')); });
    await act(async () => { fireEvent.click(screen.getByText('Upgrade hardware protection')); });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toMatch(/PIN/i);
    expect(alert.textContent).not.toMatch(/internal detail/i);
  });
});
