// lib/__tests__/sessionRevocation.test.js
//
// Unit tests for the pure session-revocation predicates that drive the honest
// local enforcement (SessionRevocationGuard locks the wallet when THIS device's
// session is revoked). These assert the guard fires for the current device only,
// never for a different device's revocation.

import { describe, it, expect } from 'vitest';
import { findCurrentSession, isCurrentSessionRevoked } from '../sessionRevocation';

const SESSIONS = [
  { id: 's1', session_token: 'tok-this-device', status: 'active' },
  { id: 's2', session_token: 'tok-other-device', status: 'revoked' },
  { id: 's3', session_token: 'tok-third', status: 'active' },
];

describe('findCurrentSession', () => {
  it('matches by this device\'s token', () => {
    expect(findCurrentSession(SESSIONS, 'tok-this-device').id).toBe('s1');
  });
  it('returns null for an unknown or missing token', () => {
    expect(findCurrentSession(SESSIONS, 'nope')).toBeNull();
    expect(findCurrentSession(SESSIONS, null)).toBeNull();
    expect(findCurrentSession(undefined, 'x')).toBeNull();
  });
});

describe('isCurrentSessionRevoked', () => {
  it('is false while this device\'s session is active', () => {
    expect(isCurrentSessionRevoked(SESSIONS, 'tok-this-device')).toBe(false);
  });
  it('is true once THIS device\'s session is revoked', () => {
    const revoked = SESSIONS.map((s) =>
      s.session_token === 'tok-this-device' ? { ...s, status: 'revoked' } : s,
    );
    expect(isCurrentSessionRevoked(revoked, 'tok-this-device')).toBe(true);
  });
  it('does NOT fire for ANOTHER device\'s revocation (no false lock)', () => {
    // s2 is revoked, but that is a different device — this device stays unlocked.
    expect(isCurrentSessionRevoked(SESSIONS, 'tok-this-device')).toBe(false);
  });
  it('is false when there is no token at all', () => {
    expect(isCurrentSessionRevoked(SESSIONS, null)).toBe(false);
  });
});
