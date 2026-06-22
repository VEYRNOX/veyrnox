// Per-chain recipient-address validation, shared by the Send flow and the Address
// Book so the two agree on what a valid address is. This wraps the validators the
// app already relies on rather than inventing new ones:
//   - EVM  : `isAddress` from ethers (the exact gate `evm/send.js` uses before signing)
//   - SOL  : `isValidSolAddress` from wallet-core (base58 → 32-byte ed25519 key)
//   - BTC  : `isValidBtcAddress` from wallet-core — a real checksum + network-HRP
//            check via @scure/btc-signer (the SAME library + params enforced at sign
//            time). It is NETWORK-AWARE to the ACTIVE BTC network: the BTC asset runs
//            on testnet, so we validate against the active testnet params
//            (`getActiveBtcParams()`) rather than the global enabled-network list.
//            That keeps the UI guard correct even though ALLOW_BTC_MAINNET is true and
//            mainnet params are enabled — a mainnet `bc1…` is the wrong network for
//            the active testnet asset and is rejected inline, not just at sign time.
//
// No wallet-core crypto is touched here — only existing exports are reused.
import { isAddress } from "ethers";
import { isValidSolAddress, isValidBtcAddress } from "@/wallet-core";
import { getActiveBtcParams } from "@/wallet-core/btc/networks.js";

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
      // Validate against the ACTIVE BTC network (testnet) only, so a mainnet-format
      // recipient is rejected inline even though mainnet params are in the enabled
      // set. This does not flip ALLOW_BTC_MAINNET — it only narrows the UI validator.
      return isValidBtcAddress(address, [getActiveBtcParams()]);
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
