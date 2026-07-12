// messageSigning.test.js — the "Message signing" opt-in preference.
//
// The toggle is OFF by default (fail-closed): the CryptoSigning page must NOT
// render a signing UI unless the user has explicitly turned it on. This mirrors
// the biometric-2fa preference pattern (localStorage flag + same-tab custom
// event for live reactivity).

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isMessageSigningEnabled,
  setMessageSigningEnabled,
  MESSAGE_SIGNING_KEY,
  MESSAGE_SIGNING_CHANGED_EVENT,
} from '@/lib/messageSigning';

describe('messageSigning preference', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to false (fail-closed) when nothing is stored', () => {
    expect(isMessageSigningEnabled()).toBe(false);
  });

  it('reads true after setMessageSigningEnabled(true)', () => {
    setMessageSigningEnabled(true);
    expect(isMessageSigningEnabled()).toBe(true);
    expect(localStorage.getItem(MESSAGE_SIGNING_KEY)).toBe('1');
  });

  it('reads false after setMessageSigningEnabled(false)', () => {
    setMessageSigningEnabled(true);
    setMessageSigningEnabled(false);
    expect(isMessageSigningEnabled()).toBe(false);
    expect(localStorage.getItem(MESSAGE_SIGNING_KEY)).toBe(null);
  });

  it('is true only when the stored value is exactly "1"', () => {
    localStorage.setItem(MESSAGE_SIGNING_KEY, 'true');
    expect(isMessageSigningEnabled()).toBe(false);
    localStorage.setItem(MESSAGE_SIGNING_KEY, '0');
    expect(isMessageSigningEnabled()).toBe(false);
    localStorage.setItem(MESSAGE_SIGNING_KEY, '1');
    expect(isMessageSigningEnabled()).toBe(true);
  });

  it('dispatches the change event on set (same-tab reactivity)', () => {
    const listener = vi.fn();
    window.addEventListener(MESSAGE_SIGNING_CHANGED_EVENT, listener);
    setMessageSigningEnabled(true);
    expect(listener).toHaveBeenCalledTimes(1);
    setMessageSigningEnabled(false);
    expect(listener).toHaveBeenCalledTimes(2);
    window.removeEventListener(MESSAGE_SIGNING_CHANGED_EVENT, listener);
  });

  it('exports the event name constant', () => {
    expect(MESSAGE_SIGNING_CHANGED_EVENT).toBe('veyrnox:message-signing-changed');
  });
});
