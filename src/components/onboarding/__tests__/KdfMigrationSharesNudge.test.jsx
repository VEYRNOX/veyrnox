// KdfMigrationSharesNudge — surfaces the KDF v1→v2 migration tradeoff to
// users with active Personal Backup shares (owner-ruled flag flip 2026-08-25).
//
// Renders IFF: Android + pending marker present + not deniability/demo +
// not dismissed. "Not now" writes the dismissed marker; "Regenerate shares"
// routes to /personal-backup.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, waitFor, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';

const getPlatformMock = vi.fn(() => 'android');
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: (...a) => getPlatformMock(...a) },
}));

const navigateMock = vi.fn();
vi.mock('react-router', async () => {
  const actual = await vi.importActual('react-router');
  return { ...actual, useNavigate: () => navigateMock };
});

import {
  NUDGE_PENDING_KEY,
  NUDGE_DISMISSED_KEY,
} from '@/wallet-core/keystore/kdfMigrationGuard';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession';
import KdfMigrationSharesNudge from '@/components/onboarding/KdfMigrationSharesNudge';

const TESTID = 'kdf-migration-shares-nudge';

async function renderWait() {
  render(
    <MemoryRouter>
      <KdfMigrationSharesNudge />
    </MemoryRouter>
  );
  // Card sets state in a useEffect; give React one tick to flush.
  await act(async () => { await Promise.resolve(); });
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  setDeniabilitySession(false);
  navigateMock.mockReset();
  getPlatformMock.mockReturnValue('android');
});
afterEach(() => { cleanup(); });

describe('KdfMigrationSharesNudge', () => {
  it('renders when the pending marker is set on Android with no dismissal', async () => {
    localStorage.setItem(NUDGE_PENDING_KEY, '1');
    await renderWait();
    expect(screen.queryByTestId(TESTID)).not.toBeNull();
  });

  it('does NOT render when the pending marker is absent', async () => {
    await renderWait();
    expect(screen.queryByTestId(TESTID)).toBeNull();
  });

  it('does NOT render on non-Android', async () => {
    getPlatformMock.mockReturnValue('ios');
    localStorage.setItem(NUDGE_PENDING_KEY, '1');
    await renderWait();
    expect(screen.queryByTestId(TESTID)).toBeNull();
  });

  it('does NOT render in a deniability/demo session (I3)', async () => {
    setDeniabilitySession(true);
    localStorage.setItem(NUDGE_PENDING_KEY, '1');
    await renderWait();
    expect(screen.queryByTestId(TESTID)).toBeNull();
  });

  it('does NOT render once the dismissed marker is set', async () => {
    localStorage.setItem(NUDGE_PENDING_KEY, '1');
    localStorage.setItem(NUDGE_DISMISSED_KEY, '1');
    await renderWait();
    expect(screen.queryByTestId(TESTID)).toBeNull();
  });

  it('"Not now" writes the dismissed marker and hides the card', async () => {
    localStorage.setItem(NUDGE_PENDING_KEY, '1');
    await renderWait();
    fireEvent.click(screen.getByTestId('kdf-migration-shares-nudge-not-now'));
    await waitFor(() => expect(screen.queryByTestId(TESTID)).toBeNull());
    expect(localStorage.getItem(NUDGE_DISMISSED_KEY)).toBe('1');
  });

  it('"Regenerate shares" routes to /personal-backup and hides the card', async () => {
    localStorage.setItem(NUDGE_PENDING_KEY, '1');
    await renderWait();
    fireEvent.click(screen.getByTestId('kdf-migration-shares-nudge-regenerate'));
    await waitFor(() => expect(screen.queryByTestId(TESTID)).toBeNull());
    expect(navigateMock).toHaveBeenCalledWith('/personal-backup');
    // "Regenerate shares" is NOT a dismissal — the pending marker still
    // decides whether a subsequent unlock deferred a rekey. Never writes the
    // dismissed marker.
    expect(localStorage.getItem(NUDGE_DISMISSED_KEY)).toBeNull();
  });
});
