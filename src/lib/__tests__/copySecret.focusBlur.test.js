// src/lib/__tests__/copySecret.focusBlur.test.js
//
// Audit 2026-08-25 M-8 — a page can be VISIBLE but UNFOCUSED (desktop window
// switch, a system dialog, picture-in-picture). `visibilitychange` never fires
// in that case, so before this fix the only wipe triggers were the 30 s timer
// and APP_LOCK_EVENT — a blur landed no attempt at all, and once the TTL wipe
// rejected for lack of focus, nothing else could retry without a visibility
// transition that never comes. `focus`/`blur` close that gap.
//
// Also covers the exhausted-attempts signal (I4): giving up after
// MAX_WIPE_ATTEMPTS with the secret still resident on the clipboard must not
// happen silently.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('copySecret — focus/blur triggers (M-8)', () => {
  let writtenTexts;
  let writesFail;

  beforeEach(async () => {
    vi.useFakeTimers();
    writtenTexts = [];
    writesFail = false;
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: vi.fn((t) => {
          if (writesFail) return Promise.reject(new Error('Document is not focused.'));
          writtenTexts.push(t);
          return Promise.resolve();
        }),
      },
    });
    // Drain listeners left by earlier tests in this file/module.
    const { APP_LOCK_EVENT } = await import('@/lib/copySecret');
    window.dispatchEvent(new Event(APP_LOCK_EVENT));
    await vi.advanceTimersByTimeAsync(60_000);
    navigator.clipboard.writeText.mockClear();
    writtenTexts.length = 0;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('attempts a wipe on blur even though the page stays visible', async () => {
    const { copySecret } = await import('@/lib/copySecret');
    await copySecret('abandon about');
    expect(writtenTexts).toEqual(['abandon about']);

    // Window loses focus but document.visibilityState never changes — no
    // visibilitychange event fires. Before the fix, nothing observed this.
    window.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(0);

    const last = writtenTexts[writtenTexts.length - 1];
    expect(last).not.toBe('abandon about');
    expect(last.length).toBeGreaterThan(0);
  });

  it('retries on focus after a blur-triggered wipe was rejected', async () => {
    const { copySecret } = await import('@/lib/copySecret');
    await copySecret('abandon about');

    writesFail = true;
    window.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(0);
    expect(writtenTexts).toEqual(['abandon about']); // still rejected, nothing wiped

    writesFail = false;
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(0);

    const last = writtenTexts[writtenTexts.length - 1];
    expect(last).not.toBe('abandon about');
    expect(last.length).toBeGreaterThan(0);
  });

  it('tears down the focus/blur listeners after a confirmed wipe', async () => {
    const { copySecret } = await import('@/lib/copySecret');
    await copySecret('abandon about');
    window.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(0);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2); // copy + wipe

    // A later blur must be a no-op — the listener was removed on success.
    window.dispatchEvent(new Event('blur'));
    await vi.advanceTimersByTimeAsync(0);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
  });
});

describe('copySecret — exhausted-attempts signal (M-8, I4)', () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: {
        writeText: vi.fn(() => Promise.resolve()),
      },
    });
    const { APP_LOCK_EVENT } = await import('@/lib/copySecret');
    window.dispatchEvent(new Event(APP_LOCK_EVENT));
    await vi.advanceTimersByTimeAsync(60_000);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('dispatches WIPE_EXHAUSTED_EVENT when every wipe attempt is rejected', async () => {
    const { copySecret, WIPE_EXHAUSTED_EVENT } = await import('@/lib/copySecret');
    expect(WIPE_EXHAUSTED_EVENT).toBeTruthy();

    // Every clipboard write after the initial copy rejects — the wipe can
    // never land, and MAX_WIPE_ATTEMPTS caps the retries.
    let first = true;
    navigator.clipboard.writeText.mockImplementation((t) => {
      if (first) { first = false; return Promise.resolve(); }
      return Promise.reject(new Error('Document is not focused.'));
    });

    const heard = vi.fn();
    window.addEventListener(WIPE_EXHAUSTED_EVENT, heard);

    await copySecret('abandon about');
    // Retry via the TTL + refocus/blur cycle enough times to exhaust attempts.
    for (let i = 0; i < 10; i += 1) {
      window.dispatchEvent(new Event('blur'));
      await vi.advanceTimersByTimeAsync(0);
      window.dispatchEvent(new Event('focus'));
      await vi.advanceTimersByTimeAsync(0);
    }

    window.removeEventListener(WIPE_EXHAUSTED_EVENT, heard);
    expect(heard).toHaveBeenCalledTimes(1);
  });
});
