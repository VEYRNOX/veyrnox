import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('getTransport', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('returns webusb when navigator.usb is present', async () => {
    vi.stubGlobal('navigator', { usb: {} });
    const { getTransport } = await import('../transport.js');
    expect(getTransport().type).toBe('webusb');
  });

  it('returns unsupported when navigator.usb is absent', async () => {
    vi.stubGlobal('navigator', {});
    const { getTransport } = await import('../transport.js');
    expect(getTransport().type).toBe('unsupported');
  });

  it('returns unsupported when navigator is undefined', async () => {
    vi.stubGlobal('navigator', undefined);
    const { getTransport } = await import('../transport.js');
    expect(getTransport().type).toBe('unsupported');
  });
});
