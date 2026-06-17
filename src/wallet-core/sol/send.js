// wallet-core/sol/send.js
//
// High-level Solana send: plan (rent-aware) -> fetch FRESH blockhash -> build a
// System transfer -> sign LOCALLY (ed25519) -> broadcast -> confirm, with an
// explicit blockhash-expiry refetch/retry. The REAL replacement for any
// simulated send, and the Solana counterpart to evm/send.js and btc/send.js.
//
// THE TWO SOLANA FUND-LOSS / SILENT-FAILURE TRAPS (handled explicitly):
//
//   1. BLOCKHASH EXPIRY. A Solana tx embeds a recent blockhash and is only valid
//      until `lastValidBlockHeight`; submitted after that it is SILENTLY dropped
//      (no error, the funds just never move). We therefore fetch a FRESH
//      blockhash at send time (never reuse a stale one), confirm against the
//      blockhash's deadline, and on a TransactionExpired* error we REFETCH a new
//      blockhash and rebuild/resign/resend (bounded retries). This is the
//      Solana analogue of BTC's change-output backstop: the failure mode that
//      silently loses user intent, handled head-on.
//
//   2. RENT-EXEMPTION MINIMUM. Solana purges accounts that fall below the
//      rent-exempt minimum. Two ways that bricks funds, both BLOCKED in the pure
//      planner below (planSolTransfer):
//        a. Sending dust to a NEW (unfunded) recipient — a transfer that leaves
//           the recipient below the rent-exempt minimum can fail / strand the
//           funds. We require a first deposit to a 0-balance account to be >=
//           the rent-exempt minimum.
//        b. Leaving the SENDER stranded below the rent-exempt minimum — we
//           require the remainder to be either exactly 0 (deliberately emptied,
//           e.g. send-max) or >= the rent-exempt minimum, never dust in between.
//
// SECURITY / CORRECTNESS
//   - The signing key is supplied transiently by the caller (e.g. via
//     WalletProvider.withSolPrivateKey) and used only inside this call. Never
//     persisted, never logged. Signing is local; the RPC only broadcasts.
//   - The mainnet gate is enforced at getSolNetwork() and re-checked at
//     broadcast (provider.broadcastRawTx).
//   - The recipient address is validated (base58 -> 32-byte ed25519 pubkey)
//     before anything is built; a malformed address can burn funds.

import { Transaction, SystemProgram, ComputeBudgetProgram, Keypair, PublicKey } from '@solana/web3.js';
import { base58 } from '@scure/base';
import { getSolNetwork, solExplorerUrl } from './networks.js';
import { isValidSolAddress } from './derivation.js';
import { solPriorityLamports } from './fees.js';
import {
  getBalanceLamports,
  getLatestBlockhash,
  getRentExemptMinimum,
  getLamportsPerSignature,
  broadcastRawTx,
  confirmTx,
  getSignatureLanding,
} from './provider.js';

const MAX_BLOCKHASH_RETRIES = 3;

/**
 * PURE: the ComputeBudget instructions that set an OPTIONAL priority fee. Returns
 * [] when no priority is requested — so a "None"/base-fee-only send builds the
 * EXACT same single-instruction transfer it always did (no behaviour change).
 * When a priority IS requested we set both a compute-unit LIMIT and PRICE; the
 * price × limit is the priority fee (see solPriorityLamports / fees.js).
 *
 * @returns {Array<import('@solana/web3.js').TransactionInstruction>}
 */
export function solComputeBudgetIxns({ priorityMicroLamports = 0, computeUnitLimit = 0 } = {}) {
  const price = Number(priorityMicroLamports) || 0;
  if (price <= 0) return [];
  const ixns = [];
  if (Number(computeUnitLimit) > 0) {
    ixns.push(ComputeBudgetProgram.setComputeUnitLimit({ units: Number(computeUnitLimit) }));
  }
  ixns.push(ComputeBudgetProgram.setComputeUnitPrice({ microLamports: BigInt(Math.round(price)) }));
  return ixns;
}

/**
 * PURE, network-free rent-aware planner — so the whole rent/dust pipeline is
 * unit-testable without broadcasting (see __tests__/sol-send.test.js). Throws
 * with an actionable message on any unsafe transfer; otherwise returns the
 * lamport plan. All amounts are BigInt lamports.
 *
 * @param {object} p
 * @param {bigint} p.balanceLamports      - sender's confirmed balance.
 * @param {bigint} [p.amountLamports]     - amount to send (omit when sendMax).
 * @param {bigint} p.feeLamports          - network fee (1 signature).
 * @param {bigint} p.rentExemptMinLamports- rent-exempt minimum for a 0-byte account.
 * @param {bigint} p.destBalanceLamports  - recipient's CURRENT balance (0 => new account).
 * @param {boolean} [p.sendMax=false]     - empty the account (amount = balance - fee).
 * @returns {{ amountLamports: bigint, feeLamports: bigint, remainderLamports: bigint, sendMax: boolean }}
 */
export function planSolTransfer({
  balanceLamports,
  amountLamports,
  feeLamports,
  rentExemptMinLamports,
  destBalanceLamports,
  sendMax = false,
}) {
  const balance = BigInt(balanceLamports);
  const fee = BigInt(feeLamports);
  const rentMin = BigInt(rentExemptMinLamports);
  const destBalance = BigInt(destBalanceLamports);

  if (fee <= 0n) throw new Error('Invalid fee.');
  if (balance <= fee) throw new Error('Balance does not cover the network fee.');

  let amount;
  if (sendMax) {
    amount = balance - fee; // empties the account
  } else {
    if (amountLamports == null) throw new Error('amountLamports is required unless sendMax is set.');
    amount = BigInt(amountLamports);
  }
  if (amount <= 0n) throw new Error('Send amount must be positive.');

  const remainder = balance - amount - fee;
  if (remainder < 0n) throw new Error('Insufficient balance for amount + fee.');

  // Trap 2a — first deposit to a NEW (0-balance) account must meet the
  // rent-exempt minimum, or the recipient account can't be created / the funds
  // are stranded.
  if (destBalance === 0n && amount < rentMin) {
    throw new Error(
      `Recipient is a new account: the first transfer must be at least the rent-exempt minimum (${rentMin} lamports) or it may fail / be lost.`,
    );
  }

  // Trap 2b — never strand the SENDER below rent-exempt. Allow exactly 0
  // (deliberately emptied) or >= rentMin; reject dust in between.
  if (remainder !== 0n && remainder < rentMin) {
    throw new Error(
      `This send would leave ${remainder} lamports — below the rent-exempt minimum (${rentMin}). ` +
      `Send less, or use send-max to empty the account.`,
    );
  }

  return { amountLamports: amount, feeLamports: fee, remainderLamports: remainder, sendMax };
}

/**
 * Build a System-transfer transaction for a given blockhash, sign it locally
 * with the ed25519 key, and return the serialized bytes. PURE — no network —
 * given a blockhash, so it can be re-run cheaply on a blockhash refetch.
 *
 * An OPTIONAL priority fee (priorityMicroLamports + computeUnitLimit) is attached
 * via leading ComputeBudget instructions; omit it (or pass 0) for a base-fee-only
 * transfer. The priority instructions come FIRST, before the System transfer, as
 * is conventional.
 *
 * @returns {{ rawTx: Buffer, signature: string }} serialized signed tx + its signature.
 */
export function buildAndSignSol({ keypair, toPubkey, amountLamports, blockhash, priorityMicroLamports = 0, computeUnitLimit = 0 }) {
  const tx = new Transaction({
    feePayer: keypair.publicKey,
    recentBlockhash: blockhash,
  });
  for (const ix of solComputeBudgetIxns({ priorityMicroLamports, computeUnitLimit })) {
    tx.add(ix); // OPTIONAL priority fee — sets compute-unit limit + price
  }
  tx.add(
    SystemProgram.transfer({
      fromPubkey: keypair.publicKey,
      toPubkey,
      lamports: BigInt(amountLamports),
    }),
  );
  tx.sign(keypair); // local ed25519 signature
  const rawTx = tx.serialize();
  const signature = base58FromSignature(tx);
  return { rawTx, signature };
}

// The tx's first signature, base58-encoded, is the canonical transaction id.
// (Encoded with @scure/base rather than reaching into web3.js's bundled bs58.)
function base58FromSignature(tx) {
  const sig = tx.signature;
  return sig ? base58.encode(new Uint8Array(sig)) : '';
}

/**
 * Estimate a send WITHOUT broadcasting — for a confirm screen. Fetches the live
 * balance, rent minimum, fee, and recipient balance, then runs the pure planner.
 * @returns {Promise<{ plan: object, network: object }>}
 */
export async function estimateSolSend({ networkKey, fromAddress, toAddress, amountLamports, sendMax = false, priorityMicroLamports = 0, computeUnitLimit = 0 }) {
  const net = getSolNetwork(networkKey); // gate-aware
  if (!isValidSolAddress(toAddress)) throw new Error('Invalid Solana recipient address.');

  const [balance, rentMin, baseFee, destBalance] = await Promise.all([
    getBalanceLamports(networkKey, fromAddress),
    getRentExemptMinimum(networkKey, 0),
    getLamportsPerSignature(networkKey),
    getBalanceLamports(networkKey, toAddress),
  ]);

  // Total fee = protocol base fee + OPTIONAL priority fee. Folding priority into
  // feeLamports keeps the rent-safety maths (planSolTransfer) correct: the
  // remainder/affordability checks account for the FULL fee the user will pay.
  const priorityFee = solPriorityLamports(priorityMicroLamports, computeUnitLimit || 0);
  const fee = BigInt(baseFee) + (priorityMicroLamports > 0 ? priorityFee : 0n);

  const plan = planSolTransfer({
    balanceLamports: balance,
    amountLamports: sendMax ? undefined : amountLamports,
    feeLamports: fee,
    rentExemptMinLamports: rentMin,
    destBalanceLamports: destBalance,
    sendMax,
  });
  return { plan: { ...plan, baseFeeLamports: BigInt(baseFee), priorityFeeLamports: priorityMicroLamports > 0 ? priorityFee : 0n }, network: net };
}

/**
 * Sign locally and broadcast a real devnet/testnet transaction, handling
 * blockhash expiry with a bounded refetch/retry loop.
 *
 * @param {object} params
 * @param {string} params.networkKey
 * @param {Uint8Array} params.privateKey  - 32-byte ed25519 seed scalar (LIVE SECRET, transient).
 * @param {string} params.fromAddress     - the wallet's base58 address (must match the key).
 * @param {string} params.toAddress
 * @param {bigint|number|string} [params.amountLamports]
 * @param {boolean} [params.sendMax=false]
 * @returns {Promise<{ signature:string, explorerUrl:string, plan:object, attempts:number }>}
 */
export async function signAndBroadcastSol({
  networkKey,
  privateKey,
  fromAddress,
  toAddress,
  amountLamports,
  sendMax = false,
  priorityMicroLamports = 0,
  computeUnitLimit = 0,
}) {
  getSolNetwork(networkKey); // throws if mainnet gated / disabled
  if (!isValidSolAddress(toAddress)) throw new Error('Invalid Solana recipient address.');

  // Reconstruct the signer from the transient seed scalar. fromSeed expects the
  // 32-byte ed25519 seed (our SLIP-0010 private scalar).
  const keypair = Keypair.fromSeed(privateKey);
  if (keypair.publicKey.toBase58() !== fromAddress) {
    // Defense-in-depth: the supplied key must actually control fromAddress.
    throw new Error('Provided key does not control the from address');
  }
  const toPubkey = new PublicKey(toAddress);

  // Plan once against live balances/rent — the amount doesn't change across
  // blockhash retries, only the blockhash does. The fee is base + OPTIONAL
  // priority; folding priority in keeps the rent-safety maths honest about the
  // full amount the user pays.
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
    amountLamports: sendMax ? undefined : amountLamports,
    feeLamports: fee,
    rentExemptMinLamports: rentMin,
    destBalanceLamports: destBalance,
    sendMax,
  });

  let lastErr;
  for (let attempt = 1; attempt <= MAX_BLOCKHASH_RETRIES; attempt++) {
    // FRESH blockhash every attempt — never reuse one that may have expired. The
    // SAME priority fee is re-attached on every rebuild so a retry pays what the
    // user selected (and the planned amount stays consistent).
    const { blockhash, lastValidBlockHeight } = await getLatestBlockhash(networkKey);
    const { rawTx, signature } = buildAndSignSol({
      keypair,
      toPubkey,
      amountLamports: plan.amountLamports,
      blockhash,
      priorityMicroLamports,
      computeUnitLimit,
    });

    try {
      const sig = await broadcastRawTx(networkKey, rawTx);
      const result = await confirmTx(networkKey, sig, blockhash, lastValidBlockHeight);
      if (result?.value?.err) {
        throw new Error(`Transaction failed on-chain: ${JSON.stringify(result.value.err)}`);
      }
      return {
        signature: sig || signature,
        explorerUrl: solExplorerUrl(networkKey, 'tx', sig || signature),
        plan,
        attempts: attempt,
      };
    } catch (e) {
      lastErr = e;
      // Blockhash expired before confirmation -> loop and refetch a fresh one.
      // web3.js throws TransactionExpiredBlockheightExceededError (or a message
      // containing "block height exceeded"); anything else is a real failure.
      const msg = String(e?.name || '') + ' ' + String(e?.message || '');
      const expired = /BlockheightExceeded|block height exceeded|blockhash.*expired/i.test(msg);
      if (!expired || attempt === MAX_BLOCKHASH_RETRIES) throw e;

      // DOUBLE-SEND GUARD (audit M-1): an expiry error means we stopped observing
      // before the deadline, NOT that the tx was excluded. A rebuild uses a FRESH
      // signature, so resending after a silent inclusion would move funds twice.
      // Re-check the just-broadcast signature before rebuilding.
      const landing = await getSignatureLanding(networkKey, signature);
      if (landing.landed === true) {
        if (landing.err) {
          throw new Error(`Transaction failed on-chain: ${JSON.stringify(landing.err)}`);
        }
        // It actually landed — the "expiry" was a confirmation-observation miss.
        return {
          signature,
          explorerUrl: solExplorerUrl(networkKey, 'tx', signature),
          plan,
          attempts: attempt,
        };
      }
      if (landing.landed === null) {
        // Inclusion is UNKNOWN (status RPC failed). Do NOT risk a double-send;
        // surface for a manual explorer check rather than blindly resending.
        throw new Error(
          'Could not confirm whether the transaction landed before its blockhash ' +
          'expired — check the explorer for this signature before resending. ' +
          `Original error: ${msg.trim()}`,
        );
      }
      // landing.landed === false -> definitively not included; safe to rebuild
      // with a fresh blockhash on the next loop iteration.
    }
  }
  throw lastErr || new Error('Solana send failed after blockhash retries.');
}
