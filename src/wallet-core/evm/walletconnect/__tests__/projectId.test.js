// Regression guard for the recurring "Project ID required after every APK rebuild"
// bug. The WalletConnect project ID must resolve to a non-empty value on ANY build
// — including one with no VITE_WALLETCONNECT_PROJECT_ID env (a git worktree, a fresh
// clone, or a CI path that missed the variable). If someone removes the committed
// public default, this test fails BEFORE a connector-broken APK can ship.
import { describe, it, expect } from 'vitest';
import { WALLETCONNECT_PROJECT_ID } from '../projectId.js';

describe('WalletConnect project ID', () => {
  it('resolves to a non-empty string on every build (committed default when env is unset)', () => {
    expect(typeof WALLETCONNECT_PROJECT_ID).toBe('string');
    expect(WALLETCONNECT_PROJECT_ID.length).toBeGreaterThan(0);
  });

  it('is a well-formed Reown/WalletConnect project ID (32-char hex)', () => {
    expect(WALLETCONNECT_PROJECT_ID).toMatch(/^[0-9a-f]{32}$/);
  });
});
