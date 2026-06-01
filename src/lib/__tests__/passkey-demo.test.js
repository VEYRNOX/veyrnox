// Tests for the passkey UNLOCK GATE module (DEMO / simulated path).
//
// DEMO is forced ON here. In demo mode registration must NOT call WebAuthn (the
// simulator/CI may not support it) — it stores a sentinel handle so the rest of
// the app behaves uniformly, and the status reports a clearly-simulated prompt.
// Globals are stubbed explicitly (no jsdom dependency).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@/api/demoClient', () => ({ DEMO: true }));

import {
  PASSKEY_CRED_KEY,
  getPasskeyStatus,
  registerPasskeyCredential,
  isPasskeyRegistered,
} from '@/lib/passkey';

function makeStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
  };
}

let storage;

beforeEach(() => {
  storage = makeStorage();
  vi.stubGlobal('window', { localStorage: storage, location: { hostname: 'veyrnox.test' } });
  vi.stubGlobal('localStorage', storage);
  vi.stubGlobal('navigator', {}); // no WebAuthn — demo must not need it
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('demo / simulated passkey', () => {
  it('registers WITHOUT any WebAuthn call and marks the record simulated', async () => {
    const res = await registerPasskeyCredential({ label: 'Veyrnox unlock' });
    expect(res.ok).toBe(true);
    expect(res.simulated).toBe(true);
    expect(isPasskeyRegistered()).toBe(true);
    const rec = JSON.parse(storage.getItem(PASSKEY_CRED_KEY));
    expect(rec.simulated).toBe(true);
    expect(rec.id).toBe('demo-passkey');
  });

  it('status reports demo mode, available + simulated', async () => {
    const s = await getPasskeyStatus();
    expect(s.mode).toBe('demo');
    expect(s.available).toBe(true);
    expect(s.simulated).toBe(true);
    expect(s.supported).toBe(true);
  });
});
