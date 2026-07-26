// src/lib/__tests__/deviceId.test.js
//
// The device id must come from a CSPRNG or not exist at all. It used to fall
// back to Math.random() when crypto was unavailable, minting a predictable,
// correlatable identifier and persisting it — with no way for a caller to
// tell a weak id from a strong one. Failing closed disables telemetry instead
// (api/trackEvent.js already bails on a null id).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const KEY = 'veyrnox-device-id';
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

async function freshModule() {
  vi.resetModules();
  return import('@/lib/deviceId');
}

describe('getOrCreateDeviceId', () => {
  const realCrypto = globalThis.crypto;

  beforeEach(() => {
    localStorage.clear();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    Object.defineProperty(globalThis, 'crypto', {
      value: realCrypto, configurable: true, writable: true,
    });
    localStorage.clear();
  });

  it('mints and persists a v4 uuid when randomUUID is available', async () => {
    const { getOrCreateDeviceId } = await freshModule();

    const id = getOrCreateDeviceId();

    expect(id).toMatch(UUID_V4);
    expect(localStorage.getItem(KEY)).toBe(id);
  });

  it('reuses the stored id', async () => {
    const { getOrCreateDeviceId } = await freshModule();

    const first = getOrCreateDeviceId();
    const second = getOrCreateDeviceId();

    expect(second).toBe(first);
  });

  it('falls back to getRandomValues when randomUUID is missing', async () => {
    vi.stubGlobal('crypto', { getRandomValues: realCrypto.getRandomValues.bind(realCrypto) });
    const { getOrCreateDeviceId } = await freshModule();

    const id = getOrCreateDeviceId();

    expect(id).toMatch(UUID_V4);
  });

  // The actual fix: no CSPRNG => no id, and nothing written to storage.
  it('returns null and persists NOTHING when no CSPRNG exists', async () => {
    vi.stubGlobal('crypto', {});
    const { getOrCreateDeviceId } = await freshModule();

    const id = getOrCreateDeviceId();

    expect(id).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('returns null when crypto is entirely absent', async () => {
    vi.stubGlobal('crypto', undefined);
    const { getOrCreateDeviceId } = await freshModule();

    expect(getOrCreateDeviceId()).toBeNull();
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('still honours an id already in storage without a CSPRNG', async () => {
    localStorage.setItem(KEY, 'aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee');
    vi.stubGlobal('crypto', {});
    const { getOrCreateDeviceId } = await freshModule();

    expect(getOrCreateDeviceId()).toBe('aaaaaaaa-bbbb-4ccc-9ddd-eeeeeeeeeeee');
  });
});
