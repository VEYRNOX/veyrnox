import { describe, it, expect, vi } from 'vitest';
import { consumePendingPin } from '../pendingPinFlow.js';

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
});
