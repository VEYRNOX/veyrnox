// wallet-core/evm/hw-send.js
//
// Hardware-wallet ETH signing for Ledger and Trezor.
// BUILT — unverified pending real-device testnet confirmation (no txid yet).
//
// The flow mirrors evm/send.js (same preflight + nonce guard) but instead of
// creating an ethers Wallet from a private key, it:
//   Ledger  — serialises an unsigned EIP-1559 tx, calls eth.signTransaction(),
//             reconstructs the signed payload, and broadcasts via the provider.
//   Trezor  — calls TrezorConnect.ethereumSignTransaction() with the same tx
//             fields, reconstructs the signed payload, and broadcasts.
//
// No private key ever touches this module. I1 preserved.

import { Transaction, parseEther, Signature, isAddress, getAddress } from 'ethers';
import Eth from '@ledgerhq/hw-app-eth';
import TrezorConnect from '@trezor/connect-web';
import { getProvider } from './provider.js';
import { getNetwork } from './networks.js';
import { evmFeeOverrides } from './fees.js';
import { verifyLiveChainId, applyEstimatedGasLimit } from './preflight.js';
import { assertDecimalAmount } from '../amount.js';

const EVM_PATH = "44'/60'/0'/0/0";

/**
 * Belt-and-suspenders recovery check (M-2 / #746): the device returns only
 * {v, r, s}, so a wrong recovery id from a buggy/malicious device yields a
 * broadcastable tx that recovers to a DIFFERENT sender — silently. Recover the
 * sender from the reconstructed signature and refuse to broadcast on mismatch
 * (fail-closed, I4). Returns the serialized tx only when the recovered sender
 * equals the expected one.
 */
function serializeCheckedSignedTx(txFields, signature, fromAddress) {
  const signed = Transaction.from({ ...txFields, signature });
  if (!signed.from || getAddress(signed.from) !== getAddress(fromAddress)) {
    throw Object.assign(
      new Error(`Hardware signature recovered to ${signed.from ?? 'null'}, expected ${fromAddress} — refusing to broadcast`),
      { code: 'HW_SIGNER_MISMATCH' },
    );
  }
  return signed.serialized;
}

/**
 * Build a fully-populated unsigned EIP-1559 tx (type 2), including nonce,
 * chainId, and gas overrides. All preflight checks from evm/send.js apply.
 */
async function buildUnsignedEvmTx({ networkKey, fromAddress, to, amountEth, fee = null }) {
  if (!isAddress(to)) throw new Error('Invalid recipient address');
  const net = getNetwork(networkKey);
  const provider = getProvider(networkKey);
  await verifyLiveChainId(provider, net.chainId);
  assertDecimalAmount(amountEth, 18);

  const value = parseEther(String(amountEth));
  const overrides = evmFeeOverrides(fee);
  await applyEstimatedGasLimit(provider, { from: fromAddress, to, value }, overrides);

  const pendingNonce = await provider.getTransactionCount(fromAddress, 'pending');
  if (!Number.isInteger(pendingNonce) || pendingNonce < 0 || pendingNonce > 1_000_000) {
    throw new Error(`RPC returned implausible nonce ${pendingNonce} — refusing to sign`);
  }

  return /** @type {{ to: string, value: bigint, chainId: number, nonce: number, type: number, data: string, gasLimit: bigint, maxFeePerGas: bigint, maxPriorityFeePerGas: bigint }} */ ({
    to,
    value,
    chainId: net.chainId,
    nonce: pendingNonce,
    type: 2,
    data: '0x',
    ...overrides,  // gasLimit, maxFeePerGas, maxPriorityFeePerGas
  });
}

/**
 * Sign and broadcast via a connected Ledger. `transport` is the live
 * WebHID transport from HardwareWalletContext.
 *
 * @returns {Promise<{ hash: string, explorerUrl: string, wait: Function }>}
 */
export async function signAndBroadcastEvmLedger({ transport, networkKey, fromAddress, to, amountEth, fee = null }) {
  const net = getNetwork(networkKey);
  const provider = getProvider(networkKey);
  const txFields = await buildUnsignedEvmTx({ networkKey, fromAddress, to, amountEth, fee });

  const unsigned = Transaction.from(txFields);
  const eth = new Eth(transport);
  // Strip 0x prefix — Ledger expects raw hex
  const sig = await eth.signTransaction(EVM_PATH, unsigned.unsignedSerialized.slice(2), null);

  const signed = serializeCheckedSignedTx(txFields, Signature.from({
    v: parseInt(sig.v, 16),
    r: '0x' + sig.r,
    s: '0x' + sig.s,
  }), fromAddress);

  const txResponse = await provider.broadcastTransaction(signed);
  return {
    hash: txResponse.hash,
    explorerUrl: `${net.explorer}/tx/${txResponse.hash}`,
    wait: (confirmations = 1) => txResponse.wait(confirmations),
  };
}

/**
 * Sign and broadcast via Trezor Connect.
 *
 * @returns {Promise<{ hash: string, explorerUrl: string, wait: Function }>}
 */
export async function signAndBroadcastEvmTrezor({ networkKey, fromAddress, to, amountEth, fee = null }) {
  const net = getNetwork(networkKey);
  const provider = getProvider(networkKey);
  const txFields = await buildUnsignedEvmTx({ networkKey, fromAddress, to, amountEth, fee });

  const toHex = (n) => '0x' + BigInt(n).toString(16);

  const result = await TrezorConnect.ethereumSignTransaction({
    path: `m/${EVM_PATH}`,
    transaction: {
      to:                   txFields.to,
      value:                toHex(txFields.value),
      chainId:              txFields.chainId,
      nonce:                toHex(txFields.nonce),
      gasLimit:             toHex(txFields.gasLimit),
      maxFeePerGas:         toHex(txFields.maxFeePerGas),
      maxPriorityFeePerGas: toHex(txFields.maxPriorityFeePerGas),
      data:                 '0x',
    },
  });
  if (!result.success) throw new Error((result.payload && 'error' in result.payload ? result.payload.error : null) ?? 'Trezor signing failed');

  const { v, r, s } = result.payload;
  const signed = serializeCheckedSignedTx(
    txFields,
    Signature.from({ v: parseInt(v, 16), r, s }),
    fromAddress,
  );

  const txResponse = await provider.broadcastTransaction(signed);
  return {
    hash: txResponse.hash,
    explorerUrl: `${net.explorer}/tx/${txResponse.hash}`,
    wait: (confirmations = 1) => txResponse.wait(confirmations),
  };
}
