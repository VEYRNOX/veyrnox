// wallet-core/evm/send.js
//
// High-level native ETH send: estimate -> sign locally -> broadcast -> confirm.
// This is the REAL replacement for the simulated send (Math.random() hash +
// DB balance edit) in the original SendCrypto flow.
//
// The signing key is obtained transiently via the provider's withPrivateKey()
// and used only inside this call. The returned hash is a REAL chain hash.

import { Wallet, parseEther, isAddress } from 'ethers';
import { getProvider } from './provider.js';
import { getNetwork } from './networks.js';
import { evmFeeOverrides } from './fees.js';

/**
 * Estimate the total cost (value + gas) before the user confirms.
 * Returns strings in ETH for display.
 */
export async function estimateSend({ networkKey, from, to, amountEth }) {
  if (!isAddress(to)) throw new Error('Invalid recipient address');
  const provider = getProvider(networkKey);
  const value = parseEther(String(amountEth));
  const [feeData, gasLimit] = await Promise.all([
    provider.getFeeData(),
    provider.estimateGas({ from, to, value }),
  ]);
  const maxFeePerGas = feeData.maxFeePerGas ?? feeData.gasPrice ?? 0n;
  const gasCostWei = gasLimit * maxFeePerGas;
  return {
    gasLimit: gasLimit.toString(),
    maxFeePerGasWei: maxFeePerGas.toString(),
    estGasCostWei: gasCostWei.toString(),
    totalWei: (value + gasCostWei).toString(),
  };
}

/**
 * Sign locally and broadcast. `privateKey` is supplied transiently by the
 * caller (e.g. via useWallet().withPrivateKey) and must not be persisted.
 *
 * `fee` (optional) is a user-selected EIP-1559 fee from evm/fees.js
 * ({ maxFeePerGasWei, maxPriorityFeePerGasWei, gasLimit }). When omitted, ethers
 * auto-fills the fee as before (back-compat). When present, those EXACT values
 * are what get signed — see evmFeeOverrides().
 *
 * @returns {Promise<{ hash: string, wait: Function }>} REAL tx handle.
 */
export async function signAndBroadcast({ networkKey, privateKey, to, amountEth, fee }) {
  if (!isAddress(to)) throw new Error('Invalid recipient address');
  const net = getNetwork(networkKey); // throws if mainnet gated
  const provider = getProvider(networkKey);
  const wallet = new Wallet(privateKey, provider);

  // Defense-in-depth: verify the live network matches the intended chainId.
  const live = await provider.getNetwork();
  if (Number(live.chainId) !== net.chainId) {
    throw new Error(`Wrong network: provider chainId ${live.chainId}, expected ${net.chainId}`);
  }

  // ethers fills nonce, signs LOCALLY, and broadcasts. The user-selected fee
  // overrides (if any) are the EXACT EIP-1559 fields that get signed; with no
  // override ethers auto-fills them.
  const value = parseEther(String(amountEth));
  const overrides = evmFeeOverrides(fee);

  // GAS LIMIT must be estimated PER CHAIN. The fee tier carries a gasLimit that is
  // only a DISPLAY hint (21000 — an Ethereum-L1 simple-transfer assumption). L2s
  // (Arbitrum, Optimism, …) require MORE intrinsic gas for the L1 data-posting
  // component, so signing a hardcoded 21000 is rejected by the RPC as "intrinsic
  // gas too low" and the send silently fails. Estimate the real limit for THIS
  // chain and sign with it (the user's chosen fee PRICE is preserved); honour a
  // larger user-supplied custom limit. If estimation fails, fall back to whatever
  // the fee carried — or ethers' own auto-fill when no override was given.
  try {
    const est = await provider.estimateGas({ from: wallet.address, to, value });
    const withHeadroom = (est * 12n) / 10n; // +20% so a tight estimate can't strand it
    overrides.gasLimit = overrides.gasLimit && overrides.gasLimit > withHeadroom
      ? overrides.gasLimit
      : withHeadroom;
  } catch {
    /* keep the hinted gasLimit (or ethers auto-fill if none was provided) */
  }

  const txResponse = await wallet.sendTransaction({ to, value, ...overrides });

  return {
    hash: txResponse.hash,          // REAL hash from the network
    explorerUrl: `${net.explorer}/tx/${txResponse.hash}`,
    wait: (confirmations = 1) => txResponse.wait(confirmations),
  };
}
