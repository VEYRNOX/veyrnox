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

  it('schedules a wipe to empty string after 30 s', async () => {
    const { copySecret } = await import('@/lib/copySecret');
    await copySecret('abandon about');
    vi.advanceTimersByTime(30_000);
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith('');
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
