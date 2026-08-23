// wallet-core/sol/hw-send-trezor.js
//
// Trezor-only SOL hardware-wallet signing for the SEND route.
// Split from sol/hw-send.js so the Android/iOS WebView SEND bundle does not
// pull Ledger's @ledgerhq/hw-app-solana bare specifier into the route chunk.
//
// No private key ever touches this module. I1 preserved.

import TrezorConnect from '@trezor/connect-web';
import { PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import { getSolNetwork } from './networks.js';
import {
  getBalanceLamports, getRentExemptMinimum, getLamportsPerSignature,
  getConnection, broadcastRawTx, confirmTx,
} from './provider.js';
import { planSolTransfer, solComputeBudgetIxns } from './send.js';
import { assertSolRecipient } from './poison.js';
import { solPriorityLamports } from './fees.js';
import { isDeniabilityOrDemoActive } from '../deniabilitySession.js';

const SOL_PATH = "44'/501'/0'/0'";
const MAX_BLOCKHASH_RETRIES = 3;

function assertNotDeniabilitySession() {
  if (isDeniabilityOrDemoActive()) throw new Error('TREZOR_DENIABILITY_BLOCKED');
}

function buildUnsignedSolTx({
  fromPubkey,
  toPubkey,
  amountLamports,
  blockhash,
  priorityMicroLamports = 0,
  computeUnitLimit = 0,
}) {
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

async function sendSolTrezorCore({
  networkKey,
  fromAddress,
  toAddress,
  amountLamports,
  sendMax,
  priorityMicroLamports,
  computeUnitLimit,
}) {
  const addrResult = await TrezorConnect.solanaGetAddress({
    path: `m/${SOL_PATH}`,
    showOnTrezor: false,
  });
  if (!addrResult.success) {
    throw new Error(
      (addrResult.payload && 'error' in addrResult.payload ? addrResult.payload.error : null)
        ?? 'Trezor SOL getAddress failed',
    );
  }
  const devicePubkey = addrResult.payload.address;
  if (!devicePubkey || String(devicePubkey) !== String(fromAddress)) {
    throw new Error(
      `HW_SIGNER_MISMATCH: device pubkey ${devicePubkey ?? '(none)'} does not match send-source ${fromAddress}`,
    );
  }

  getSolNetwork(networkKey);
  assertSolRecipient(toAddress);

  const [balance, rentMin, baseFee, destBalance] = await Promise.all([
    getBalanceLamports(networkKey, fromAddress),
    getRentExemptMinimum(networkKey, 0),
    getLamportsPerSignature(networkKey),
    getBalanceLamports(networkKey, toAddress),
  ]);

  const priorityFee = solPriorityLamports(priorityMicroLamports, computeUnitLimit || 0);
  const fee = BigInt(baseFee) + (priorityMicroLamports > 0 ? priorityFee : 0n);

  const plan = planSolTransfer({
    balanceLamports: balance,
    amountLamports: sendMax ? undefined : BigInt(amountLamports),
    feeLamports: fee,
    rentExemptMinLamports: rentMin,
    destBalanceLamports: destBalance,
    sendMax,
  });

  const fromPubkey = new PublicKey(fromAddress);
  const toPubkey = new PublicKey(toAddress);
  const connection = getConnection(networkKey);
  const net = getSolNetwork(networkKey);

  let lastError;
  for (let attempt = 0; attempt < MAX_BLOCKHASH_RETRIES; attempt++) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');

    const tx = buildUnsignedSolTx({
      fromPubkey,
      toPubkey,
      amountLamports: plan.amountLamports,
      blockhash,
      priorityMicroLamports,
      computeUnitLimit,
    });

    const msgBytes = tx.serializeMessage();
    const signResult = await TrezorConnect.solanaSignTransaction({
      path: `m/${SOL_PATH}`,
      serializedTx: Buffer.from(msgBytes).toString('hex'),
    });
    if (!signResult.success) {
      throw new Error(
        (signResult.payload && 'error' in signResult.payload ? signResult.payload.error : null)
          ?? 'Trezor SOL signing failed',
      );
    }
    const signature = Buffer.from(signResult.payload.signature, 'hex');

    tx.addSignature(fromPubkey, signature);
    const rawTx = tx.serialize();

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
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('expired') || msg.toLowerCase().includes('blockhash')) {
        lastError = err;
        continue;
      }
      throw err;
    }
  }
  throw lastError ?? new Error('Transaction failed after max blockhash retries.');
}

export async function signAndBroadcastSolTrezor({
  networkKey,
  fromAddress,
  toAddress,
  amountLamports,
  sendMax = false,
  priorityMicroLamports = 0,
  computeUnitLimit = 0,
}) {
  assertNotDeniabilitySession();
  return sendSolTrezorCore({
    networkKey,
    fromAddress,
    toAddress,
    amountLamports,
    sendMax,
    priorityMicroLamports,
    computeUnitLimit,
  });
}
