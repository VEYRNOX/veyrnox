// Per-chain recipient-address validation, shared by the Send flow and the Address
// Book so the two agree on what a valid address is. This wraps the validators the
// app already relies on rather than inventing new ones:
//   - EVM  : `isAddress` from ethers (the exact gate `evm/send.js` uses before signing)
//   - SOL  : `isValidSolAddress` from wallet-core (base58 → 32-byte ed25519 key)
//   - BTC  : the Send flow's shallow format regex (authoritative checksum is enforced
//            by @scure/btc-signer at send time; this is a UI guard, not a crypto check)
//
// No wallet-core crypto is touched here — only existing exports are reused.
import { isAddress } from "ethers";
import { isValidSolAddress } from "@/wallet-core";

// Shallow Bitcoin format check. Mainnet (legacy 1…, P2SH 3…, bech32 bc1…) AND
// testnet/regtest bech32 (tb1…, bcrt1…) — the app is testnet-only, so a recipient
// is a tb1… address (the wallet's own BIP-84 address included); without these the
// send flow rejects every valid testnet recipient. Format-only — the authoritative
// checksum + network match are enforced by @scure/btc-signer at sign time.
const BTC_ADDRESS = /^(1|3|bc1|tb1|bcrt1)[a-zA-Z0-9]{25,62}$/;

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
      return BTC_ADDRESS.test(address);
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
