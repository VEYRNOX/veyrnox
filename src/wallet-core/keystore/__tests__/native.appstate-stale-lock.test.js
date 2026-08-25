// Stale `appStateChange` must not fire the background lock hook mid-unlock.
//
// THE BUG. Depth-based lock suppression (`_lockSuppressDepth`) covers the window in
// which an OS biometric sheet is OPEN. It does not cover DELIVERY. Capacitor dispatches
// `appStateChange` over the bridge asynchronously, and the main thread is blocked for
// seconds by the synchronous Argon2id WASM, so the `isActive:false` a Face ID sheet
// emitted earlier can flush LATE — after suppression is back to 0, right as the user's
// next PIN unlock finishes its KDF. `fireLockHook()` → WalletProvider.lock() → bumps
// `unlockGenRef` → the in-flight unlock aborts with UNLOCK_SUPERSEDED before
// keyStore.unlock() has started. PR #1881 attacked this by wrapping unlock() in
// withLockSuppressed and was reverted (#1887) for bundling a biometric prompt-count
// regression with it. This guard closes the same race by discriminating on LIVE state
// instead: a queued pause describes a moment that has passed, so if the WebView is
// visible at delivery the event is stale.
//
// WHY THE PREDICATE IS TESTED DIRECTLY. The listener itself only reaches
// `document.visibilityState` and calls this; wiring a full Capacitor bridge to re-assert
// that adds mocks, not coverage. What must not regress is the DECISION — including its
// fail-closed defaults — so that is what is pinned, exhaustively.

import { describe, it, expect } from 'vitest';
import { shouldFireLockOnAppStateChange } from '@/wallet-core/keystore/native';

describe('shouldFireLockOnAppStateChange — stale-event guard (#1881 race, prompt-neutral)', () => {
  it('IGNORES a stale isActive:false delivered while the WebView is visible', () => {
    // The exact race: Face ID resigned active minutes ago, the event flushes now,
    // mid-PIN-unlock, with the app in the foreground.
    expect(shouldFireLockOnAppStateChange(false, 'visible')).toBe(false);
  });

  it('LOCKS on a genuine background — isActive:false while hidden', () => {
    // The protection the guard must not weaken: key material is cleared on background.
    expect(shouldFireLockOnAppStateChange(false, 'hidden')).toBe(true);
  });

  it('never locks on a resume event, whatever the visibility says', () => {
    for (const v of ['visible', 'hidden', 'prerender', 'unknown', undefined]) {
      expect(shouldFireLockOnAppStateChange(true, v)).toBe(false);
    }
  });

  it('FAILS CLOSED: every non-`visible` value locks, including unreadable ones (I4)', () => {
    // Only a definite 'visible' proves staleness. A missing document, a throwing
    // getter (both surface as 'unknown'), or any value a future WebView invents must
    // lock rather than be assumed foreground — the direction that loses key material,
    // not the one that leaks it.
    for (const v of ['hidden', 'prerender', 'unknown', undefined, null, '', 'VISIBLE']) {
      expect(shouldFireLockOnAppStateChange(false, /** @type {any} */ (v))).toBe(true);
    }
  });

  it('adds no biometric call — the guard is a pure predicate over state it is handed', () => {
    // The whole point of this fix over #1881: it cannot change the prompt count,
    // because it neither authenticates nor touches the unlock path. Pinning purity
    // keeps a future "just re-check with App.getState()" edit honest — that would be a
    // bridge round-trip resolving only AFTER a real background ended, reporting
    // isActive:true on resume, and would skip the lock on the case that needs it most.
    expect(shouldFireLockOnAppStateChange.length).toBe(2);
    expect(shouldFireLockOnAppStateChange(false, 'visible')).toBe(false);
    expect(shouldFireLockOnAppStateChange(false, 'visible')).toBe(false);
  });
});
