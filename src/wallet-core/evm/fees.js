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

import { parseUnits, formatUnits } from 'ethers';
import { getProvider } from './provider.js';
import { getNetworkInfo } from './networks.js';

export const MAX_BASE_FEE_GWEI = {
  mainnet:         1_000n,
  // Polygon PoS routinely runs base fees of 30–300+ gwei and spikes higher under
  // load — a 200 gwei cap false-tripped on the live mainnet base fee (~250 gwei),
  // throwing "implausible base fee" on every Polygon send. Widened to 5000 (matching
  // the polygonAmoy testnet cap); still catches a genuinely broken RPC value.
  polygon:         5_000n,
  arbitrum:          200n,
  optimism:          200n,
  avalanche:         200n,
  bnb:               200n,
  sepolia:         5_000n,
  polygonAmoy:     5_000n,
  arbitrumSepolia: 5_000n,
  optimismSepolia: 5_000n,
  avalancheFuji:   5_000n,
  bnbTestnet:      5_000n,
};

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

// Codex P1 2026-08-15: upper bound on the RPC-suggested priority tip. Prior
// behaviour trusted `feeData.maxPriorityFeePerGas` unbounded, so a malicious
// or misconfigured RPC could return a huge tip (e.g. 10_000 gwei) that flowed
// unchanged into the signed tx — real overpayment. 500 gwei sits well above
// every real tip observed on mainnet (~5-30 gwei baseline, ~50-200 gwei
// under peak MEV auctions), and mirrors the `MAX_BASE_FEE_GWEI.mainnet`
// order of magnitude. Applied before `buildEvmTiers` so both tier + custom
// paths share the ceiling — see also `buildEvmCustomFee` below.
export const MAX_TIP_GWEI = 500n;
export const MAX_TIP_WEI = MAX_TIP_GWEI * 1_000_000_000n;

// Codex P2 2026-08-15: upper bound on user-authored gasLimit at the custom-fee
// construction site. The send path caps at 1_000_000 (preflight.js), but the
// fee object itself was accepted with a gigantic value — which made the
// on-screen "max fee" preview wildly wrong. Mirroring the preflight cap here
// keeps the display honest AND fails at input time.
export const MAX_CUSTOM_GAS_LIMIT = 1_000_000n;

/**
 * PURE: build the three preset tiers from a live base fee, the network-suggested
 * tip, and a gas limit. All wei/gas values are BigInt. For each tier:
 *   maxPriorityFeePerGas = suggestedTip × tierMultiplier (floored at MIN_TIP_WEI
 *                          and optionally a per-network minGasPriceWei)
 *   maxFeePerGas         = baseFee×2 + tip            (one-doubling headroom)
 *   estFee               = gasLimit × (baseFee + tip) (EXPECTED cost)
 *   maxFee               = gasLimit × maxFeePerGas    (ceiling the user could pay)
 *
 * minGasPriceWei: optional per-network minimum (e.g. BSC enforces ≥1 gwei). On
 * chains where baseFee≈0 (BSC EIP-1559), effective price≈tip, so this floor
 * prevents Slow-tier txs being silently rejected by the network.
 */
export function buildEvmTiers({ baseFeePerGasWei, suggestedTipWei, gasLimit, minGasPriceWei, networkKey }) {
  const base = BigInt(baseFeePerGasWei);
  const capGwei = MAX_BASE_FEE_GWEI[networkKey];
  if (capGwei !== undefined) {
    const capWei = parseUnits(capGwei.toString(), 'gwei');
    if (base > capWei) {
      throw new Error(
        `RPC returned implausible base fee (${formatUnits(base, 'gwei')} gwei). ` +
        `Maximum accepted for ${networkKey} is ${capGwei} gwei. ` +
        `Check your RPC provider.`,
      );
    }
  }
  // Codex P1 2026-08-15: clamp the RPC-suggested tip at MAX_TIP_WEI before
  // scaling. A hostile RPC returning e.g. 10_000 gwei would otherwise flow
  // through unchanged (the Trezor branch clamps; the software branch did
  // not). Also reject a negative BigInt (BigInt(-1) is legal), which no
  // real RPC returns but a stub / test / injected middleware could.
  const suggestedRaw = BigInt(suggestedTipWei);
  const suggested = suggestedRaw < 0n
    ? 0n
    : (suggestedRaw > MAX_TIP_WEI ? MAX_TIP_WEI : suggestedRaw);
  const limit = BigInt(gasLimit);
  const tipFloor = minGasPriceWei != null && BigInt(minGasPriceWei) > MIN_TIP_WEI
    ? BigInt(minGasPriceWei)
    : MIN_TIP_WEI;
  return EVM_TIERS.map((t) => {
    let tip = (suggested * t.tipNum) / t.tipDen;
    if (tip < tipFloor) tip = tipFloor;
    if (tip > MAX_TIP_WEI) tip = MAX_TIP_WEI; // defence in depth for a large multiplier
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
export function buildEvmCustomFee({ maxBaseFeeGwei, priorityGwei, gasLimit, networkKey }) {
  const capGwei = MAX_BASE_FEE_GWEI[networkKey];
  if (capGwei !== undefined) {
    const inputGwei = BigInt(Math.round(Number(maxBaseFeeGwei) || 0));
    if (inputGwei > capGwei) {
      throw new Error(`Custom max base fee (${inputGwei} gwei) exceeds the ${networkKey} ceiling of ${capGwei} gwei.`);
    }
  }
  // Codex P2 2026-08-15: clamp the user-authored priority tip.
  //   - Negative reject: parseUnits('-1', 'gwei') = -1_000_000_000n is legal
  //     BigInt but produces a nonsense maxFeePerGas that could silently
  //     underprice the tx; refuse rather than silently zero.
  //   - Upper reject: same MAX_TIP_GWEI ceiling as the tier path — a user
  //     fat-fingering "500000" gwei is refused with a clear message.
  // Guard NaN explicitly rather than swallowing it via `|| 0`: an unparseable
  // input (e.g. raw de-DE "1,5" reaching this function without
  // normalizeDecimalInput running first) MUST throw so the caller cannot
  // silently swap the user's intended fee for zero. parseUnits below already
  // does this — the two-layer defence is the whole point.
  const priorityRawNum = Number(priorityGwei);
  const priorityRaw = Number.isNaN(priorityRawNum) ? priorityGwei : priorityRawNum;
  if (typeof priorityRaw === 'number') {
    if (priorityRaw < 0) throw new Error('Priority fee cannot be negative.');
    if (BigInt(Math.round(priorityRaw)) > MAX_TIP_GWEI) {
      throw new Error(`Priority fee (${Math.round(priorityRaw)} gwei) exceeds the ceiling of ${MAX_TIP_GWEI} gwei.`);
    }
  }
  const tip = parseUnits(String(priorityRaw || 0), 'gwei');
  const maxBase = parseUnits(String(maxBaseFeeGwei || 0), 'gwei');
  // Codex P2 2026-08-15: same 1_000_000 gasLimit ceiling as preflight.js so
  // the on-screen "max fee" preview cannot lie about what the send path
  // would actually accept.
  const limitRaw = BigInt(Math.max(21000, Math.floor(Number(gasLimit) || 21000)));
  const limit = limitRaw > MAX_CUSTOM_GAS_LIMIT ? MAX_CUSTOM_GAS_LIMIT : limitRaw;
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
      // 2026-08-16 audit R6: also estimate for contract DEPLOYMENTS (to == null
      // + non-empty data). Previously only the `to`-set branch reached
      // estimateGas, so a deploy tx silently fell back to 21000n — always
      // out-of-gas. Split the branches so both contract-call and contract-deploy
      // paths surface GAS_ESTIMATION_FAILED honestly.
      : (to || (data != null && data !== '0x'))
        // Previous silent .catch(() => 21000n) returned a pure-transfer gas
        // limit on ANY estimation error, leading to out-of-gas revert once
        // signed. Callers that know they are doing a pure ETH transfer must
        // pass gasLimit=21000n explicitly (or omit both `to` and `data`); a
        // live estimate failure is a signal we cannot safely default.
        ? provider.estimateGas({ from, to, value, data }).catch((cause) => {
            throw Object.assign(
              new Error('Gas estimation failed, cannot safely sign contract call'),
              { cause, code: 'GAS_ESTIMATION_FAILED' },
            );
          })
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
    tiers: buildEvmTiers({ baseFeePerGasWei, suggestedTipWei, gasLimit: est, minGasPriceWei: info?.minGasPriceWei, networkKey }),
  };
}
