// wallet-core/evm/fees.js
//
// EIP-1559 fee tiers + custom-fee plumbing for the EVM family. The fee NUMBERS
// come from the EXISTING provider (getProvider → ethers JsonRpcProvider) — the
// same untrusted RPC the send path already uses. NO new data source is added.
//
// Why this matters: a wrong fee is a real fund/UX hazard. Too low a maxFeePerGas
// and the tx is stuck; too high and the user overpays. So the tier maths is pure
// and unit-tested, and the selection produced here maps to the EXACT override
// object handed to wallet.sendTransaction() (see evmFeeOverrides + send.js), so
// what the user picks is provably what gets signed.
//
// EIP-1559 model recap:
//   effective price = min(maxFeePerGas, baseFee + maxPriorityFeePerGas)
//   - maxPriorityFeePerGas ("tip") is what nudges inclusion speed.
//   - maxFeePerGas must clear baseFee + tip or the tx can't be included; we buffer
//     it at baseFee*2 + tip so a brief base-fee rise can't strand the tx.

import { parseUnits } from 'ethers';
import { getProvider } from './provider.js';
import { getNetworkInfo } from './networks.js';

// Preset tiers scale the network-suggested tip. ETA labels are indicative (EVM
// block time ~12s; a larger tip wins earlier inclusion under contention).
export const EVM_TIERS = [
  { id: 'slow',     label: 'Slow',     tipNum: 1n, tipDen: 2n, etaSeconds: 180, etaLabel: '~3 min' },
  { id: 'standard', label: 'Standard', tipNum: 1n, tipDen: 1n, etaSeconds: 45,  etaLabel: '~45 sec' },
  { id: 'fast',     label: 'Fast',     tipNum: 2n, tipDen: 1n, etaSeconds: 15,  etaLabel: '~15 sec' },
];

// A tier tip never rounds below this, so "Slow" on an idle testnet (suggested tip
// ~0) still pays a relayable, non-zero tip.
export const MIN_TIP_WEI = 100_000_000n; // 0.1 gwei

/**
 * PURE: build the three preset tiers from a live base fee, the network-suggested
 * tip, and a gas limit. All wei/gas values are BigInt. For each tier:
 *   maxPriorityFeePerGas = suggestedTip × tierMultiplier (floored at MIN_TIP_WEI)
 *   maxFeePerGas         = baseFee×2 + tip            (one-doubling headroom)
 *   estFee               = gasLimit × (baseFee + tip) (EXPECTED cost)
 *   maxFee               = gasLimit × maxFeePerGas    (ceiling the user could pay)
 */
export function buildEvmTiers({ baseFeePerGasWei, suggestedTipWei, gasLimit }) {
  const base = BigInt(baseFeePerGasWei);
  const suggested = BigInt(suggestedTipWei);
  const limit = BigInt(gasLimit);
  return EVM_TIERS.map((t) => {
    let tip = (suggested * t.tipNum) / t.tipDen;
    if (tip < MIN_TIP_WEI) tip = MIN_TIP_WEI;
    const maxFeePerGas = base * 2n + tip;
    return {
      id: t.id,
      label: t.label,
      etaSeconds: t.etaSeconds,
      etaLabel: t.etaLabel,
      maxPriorityFeePerGasWei: tip.toString(),
      maxFeePerGasWei: maxFeePerGas.toString(),
      gasLimit: limit.toString(),
      estFeeWei: (limit * (base + tip)).toString(),
      maxFeeWei: (limit * maxFeePerGas).toString(),
    };
  });
}

/**
 * PURE: map a user's custom inputs (gwei) to a fee selection. The user sets a max
 * base fee and a priority tip directly (the MetaMask "advanced" model):
 *   maxFeePerGas = maxBaseFee + tip ,  maxPriorityFeePerGas = tip
 * Throws on a non-positive max fee (a stuck-tx guard).
 */
export function buildEvmCustomFee({ maxBaseFeeGwei, priorityGwei, gasLimit }) {
  const tip = parseUnits(String(priorityGwei || 0), 'gwei');
  const maxBase = parseUnits(String(maxBaseFeeGwei || 0), 'gwei');
  const limit = BigInt(Math.max(21000, Math.floor(Number(gasLimit) || 21000)));
  const maxFeePerGas = maxBase + tip;
  if (maxFeePerGas <= 0n) throw new Error('Max fee must be greater than zero.');
  return {
    maxPriorityFeePerGasWei: tip.toString(),
    maxFeePerGasWei: maxFeePerGas.toString(),
    gasLimit: limit.toString(),
    estFeeWei: (limit * maxFeePerGas).toString(),
    maxFeeWei: (limit * maxFeePerGas).toString(),
  };
}

/**
 * PURE: translate a fee selection into ethers tx overrides. Returns {} when fee
 * is null/undefined so the send path keeps ethers' auto-fill (back-compat). This
 * is the EXACT object spread into wallet.sendTransaction()/contract.transfer(),
 * so the selected fee is provably what gets signed.
 */
export function evmFeeOverrides(fee) {
  if (!fee) return {};
  const o = {};
  if (fee.maxFeePerGasWei != null) o.maxFeePerGas = BigInt(fee.maxFeePerGasWei);
  if (fee.maxPriorityFeePerGasWei != null) o.maxPriorityFeePerGas = BigInt(fee.maxPriorityFeePerGasWei);
  if (fee.gasLimit != null) o.gasLimit = BigInt(fee.gasLimit);
  if (fee.gasPriceWei != null) o.gasPrice = BigInt(fee.gasPriceWei); // legacy (pre-1559) chains
  return o;
}

/**
 * LIVE estimate from the EXISTING provider (no new data source): the latest
 * block's baseFeePerGas + getFeeData()'s suggested tip, over a gas limit. For a
 * native transfer the limit is exactly 21000; callers may pass a known limit
 * (e.g. 65000 for an ERC-20 transfer) to avoid an estimateGas round-trip, or
 * supply { to, value, data } to estimate it live.
 *
 * @returns {Promise<{ chain, symbol, decimals, networkName, baseFeePerGasWei,
 *   suggestedTipWei, gasLimit, tiers }>}
 */
export async function estimateEvmFeeTiers({ networkKey, from, to, value, data, gasLimit }) {
  const provider = getProvider(networkKey);
  const info = getNetworkInfo(networkKey);
  const [block, feeData, est] = await Promise.all([
    provider.getBlock('latest'),
    provider.getFeeData(),
    gasLimit != null
      ? Promise.resolve(BigInt(gasLimit))
      : to
        ? provider.estimateGas({ from, to, value, data }).catch(() => 21000n)
        : Promise.resolve(21000n),
  ]);
  // baseFeePerGas is null on pre-1559 chains; fall back to gasPrice as the floor.
  const baseFeePerGasWei = block?.baseFeePerGas ?? feeData.gasPrice ?? 0n;
  const suggestedTipWei = feeData.maxPriorityFeePerGas ?? parseUnits('1', 'gwei');
  return {
    chain: 'evm',
    symbol: info?.symbol || 'ETH',
    decimals: info?.decimals ?? 18,
    networkName: info?.name || networkKey,
    baseFeePerGasWei: baseFeePerGasWei.toString(),
    suggestedTipWei: suggestedTipWei.toString(),
    gasLimit: est.toString(),
    tiers: buildEvmTiers({ baseFeePerGasWei, suggestedTipWei, gasLimit: est }),
  };
}
