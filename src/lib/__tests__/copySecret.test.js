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
