// wallet-core/coldkey/evmUnsigned.js
//
// Serialise an unsigned EIP-1559 transaction for cold-key / air-gapped signing.
// The caller provides all fields; this module constructs an RLP-encoded unsigned
// tx payload (no signature) that a cold signer can sign and return.
//
// I1: private keys NEVER touch this module. Only public data (addresses, amounts,
// fees, chainId) goes into the unsigned payload — and only the signed result comes
// back. chainId is REQUIRED (fail-closed replay guard: missing chainId → throw).

import { Transaction } from 'ethers';

/**
 * Build an unsigned EIP-1559 transaction suitable for cold signing.
 * @param {{
 *   chainId: number,
 *   to: string,
 *   value?: bigint,
 *   data?: string,
 *   nonce: number,
 *   maxFeePerGas: bigint,
 *   maxPriorityFeePerGas: bigint,
 *   gasLimit: bigint,
 * }} params
 * @returns {{ unsignedHex: string, chainId: number }}
 */
export function buildUnsignedEvmTx(params) {
  const { chainId, to, value, data, nonce, maxFeePerGas, maxPriorityFeePerGas, gasLimit } = params;
  if (!chainId) throw new Error('chainId is required for cold signing (replay guard)');
  const tx = Transaction.from({
    type: 2,
    chainId,
    to,
    value: value ?? 0n,
    data: data ?? '0x',
    nonce,
    maxFeePerGas,
    maxPriorityFeePerGas,
    gasLimit,
  });
  return { unsignedHex: tx.unsignedSerialized, chainId };
}
