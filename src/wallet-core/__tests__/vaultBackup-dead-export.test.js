import { describe, it, expect } from 'vitest';
import * as vaultBackup from '../vaultBackup.js';

describe('vaultBackup export surface (#1101)', () => {
  it('does NOT export restoreWithPassword', () => {
    expect(vaultBackup).not.toHaveProperty('restoreWithPassword');
  });

  it('still exports decryptPasswordSeal', () => {
    expect(typeof vaultBackup.decryptPasswordSeal).toBe('function');
  });

  it('still exports finalisePinRestore', () => {
    expect(typeof vaultBackup.finalisePinRestore).toBe('function');
  });
});
