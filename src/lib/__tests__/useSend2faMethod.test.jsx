import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

// Not demo, not deciding platform here — the hook takes isNative as an explicit arg.
vi.mock('@/api/demoClient', () => ({ DEMO: false }));
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }));

import { useSend2faMethod, SEND_2FA_CHANGED_EVENT } from '@/lib/useSend2faMethod';
import { set2faBiometricEnabled } from '@/lib/biometric';
import { set2faPasskeyEnabled } from '@/lib/passkey';

beforeEach(() => { window.localStorage.clear(); });

describe('useSend2faMethod — reactive to mid-session 2FA changes (L-3)', () => {
  it('re-reads when the biometric 2FA pref is disabled during the session', () => {
    // Initially: native + biometric second factor ON → resolves to 'biometric'.
    set2faBiometricEnabled(true);
    const { result } = renderHook(() => useSend2faMethod({
      demo: false, isNative: true, actionPasswordConfigured: false, isDecoy: false, isHidden: false,
    }));
    expect(result.current).toBe('biometric');

    // User navigates to Settings mid-session and turns biometric 2FA OFF. The Send
    // screen stays mounted — a render-time snapshot would keep 'biometric' (stale).
    act(() => {
      set2faBiometricEnabled(false);
      window.dispatchEvent(new Event(SEND_2FA_CHANGED_EVENT));
    });
    expect(result.current).toBe('none');
  });

  it('re-reads when a passkey 2FA pref is enabled during the session', () => {
    const { result } = renderHook(() => useSend2faMethod({
      // web-shaped inputs but with a registered passkey already present so enabling
      // the pref flips the resolver.
      demo: false, isNative: false, actionPasswordConfigured: false, isDecoy: false, isHidden: false,
    }));
    expect(result.current).toBe('none');

    // Register a passkey handle + enable the passkey 2FA pref mid-session.
    act(() => {
      window.localStorage.setItem('veyrnox-passkey-cred', JSON.stringify({ id: 'abc' }));
      set2faPasskeyEnabled(true);
      window.dispatchEvent(new Event(SEND_2FA_CHANGED_EVENT));
    });
    expect(result.current).toBe('passkey');
  });
});
