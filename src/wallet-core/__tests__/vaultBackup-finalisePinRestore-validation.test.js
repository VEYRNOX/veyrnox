// L-7: finalisePinRestore must reject anything that isn't exactly 8 digits,
// matching the device-PIN shape used by every other keystore path.
// 2026-09-01: tightened from /^\d{8,12}$/ to /^\d{8}$/ alongside the
// combined-credential backup rewrite — the device PIN is always 8 digits on
// the PinPad, so accepting 9–12 admitted shapes the UI can't produce.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../keyStore.js', () => ({
  getKeyStore: () => ({ createVault: vi.fn(async () => undefined) }),
}));

import { finalisePinRestore } from '../vaultBackup.js';

describe('finalisePinRestore device-PIN shape validation (L-7)', () => {
  beforeEach(() => vi.clearAllMocks());

  const container = '{"v":2,"cipher":"..."}';

  it('rejects non-digit strings', async () => {
    await expect(finalisePinRestore(container, 'password1234')).rejects.toThrow(/exactly 8 digits/);
  });

  it('rejects too-short digit strings', async () => {
    await expect(finalisePinRestore(container, '1234567')).rejects.toThrow(/exactly 8 digits/);
  });

  it('rejects too-long digit strings (10, 12 — all rejected under the tightened floor)', async () => {
    await expect(finalisePinRestore(container, '1234567890')).rejects.toThrow(/exactly 8 digits/);
    await expect(finalisePinRestore(container, '123456789012')).rejects.toThrow(/exactly 8 digits/);
  });

  it('rejects empty string', async () => {
    await expect(finalisePinRestore(container, '')).rejects.toThrow(/exactly 8 digits/);
  });

  it('rejects mixed digits + spaces', async () => {
    await expect(finalisePinRestore(container, '1234 5678')).rejects.toThrow(/exactly 8 digits/);
  });

  it('accepts an 8-digit PIN', async () => {
    await expect(finalisePinRestore(container, '12345678')).resolves.toBeUndefined();
  });
});
