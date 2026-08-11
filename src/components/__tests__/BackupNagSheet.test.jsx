// BackupNagSheet — Slice G+H plan §3. Wraps <WalletCreatedFlash compact/>.
//
// RED phase: component does not yet exist. Pins the mount-does-nothing rule
// (mount MUST NOT call markBackupNagShown) and the two user-action paths.

import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const navigateMock = vi.fn();
vi.mock('react-router', async (orig) => {
  const actual = await orig();
  return { ...actual, useNavigate: () => navigateMock };
});

const backupNagMock = {
  shouldShowBackupNag: vi.fn(() => true),
  dismissForSession: vi.fn(),
  markBackupCompleted: vi.fn(),
  markBackupNagShown: vi.fn(),
  onVaultKeySetChanged: vi.fn(),
  markBackupPendingConfirmation: vi.fn(),
  markBackupCompletedFromConfirmation: vi.fn(),
  recordUnlock: vi.fn(),
  subscribe: vi.fn(() => () => {}),
  getVaultFingerprint: vi.fn(() => 'fp-a'),
};
vi.mock('@/lib/backupNag', () => backupNagMock);

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

async function loadSheet() {
  const mod = await import('@/components/BackupNagSheet');
  return mod.default ?? mod.BackupNagSheet;
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

describe('BackupNagSheet', () => {
  it('mount does NOT call markBackupNagShown (avoids self-unmount race)', async () => {
    const Sheet = await loadSheet();
    render(<Sheet addrs={['0xaaa']} />);
    expect(backupNagMock.markBackupNagShown).not.toHaveBeenCalled();
  });

  it('"Not now" click calls dismissForSession', async () => {
    const Sheet = await loadSheet();
    render(<Sheet addrs={['0xaaa']} />);
    fireEvent.click(screen.getByRole('button', { name: /Not now|Skip/i }));
    expect(backupNagMock.dismissForSession).toHaveBeenCalledTimes(1);
  });

  it('"Set up now" click navigates to /personal-backup', async () => {
    const Sheet = await loadSheet();
    render(<Sheet addrs={['0xaaa']} />);
    fireEvent.click(screen.getByRole('button', { name: /Set up|Open backup screen/i }));
    expect(navigateMock).toHaveBeenCalledWith('/personal-backup');
  });

  it('remains rendered across 3 re-renders with no interaction', async () => {
    const Sheet = await loadSheet();
    const { rerender } = render(<Sheet addrs={['0xaaa']} />);
    for (let i = 0; i < 3; i++) rerender(<Sheet addrs={['0xaaa']} />);
    expect(screen.getByRole('button', { name: /Not now|Skip/i })).toBeInTheDocument();
  });

  it('I3: in decoy/demo the sheet does not render', async () => {
    const den = await import('@/wallet-core/deniabilitySession');
    vi.mocked(den.isDeniabilityOrDemoActive).mockReturnValue(true);
    backupNagMock.shouldShowBackupNag.mockReturnValue(false);
    const Sheet = await loadSheet();
    const { container } = render(<Sheet addrs={['0xaaa']} />);
    expect(container.textContent ?? '').not.toMatch(/Set up Personal Backup|Not now/i);
  });
});
