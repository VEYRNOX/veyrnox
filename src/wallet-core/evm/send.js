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
import { verifyLiveChainId, applyEstimatedGasLimit } from './preflight.js';
import { assertDecimalAmount } from '../amount.js';

/**
 * Sign locally and broadcast. `privateKey` is supplied transiently by the
 * caller (e.g. via useWallet().withPrivateKey) and must not be persisted.
 *
 * `fee` (optional) is a user-selected EIP-1559 fee from evm/fees.js
 * ({ maxFeePerGasWei, maxPriorityFeePerGasWei, gasLimit }). When omitted, ethers
 * auto-fills the fee as before (back-compat). When present, those EXACT values
 * are what get signed — see evmFeeOverrides().
 *
 * @returns {Promise<{ hash: string, explorerUrl: string, wait: Function }>} REAL tx handle.
 */
export async function signAndBroadcast({ networkKey, privateKey, to, amountEth, fee }) {
  if (!isAddress(to)) throw new Error('Invalid recipient address');
  const net = getNetwork(networkKey); // throws if mainnet gated
  const provider = getProvider(networkKey);
  const wallet = new Wallet(privateKey, provider);

  // Defense-in-depth: confirm the RPC is ACTUALLY on the intended chain via a raw
  // eth_chainId read (provider.getNetwork() can't — it returns the pinned chainId
  // under staticNetwork; see preflight.js). Fail closed on mismatch.
  await verifyLiveChainId(provider, net.chainId);

  // ethers fills nonce, signs LOCALLY, and broadcasts. The user-selected fee
  // overrides (if any) are the EXACT EIP-1559 fields that get signed; with no
  // override ethers auto-fills them.
  assertDecimalAmount(amountEth, 18); // family-consistent strict validation (ETH = 18 dp)
  const value = parseEther(String(amountEth));
  const overrides = evmFeeOverrides(fee);
  // Estimate the gas LIMIT per chain (+20% headroom) — a tier's hinted 21000 is an
  // L1 simple-transfer assumption that L2s reject (see preflight.js).
  await applyEstimatedGasLimit(provider, { from: wallet.address, to, value }, overrides);

  // VULN-19: sanity-check the pending nonce before signing. A malicious RPC could
  // return an inflated nonce to make the tx unreplayable, or a stale one to replay
  // an old tx. We trust the local counter only within a sane window (0–1 000 000).
  const pendingNonce = await provider.getTransactionCount(wallet.address, 'pending');
  if (!Number.isInteger(pendingNonce) || pendingNonce < 0 || pendingNonce > 1_000_000) {
    throw new Error(`RPC returned implausible nonce ${pendingNonce} — refusing to sign`);
  }

  const txResponse = await wallet.sendTransaction({ to, value, ...overrides });

  return {
    hash: txResponse.hash,          // REAL hash from the network
    explorerUrl: `${net.explorer}/tx/${txResponse.hash}`,
    wait: (confirmations = 1) => txResponse.wait(confirmations),
  };
}
