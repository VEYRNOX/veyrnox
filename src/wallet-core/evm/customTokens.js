// wallet-core/evm/customTokens.js
//
// Read-only custom ERC-20 discovery and balance reads. A custom token is never
// trusted because a user supplied its address: the address must contain bytecode,
// symbol/decimals come from that contract, and the persisted decimals value is
// checked again before every balance read. This module does not sign or send.

import { Contract, formatUnits, getAddress, isAddress } from 'ethers';
import { getProvider } from './provider.js';
import { getNetwork } from './networks.js';
import { ERC20_ABI } from './tokens.js';
import { isDeniabilityOrDemoActive } from '../deniabilitySession.js';

export const CUSTOM_TOKEN_SYMBOL_MAX_LENGTH = 16;
export const CUSTOM_TOKEN_DECIMALS_MAX = 36;

function userError(message, code) {
  return Object.assign(new Error(message), { code });
}

function assertPrimarySession() {
  let deniable = true;
  try {
    deniable = isDeniabilityOrDemoActive() !== false;
  } catch {
    // If session state cannot be established, fail closed before storage/RPC.
  }
  if (deniable) {
    throw userError('Custom tokens are unavailable in a private session.', 'CUSTOM_TOKEN_DENIABLE');
  }
}

/** Validate at the user-input boundary before any provider is created. */
export function validateCustomTokenAddress(value) {
  if (typeof value !== 'string') {
    throw userError('Enter a valid 42-character contract address.', 'CUSTOM_TOKEN_ADDRESS');
  }
  const address = value.trim();
  if (address.length !== 42 || !isAddress(address)) {
    throw userError('Enter a valid 42-character contract address.', 'CUSTOM_TOKEN_ADDRESS');
  }
  return getAddress(address);
}

/** Treat contract-returned metadata as hostile display input. */
export function validateCustomTokenSymbol(value) {
  if (typeof value !== 'string') {
    throw userError('This contract did not return a valid token symbol.', 'CUSTOM_TOKEN_SYMBOL');
  }
  const symbol = value.trim();
  const characters = [...symbol];
  if (
    characters.length < 1
    || characters.length > CUSTOM_TOKEN_SYMBOL_MAX_LENGTH
    // React renders this as text, never HTML. Reject markup delimiters anyway,
    // plus control/bidirectional characters that can forge the visible label.
    || /[<>&\u0000-\u001F\u007F-\u009F\u202A-\u202E\u2066-\u2069]/u.test(symbol)
  ) {
    throw userError(
      `Token symbols must be 1–${CUSTOM_TOKEN_SYMBOL_MAX_LENGTH} visible characters without HTML or control characters.`,
      'CUSTOM_TOKEN_SYMBOL',
    );
  }
  return symbol;
}

export function validateCustomTokenDecimals(value) {
  const decimals = typeof value === 'bigint' ? Number(value) : value;
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > CUSTOM_TOKEN_DECIMALS_MAX) {
    throw userError(
      `This contract returned unsupported decimals. Expected a whole number from 0 to ${CUSTOM_TOKEN_DECIMALS_MAX}.`,
      'CUSTOM_TOKEN_DECIMALS',
    );
  }
  return decimals;
}

export function assertCustomTokenDecimalsMatch(expected, observed) {
  const stored = validateCustomTokenDecimals(expected);
  const onChain = validateCustomTokenDecimals(observed);
  if (stored !== onChain) {
    throw userError(
      `Token decimals changed from ${stored} to ${onChain}. The balance was not loaded. Remove and add the token again after checking the contract.`,
      'CUSTOM_TOKEN_DECIMALS_MISMATCH',
    );
  }
  return stored;
}

/** Validate a token object read from local storage before it reaches the UI/RPC. */
export function validateStoredCustomToken(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw userError('Saved token data is invalid.', 'CUSTOM_TOKEN_SAVED_DATA');
  }
  const networkKey = typeof value.networkKey === 'string' ? value.networkKey : '';
  try {
    getNetwork(networkKey);
  } catch {
    throw userError('The saved token network is not supported.', 'CUSTOM_TOKEN_NETWORK');
  }
  const address = validateCustomTokenAddress(value.address);
  const symbol = validateCustomTokenSymbol(value.symbol);
  const decimals = validateCustomTokenDecimals(value.decimals);
  return {
    id: `${networkKey}:${address.toLowerCase()}`,
    networkKey,
    address,
    symbol,
    decimals,
  };
}

function contractAt(address, provider, contractFactory) {
  return contractFactory
    ? contractFactory(address, ERC20_ABI, provider)
    : new Contract(address, ERC20_ABI, provider);
}

/**
 * @typedef {{ providerFactory?: (networkKey: string) => any, contractFactory?: (address: string, abi: any, provider: any) => any }} CustomTokenFactories
 */

/**
 * Read and validate metadata from a user-selected EVM network. Provider and
 * contract factories are injectable only so unit tests can prove the guards.
 */
export async function inspectCustomToken(options = /** @type {CustomTokenFactories & { networkKey: string, address: string }} */ ({})) {
  const { networkKey, address, providerFactory = getProvider, contractFactory } = options;
  assertPrimarySession();
  const cleanAddress = validateCustomTokenAddress(address);
  try {
    getNetwork(networkKey);
  } catch {
    throw userError('Choose a supported EVM network.', 'CUSTOM_TOKEN_NETWORK');
  }

  const provider = providerFactory(networkKey);
  let code;
  try {
    code = await provider.getCode(cleanAddress);
  } catch {
    throw userError('Could not check this address on the selected network. Try again.', 'CUSTOM_TOKEN_RPC');
  }
  if (typeof code !== 'string' || !/^0x[0-9a-fA-F]*$/.test(code) || /^0x0*$/.test(code)) {
    throw userError('No contract was found at this address on the selected network.', 'CUSTOM_TOKEN_NOT_CONTRACT');
  }

  const contract = contractAt(cleanAddress, provider, contractFactory);
  let rawSymbol;
  let rawDecimals;
  try {
    [rawSymbol, rawDecimals] = await Promise.all([contract.symbol(), contract.decimals()]);
  } catch {
    throw userError('This contract does not expose readable ERC-20 symbol and decimals metadata.', 'CUSTOM_TOKEN_METADATA');
  }

  return validateStoredCustomToken({
    networkKey,
    address: cleanAddress,
    symbol: validateCustomTokenSymbol(rawSymbol),
    decimals: validateCustomTokenDecimals(rawDecimals),
  });
}

/** Read one balance only after the saved decimals still match the contract. */
export async function readCustomTokenBalance(options = /** @type {CustomTokenFactories & { token: any, owner: string }} */ ({})) {
  const { token, owner, providerFactory = getProvider, contractFactory } = options;
  assertPrimarySession();
  const cleanToken = validateStoredCustomToken(token);
  const cleanOwner = validateCustomTokenAddress(owner);
  const provider = providerFactory(cleanToken.networkKey);
  const contract = contractAt(cleanToken.address, provider, contractFactory);

  let observedDecimals;
  try {
    observedDecimals = await contract.decimals();
  } catch {
    throw userError('Could not verify this token’s decimals. The balance was not loaded.', 'CUSTOM_TOKEN_METADATA');
  }
  assertCustomTokenDecimalsMatch(cleanToken.decimals, observedDecimals);

  let rawBalance;
  try {
    rawBalance = await contract.balanceOf(cleanOwner);
    return formatUnits(rawBalance, cleanToken.decimals);
  } catch {
    throw userError('Could not load this token balance from the selected network.', 'CUSTOM_TOKEN_BALANCE');
  }
}
