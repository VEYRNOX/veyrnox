// Unit tests for the audit-log key-derivation + session gate (pure helpers).
import { describe, it, expect } from 'vitest';
import { deriveAuditSecret, auditSecretForSession } from '../auditLog.js';

const M1 = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const M2 = 'zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo zoo wrong';

describe('deriveAuditSecret', () => {
  it('is deterministic for one mnemonic and 32 bytes of hex', () => {
    const a = deriveAuditSecret(M1);
    const b = deriveAuditSecret(M1);
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/); // 32 bytes hex
  });

  it('differs across mnemonics', () => {
    expect(deriveAuditSecret(M1)).not.toBe(deriveAuditSecret(M2));
  });

  it('throws on an empty/invalid mnemonic', () => {
    expect(() => deriveAuditSecret('')).toThrow();
    expect(() => deriveAuditSecret(undefined)).toThrow();
  });
});

describe('auditSecretForSession (decoy/hidden hard-off gate)', () => {
  it('returns the derived secret in a primary session', () => {
    expect(auditSecretForSession({ isDecoy: false, isHidden: false, primaryMnemonic: M1 }))
      .toBe(deriveAuditSecret(M1));
  });

  it('returns null in a decoy session', () => {
    expect(auditSecretForSession({ isDecoy: true, isHidden: false, primaryMnemonic: M1 })).toBeNull();
  });

  it('returns null in a hidden session', () => {
    expect(auditSecretForSession({ isDecoy: false, isHidden: true, primaryMnemonic: M1 })).toBeNull();
  });

  it('returns null when there is no mnemonic', () => {
    expect(auditSecretForSession({ isDecoy: false, isHidden: false, primaryMnemonic: undefined })).toBeNull();
    expect(auditSecretForSession({ isDecoy: false, isHidden: false, primaryMnemonic: '' })).toBeNull();
  });
});
