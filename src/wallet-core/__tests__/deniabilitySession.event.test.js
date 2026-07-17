// src/wallet-core/__tests__/deniabilitySession.event.test.js
//
// I-2 fix (mid-session deniability entry): setDeniabilitySession must dispatch a
// DENIABILITY_SESSION_CHANGED_EVENT so listeners (e.g. TierProvider) can react
// live to a session type flip. Mirrors the SEND_2FA_CHANGED_EVENT pattern.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  setDeniabilitySession,
  DENIABILITY_SESSION_CHANGED_EVENT,
} from '../deniabilitySession.js';

beforeEach(() => {
  setDeniabilitySession(false);
});

describe('deniabilitySession — DENIABILITY_SESSION_CHANGED_EVENT', () => {
  it('exports a stable event constant', () => {
    expect(typeof DENIABILITY_SESSION_CHANGED_EVENT).toBe('string');
    expect(DENIABILITY_SESSION_CHANGED_EVENT.length).toBeGreaterThan(0);
  });

  it('dispatches on flip true', () => {
    const spy = vi.fn();
    window.addEventListener(DENIABILITY_SESSION_CHANGED_EVENT, spy);
    setDeniabilitySession(true);
    expect(spy).toHaveBeenCalled();
    window.removeEventListener(DENIABILITY_SESSION_CHANGED_EVENT, spy);
  });

  it('dispatches on flip false', () => {
    setDeniabilitySession(true);
    const spy = vi.fn();
    window.addEventListener(DENIABILITY_SESSION_CHANGED_EVENT, spy);
    setDeniabilitySession(false);
    expect(spy).toHaveBeenCalled();
    window.removeEventListener(DENIABILITY_SESSION_CHANGED_EVENT, spy);
  });
});
