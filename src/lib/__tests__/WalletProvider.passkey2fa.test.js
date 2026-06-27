// M3: Passkey UNAVAILABLE must NOT silently downgrade 2FA→1FA.
//
// When the user has enrolled the passkey as a REQUIRED second factor, an
// UNAVAILABLE passkey at unlock time must fail CLOSED with a machine-coded
// PASSKEY_REQUIRED error — never quietly proceed with the password alone.
// The decision is extracted to a pure helper so the contract is pinned here.
import { describe, it, expect } from 'vitest';
import { assertPasskeyFactorSatisfied } from '@/lib/WalletProvider';
import { PASSKEY_GATE } from '@/lib/passkey';

describe('M3 passkey second-factor fail-closed', () => {
  it('throws PASSKEY_REQUIRED when 2FA is configured and the passkey is UNAVAILABLE', () => {
    expect(() => assertPasskeyFactorSatisfied({
      gateStatus: PASSKEY_GATE.UNAVAILABLE,
      twoFactorConfigured: true,
    })).toThrowError(/PASSKEY_REQUIRED/);
  });

  it('does NOT throw when the passkey is UNAVAILABLE but 2FA is NOT configured (convenience gate may degrade)', () => {
    expect(() => assertPasskeyFactorSatisfied({
      gateStatus: PASSKEY_GATE.UNAVAILABLE,
      twoFactorConfigured: false,
    })).not.toThrow();
  });

  it('does NOT throw when the passkey PASSED even with 2FA configured', () => {
    expect(() => assertPasskeyFactorSatisfied({
      gateStatus: PASSKEY_GATE.PASSED,
      twoFactorConfigured: true,
    })).not.toThrow();
  });

  it('does NOT throw when the gate was SKIPPED (passkey not the 2FA factor here)', () => {
    expect(() => assertPasskeyFactorSatisfied({
      gateStatus: PASSKEY_GATE.SKIPPED,
      twoFactorConfigured: true,
    })).not.toThrow();
  });
});
