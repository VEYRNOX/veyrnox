// Per-chain recipient-address validation, shared by the Send flow and the Address
// Book so the two agree on what a valid address is. This wraps the validators the
// app already relies on rather than inventing new ones:
//   - EVM  : `isAddress` from ethers (the exact gate `evm/send.js` uses before signing)
//   - SOL  : `isValidSolAddress` from wallet-core (base58 → 32-byte ed25519 key)
//   - BTC  : `isValidBtcAddress` from wallet-core — a real checksum + network-HRP
//            check via @scure/btc-signer (the SAME library + params enforced at sign
//            time), so the UI guard agrees with the crypto backstop and rejects
//            mainnet addresses while the app is testnet-only.
//
// No wallet-core crypto is touched here — only existing exports are reused.
import { isAddress } from "ethers";
import { isValidSolAddress, isValidBtcAddress } from "@/wallet-core";

// Currencies whose on-chain address is a standard 20-byte EVM 0x-address.
const EVM_CURRENCIES = new Set(["ETH", "USDC", "USDT", "BNB", "MATIC", "ARB", "OP", "AVAX"]);
// Networks that are EVM chains (address format is a property of the network).
const EVM_NETWORKS = new Set(["Ethereum", "Polygon", "BSC", "Arbitrum", "Optimism", "Avalanche"]);

/**
 * Resolve which chain's address format applies to a contact / recipient.
 *
 * The address format is a property of the NETWORK (e.g. USDC on Ethereum is a
 * 0x-address; USDC on Solana is base58), so the network is authoritative when it
 * is known; the currency is the fallback when no network is supplied (the Send
 * flow only has a currency). Returns 'evm' | 'btc' | 'sol' | 'unknown'.
 */
export function addressChainKind(currency, network) {
  if (network === "Bitcoin") return "btc";
  if (network === "Solana") return "sol";
  if (EVM_NETWORKS.has(network)) return "evm";
  if (currency === "BTC") return "btc";
  if (currency === "SOL") return "sol";
  if (EVM_CURRENCIES.has(currency)) return "evm";
  return "unknown";
}

/**
 * @returns {boolean} true if `address` is a plausible address for the given
 * currency/network. Empty strings return true (the empty/required-field case is
 * handled by the form, not here). Unknown chains are not validated (return true),
 * matching the Send flow's permissive default for currencies it can't check.
 */
export function isValidAddressForCurrency(address, currency, network) {
  if (!address) return true;
  switch (addressChainKind(currency, network)) {
    case "evm":
      return isAddress(address);
    case "sol":
      return isValidSolAddress(address);
    case "btc":
      return isValidBtcAddress(address);
    default:
      return true;
  }
}

/** Human-readable label for the expected address format, for inline error copy. */
export function addressKindLabel(currency, network) {
  switch (addressChainKind(currency, network)) {
    case "evm":
      return "a 0x EVM address";
    case "sol":
      return "a base58 Solana address";
    case "btc":
      return "a Bitcoin address";
    default:
      return "a valid address";
  }
}
