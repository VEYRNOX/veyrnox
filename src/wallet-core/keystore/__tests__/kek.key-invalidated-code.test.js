// src/wallet-core/keystore/__tests__/kek.key-invalidated-code.test.js
//
// Step 1 — Android biometric re-enrollment permanently invalidates the AndroidKeyStore
// HMAC key. This is NOT a wrong PIN. It needs its own stable machine code so callers can
// branch to a recovery path instead of incrementing the wrong-PIN wipe counter.
// Codes ARE the contract (copy can change; codes cannot).

import { describe, it, expect } from 'vitest';
import { KEK_ERR } from '../kek.js';

describe('KEK_ERR.KEY_PERMANENTLY_INVALIDATED', () => {
  it('is the stable code KEK_KEY_PERMANENTLY_INVALIDATED', () => {
    expect(KEK_ERR.KEY_PERMANENTLY_INVALIDATED).toBe('KEK_KEY_PERMANENTLY_INVALIDATED');
  });
});
