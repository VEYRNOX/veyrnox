import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Real-wallet rewrite: the CryptoSigning page no longer holds or copies any
// SECRET (no mnemonic, no private key) — signing is scoped inside
// withPrivateKey and the only copyable values are PUBLIC (the wallet address and
// the signature). makeCopy therefore has NO sensitive branch: every copy is a
// plain copy (copyPlain) with no clipboard-wipe timer. This test pins that:
// nothing schedules a 30 s wipe, because nothing sensitive is ever copied here.

// Spy on the copy helpers so we can assert makeCopy routes to copyPlain, never
// copySecret (which is the wiping path). vi.hoisted so the spies exist when the
// hoisted vi.mock factory runs.
const { copyPlain, copySecret } = vi.hoisted(() => ({ copyPlain: vi.fn(), copySecret: vi.fn() }));
vi.mock('@/lib/copySecret', () => ({ copyPlain, copySecret }));

import { makeCopy } from '@/pages/CryptoSigning';

describe('CryptoSigning clipboard — public-only, no secret wipe path', () => {
  beforeEach(() => {
    copyPlain.mockClear();
    copySecret.mockClear();
  });
  afterEach(() => vi.clearAllTimers());

  it('copies the address via copyPlain (no wipe)', () => {
    const copy = makeCopy(() => {});
    copy('0xAddress', 'addr');
    expect(copyPlain).toHaveBeenCalledWith('0xAddress');
    expect(copySecret).not.toHaveBeenCalled();
  });

  it('copies the signature via copyPlain (no wipe)', () => {
    const copy = makeCopy(() => {});
    copy('0xSignature', 'sig');
    expect(copyPlain).toHaveBeenCalledWith('0xSignature');
    expect(copySecret).not.toHaveBeenCalled();
  });

  it('never routes any copy through the wiping copySecret path', () => {
    const copy = makeCopy(() => {});
    // Even a would-be "sensitive" 3rd arg has no effect — there is no secret
    // branch anymore; makeCopy ignores extra args and always copies plainly.
    copy('anything', 'k', { sensitive: true });
    expect(copySecret).not.toHaveBeenCalled();
    expect(copyPlain).toHaveBeenCalledWith('anything');
  });
});
