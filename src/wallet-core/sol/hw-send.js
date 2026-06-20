// wallet-core/sol/hw-send.js
//
// Hardware-wallet SOL signing for Ledger and Trezor.
// BUILT — unverified pending real-device testnet confirmation (no txid yet).
//
// The rent-exempt planner and blockhash-expiry retry loop from sol/send.js are
// reused verbatim — the only change is how the transaction is signed:
//
//   Ledger  — serialises the tx message, calls AppSolana.signTransaction(),
//             and adds the returned 64-byte ed25519 signature.
//   Trezor  — passes the serialised message hex to
//             TrezorConnect.solanaSignTransaction(), converts the returned hex
//             signature, and adds it the same way.
//
// No private key ever touches this module. I1 preserved.

import AppSolana from '@ledgerhq/hw-app-solana';
import TrezorConnect from '@trezor/connect-web';
import {
  PublicKey, Transaction, SystemProgram, Connection,
} from '@solana/web3.js';
import { getSolNetwork } from './networks.js';
import {
  getBalanceLamports, getRentExemptMinimum, getLamportsPerSignature,
  getConnection, broadcastRawTx, confirmTx,
} from './provider.js';
import { planSolTransfer, solComputeBudgetIxns } from './send.js';
import { isValidSolAddress } from './derivation.js';
import { solPriorityLamports } from './fees.js';

const SOL_PATH = "44'/501'/0'/0'";

const MAX_BLOCKHASH_RETRIES = 3;

/**
 * Build an unsigned SOL System-transfer transaction for the given blockhash.
 */
function buildUnsignedSolTx({ fromPubkey, toPubkey, amountLamports, blockhash, priorityMicroLamports = 0, computeUnitLimit = 0 }) {
  const tx = new Transaction({
    feePayer: fromPubkey,
    recentBlockhash: blockhash,
  });
  for (const ix of solComputeBudgetIxns({ priorityMicroLamports, computeUnitLimit })) {
    tx.add(ix);
  }
  tx.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey,
      lamports: BigInt(amountLamports),
    }),
  );
  return tx;
}

/**
 * Shared core: plan → fetch blockhash → sign (via `signFn`) → broadcast,
 * with the same bounded blockhash-expiry retry loop as sol/send.js.
 *
 * `signFn(tx: Transaction): Promise<Buffer>` must return the 64-byte sig.
 */
async function sendSolHw({ networkKey, fromAddress, toAddress, amountLamports, sendMax, priorityMicroLamports, computeUnitLimit, signFn }) {
  getSolNetwork(networkKey);
  if (!isValidSolAddress(toAddress)) throw new Error('Invalid Solana recipient address.');

  const [balance, rentMin, baseFee, destBalance] = await Promise.all([
    getBalanceLamports(networkKey, fromAddress),
    getRentExemptMinimum(networkKey, 0),
    getLamportsPerSignature(networkKey),
    getBalanceLamports(networkKey, toAddress),
  ]);

  const priorityFee = solPriorityLamports(priorityMicroLamports, computeUnitLimit || 0);
  const fee = BigInt(baseFee) + (priorityMicroLamports > 0 ? priorityFee : 0n);

  const plan = planSolTransfer({
    balanceLamports:     balance,
    amountLamports:      sendMax ? undefined : BigInt(amountLamports),
    feeLamports:         fee,
    rentExemptMinLamports: rentMin,
    destBalanceLamports: destBalance,
    sendMax,
  });

  const fromPubkey = new PublicKey(fromAddress);
  const toPubkey   = new PublicKey(toAddress);
  const connection  = getConnection(networkKey);
  const net         = getSolNetwork(networkKey);

  let lastError;
  for (let attempt = 0; attempt < MAX_BLOCKHASH_RETRIES; attempt++) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const tx = buildUnsignedSolTx({
      fromPubkey, toPubkey,
      amountLamports: plan.amountLamports,
      blockhash, priorityMicroLamports, computeUnitLimit,
    });

    // Hardware sign — device signs the serialised message bytes
    const msgBytes = tx.serializeMessage();
    const signature = await signFn(msgBytes);

    tx.addSignature(fromPubkey, signature);

    const rawTx = tx.serialize();
    const sigBase58 = tx.signatures[0]?.signature
      ? Buffer.from(tx.signatures[0].signature).toString('base64')
      : null;

    try {
      const txSig = await broadcastRawTx(networkKey, rawTx);
      await confirmTx(networkKey, txSig, blockhash, lastValidBlockHeight);
      return {
        signature: txSig,
        explorerUrl: `${net.explorer}/tx/${txSig}`,
        plan,
        attempts: attempt + 1,
      };
    } catch (err) {
      const msg = err?.message ?? '';
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('blockhash')) {
        lastError = err;
        continue; // fetch new blockhash and retry
      }
      throw err;
    }
  }
  throw lastError ?? new Error('Transaction failed after max blockhash retries.');
}

// ── Ledger ────────────────────────────────────────────────────────────────────

/**
 * Sign and broadcast SOL via a connected Ledger.
 *
 * @param {{ transport, networkKey, fromAddress, toAddress, amountLamports?, sendMax?, priorityMicroLamports?, computeUnitLimit? }} params
 * @returns {Promise<{ signature: string, explorerUrl: string, plan: object, attempts: number }>}
 */
export async function signAndBroadcastSolLedger({
  transport,
  networkKey,
  fromAddress,
  toAddress,
  amountLamports,
  sendMax = false,
  priorityMicroLamports = 0,
  computeUnitLimit = 0,
}) {
  const solApp = new AppSolana(transport);

  return sendSolHw({
    networkKey, fromAddress, toAddress, amountLamports, sendMax,
    priorityMicroLamports, computeUnitLimit,
    signFn: async (msgBytes) => {
      const { signature } = await solApp.signTransaction(SOL_PATH, Buffer.from(msgBytes));
      return Buffer.from(signature); // 64-byte ed25519 sig
    },
  });
}

// ── Trezor ────────────────────────────────────────────────────────────────────

/**
 * Sign and broadcast SOL via Trezor Connect.
 *
 * @param {{ networkKey, fromAddress, toAddress, amountLamports?, sendMax?, priorityMicroLamports?, computeUnitLimit? }} params
 * @returns {Promise<{ signature: string, explorerUrl: string, plan: object, attempts: number }>}
 */
export async function signAndBroadcastSolTrezor({
  networkKey,
  fromAddress,
  toAddress,
  amountLamports,
  sendMax = false,
  priorityMicroLamports = 0,
  computeUnitLimit = 0,
}) {
  return sendSolHw({
    networkKey, fromAddress, toAddress, amountLamports, sendMax,
    priorityMicroLamports, computeUnitLimit,
    signFn: async (msgBytes) => {
      const result = await TrezorConnect.solanaSignTransaction({
        path: `m/${SOL_PATH}`,
        serializedTx: Buffer.from(msgBytes).toString('hex'),
      });
      if (!result.success) throw new Error((result.payload && 'error' in result.payload ? result.payload.error : null) ?? 'Trezor SOL signing failed');
      return Buffer.from(result.payload.signature, 'hex'); // 64-byte sig
    },
  });
}
