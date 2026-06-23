// wallet-core/coldkey/evmUnsigned.js
//
// COLD-KEY SIGNING (Feature 5) — EVM unsigned transaction serialiser.
//
// Serialises a fully-specified EIP-1559 transaction WITHOUT a signature. The wallet
// shows the `unsignedSerialized` bytes to an EXTERNAL signer (as a QR), which holds
// the key, signs, and returns the signed raw tx the wallet broadcasts via
// evm/provider.js#broadcastSigned.
//
// I1 — keys never leave the device: this artifact has NO private key and NO
// signature. It pins chainId/nonce/gas/value/to so the external signer signs
// EXACTLY what the user reviewed (wrong-network / replay safety — chainId is
// REQUIRED, fail closed if absent).

import { Transaction, isAddress } from 'ethers';

/**
 * Build an UNSIGNED EIP-1559 EVM transaction. PURE — no network, no signing.
 *
 * @param {object} args
 * @param {number} args.chainId                  REQUIRED — wrong-network/replay guard.
 * @param {number} args.nonce
 * @param {string} args.to
 * @param {bigint} args.valueWei
 * @param {bigint} args.maxFeePerGasWei
 * @param {bigint} args.maxPriorityFeePerGasWei
 * @param {bigint} args.gasLimit
 * @param {string} [args.data]                   optional calldata (token transfer etc.)
 * @returns {{ unsignedSerialized: string, chainId: number, signature: import('ethers').Signature|null }}
 */
export function buildUnsignedEvmTx({
  chainId,
  nonce,
  to,
  valueWei,
  maxFeePerGasWei,
  maxPriorityFeePerGasWei,
  gasLimit,
  data,
}) {
  if (!Number.isInteger(chainId) || chainId <= 0) {
    throw new Error('buildUnsignedEvmTx: chainId is required (wrong-network/replay guard)');
  }
  if (!isAddress(to)) throw new Error('buildUnsignedEvmTx: invalid recipient address');
  if (!Number.isInteger(nonce) || nonce < 0) {
    throw new Error('buildUnsignedEvmTx: invalid nonce');
  }

  const tx = Transaction.from({
    type: 2, // EIP-1559
    chainId,
    nonce,
    to,
    value: valueWei,
    maxFeePerGas: maxFeePerGasWei,
    maxPriorityFeePerGas: maxPriorityFeePerGasWei,
    gasLimit,
    ...(data ? { data } : {}),
  });

  // ethers throws if you read unsignedSerialized on a signed tx; on an unsigned tx
  // it returns the 0x02… typed envelope WITHOUT signature fields.
  return {
    unsignedSerialized: tx.unsignedSerialized,
    chainId,
    signature: tx.signature, // null while unsigned — asserted in tests
  };
}
