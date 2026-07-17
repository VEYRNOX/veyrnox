// src/lib/__tests__/kekPinNotice.test.js
//
// S1-S4 audit M-9: native users whose vault has no hardware KEK wrap receive a
// one-time toast.warning explaining that an 8-digit PIN is offline-exhaustible.
// The notice fires once (localStorage marker), is skipped when already enrolled,
// and never throws (best-effort — must not block unlock).

import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- mocks -------------------------------------------------------------------

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: vi.fn(() => true) },
}));

vi.mock('sonner', () => ({
  toast: { warning: vi.fn() },
}));

// Keystore module — control hasVaultKekWrap per test
const mockKeyStore = { hasVaultKekWrap: vi.fn(async () => false) };
vi.mock('@/wallet-core/keystore', () => ({
  getKeyStore: () => mockKeyStore,
}));

// I3 LIVE deniability/demo check (issue #1094): kekPinNotice must not fire and
// must not persist its localStorage marker inside a decoy/hidden/demo session.
vi.mock('@/wallet-core/deniabilitySession.js', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';

// --- helpers -----------------------------------------------------------------

import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
const keyStore = mockKeyStore;

const LS_KEY = 'veyrnox-kek-pin-notice';

function resetLocalStorage() {
  localStorage.removeItem(LS_KEY);
}

// Import lazily so mocks are in place first
async function getModule() {
  const mod = await import('../kekPinNotice.js');
  return mod;
}

// --- tests -------------------------------------------------------------------

describe('ensureKekPinNoticeOnNative — M-9 short-PIN disclosure', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetLocalStorage();
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(true);
    vi.mocked(keyStore.hasVaultKekWrap).mockResolvedValue(false);
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(false);
  });

  // --- I3 guard (issue #1094 — GAP-6-adjacent) ------------------------------

  it('I3: does NOT show toast.warning in a decoy/hidden/demo session', async () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    const { ensureKekPinNoticeOnNative } = await getModule();
    await ensureKekPinNoticeOnNative();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('I3: does NOT write the localStorage marker in a decoy/hidden/demo session', async () => {
    vi.mocked(isDeniabilityOrDemoActive).mockReturnValue(true);
    const { ensureKekPinNoticeOnNative } = await getModule();
    await ensureKekPinNoticeOnNative();
    expect(localStorage.getItem(LS_KEY)).toBeNull();
  });

  it('shows toast.warning on first launch for an unenrolled native user', async () => {
    const { ensureKekPinNoticeOnNative } = await getModule();
    await ensureKekPinNoticeOnNative();
    expect(toast.warning).toHaveBeenCalledOnce();
    const msg = vi.mocked(toast.warning).mock.calls[0][0];
    expect(msg).toMatch(/PIN/i);
    expect(msg).toMatch(/100.?[Mm]illion|100M/);
  });

  it('sets the localStorage marker so the notice is not shown again', async () => {
    const { ensureKekPinNoticeOnNative } = await getModule();
    await ensureKekPinNoticeOnNative();
    expect(localStorage.getItem(LS_KEY)).toBe('1');
  });

  it('does NOT show the toast on subsequent launches (marker present)', async () => {
    localStorage.setItem(LS_KEY, '1');
    const { ensureKekPinNoticeOnNative } = await getModule();
    await ensureKekPinNoticeOnNative();
    expect(toast.warning).not.toHaveBeenCalled();
  });

  it('does NOT show the toast when hardware KEK is already enrolled', async () => {
    vi.mocked(keyStore.hasVaultKekWrap).mockResolvedValue(true);
    const { ensureKekPinNoticeOnNative } = await getModule();
    await ensureKekPinNoticeOnNative();
    expect(toast.warning).not.toHaveBeenCalled();
    // still marks so it never fires retroactively if user later unenrolls
    expect(localStorage.getItem(LS_KEY)).toBe('1');
  });

  it('is a no-op on web (non-native)', async () => {
    vi.mocked(Capacitor.isNativePlatform).mockReturnValue(false);
    const { ensureKekPinNoticeOnNative } = await getModule();
    await ensureKekPinNoticeOnNative();
    expect(toast.warning).not.toHaveBeenCalled();
    expect(localStorage.getItem(LS_KEY)).toBeNull();
  });

  it('never throws even when keyStore.hasVaultKekWrap rejects', async () => {
    vi.mocked(keyStore.hasVaultKekWrap).mockRejectedValue(new Error('KEK read error'));
    const { ensureKekPinNoticeOnNative } = await getModule();
    await expect(ensureKekPinNoticeOnNative()).resolves.toBeUndefined();
  });

  it('exports KEK_PIN_NOTICE_KEY matching the localStorage key used', async () => {
    const { KEK_PIN_NOTICE_KEY } = await getModule();
    expect(KEK_PIN_NOTICE_KEY).toBe(LS_KEY);
  });
});
