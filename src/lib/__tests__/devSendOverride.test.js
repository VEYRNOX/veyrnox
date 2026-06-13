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

  it('fails closed on an absent/empty env — NO ambient import.meta.env fallback', () => {
    // SEAL: the function is pure and reads ONLY its argument. An absent (undefined/
    // null) or empty env returns false WITHOUT consulting the surrounding
    // import.meta.env, so the ungate can never switch on from ambient process env.
    // These assertions exercise the real predicate against an absent env (they no
    // longer route through a `= import.meta.env` default), so they go RED if anyone
    // reintroduces an ambient or otherwise permissive default. They are NOT coupled
    // to the test runner's ambient env, so they are deterministic in CI.
    expect(isDevSendUngated({})).toBe(false);
    expect(isDevSendUngated(undefined)).toBe(false);
    expect(isDevSendUngated(null)).toBe(false);
    // Opt-in present but the build-time DEV lock absent → still closed.
    expect(isDevSendUngated({ VITE_DEV_UNGATE_SEND: '1' })).toBe(false);
  });

  it('requires DEV to be the boolean true, not a truthy string', () => {
    // import.meta.env.DEV is a real boolean under Vite; guard against a stringy env.
    expect(isDevSendUngated({ DEV: 'true', VITE_DEV_UNGATE_SEND: '1' })).toBe(false);
    expect(isDevSendUngated({ DEV: 1, VITE_DEV_UNGATE_SEND: '1' })).toBe(false);
  });
});
