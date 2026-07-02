// KEK_NO_HARDWARE_FACTOR wiring bug in decryptPrimaryContainer (WalletProvider.jsx).
//
// ROOT CAUSE: the multi-wallet mutation re-auth path (decryptPrimaryContainer)
// calls keyStore.unlock(password, { requireBiometric }) WITHOUT forwarding
// getHardwareFactor. On a KEK-enrolled vault the web/native keyStore.unlock is
// fail-closed (I4): a KEK-wrapped blob with no getHardwareFactor throws
// KEK_NO_HARDWARE_FACTOR. So add / import-additional / remove wallet all break on
// an enrolled vault — even though persistPrimaryContents and the main unlock flow
// already forward the factor correctly.
//
// This exercises the REAL WalletProvider, the REAL webKeyStore, and the REAL KEK
// crypto (enrollKek/unlock via ../vault.js + ./kek.js). Only the WebAuthn PRF
// chokepoint is shimmed so getHardwareFactor() yields a DETERMINISTIC 32-byte H —
// the same H at enrollment and at unlock, exactly as a single device would. The
// KEK fail-closed contract is therefore enforced by production code, not faked:
// if the provider forgets the factor, production keyStore.unlock throws the real
// machine code. We assert that CODE (the contract), never prose copy.

import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

import { WalletProvider, useWallet } from '@/lib/WalletProvider';
import { webKeyStore } from '@/wallet-core/keystore/web.js';
import { clearVault } from '@/wallet-core/evm/vaultStore.js';
import { KEK_ERR } from '@/wallet-core/keystore/kek.js';

// 12-char minimum enforced by H-A (validateWebVaultPassword) on web mainnet builds.
const PASSWORD = 'correct horse battery staple';
const IMPORT_MNEMONIC =
  'legal winner thank year wave sausage worth useful legal winner thank yellow';

// ── WebAuthn PRF shim ────────────────────────────────────────────────────────
// A DETERMINISTIC platform authenticator: create() mints a credential; get()
// always returns the SAME 32-byte PRF output. That makes the PRF-derived H stable
// across enroll and unlock (one device, one authenticator), so the REAL KEK
// wrap/unwrap round-trips with production crypto.
const FIXED_PRF = new Uint8Array(32).fill(0x5a);
let savedCredentials;
let savedPublicKeyCredential;

function installWebAuthnShim() {
  const rawId = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]).buffer;
  savedCredentials = navigator.credentials;
  savedPublicKeyCredential = window.PublicKeyCredential;

  window.PublicKeyCredential = /** @type {any} */ (function PublicKeyCredential() {});
  window.PublicKeyCredential.isConditionalMediationAvailable = async () => true;

  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: {
      create: async () => ({ rawId, type: 'public-key' }),
      get: async () => ({
        rawId,
        type: 'public-key',
        getClientExtensionResults: () => ({
          prf: { results: { first: FIXED_PRF.slice().buffer } },
        }),
      }),
    },
  });
}

function uninstallWebAuthnShim() {
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: savedCredentials,
  });
  window.PublicKeyCredential = savedPublicKeyCredential;
}

// Capture the live wallet context so tests can call provider methods directly.
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

// Create a primary vault via the real provider, then KEK-enroll it through the
// real webKeyStore so the stored blob carries kekWrap/kekSalt. The provider now
// holds a live, KEK-enrolled primary vault — exactly the state the bug breaks in.
async function createKekEnrolledWallet() {
  await renderProvider();
  await act(async () => {
    await ctx.createWallet(PASSWORD);
  });
  await act(async () => {
    await webKeyStore.enrollKek(PASSWORD, {
      getHardwareFactor: webKeyStore.getHardwareFactor.bind(webKeyStore),
    });
  });
  // Sanity: the at-rest vault really is KEK-enrolled.
  expect(await webKeyStore.isHardwareEnrolled()).toBe(true);
}

beforeEach(async () => {
  try {
    localStorage.clear();
  } catch {
    /* shimmed */
  }
  await clearVault();
  installWebAuthnShim();
});
afterEach(async () => {
  uninstallWebAuthnShim();
  cleanup();
  await clearVault();
});

describe('decryptPrimaryContainer forwards getHardwareFactor on KEK-enrolled vaults (I6)', () => {
  it('addWallet succeeds on a KEK-enrolled vault (no KEK_NO_HARDWARE_FACTOR)', async () => {
    await createKekEnrolledWallet();

    let result;
    await act(async () => {
      result = await ctx.addWallet(PASSWORD);
    });

    expect(result).toBeTruthy();
    expect(typeof result.walletId).toBe('string');
    expect(typeof result.mnemonic).toBe('string');
  });

  it('importAdditionalWallet succeeds on a KEK-enrolled vault (no KEK_NO_HARDWARE_FACTOR)', async () => {
    await createKekEnrolledWallet();

    let result;
    await act(async () => {
      result = await ctx.importAdditionalWallet(PASSWORD, IMPORT_MNEMONIC);
    });

    expect(result).toBeTruthy();
    expect(typeof result.walletId).toBe('string');
  });

  it('removeWallet succeeds on a KEK-enrolled vault (no KEK_NO_HARDWARE_FACTOR)', async () => {
    await createKekEnrolledWallet();

    // Need a second wallet first (removeWallet refuses to remove the last one).
    let added;
    await act(async () => {
      added = await ctx.addWallet(PASSWORD);
    });

    let thrown = null;
    await act(async () => {
      try {
        await ctx.removeWallet(PASSWORD, added.walletId);
      } catch (e) {
        thrown = e;
      }
    });

    expect(thrown).toBeNull();
  });

  it('the re-auth decrypt path never surfaces the KEK_NO_HARDWARE_FACTOR machine code', async () => {
    await createKekEnrolledWallet();

    let thrown = null;
    await act(async () => {
      try {
        await ctx.addWallet(PASSWORD);
      } catch (e) {
        thrown = e;
      }
    });

    // The contract is the CODE, not the copy.
    if (thrown) {
      expect(thrown.message).not.toContain(KEK_ERR.NO_HARDWARE_FACTOR);
    }
    expect(thrown).toBeNull();
  });
});
