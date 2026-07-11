// vaultErrors facade parity — the R2 facade's machine-code VALUES must stay
// byte-for-byte identical to the keystore modules that throw them (the facade
// exists so UI never imports wallet-core directly; this test is what keeps the
// mirror honest). Tests are ring-lint exempt by design, so importing both
// sides here is the sanctioned way to pin the contract.
import { describe, it, expect } from 'vitest';
import { WEB_VAULT_ERR, KEK_UI_ERR } from '@/lib/vaultErrors';
import { KEK_ERR } from '@/wallet-core/keystore/kek.js';

describe('vaultErrors R2 facade parity', () => {
  it('KEK_UI_ERR values mirror keystore KEK_ERR byte-for-byte', () => {
    expect(KEK_UI_ERR.NO_HARDWARE_FACTOR).toBe(KEK_ERR.NO_HARDWARE_FACTOR);
    expect(KEK_UI_ERR.KEY_PERMANENTLY_INVALIDATED).toBe(
      KEK_ERR.KEY_PERMANENTLY_INVALIDATED
    );
    expect(KEK_UI_ERR.USER_CANCELLED).toBe(KEK_ERR.USER_CANCELLED);
  });

  it('HARDWARE_FACTOR_DEGENERATE mirrors the literal thrown by hardware.js', () => {
    // hardware.js throws this as a string literal (no exported constant).
    expect(KEK_UI_ERR.HARDWARE_FACTOR_DEGENERATE).toBe(
      'HARDWARE_FACTOR_DEGENERATE'
    );
  });

  it('WEB_VAULT_ERR password minimum code is stable', () => {
    expect(WEB_VAULT_ERR.PASSWORD_TOO_SHORT).toBe('WEB_VAULT_PASSWORD_TOO_SHORT');
  });

  it('facade objects are frozen', () => {
    expect(Object.isFrozen(KEK_UI_ERR)).toBe(true);
    expect(Object.isFrozen(WEB_VAULT_ERR)).toBe(true);
  });
});
