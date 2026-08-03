// src/lib/__tests__/copySecret.refocus.test.js
//
// Audit 2026-08-03 H-2 — the clipboard wipe must not give up when the write is
// REJECTED.
//
// `navigator.clipboard.writeText` requires document focus in most browsers, so
// the wipe issued by the `visibilitychange` → hidden trigger is precisely the
// one most likely to reject. Before this fix, `wipe()` set `done = true` and
// tore down the TTL timer and both listeners BEFORE the write resolved, then
// swallowed the rejection — so backgrounding the app (copy seed → switch to a
// password manager to paste it, the normal flow) left the seed phrase on the OS
// clipboard permanently, with every retry path already dismantled.
//
// The wipe must stay armed on failure and retry when focus returns.
//
// These tests are behavioural, not source-scanning: they drive the real
// listeners with a clipboard that rejects while hidden and succeeds when
// visible, which is the actual browser behaviour being defended against.

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

function setVisibility(state) {
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => state,
  });
}

describe('copySecret — wipe survives a rejected write (H-2)', () => {
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
          // Mirrors the browser: a blurred/hidden document rejects the write.
          if (writesFail) return Promise.reject(new Error('Document is not focused.'));
          writtenTexts.push(t);
          return Promise.resolve();
        }),
      },
    });
    // Drain listeners left on the shared jsdom window by earlier tests in this
    // file (same pattern as copySecret.test.js's app-lock suite).
    const { APP_LOCK_EVENT } = await import('@/lib/copySecret');
    setVisibility('visible');
    window.dispatchEvent(new Event(APP_LOCK_EVENT));
    await vi.advanceTimersByTimeAsync(60_000);
    navigator.clipboard.writeText.mockClear();
    writtenTexts.length = 0;
  });

  afterEach(() => {
    setVisibility('visible');
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('retries the wipe when the page becomes visible after a rejected hidden-wipe', async () => {
    const { copySecret } = await import('@/lib/copySecret');
    await copySecret('abandon about');
    expect(writtenTexts).toEqual(['abandon about']);

    // Background the app — the wipe fires but the write rejects (no focus).
    writesFail = true;
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    // Nothing was wiped: the secret is still the last thing on the clipboard.
    expect(writtenTexts).toEqual(['abandon about']);

    // Focus returns; the clipboard is writable again.
    writesFail = false;
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);

    const last = writtenTexts[writtenTexts.length - 1];
    expect(last).not.toBe('abandon about');
    expect(last.length).toBeGreaterThan(0);
  });

  it('retries on the TTL timer when a hidden-wipe was rejected and focus returned', async () => {
    const { copySecret } = await import('@/lib/copySecret');
    await copySecret('abandon about');

    // A rejected early wipe must NOT cancel the 30 s TTL fallback.
    writesFail = true;
    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(writtenTexts).toEqual(['abandon about']);

    // Focus is back but no visibilitychange is delivered; the TTL must still fire.
    writesFail = false;
    setVisibility('visible');
    await vi.advanceTimersByTimeAsync(30_000);

    const last = writtenTexts[writtenTexts.length - 1];
    expect(last).not.toBe('abandon about');
    expect(last.length).toBeGreaterThan(0);
  });

  it('does not re-wipe after a write that SUCCEEDED (at-most-once preserved)', async () => {
    const { copySecret } = await import('@/lib/copySecret');
    await copySecret('abandon about');

    setVisibility('hidden');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2); // copy + wipe

    // Every later trigger must be a no-op once the wipe has actually landed.
    setVisibility('visible');
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(2);
  });
});
