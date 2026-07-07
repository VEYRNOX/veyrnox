// THIRD Face ID prompt on every unlock of a hardware-KEK-enrolled iOS vault
// (device-confirmed, iPhone 17 Pro Max). Prior fix #662 removed a DIFFERENT third
// prompt (the v2->v3 lazy migration on the unlock hot path). THIS is a distinct one.
//
// ROOT CAUSE: on the primary-unlock success path (WalletProvider.unlock, the
// `if (isPrimary)` block) a legacy/unpadded container triggers a best-effort DISK
// re-persist via `keyStore.saveVaultContents(...)` — either the `migrated`
// (legacy bare mnemonic -> container) branch or the `primaryNeedsPadMigration`
// (unpadded -> FIXED_LEN) branch. On a KEK-enrolled vault `saveVaultContents`
// derives H via `getHardwareFactor` -> ONE biometric prompt for that write. The
// unlock itself already spends two prompts (cache-gate + KEK unlock), so this write
// is a THIRD prompt, and because the best-effort write never converges (swallowed /
// on-disk payload never reaches FIXED_LEN) it re-fires on EVERY unlock.
//
// The FIX mirrors #662 and the existing branch-3 (lastUnlockAt) KEK guard: on a
// KEK-enrolled vault the unlock hot path must NOT call `saveVaultContents` at all
// (any such call re-prompts). The migration is DEFERRED to the next real content
// write (add/import/remove wallet, or changePassword) — all of which already prompt.
//
// We mock the whole keystore facade so we can COUNT calls precisely and assert the
// machine-level contract (which methods run), never prose copy.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

// The decrypted vault payload used by the mock (below) is a LEGACY bare mnemonic
// (not a multi-seed container), so mv.parseVault() returns migrated:true AND its
// length (75) != mv.FIXED_LEN (8192) -> primaryNeedsPadMigration would also be true.
// Either way the pre-fix code takes a saveVaultContents branch on unlock.
const PASSWORD = 'correct horse battery staple';

// Per-test controllable keystore mock state, hoisted so the vi.mock factory (also
// hoisted) may reference it. `state.kekWrapped` decides the vault type; `unlock`
// returns the legacy bare mnemonic; counters record the prompting calls.
const state = vi.hoisted(() => ({
  kekWrapped: false,
  saveVaultContentsCalls: 0,
  getHardwareFactorCalls: 0,
}));

vi.mock('@/wallet-core/keystore', () => {
  const LEGACY =
    'legal winner thank year wave sausage worth useful legal winner thank yellow';
  const mockKeyStore = {
    async hasVault() { return true; },
    async hasVaultKekWrap() { return state.kekWrapped; },
    // The unlock itself. On a real KEK vault this internally spends ONE
    // getHardwareFactor (the KEK unwrap). We model that here so the counter
    // reflects the real prompt count.
    async unlock() {
      if (state.kekWrapped) state.getHardwareFactorCalls += 1;
      return LEGACY;
    },
    // A KEK-vault content write ALWAYS derives H -> one biometric prompt. Model it.
    async saveVaultContents() {
      state.saveVaultContentsCalls += 1;
      if (state.kekWrapped) state.getHardwareFactorCalls += 1;
    },
    // Bound-reference the provider forwards into unlock/saveVaultContents opts. Its
    // mere presence is what the provider forwards; the counters above model the real
    // prompt cost, so this can be a harmless stub.
    getHardwareFactor: async () => new Uint8Array(32),
    lock() {},
    async clearVault() {},
    setLockHook() {},
  };
  return {
    getKeyStore: () => mockKeyStore,
    webKeyStore: mockKeyStore,
    withLockSuppressed: (fn) => Promise.resolve().then(fn),
  };
});

// Import AFTER the mock is registered.
import { WalletProvider, useWallet } from '@/lib/WalletProvider';

let ctx;
function Capture() {
  ctx = useWallet();
  return null;
}
async function renderProvider() {
  await act(async () => {
    render(
      <WalletProvider>
        <Capture />
      </WalletProvider>,
    );
  });
}

beforeEach(() => {
  try { localStorage.clear(); } catch { /* shimmed */ }
  state.kekWrapped = false;
  state.saveVaultContentsCalls = 0;
  state.getHardwareFactorCalls = 0;
});
afterEach(() => {
  cleanup();
});

describe('KEK-enrolled primary unlock does not re-persist on the hot path (no 3rd biometric prompt)', () => {
  it('KEK vault + legacy/unpadded payload: unlock does NOT call saveVaultContents (getHardwareFactor once, for the unlock)', async () => {
    state.kekWrapped = true;
    await renderProvider();

    let result;
    await act(async () => {
      result = await ctx.unlock(PASSWORD);
    });

    // Unlock succeeded (primary session).
    expect(result).toBeTruthy();
    expect(ctx.isDecoy).toBe(false);

    // THE CONTRACT: no disk re-persist on the KEK unlock hot path -> no 3rd prompt.
    expect(state.saveVaultContentsCalls).toBe(0);
    // Exactly ONE hardware-factor derivation: the unlock unwrap itself. NOT two
    // (the pre-fix migration write would have made it two).
    expect(state.getHardwareFactorCalls).toBe(1);
  });

  it('regression — NON-KEK vault + legacy payload STILL migrates on unlock (saveVaultContents called, no prompt cost)', async () => {
    state.kekWrapped = false;
    await renderProvider();

    await act(async () => {
      await ctx.unlock(PASSWORD);
    });

    // Migration is preserved for the no-prompt (bare / web-password) path.
    expect(state.saveVaultContentsCalls).toBe(1);
    // A bare vault never derives a hardware factor.
    expect(state.getHardwareFactorCalls).toBe(0);
  });

  it('guard — KEK vault: in-memory session is still correct (unlocked primary, migrated wallet metadata set up)', async () => {
    state.kekWrapped = true;
    await renderProvider();

    await act(async () => {
      await ctx.unlock(PASSWORD);
    });

    // Session correctness preserved despite the deferred disk write: a primary
    // session with the migrated wallet present (ensureWalletMeta ran for it).
    expect(ctx.isDecoy).toBe(false);
    expect(ctx.isHidden).toBe(false);
    expect(Array.isArray(ctx.wallets)).toBe(true);
    expect(ctx.wallets.length).toBeGreaterThanOrEqual(1);
  });
});
