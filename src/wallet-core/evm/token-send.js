// wallet-core/evm/token-send.js
//
// ERC-20 read + transfer (Phase B). NO new key cryptography: same EVM keys, same
// m/44'/60' derivation, same LOCAL signing as Phase A. The only new surface is
// the token contract calls.
//
// SECURITY RATIONALE
//   - Chain is the source of truth for balances (read via balanceOf), never the
//     DB. We additionally cross-check the contract's on-chain decimals() against
//     the pinned registry value — a mismatch throws rather than silently scaling
//     the amount by the wrong power of ten.
//   - `privateKey` is supplied transiently by the caller (useWallet().
//     withPrivateKey) and is never persisted or logged.
//   - chainId is re-verified against the intended network before broadcast
//     (wrong-chain / replay protection), mirroring the native send path.
//   - approve() is deliberately NOT exposed here: unlimited approvals are the #1
//     token-drain vector and only belong behind the explicit warning UX.

import { Contract, Interface, Wallet, parseUnits, formatUnits, isAddress } from 'ethers';
import { getProvider } from './provider.js';
import { getNetwork } from './networks.js';
import { getToken, ERC20_ABI } from './tokens.js';

const erc20Interface = new Interface(ERC20_ABI);

/** Assert the contract's live decimals() matches the pinned registry value. */
async function assertDecimals(contract, token) {
  const onchain = await contract.decimals();
  if (Number(onchain) !== token.decimals) {
    throw new Error(
      `Decimals mismatch for ${token.symbol}: configured ${token.decimals}, chain ${onchain}`
    );
  }
}

/**
 * Read a token balance from the chain (source of truth), formatted with the
 * token's decimals. Returns a decimal string (e.g. "12.5").
 */
export async function getTokenBalance({ networkKey, symbol, owner }) {
  if (!isAddress(owner)) throw new Error('Invalid owner address');
  const provider = getProvider(networkKey);
  const t = getToken(networkKey, symbol); // throws if unconfigured/unverified
  const c = new Contract(t.address, ERC20_ABI, provider);
  const [raw, onchainDecimals] = await Promise.all([c.balanceOf(owner), c.decimals()]);
  if (Number(onchainDecimals) !== t.decimals) {
    throw new Error(
      `Decimals mismatch for ${symbol}: configured ${t.decimals}, chain ${onchainDecimals}`
    );
  }
  return formatUnits(raw, t.decimals);
}

/**
 * Build the ERC-20 `transfer` calldata for a given amount WITHOUT broadcasting.
 * Exposed so the UI can decode + display EXACTLY what will be signed (via
 * describeErc20Call in calldata.js) before the user confirms. Uses parseUnits
 * for exact base-unit scaling (no floats).
 * @returns {{ data: string, contract: string, value: bigint, token: object }}
 */
export function buildTokenTransfer({ networkKey, symbol, to, amount }) {
  if (!isAddress(to)) throw new Error('Invalid recipient address');
  const t = getToken(networkKey, symbol);
  const value = parseUnits(String(amount), t.decimals); // correct-decimals scaling
  const data = erc20Interface.encodeFunctionData('transfer', [to, value]);
  return { data, contract: t.address, value, token: t };
}

/**
 * Build + sign + broadcast an ERC-20 transfer. `privateKey` is transient and
 * never persisted. Returns a REAL tx handle (hash from the network).
 * @returns {Promise<{ hash: string, explorerUrl: string, wait: Function }>}
 */
export async function sendToken({ networkKey, privateKey, symbol, to, amount }) {
  if (!isAddress(to)) throw new Error('Invalid recipient address');
  const net = getNetwork(networkKey); // throws if mainnet gated / disabled
  const provider = getProvider(networkKey);
  const t = getToken(networkKey, symbol);

  const wallet = new Wallet(privateKey, provider);

  // Defense-in-depth: confirm the live network matches the intended chainId.
  const live = await provider.getNetwork();
  if (Number(live.chainId) !== net.chainId) {
    throw new Error(`Wrong network: provider chainId ${live.chainId}, expected ${net.chainId}`);
  }

  const c = new Contract(t.address, ERC20_ABI, wallet);
  await assertDecimals(c, t); // never scale by an unverified power of ten
  const value = parseUnits(String(amount), t.decimals); // exact base units, no float
  const txResponse = await c.transfer(to, value); // signed LOCALLY + broadcast

  return {
    hash: txResponse.hash, // REAL hash from the network
    explorerUrl: `${net.explorer}/tx/${txResponse.hash}`,
    wait: (n = 1) => txResponse.wait(n),
  };
}
