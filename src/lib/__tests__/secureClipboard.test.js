import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Lane 2 (Brief A) — sensitive-clipboard utility spec.
//
// We patch ONLY navigator.clipboard.writeText (not the whole navigator object),
// mirroring the pattern in src/pages/__tests__/CryptoSigning.clipboardWipe.test.js
// so react-dom's userAgent sniffing at import time stays intact.
//
// H-NEW-3: the wipe overwrites the clipboard with a NON-EMPTY replacement, not ''
// — an empty write is treated as a fresh history entry by some clipboard managers
// (Samsung, Gboard), leaving the secret in history. We assert the wipe replaced
// the secret with something non-empty, not the exact glyphs.

describe('secureClipboard.copySensitive', () => {
  let writtenTexts;
  let writeText;

  beforeEach(() => {
    vi.useFakeTimers();
    writtenTexts = [];
    writeText = vi.fn((t) => { writtenTexts.push(t); return Promise.resolve(); });
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
    // Ensure a clean, visible document for each test.
    Object.defineProperty(document, 'visibilityState', {
      value: 'visible', configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete navigator.clipboard;
  });

  it('writes text, then wipes with a non-empty replacement at TTL; cleared resolves', async () => {
    const { copySensitive } = await import('@/lib/secureClipboard');
    const { copied, cleared } = await copySensitive('abandon about');
    expect(copied).toBe(true);
    expect(writtenTexts).toEqual(['abandon about']);

    await vi.advanceTimersByTimeAsync(30_000);
    await cleared;

    const last = writtenTexts.at(-1);
    expect(last).not.toBe('');
    expect(last.length).toBeGreaterThan(0);
    expect(last).not.toBe('abandon about');
    expect(writtenTexts).toHaveLength(2); // one real write + one wipe
  });

  it('APP_LOCK_EVENT before TTL wipes immediately and cancels the timer', async () => {
    const { copySensitive, APP_LOCK_EVENT } = await import('@/lib/secureClipboard');
    const { cleared } = await copySensitive('abandon about');

    window.dispatchEvent(new Event(APP_LOCK_EVENT));
    await cleared;
    expect(writtenTexts).toHaveLength(2); // real write + one lock wipe

    // Advancing past the TTL must NOT produce a second wipe (timer cancelled).
    await vi.advanceTimersByTimeAsync(60_000);
    expect(writtenTexts).toHaveLength(2);
  });

  it('visibilitychange -> hidden wipes immediately and cancels the timer', async () => {
    const { copySensitive } = await import('@/lib/secureClipboard');
    const { cleared } = await copySensitive('abandon about');

    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden', configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await cleared;
    expect(writtenTexts).toHaveLength(2); // real write + one hidden wipe

    await vi.advanceTimersByTimeAsync(60_000);
    expect(writtenTexts).toHaveLength(2);
  });

  it('fails honest when clipboard API is absent: { copied:false, cleared:null }, no throw', async () => {
    delete navigator.clipboard;
    const { copySensitive, canAutoClear } = await import('@/lib/secureClipboard');
    expect(canAutoClear().available).toBe(false);

    const result = await copySensitive('abandon about');
    expect(result).toEqual({ copied: false, cleared: null });
  });

  it('canAutoClear reports available when writeText exists', async () => {
    const { canAutoClear } = await import('@/lib/secureClipboard');
    expect(canAutoClear().available).toBe(true);
  });

  it('wipes at most once across multiple triggers (lock then TTL then hidden)', async () => {
    const { copySensitive, APP_LOCK_EVENT } = await import('@/lib/secureClipboard');
    const { cleared } = await copySensitive('abandon about');

    window.dispatchEvent(new Event(APP_LOCK_EVENT));
    window.dispatchEvent(new Event(APP_LOCK_EVENT));
    Object.defineProperty(document, 'visibilityState', {
      value: 'hidden', configurable: true,
    });
    document.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(60_000);
    await cleared;

    expect(writtenTexts).toHaveLength(2); // exactly one wipe despite many triggers
  });
});
