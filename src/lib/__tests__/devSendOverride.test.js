// lib/__tests__/devSendOverride.test.js
//
// The dev-only send ungate is a SECURITY-SENSITIVE switch: if it could ever be
// true in a production build, it would let the UI bypass the canSend() gate. So
// the contract is exhaustively pinned here — it is true ONLY when BOTH the
// build-time DEV flag AND the explicit opt-in env are set, and false for every
// other combination (the production case included).

import { describe, it, expect } from 'vitest';
import { isDevSendUngated } from '../devSendOverride.js';

describe('isDevSendUngated — both locks required', () => {
  it('is TRUE only when DEV build AND VITE_DEV_UNGATE_SEND=1', () => {
    expect(isDevSendUngated({ DEV: true, VITE_DEV_UNGATE_SEND: '1' })).toBe(true);
  });

  it('is FALSE in a production build even if the env is somehow set', () => {
    // The decisive lock: a prod `vite build` compiles DEV to false, so the flag
    // can never re-enable sending in a shipped bundle.
    expect(isDevSendUngated({ DEV: false, VITE_DEV_UNGATE_SEND: '1' })).toBe(false);
    expect(isDevSendUngated({ PROD: true, VITE_DEV_UNGATE_SEND: '1' })).toBe(false);
  });

  it('is FALSE in a dev build when the opt-in env is absent or not exactly "1"', () => {
    expect(isDevSendUngated({ DEV: true })).toBe(false);
    expect(isDevSendUngated({ DEV: true, VITE_DEV_UNGATE_SEND: '0' })).toBe(false);
    expect(isDevSendUngated({ DEV: true, VITE_DEV_UNGATE_SEND: 'true' })).toBe(false);
    expect(isDevSendUngated({ DEV: true, VITE_DEV_UNGATE_SEND: 1 })).toBe(false); // number, not the string '1'
    expect(isDevSendUngated({ DEV: true, VITE_DEV_UNGATE_SEND: '' })).toBe(false);
  });

  it('is FALSE when neither lock is set, and never throws on empty/undefined env', () => {
    // "Neither lock set" is asserted against EXPLICIT envs so the result is
    // deterministic. An empty object and null both yield false (no DEV, no opt-in).
    expect(isDevSendUngated({})).toBe(false);
    expect(isDevSendUngated(null)).toBe(false);
    expect(isDevSendUngated({ DEV: false, VITE_DEV_UNGATE_SEND: undefined })).toBe(false);
    // Calling with no argument falls back to the ambient import.meta.env, whose
    // value depends on the dev/test environment (a developer doing testnet send
    // verification may have VITE_DEV_UNGATE_SEND=1 in a git-ignored .env.local).
    // The contract under test is "both explicit locks required" — pinned by the
    // explicit-env cases above and below — so here we only assert the default-arg
    // path never throws, not a value coupled to that ambient env.
    expect(() => isDevSendUngated()).not.toThrow();
    expect(() => isDevSendUngated(undefined)).not.toThrow();
  });

  it('requires DEV to be the boolean true, not a truthy string', () => {
    // import.meta.env.DEV is a real boolean under Vite; guard against a stringy env.
    expect(isDevSendUngated({ DEV: 'true', VITE_DEV_UNGATE_SEND: '1' })).toBe(false);
    expect(isDevSendUngated({ DEV: 1, VITE_DEV_UNGATE_SEND: '1' })).toBe(false);
  });
});
