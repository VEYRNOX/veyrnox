// Panic wipe must cancel pending OS notifications (security diff 2026-09-21).
//
// armDormancyReminder() schedules LocalNotifications id 9005 ("It's been a
// while since you opened Veyrnox") 7 days out on every unlock. A pending OS
// notification survives localStorage/IndexedDB erasure and fires on the lock
// screen after a wipe — proof of prior use. ALL_RESIDUE_KEYS cannot see it,
// so inspectKeyMaterial().clean cannot catch it; this test does.

import { describe, it, expect, vi, beforeEach } from 'vitest';

const cancel = vi.fn(async () => {});

vi.mock('@capacitor/core', async (orig) => {
  const actual = await orig();
  return {
    ...actual,
    Capacitor: { ...actual.Capacitor, isNativePlatform: () => true, getPlatform: () => 'ios' },
  };
});

// Forcing native would route the secure-store sweep to a plugin that has no
// web implementation; it is not what this test is about.
vi.mock('@/lib/secureStore.js', () => ({
  secureWipeAll: vi.fn(async () => {}),
  inspectSecureStore: vi.fn(async () => ({ residue: [], verified: true })),
}));

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: { cancel, schedule: vi.fn(async () => {}) },
}));

import { panicWipeLocal, clearWipeMarker } from '../panic.js';

describe('panic wipe — pending OS notifications (I3 residue)', () => {
  beforeEach(() => {
    cancel.mockClear();
    try { clearWipeMarker(); } catch { /* noop */ }
  });

  it('cancels the dormancy reminder (id 9005) and every other reminder id', async () => {
    await panicWipeLocal();
    const ids = cancel.mock.calls.flatMap(([arg]) => arg.notifications.map((n) => n.id));
    expect(ids).toContain(9005);
    for (const id of [9001, 9002, 9003, 9004]) expect(ids).toContain(id);
  });
});
