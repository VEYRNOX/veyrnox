import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('copySecret', () => {
  let writtenTexts;
  let originalClipboard;

  beforeEach(() => {
    vi.useFakeTimers();
    writtenTexts = [];
    originalClipboard = navigator.clipboard;
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: vi.fn((t) => { writtenTexts.push(t); return Promise.resolve(); }),
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('writes the provided text to the clipboard', async () => {
    const { copySecret } = await import('@/lib/copySecret');
    await copySecret('abandon about');
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('abandon about');
  });

  it('schedules a wipe to a non-empty sentinel after 30 s (H-NEW-3)', async () => {
    const { copySecret } = await import('@/lib/copySecret');
    await copySecret('abandon about');
    vi.advanceTimersByTime(30_000);
    // H-NEW-3: wipe overwrites with a non-empty sentinel, not '' — an empty
    // write is treated as a new clipboard-history entry by some managers,
    // leaving the secret in history.
    const last = writtenTexts[writtenTexts.length - 1];
    expect(last).not.toBe('');
    expect(last.length).toBeGreaterThan(0);
    expect(last).not.toBe('abandon about');
  });

  it('does NOT wipe before 30 s have elapsed', async () => {
    const { copySecret } = await import('@/lib/copySecret');
    await copySecret('abandon about');
    vi.advanceTimersByTime(29_999);
    // Only the first writeText call — no wipe yet
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
  });

  it('resolves even when clipboard API is unavailable', async () => {
    vi.stubGlobal('navigator', { ...navigator, clipboard: undefined });
    const { copySecret } = await import('@/lib/copySecret');
    await expect(copySecret('abandon about')).resolves.toBeUndefined();
  });
});

// Brief A, Lane 2 (re-applied from closed PR #556): locking the wallet while the
// page stays VISIBLE used to leave the secret on the clipboard until the 30s TTL.
// WalletProvider.lock() now dispatches APP_LOCK_EVENT on window and copySecret
// wipes immediately on it. The wipe runs AT MOST ONCE across all triggers
// (TTL / visibilitychange / app-lock), and every listener is torn down after it.
describe('copySecret — app-lock wipe trigger (Brief A Lane 2)', () => {
  let writtenTexts;

  beforeEach(async () => {
    vi.useFakeTimers();
    writtenTexts = [];
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: vi.fn((t) => { writtenTexts.push(t); return Promise.resolve(); }),
      },
    });
    // Drain listeners left on the shared jsdom window by EARLIER tests' copySecret
    // calls (their wipes never fired), so the counts below are this test's alone.
    const { APP_LOCK_EVENT } = await import('@/lib/copySecret');
    window.dispatchEvent(new Event(APP_LOCK_EVENT));
    vi.advanceTimersByTime(60_000);
    navigator.clipboard.writeText.mockClear();
    writtenTexts.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('wipes immediately when APP_LOCK_EVENT fires (no 30s window after lock)', async () => {
    const { copySecret, APP_LOCK_EVENT } = await import('@/lib/copySecret');
    await copySecret('abandon about');
    expect(writtenTexts).toEqual(['abandon about']);

    window.dispatchEvent(new Event(APP_LOCK_EVENT));
    // The wipe write happened right away — not after the TTL.
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
    const last = writtenTexts[writtenTexts.length - 1];
    expect(last).not.toBe('');
    expect(last).not.toBe('abandon about');
  });

  it('wipes AT MOST once: the TTL timer does not re-wipe after an app-lock wipe', async () => {
    const { copySecret, APP_LOCK_EVENT } = await import('@/lib/copySecret');
    await copySecret('abandon about');
    window.dispatchEvent(new Event(APP_LOCK_EVENT));
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(60_000);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2); // no third write
  });

  it('tears the app-lock listener down after the TTL wipe (no wipe on a later lock)', async () => {
    const { copySecret, APP_LOCK_EVENT } = await import('@/lib/copySecret');
    await copySecret('abandon about');
    vi.advanceTimersByTime(30_000); // TTL wipe fires
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
    window.dispatchEvent(new Event(APP_LOCK_EVENT)); // stale listener would write again
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
  });
});
