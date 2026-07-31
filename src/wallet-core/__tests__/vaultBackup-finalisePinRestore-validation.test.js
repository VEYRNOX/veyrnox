// L-7: finalisePinRestore must reject anything that isn't 8-12 digits, mirroring
// createBackupEnvelope's PIN shape. Prior to the fix any non-empty string passed.
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../keyStore.js', () => ({
  getKeyStore: () => ({ createVault: vi.fn(async () => undefined) }),
}));

import { finalisePinRestore } from '../vaultBackup.js';

describe('finalisePinRestore PIN shape validation (L-7)', () => {
  beforeEach(() => vi.clearAllMocks());

  const container = '{"v":2,"cipher":"..."}';

  it('rejects non-digit strings', async () => {
    await expect(finalisePinRestore(container, 'password1234')).rejects.toThrow(/8-12 digits/);
  });

  it('rejects too-short digit strings', async () => {
    await expect(finalisePinRestore(container, '1234567')).rejects.toThrow(/8-12 digits/);
  });

  it('rejects too-long digit strings', async () => {
    await expect(finalisePinRestore(container, '1234567890123')).rejects.toThrow(/8-12 digits/);
  });

  it('rejects empty string', async () => {
    await expect(finalisePinRestore(container, '')).rejects.toThrow(/8-12 digits/);
  });

  it('rejects mixed digits + spaces', async () => {
    await expect(finalisePinRestore(container, '1234 5678')).rejects.toThrow(/8-12 digits/);
  });

  it('accepts an 8-digit PIN', async () => {
    await expect(finalisePinRestore(container, '12345678')).resolves.toBeUndefined();
  });

  it('accepts a 12-digit PIN', async () => {
    await expect(finalisePinRestore(container, '123456789012')).resolves.toBeUndefined();
  });
});
