// BackupNagSheet — gentle Safety Plus nudge (replaces former Personal Backup push).
//
// Pins: mount does NOT call markBackupNagShown, dismiss button works,
// CTA navigates to /plans (not /personal-backup), I3 suppression.

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

  it('dismiss button calls dismissForSession', async () => {
    const Sheet = await loadSheet();
    render(<Sheet addrs={['0xaaa']} />);
    fireEvent.click(screen.getByRole('button', { name: /dismiss/i }));
    expect(backupNagMock.dismissForSession).toHaveBeenCalledTimes(1);
  });

  it('"Learn about Safety Plus" navigates to /plans', async () => {
    const Sheet = await loadSheet();
    render(<Sheet addrs={['0xaaa']} />);
    fireEvent.click(screen.getByRole('button', { name: /learn about safety plus/i }));
    expect(navigateMock).toHaveBeenCalledWith('/plans');
  });

  it('I3: in decoy/demo the sheet does not render', async () => {
    const den = await import('@/wallet-core/deniabilitySession');
    vi.mocked(den.isDeniabilityOrDemoActive).mockReturnValue(true);
    backupNagMock.shouldShowBackupNag.mockReturnValue(false);
    const Sheet = await loadSheet();
    const { container } = render(<Sheet addrs={['0xaaa']} />);
    expect(container.textContent ?? '').not.toMatch(/Safety Plus|Protect/i);
  });
});
