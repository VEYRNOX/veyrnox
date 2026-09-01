import { describe, it, expect } from 'vitest';
import * as vaultBackup from '../vaultBackup.js';

describe('vaultBackup export surface (#1101)', () => {
  it('does NOT export restoreWithPassword', () => {
    expect(vaultBackup).not.toHaveProperty('restoreWithPassword');
  });

  it('exports decryptBackupSeal (combined-credential replacement for the two split seal decrypters, 2026-09-01)', () => {
    expect(typeof vaultBackup.decryptBackupSeal).toBe('function');
  });

  it('does NOT export the legacy split-seal decrypters (removed 2026-09-01 with the combined-credential model)', () => {
    expect(vaultBackup).not.toHaveProperty('decryptPasswordSeal');
    expect(vaultBackup).not.toHaveProperty('decryptPinSeal');
  });

  it('still exports finalisePinRestore', () => {
    expect(typeof vaultBackup.finalisePinRestore).toBe('function');
  });
});
