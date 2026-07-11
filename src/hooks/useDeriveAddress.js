// hooks/useDeriveAddress.js
//
// R2 facade over wallet-core HD derivation for UI/page code. The ring-import
// lint rule permits src/hooks/ to import from wallet-core; pages must not reach
// past this boundary directly (issue #627). This wrapper only forwards the call
// — it does NOT persist or log the derived private key.
import { deriveEvmAccount } from '@/wallet-core/derivation';

/**
 * Derive the EVM account (address + live private key + path) for a mnemonic.
 * Callers typically use only `.address`. The privateKey is a LIVE SECRET —
 * do not persist it in plaintext (same contract as deriveEvmAccount).
 * @param {string} mnemonic
 * @param {number} [index=0] - final BIP-44 path index (m/44'/60'/0'/0/{index})
 * @returns {{ address: string, privateKey: string, path: string }}
 */
export function deriveAddressFromMnemonic(mnemonic, index = 0) {
  return deriveEvmAccount(mnemonic, index);
}
