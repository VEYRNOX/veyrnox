// wallet-core/signing.js
//
// Local transaction & message signing for EVM chains.
//
// SECURITY RATIONALE
// ------------------
// Replaces the simulated send flow that fabricated a tx hash with
// Math.random() and decremented a database balance. Real self-custody:
//   1. Build the tx.
//   2. Sign it LOCALLY with the in-memory key (never sent anywhere).
//   3. Broadcast the signed raw tx via an RPC provider.
//   4. Poll for confirmation; treat the CHAIN as source of truth.
//
// The key never leaves the device. The backend, if involved at all, only
// ever sees the already-signed transaction or the resulting public hash.
//
// ANTI-PHISHING (implement in the UI layer that calls this):
//   - Decode and display calldata in human-readable form before signing.
//   - Flag unlimited ERC-20 approvals and unknown contract interactions.
//   - Show chainId explicitly; verify it matches the intended network
//     (replay protection / wrong-chain protection).
//   - Resolve + display ENS and guard against address-poisoning lookalikes.

import { Wallet, JsonRpcProvider, parseEther, isAddress } from 'ethers';

/**
 * Create an ethers Wallet from a private key, connected to a provider.
 * The privateKey is a LIVE SECRET; keep its lifetime as short as possible
 * and do not store the resulting object in long-lived global state.
 */
export function makeSigner(privateKey, rpcUrl) {
  const provider = new JsonRpcProvider(rpcUrl);
  return new Wallet(privateKey, provider);
}

/** EIP-191 personal message signing. */
export async function signMessage(privateKey, rpcUrl, message) {
  const signer = makeSigner(privateKey, rpcUrl);
  return signer.signMessage(message);
}

/**
 * Build + sign + broadcast a native-value transfer.
 * Returns the broadcast response; caller polls .wait() for confirmation.
 * Fees: ethers populates EIP-1559 maxFeePerGas/maxPriorityFeePerGas from the
 * provider. For production, surface these to the user before signing.
 */
export async function sendNativeTransfer({ privateKey, rpcUrl, to, amountEth, chainId }) {
  if (!isAddress(to)) throw new Error('Invalid recipient address');
  const signer = makeSigner(privateKey, rpcUrl);

  // Defense-in-depth: confirm the connected network matches the intended chain.
  const net = await signer.provider.getNetwork();
  if (chainId != null && Number(net.chainId) !== Number(chainId)) {
    throw new Error(`Wrong network: provider is chainId ${net.chainId}, expected ${chainId}`);
  }

  // ethers fills nonce, gas, and EIP-1559 fees, signs locally, and broadcasts.
  const tx = await signer.sendTransaction({ to, value: parseEther(String(amountEth)) });
  return tx; // await tx.wait() to confirm; the hash here is REAL, from the chain.
}
