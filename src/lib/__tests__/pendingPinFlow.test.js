import { describe, it, expect, vi } from 'vitest';
import { consumePendingPin, isRecoverableSeedInputError } from '../pendingPinFlow.js';

describe('consumePendingPin', () => {
  it('happy path: provisions with the pin, then clears it (consume-on-success)', async () => {
    const order = [];
    const provision = vi.fn().mockImplementation(async () => { order.push('provision'); });
    const clearPin = vi.fn().mockImplementation(() => { order.push('clear'); });
    await consumePendingPin(() => '123456', clearPin, provision);
    expect(provision).toHaveBeenCalledWith('123456');
    expect(clearPin).toHaveBeenCalledTimes(1);
    expect(order).toEqual(['provision', 'clear']); // clear only AFTER provision resolves
  });

  it('throws if no pending PIN; never provisions or clears', async () => {
    const provision = vi.fn();
    const clearPin = vi.fn();
    await expect(consumePendingPin(() => null, clearPin, provision)).rejects.toThrow('No PIN set');
    expect(provision).not.toHaveBeenCalled();
    expect(clearPin).not.toHaveBeenCalled();
  });

  it('fail-closed: if provision throws, the pin is NOT cleared (caller decides) and the error propagates', async () => {
    const provision = vi.fn().mockRejectedValue(new Error('provision-failed'));
    const clearPin = vi.fn();
    await expect(consumePendingPin(() => '123456', clearPin, provision)).rejects.toThrow('provision-failed');
    expect(clearPin).not.toHaveBeenCalled(); // not consumed on failure; UI catch handles clearing
  });

  it('repro: a bad-checksum import leaves the pin intact, so the corrected import then succeeds with the SAME pin', async () => {
    // Models the WalletEntry import handler over a stable in-memory pending PIN: a
    // recoverable seed reject must NOT consume the PIN, or the retry is stranded.
    let pin = '123456';
    const clearPin = vi.fn(() => { pin = null; });
    const provision = vi.fn()
      .mockImplementationOnce(() => { const e = new Error('Invalid recovery phrase'); e.code = 'INVALID_MNEMONIC'; throw e; })
      .mockImplementationOnce(async () => { /* good seed provisions */ });

    // First attempt: bad seed. consumePendingPin propagates and leaves the PIN.
    await expect(consumePendingPin(() => pin, clearPin, provision)).rejects.toThrow('Invalid recovery phrase');
    expect(clearPin).not.toHaveBeenCalled();
    expect(pin).toBe('123456');

    // Retry with the correct seed: same PIN is still present and is consumed.
    await consumePendingPin(() => pin, clearPin, provision);
    expect(provision).toHaveBeenLastCalledWith('123456');
    expect(clearPin).toHaveBeenCalledTimes(1);
  });
});

describe('isRecoverableSeedInputError', () => {
  it('classifies the tagged BIP-39 reject as recoverable (preserve the pending PIN)', () => {
    const e = new Error('Invalid recovery phrase');
    e.code = 'INVALID_MNEMONIC';
    expect(isRecoverableSeedInputError(e)).toBe(true);
  });

  it('falls back to the known messages when the error is untagged', () => {
    expect(isRecoverableSeedInputError(new Error('Invalid recovery phrase'))).toBe(true);
    expect(isRecoverableSeedInputError(new Error('Invalid mnemonic: failed BIP-39 checksum/wordlist check'))).toBe(true);
  });

  it('treats genuine provisioning/teardown failures as NON-recoverable (fail closed, clear the pin)', () => {
    expect(isRecoverableSeedInputError(new Error('keystore write failed'))).toBe(false);
    expect(isRecoverableSeedInputError(new Error('No PIN set; complete PIN setup first'))).toBe(false);
    expect(isRecoverableSeedInputError(null)).toBe(false);
    expect(isRecoverableSeedInputError(undefined)).toBe(false);
  });
});
