// Regression pin for issue #1101: restoreWithPassword() was an exported footgun
// that bypassed the native keystore (SecureStorage / KEK) by calling web saveVault()
// directly. Deleted (dead code — finalisePinRestore is the real path). Never
// re-export it without routing through getKeyStore().createVault().
import { describe, it, expect } from 'vitest';
import * as vaultBackup from '../vaultBackup.js';

describe('#1101 restoreWithPassword export removed', () => {
  it('does not export restoreWithPassword', () => {
    expect(vaultBackup.restoreWithPassword).toBeUndefined();
    expect(Object.keys(vaultBackup)).not.toContain('restoreWithPassword');
  });
});
