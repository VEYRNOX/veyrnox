// @ts-nocheck
// I4: the spend-limit empty state must describe enforcement per surface.
// It used to say a limit "never blocks a transaction you approve", which is
// false for WalletConnect: an over-limit request is refused outright
// (WalletConnectProvider.jsx, WC_SEND_LIMIT_EXCEEDED) unless Theft Protection
// is on.
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/api/base44Client', () => ({ base44: { entities: {} } }));
vi.mock('@/lib/WalletProvider', () => ({ useWallet: () => ({}) }));
vi.mock('@/components/security/useActionGuard', () => ({ useActionGuard: () => ({}) }));
vi.mock('@/lib/useAdvisorSnapshot', () => ({ useAdvisorSnapshot: () => ({}) }));

import { SPEND_LIMIT_EMPTY_DESCRIPTION as copy } from '@/pages/SecurityCenter';

describe('spend-limit empty-state copy', () => {
  it('does not claim a limit never blocks', () => {
    expect(copy).not.toMatch(/never blocks|not a cap/i);
  });
  it('says connected-app requests over a limit are refused', () => {
    expect(copy).toMatch(/WalletConnect/);
    expect(copy).toMatch(/refused/i);
  });
});
