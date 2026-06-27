import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { makeCopy } from '@/pages/HDWalletManager';

// M15: the recovery-phrase ("seed") copy on the Wallet Manager page is sensitive
// and must schedule a 30 s clipboard wipe. Public address copies must NOT wipe.
// We test the page's pure copy router (makeCopy) independent of React rendering.
//
// We patch only navigator.clipboard.writeText (not the whole navigator object),
// so react-dom's userAgent sniffing at import time is left intact.

describe('HDWalletManager clipboard wipe (M15)', () => {
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
  const WIPE_REPLACEMENT = '•'.repeat(24);

  it('schedules a wipe after copying the recovery phrase (sensitive)', async () => {
    const copy = makeCopy(() => {});
    copy('abandon abandon about', 'seed', { sensitive: true });
    await vi.advanceTimersByTimeAsync(30_000);
    expect(navigator.clipboard.writeText).toHaveBeenLastCalledWith(WIPE_REPLACEMENT);
    expect(writtenTexts.at(-1)).not.toBe('abandon abandon about'); // secret was overwritten
  });

  it('does NOT schedule a wipe for a public address (non-sensitive)', async () => {
    const copy = makeCopy(() => {});
    copy('0xAddress', 'evm-account');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(navigator.clipboard.writeText).toHaveBeenCalledTimes(1);
    expect(writtenTexts).toEqual(['0xAddress']);
  });
});
