// useRevealWithReauth — L-6 fix (audit 2026-08-25).
//
// revealWithReauth() used to gate seed reveal ONLY on the mount-time
// useRaspArtifact() sample (up to ~60s stale — see useRaspArtifact.js
// heartbeat). This pins that the confirm step now ALSO awaits a FRESH,
// on-device-only probe (getFreshLocalRaspArtifact) and refuses on a BLOCK
// verdict, mirroring the sign hot-path's fresh-probe pattern (SendCrypto.jsx).
// Mount-time gate stays in place unchanged (asserted via the ALLOW-mount /
// BLOCK-fresh case below, which would pass under the old code — this is the
// case a stale-artifact hook injection exploits).

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const revealWalletMnemonic = vi.fn(() => ({ mnemonic: 'a b c d e f g h i j k l', reauthRequired: false }));
const verifyActiveCredentialDetailed = vi.fn();
const lock = vi.fn();
vi.mock('@/lib/WalletProvider', () => ({
  useWallet: () => ({ revealWalletMnemonic, verifyActiveCredentialDetailed, lock }),
}));

vi.mock('@/components/security/useActionGuard', () => ({
  useActionGuard: () => ({ requireTwoFactor: (fn) => fn(), gateModal: null }),
}));

// Mount-time artifact is ALLOW by default — the case that matters is the
// FRESH probe disagreeing with it (the staleness window L-6 closes).
let mountArtifact = { tier: 'allow', sentence: null, blockedActions: [], requiresBiometric: false };
vi.mock('@/rasp', async (importOriginal) => {
  const actual = /** @type {any} */ (await importOriginal());
  return { ...actual, useRaspArtifact: () => mountArtifact };
});

const getFreshLocalRaspArtifact = vi.fn(async () => mountArtifact);
vi.mock('@/lib/getFreshLocalRaspArtifact', () => ({
  getFreshLocalRaspArtifact: (...a) => getFreshLocalRaspArtifact(...a),
}));

const { useRevealWithReauth } = await import('@/components/security/useRevealWithReauth');

beforeEach(() => {
  mountArtifact = { tier: 'allow', sentence: null, blockedActions: [], requiresBiometric: false };
  revealWalletMnemonic.mockClear().mockReturnValue({ mnemonic: 'a b c d e f g h i j k l', reauthRequired: false });
  getFreshLocalRaspArtifact.mockReset().mockImplementation(async () => mountArtifact);
});

describe('useRevealWithReauth — fresh-at-confirm RASP probe (L-6)', () => {
  it('awaits getFreshLocalRaspArtifact at the confirm step', async () => {
    const onRevealed = vi.fn();
    const { result } = renderHook(() => useRevealWithReauth(onRevealed));

    await act(async () => { await result.current.revealWithReauth('wallet-1'); });

    expect(getFreshLocalRaspArtifact).toHaveBeenCalledTimes(1);
  });

  it('mount-time ALLOW + fresh BLOCK refuses the reveal (closes the staleness window)', async () => {
    // Mount-time artifact stayed ALLOW (last heartbeat sample); a hook was
    // injected after that sample but before the user tapped Reveal — the
    // FRESH probe below is what must catch it.
    getFreshLocalRaspArtifact.mockResolvedValue({
      tier: 'block',
      sentence: 'Another program appears to be inspecting this app…',
      blockedActions: ['sign', 'seed-reveal', 'export', 'import'],
      requiresBiometric: false,
    });
    const onRevealed = vi.fn();
    const { result } = renderHook(() => useRevealWithReauth(onRevealed));

    await act(async () => { await result.current.revealWithReauth('wallet-1'); });

    expect(revealWalletMnemonic).not.toHaveBeenCalled();
    expect(onRevealed).not.toHaveBeenCalled();
  });

  it('fresh ALLOW proceeds to reveal as before', async () => {
    getFreshLocalRaspArtifact.mockResolvedValue({ tier: 'allow', sentence: null, blockedActions: [], requiresBiometric: false });
    const onRevealed = vi.fn();
    const { result } = renderHook(() => useRevealWithReauth(onRevealed));

    await act(async () => { await result.current.revealWithReauth('wallet-1'); });

    expect(revealWalletMnemonic).toHaveBeenCalledWith('wallet-1', { callerGated: true });
    expect(onRevealed).toHaveBeenCalledWith({ walletId: 'wallet-1', mnemonic: 'a b c d e f g h i j k l' });
  });
});
