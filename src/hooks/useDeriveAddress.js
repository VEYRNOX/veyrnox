// hooks/useDeriveAddress.js
//
// R2 facade over wallet-core HD derivation for UI/page code. The ring-import
// lint rule permits src/hooks/ to import from wallet-core; pages must not reach
// past this boundary directly (issue #627). This wrapper only forwards the call
// — it does NOT persist or log the derived private key.
import { deriveEvmAddress } from '@/wallet-core/derivation';

/**
 * Derive ONLY the EVM address for a mnemonic — the private key is never
 * materialised (address-only public-key derivation, L-1 S1-S4 audit). This is
 * all UI/page code needs (display + address comparison); anything that must
 * sign uses deriveEvmAccount directly, never this hook.
 * @param {string} mnemonic
 * @param {number} [index=0] - final BIP-44 path index (m/44'/60'/0'/0/{index})
 * @returns {string} checksummed EIP-55 address
 */
export function deriveAddressFromMnemonic(mnemonic, index = 0) {
  return deriveEvmAddress(mnemonic, index);
}
