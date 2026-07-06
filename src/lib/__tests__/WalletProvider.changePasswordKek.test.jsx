// KEK_NO_HARDWARE_FACTOR wiring bug in changePassword (WalletProvider.jsx).
//
// ROOT CAUSE: WalletProvider.changePassword calls
//   keyStore.changePassword(currentPassword, newPassword)
// WITHOUT the third `opts` argument, so opts.getHardwareFactor is undefined by the
// time it reaches the keystore. On a KEK-enrolled vault (web WebAuthn PRF OR native
// Secure Enclave/StrongBox) the keystore.changePassword KEK branch is fail-closed
// (I4/I6): a kekWrap blob with no getHardwareFactor throws KEK_NO_HARDWARE_FACTOR.
// So a PIN/password change can NEVER succeed on exactly the vault type the flow
// targets — even though decryptPrimaryContainer, persistPrimaryContents, enrollKek,
// and the main unlock flow already forward the factor correctly.
//
// This is the SIBLING of the decryptPrimaryContainer bug covered by
// WalletProvider.kekMutationWiring.test.jsx, and is tested the same way: it exercises
// the REAL WalletProvider, the REAL webKeyStore, and the REAL KEK crypto
// (enrollKek/changePassword via ../vault.js + ./kek.js). Only the WebAuthn PRF
// chokepoint is shimmed so getHardwareFactor() yields a DETERMINISTIC 32-byte H —
// the same H at enrollment and at re-wrap, exactly as a single device would. The KEK
// fail-closed contract is therefore enforced by production code, not faked: if the
// provider forgets the factor, production keyStore.changePassword throws the real
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
const NEW_PASSWORD = 'staple battery horse correct';

// ── WebAuthn PRF shim ────────────────────────────────────────────────────────
// A DETERMINISTIC platform authenticator: create() mints a credential; get()
// always returns the SAME 32-byte PRF output. That makes the PRF-derived H stable
// across enroll and re-wrap (one device, one authenticator), so the REAL KEK
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

// Create a primary vault via the real provider, then KEK-enroll it through the real
// webKeyStore so the stored blob carries kekWrap/kekSalt. The provider now holds a
// live, KEK-enrolled primary vault — exactly the state the bug breaks in.
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

describe('changePassword forwards getHardwareFactor on KEK-enrolled vaults (I6)', () => {
  it('changePassword succeeds on a KEK-enrolled vault (no KEK_NO_HARDWARE_FACTOR)', async () => {
    await createKekEnrolledWallet();

    let thrown = null;
    await act(async () => {
      try {
        await ctx.changePassword(PASSWORD, NEW_PASSWORD);
      } catch (e) {
        thrown = e;
      }
    });

    // The contract is the CODE, not the copy: a forgotten factor throws the real
    // fail-closed machine code from production keyStore.changePassword.
    if (thrown) {
      expect(thrown.message).not.toContain(KEK_ERR.NO_HARDWARE_FACTOR);
    }
    expect(thrown).toBeNull();
  });

  it('the vault stays KEK-enrolled and unlocks under the NEW password after the change', async () => {
    await createKekEnrolledWallet();

    await act(async () => {
      await ctx.changePassword(PASSWORD, NEW_PASSWORD);
    });

    // The re-wrap preserved the KEK format (I4: never silently downgrade to bare).
    expect(await webKeyStore.isHardwareEnrolled()).toBe(true);

    // The NEW password unlocks the KEK-wrapped DEK end-to-end through real crypto.
    let plaintext;
    await act(async () => {
      plaintext = await webKeyStore.unlock(NEW_PASSWORD, {
        getHardwareFactor: webKeyStore.getHardwareFactor.bind(webKeyStore),
      });
    });
    expect(typeof plaintext).toBe('string');
    expect(plaintext.length).toBeGreaterThan(0);
  });

  it('the OLD password no longer unlocks after a successful change', async () => {
    await createKekEnrolledWallet();

    await act(async () => {
      await ctx.changePassword(PASSWORD, NEW_PASSWORD);
    });

    let thrown = null;
    await act(async () => {
      try {
        await webKeyStore.unlock(PASSWORD, {
          getHardwareFactor: webKeyStore.getHardwareFactor.bind(webKeyStore),
        });
      } catch (e) {
        thrown = e;
      }
    });
    // Wrong (old) PIN must fail — the DEK is now wrapped under the new KEK.
    expect(thrown).not.toBeNull();
  });
});
