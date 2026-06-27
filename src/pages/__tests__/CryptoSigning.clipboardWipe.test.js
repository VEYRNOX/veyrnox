import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCopy } from '@/pages/CryptoSigning';

// M15: sensitive copies (private key, mnemonic) on the CryptoSigning page must
// schedule a 30 s clipboard wipe. Non-sensitive copies (address, signature,
// signed tx) must NOT — wiping a public value the user pasted is just a bug.
// We test the page's pure copy router (makeCopy) independent of React rendering.
//
// We patch only navigator.clipboard.writeText (not the whole navigator object),
// so react-dom's userAgent sniffing at import time is left intact.

describe('CryptoSigning clipboard wipe (M15)', () => {
  let writtenTexts;

  let writeText;

  beforeEach(() => {
    vi.useFakeTimers();
    writtenTexts = [];
    writeText = vi.fn((t) => { writtenTexts.push(t); return Promise.resolve(); });
    // jsdom has no navigator.clipboard; define it without replacing navigator
    // (so react-dom's userAgent sniffing at import time stays intact).
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText },
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    delete navigator.clipboard;
  });

  // H-NEW-3: the wipe overwrites the clipboard with a NON-EMPTY replacement,
  // not '' — an empty write is treated as a fresh history entry by some
  // clipboard managers (Samsung, Gboard), leaving the secret in history.
  // What we pin is that a wipe happened and it replaced the secret, not the
  // exact replacement glyphs.
  const WIPE_REPLACEMENT = '•'.repeat(24);

  it('schedules a wipe after copying the mnemonic (sensitive)', async () => {
    const copy = makeCopy(() => {});
    copy('abandon abandon about', 'mnemonic', { sensitive: true });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(WIPE_REPLACEMENT);
    expect(writtenTexts.at(-1)).not.toBe('abandon abandon about'); // secret was overwritten
  });

  it('schedules a wipe after copying a private key (sensitive)', async () => {
    const copy = makeCopy(() => {});
    copy('0xdeadbeef', 'pk', { sensitive: true });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(WIPE_REPLACEMENT);
  });

  it('does NOT schedule a wipe for an address (non-sensitive)', async () => {
    const copy = makeCopy(() => {});
    copy('0xAddress', 'addr');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(writtenTexts).toEqual(['0xAddress']);
  });
});
