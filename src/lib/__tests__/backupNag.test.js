// backupNag — pure module contract (Slice G+H plan §1).
//
// RED phase: module does not yet exist. Every test asserts a shape /
// transition the plan pins. See docs/superpowers/plans/2026-08-10-wallet-
// created-flash-slice-g.md §1.
//
// Two-chokepoint K-2 pattern mirrors src/lib/consent.js: both reads and writes
// gate on isDeniabilityOrDemoActive() inside the module — no call site is
// trusted with the invariant.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

const ADDRS_A = [
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
];
const ADDRS_B = [
  '0x0000000000000000000000000000000000000001',
  '0x0000000000000000000000000000000000000002',
  '0x0000000000000000000000000000000000000003',
];

const STATE_KEY   = 'veyrnox-backup-state-v1';
const CADENCE_KEY = 'veyrnox-backup-nag-v1';
const SESSION_KEY = 'veyrnox-backup-nag-session-skip';

async function loadModule() {
  return await import('@/lib/backupNag');
}

async function loadDeniabilityMock() {
  return (await import('@/wallet-core/deniabilitySession'));
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  vi.clearAllMocks();
  const { isDeniabilityOrDemoActive } = await loadDeniabilityMock();
  vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
  vi.resetModules();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('backupNag — fingerprint', () => {
  it('getVaultFingerprint is stable for the same address set', async () => {
    const { getVaultFingerprint } = await loadModule();
    expect(getVaultFingerprint(ADDRS_A)).toBe(getVaultFingerprint(ADDRS_A));
  });

  it('getVaultFingerprint changes when the address set grows', async () => {
    const { getVaultFingerprint } = await loadModule();
    expect(getVaultFingerprint(ADDRS_A)).not.toBe(getVaultFingerprint(ADDRS_B));
  });
});

describe('backupNag — state transitions', () => {
  it('shouldShowBackupNag is true on a fresh install', async () => {
    const { shouldShowBackupNag } = await loadModule();
    expect(shouldShowBackupNag(ADDRS_A)).toBe(true);
  });

  it('markBackupCompleted flips shouldShowBackupNag to false for the matching fp', async () => {
    const { markBackupCompleted, shouldShowBackupNag } = await loadModule();
    markBackupCompleted(ADDRS_A);
    expect(shouldShowBackupNag(ADDRS_A)).toBe(false);
  });

  it('markBackupPendingConfirmation does NOT satisfy the nag on its own', async () => {
    const { markBackupPendingConfirmation, shouldShowBackupNag } = await loadModule();
    markBackupPendingConfirmation(ADDRS_A);
    expect(shouldShowBackupNag(ADDRS_A)).toBe(true);
  });

  it('markBackupCompletedFromConfirmation promotes pending → completed', async () => {
    const { markBackupPendingConfirmation, markBackupCompletedFromConfirmation, shouldShowBackupNag } = await loadModule();
    markBackupPendingConfirmation(ADDRS_A);
    markBackupCompletedFromConfirmation();
    expect(shouldShowBackupNag(ADDRS_A)).toBe(false);
  });

  it('onVaultKeySetChanged after completion invalidates it (fingerprint mismatch)', async () => {
    const { markBackupCompleted, onVaultKeySetChanged, shouldShowBackupNag } = await loadModule();
    markBackupCompleted(ADDRS_A);
    expect(shouldShowBackupNag(ADDRS_A)).toBe(false);
    onVaultKeySetChanged(ADDRS_B);
    expect(shouldShowBackupNag(ADDRS_B)).toBe(true);
  });
});

describe('backupNag — cadence', () => {
  it('first-time show fires when cadence is untouched', async () => {
    const { shouldShowBackupNag } = await loadModule();
    expect(shouldShowBackupNag(ADDRS_A)).toBe(true);
  });

  it('after markBackupNagShown the nag hides until the 5-unlock threshold', async () => {
    const { markBackupNagShown, recordUnlock, shouldShowBackupNag } = await loadModule();
    markBackupNagShown();
    expect(shouldShowBackupNag(ADDRS_A)).toBe(false);
    for (let i = 0; i < 4; i++) recordUnlock();
    expect(shouldShowBackupNag(ADDRS_A)).toBe(false);
    recordUnlock(); // 5th
    expect(shouldShowBackupNag(ADDRS_A)).toBe(true);
  });

  it('after markBackupNagShown the nag re-fires at the 3-day threshold', async () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-08-10T00:00:00Z').getTime();
    vi.setSystemTime(t0);
    const { markBackupNagShown, shouldShowBackupNag } = await loadModule();
    markBackupNagShown();
    expect(shouldShowBackupNag(ADDRS_A)).toBe(false);
    vi.setSystemTime(t0 + 3 * 86400_000 + 1);
    expect(shouldShowBackupNag(ADDRS_A)).toBe(true);
  });

  it('a clock rollback resets counters and shows the nag', async () => {
    vi.useFakeTimers();
    const t0 = new Date('2026-08-10T12:00:00Z').getTime();
    vi.setSystemTime(t0);
    const { markBackupNagShown, shouldShowBackupNag } = await loadModule();
    markBackupNagShown();
    expect(shouldShowBackupNag(ADDRS_A)).toBe(false);
    vi.setSystemTime(t0 - 60_000);
    expect(shouldShowBackupNag(ADDRS_A)).toBe(true);
  });
});

describe('backupNag — session skip', () => {
  it('dismissForSession short-circuits shouldShowBackupNag for the rest of the session', async () => {
    const { dismissForSession, shouldShowBackupNag } = await loadModule();
    expect(shouldShowBackupNag(ADDRS_A)).toBe(true);
    dismissForSession();
    expect(shouldShowBackupNag(ADDRS_A)).toBe(false);
  });

  it('new session re-evaluates against cadence (dismiss bumps lastShownTs; 5-unlock or 3-day threshold gates re-show)', async () => {
    const { dismissForSession, shouldShowBackupNag, recordUnlock } = await loadModule();
    dismissForSession();
    expect(shouldShowBackupNag(ADDRS_A)).toBe(false);
    sessionStorage.clear();
    // Fresh session but cadence is still fresh (lastShownTs = now, counter = 0) → quiet.
    expect(shouldShowBackupNag(ADDRS_A)).toBe(false);
    // 5 unlocks later → re-eligible.
    for (let i = 0; i < 5; i++) recordUnlock();
    expect(shouldShowBackupNag(ADDRS_A)).toBe(true);
  });
});

describe('backupNag — I3 chokepoint (K-2 pattern)', () => {
  it('shouldShowBackupNag returns a bare boolean false in decoy/demo', async () => {
    const { isDeniabilityOrDemoActive } = await loadDeniabilityMock();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    const { shouldShowBackupNag } = await loadModule();
    const v = shouldShowBackupNag(ADDRS_A);
    expect(typeof v).toBe('boolean');
    expect(v).toBe(false);
  });

  it('writers no-op silently in decoy/demo — no localStorage / sessionStorage mutation', async () => {
    const { isDeniabilityOrDemoActive } = await loadDeniabilityMock();
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    const { markBackupCompleted, markBackupPendingConfirmation, markBackupCompletedFromConfirmation, markBackupNagShown, recordUnlock, dismissForSession, onVaultKeySetChanged } = await loadModule();

    markBackupCompleted(ADDRS_A);
    markBackupPendingConfirmation(ADDRS_A);
    markBackupCompletedFromConfirmation();
    markBackupNagShown();
    recordUnlock();
    dismissForSession();
    onVaultKeySetChanged(ADDRS_A);

    expect(localStorage.getItem(STATE_KEY)).toBeNull();
    expect(localStorage.getItem(CADENCE_KEY)).toBeNull();
    expect(sessionStorage.getItem(SESSION_KEY)).toBeNull();
  });
});

describe('backupNag — subscribe', () => {
  it('subscribe callback fires on writes; unsubscribe stops delivery', async () => {
    const { subscribe, markBackupNagShown, dismissForSession } = await loadModule();
    const cb = vi.fn();
    const unsub = subscribe(cb);
    markBackupNagShown();
    expect(cb).toHaveBeenCalled();
    const n = cb.mock.calls.length;
    unsub();
    dismissForSession();
    expect(cb.mock.calls.length).toBe(n);
  });
});
