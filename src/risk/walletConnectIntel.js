// @ts-nocheck
//
// WalletConnect transaction-intelligence builder.
//
// Shared by the WC signing gate and the WC approval modal so they explain the
// same local transaction findings. Dynamic imports keep the provider test-safe:
// some sibling suites fully mock `ethers` without Interface support, so the
// risk stack must not load unless a WC send is actually being evaluated.

import { LEVEL } from '@/risk/levels';
import { TIER } from '@/rasp';
import { composeTransactionVerdict } from '@/risk/composeVerdict.js';
import { getNetworkByChainId } from '@/wallet-core/evm/networks.js';
import { screenTransaction } from '@/api/tipScreen.js';
import { ZERO_FROM_ADDRESS } from '@/lib/tipZeroFrom.js';
import { resolveTipChain } from '@/pages/sendCryptoTipChain.js';
import { buildReviewContributor } from '@/risk/reviewContributor.js';

const WC_TX_RISK_SIGNAL_IMPORTS = [
  () => import('@/risk/score'),
  () => import('@/risk/signals/s2-unlimited-approval'),
  () => import('@/risk/signals/s4-address-poisoning'),
  () => import('@/risk/signals/s9-tip-threat'),
  () => import('@/risk/fromWalletConnect'),
  () => import('@/wallet-core/evm/simulate.js'),
];

function parseWcChainId(caip2ChainId) {
  if (typeof caip2ChainId !== 'string') return undefined;
  const parsed = parseInt(caip2ChainId.replace(/^eip155:/, ''), 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function fallbackLocalVerdict() {
  return {
    level: LEVEL.CAUTION,
    sentence: 'A transaction risk check could not fully complete. Review this request carefully.',
    evidence: null,
    signalId: null,
    requiresConfirmation: true,
    signals: [],
  };
}

async function buildRemoteTipResult(tipApplicable, tipChain, txParams, signal) {
  if (!tipApplicable) return null;
  return screenTransaction({
    chain: tipChain,
    actionType: 'transfer',
    from: ZERO_FROM_ADDRESS[tipChain],
    to: txParams?.to,
    ...(txParams?.data && txParams.data !== '0x' && { calldata: txParams.data }),
    ...(txParams?.value && { valueWei: txParams.value }),
  }, { signal });
}

export async function buildWcTransactionIntelligence({
  txParams = {},
  caip2ChainId,
  evmAddress = null,
  remoteScreenEnabled = false,
  history = [],
  knownAddresses = [],
  whitelist = [],
  review = null,
  sessionMeta = null,
  raspTier = TIER.ALLOW,
  raspArtifact = null,
  presign = null,
  signal,
} = {}) {
  const parsedChainId = parseWcChainId(caip2ChainId);
  const network = parsedChainId == null ? null : getNetworkByChainId(parsedChainId);
  const tipChain = resolveTipChain(null, network?.key);
  const tipApplicable = remoteScreenEnabled && !!txParams?.to && !!tipChain;
  const reviewContributor = review ?? buildReviewContributor({
    recipient: txParams?.to ?? null,
    currency: network?.symbol ?? 'ETH',
    history,
    knownAddresses,
    whitelist,
    sessionMeta,
  });

  // H-3 (2026-08-25 weekly audit) — fetched BEFORE score() so S9 can READ it.
  // This used to sit after score(), and the WC registry omitted S9 entirely, so
  // the TIP verdict was fetched, rendered as a "remote screening ran" notice,
  // and then discarded: sanctions hits, the static OFAC fallback, and signal-less
  // `block` verdicts all reached the pre-sign gate as LEVEL.OK. Hoisting it here
  // also means the fallback path below reuses this result instead of issuing a
  // second network call.
  let tipResult = null;
  try {
    tipResult = await buildRemoteTipResult(tipApplicable, tipChain, txParams, signal);
  } catch {
    // I4: an un-fetchable verdict stays null, which leaves tipSettled false and
    // the composed verdict 'pending' — it never reads as clean.
    tipResult = null;
  }

  try {
    const [
      { score },
      { s2UnlimitedApproval },
      { s4AddressPoisoning },
      { s9TipThreat },
      { buildRiskInputsFromWcRequest },
      { simulateEvmTransaction },
    ] = await Promise.all(WC_TX_RISK_SIGNAL_IMPORTS.map((load) => load()));

    let recipientCode;
    try {
        if (network?.key && txParams?.to) {
          const simulation = await simulateEvmTransaction({
            networkKey: network.key,
          from: evmAddress,
          to: txParams.to,
          valueWei: txParams.value ? BigInt(txParams.value) : 0n,
          data: txParams.data ?? '0x',
        });
        recipientCode = simulation?.recipientCode ?? undefined;
      }
    } catch {
      recipientCode = undefined;
    }

    const riskInputs = buildRiskInputsFromWcRequest({
      txParam: txParams,
      chainId: parsedChainId,
      recipientCode,
    });

    // Mirrors SendCrypto.jsx: inject the pre-fetched TIP result so S9 (pure,
    // synchronous) can score it. Null when opt-out / deniability / unconfigured,
    // in which case S9 returns OK and contributes nothing — but the static OFAC
    // fallback inside S9 still runs on the recipient address either way.
    riskInputs.chainData.tipResult = tipResult;

    const localVerdict = score(
      riskInputs.unsignedTx,
      riskInputs.activeSetLocalState,
      riskInputs.chainData,
      [
        { id: 'S2', fn: s2UnlimitedApproval },
        { id: 'S4', fn: s4AddressPoisoning },
        { id: 'S9', fn: s9TipThreat },
      ],
    );

    const verdict = composeTransactionVerdict({
      localVerdict,
      localApplicable: true,
      localSettled: true,
      tipResult,
      tipApplicable,
      tipSettled: !tipApplicable || tipResult != null,
      review: reviewContributor,
      raspTier,
      raspArtifact,
      presign,
    });

    return {
      txLevel: verdict.level ?? localVerdict?.level ?? LEVEL.CAUTION,
      localVerdict,
      tipResult,
      verdict,
    };
  } catch {
    const localVerdict = fallbackLocalVerdict();
    const verdict = composeTransactionVerdict({
      localVerdict,
      localApplicable: true,
      localSettled: true,
      tipResult,
      tipApplicable,
      tipSettled: !tipApplicable || tipResult != null,
      review: reviewContributor,
      raspTier,
      raspArtifact,
      presign,
    });
    return {
      txLevel: verdict.level ?? LEVEL.CAUTION,
      localVerdict,
      tipResult,
      verdict,
    };
  }
}
