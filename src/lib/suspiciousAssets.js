import { annotateTokens, classifyToken } from '@/wallet-core/evm/spam';
import { isSafeNftImageUrl } from '@/lib/nftImageUrl';

const DAY_MS = 24 * 60 * 60 * 1000;
const CONTRACT_REVIEW_WINDOW_DAYS = 30;
const LOW_LIQUIDITY_USD = 25_000;
const LOW_HOLDER_COUNT = 250;

function toFlags(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map((v) => String(v).trim().toLowerCase());
  return [];
}

function parseNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isRecentDeployment(value) {
  const ts = Date.parse(String(value || ''));
  if (!Number.isFinite(ts)) return false;
  return Date.now() - ts <= CONTRACT_REVIEW_WINDOW_DAYS * DAY_MS;
}

function hasPlaceholderContract(token) {
  const contract = String(token?.token_contract || '').toLowerCase();
  return contract.startsWith('0xdeadbeef');
}

export function evaluateTokenContractRisk(token = {}) {
  const issues = [];
  const unknowns = [];
  const flags = new Set(toFlags(token.contract_flags));
  const liquidityUsd = parseNumber(token.liquidity_usd);
  const holderCount = parseNumber(token.holder_count);
  const transferFeeBps = parseNumber(token.transfer_fee_bps);
  const contractVerified = token.contract_verified;
  const mintable = token.is_mintable ?? token.mintable;
  const freezable = token.is_freezable ?? token.freezable;

  if (mintable === true || flags.has('mintable')) {
    issues.push({ severity: 'high', kind: 'mintable', text: 'Issuer can still mint more supply.' });
  } else if (mintable == null && !flags.has('non_mintable')) {
    unknowns.push('mint authority');
  }

  if (freezable === true || flags.has('freezable')) {
    issues.push({ severity: 'high', kind: 'freezable', text: 'Issuer can freeze or block transfers.' });
  } else if (freezable == null && !flags.has('non_freezable')) {
    unknowns.push('freeze authority');
  }

  if (transferFeeBps != null && transferFeeBps > 0) {
    issues.push({
      severity: transferFeeBps >= 500 ? 'high' : 'medium',
      kind: 'transfer_fee',
      text: `Transfers can charge a ${Number((transferFeeBps / 100).toFixed(2))}% token fee.`,
    });
  } else if (transferFeeBps == null) {
    unknowns.push('transfer tax');
  }

  if (liquidityUsd != null && liquidityUsd < LOW_LIQUIDITY_USD) {
    issues.push({ severity: 'medium', kind: 'liquidity', text: 'Observed liquidity is thin, so exits may be hard or heavily slippage-prone.' });
  } else if (liquidityUsd == null) {
    unknowns.push('liquidity depth');
  }

  if (holderCount != null && holderCount < LOW_HOLDER_COUNT) {
    issues.push({ severity: 'medium', kind: 'holder_count', text: 'Very few holders are visible, which can indicate a fresh or thinly distributed token.' });
  } else if (holderCount == null) {
    unknowns.push('holder distribution');
  }

  if (contractVerified === false || flags.has('unverified_contract')) {
    issues.push({ severity: 'medium', kind: 'contract_verified', text: 'Contract source is not verified in this dataset.' });
  } else if (contractVerified == null) {
    unknowns.push('source verification');
  }

  if (isRecentDeployment(token.deployed_at) || flags.has('new_contract')) {
    issues.push({ severity: 'medium', kind: 'new_contract', text: `Contract appears newly deployed within the last ${CONTRACT_REVIEW_WINDOW_DAYS} days.` });
  }

  if (hasPlaceholderContract(token)) {
    issues.push({ severity: 'medium', kind: 'placeholder_contract', text: 'Contract address is only a placeholder/demo record here, so it cannot be independently trusted.' });
  }

  const hasHigh = issues.some((issue) => issue.severity === 'high');
  return {
    issues,
    unknowns,
    severity: hasHigh ? 'high' : issues.length > 0 ? 'medium' : 'ok',
    score: hasHigh ? 2 : issues.length > 0 ? 1 : 0,
  };
}

export function evaluateSuspiciousToken(token = {}) {
  const spam = classifyToken(token);
  const contract = evaluateTokenContractRisk(token);
  const reasons = [
    ...spam.reasons.map((text) => ({ severity: 'medium', kind: 'metadata_spam', text })),
    ...contract.issues,
  ];
  return {
    ...token,
    spam,
    contract,
    reasons,
    suspicious: spam.spam || contract.score > 0,
    severity: contract.severity === 'high' ? 'high' : reasons.length > 0 ? 'medium' : 'ok',
  };
}

export function evaluateSuspiciousNft(nft = {}) {
  const reasons = [];
  const isAirdrop = nft.acquired_via === 'airdrop' || nft.unsolicited === true;
  if (isAirdrop) {
    reasons.push({ severity: 'medium', kind: 'unsolicited_airdrop', text: 'This collectible arrived unsolicited.' });
  }
  if (nft.image_url && !isSafeNftImageUrl(nft.image_url)) {
    reasons.push({ severity: 'medium', kind: 'remote_image_blocked', text: 'Artwork URL is not on the allowlist, so Veyrnox blocks it to avoid tracker beacons.' });
  }
  const collection = String(nft.collection || '').toLowerCase();
  const name = String(nft.name || '').toLowerCase();
  if (/(claim|reward|redeem|airdrop|voucher|visit|free)/i.test(`${collection} ${name}`)) {
    reasons.push({ severity: 'medium', kind: 'lure_wording', text: 'Name/collection uses common claim-or-reward lure wording.' });
  }
  return {
    ...nft,
    reasons,
    suspicious: reasons.length > 0,
    severity: reasons.some((reason) => reason.severity === 'high') ? 'high' : reasons.length > 0 ? 'medium' : 'ok',
  };
}

export function buildSuspiciousAssetSnapshot({ tokens = [], nfts = [], spamOverrides = {}, dismissedNftIds = [] } = {}) {
  const annotatedTokens = annotateTokens(tokens, spamOverrides);
  const dismissed = new Set((dismissedNftIds || []).map((id) => String(id)));
  const suspiciousTokens = /** @type {any[]} */ (annotatedTokens.map(evaluateSuspiciousToken).filter((token) => token.suspicious));
  const suspiciousNfts = /** @type {any[]} */ (nfts
    .map(evaluateSuspiciousNft)
    .filter((nft) => {
      const candidate = /** @type {any} */ (nft);
      return candidate.suspicious && !dismissed.has(String(candidate.id ?? ''));
    }));
  const highRiskTokens = suspiciousTokens.filter((token) => token.severity === 'high');
  const contractRiskTokens = suspiciousTokens.filter((token) => token.contract.score > 0);
  return {
    suspiciousTokens,
    suspiciousNfts,
    highRiskTokens,
    contractRiskTokens,
    totals: {
      suspiciousTokens: suspiciousTokens.length,
      suspiciousNfts: suspiciousNfts.length,
      riskyContracts: contractRiskTokens.length,
      hiddenTokens: suspiciousTokens.filter((token) => token?.hidden === true).length,
      visibleTokens: suspiciousTokens.filter((token) => token?.hidden !== true).length,
      dismissedNfts: dismissed.size,
      total: suspiciousTokens.length + suspiciousNfts.length,
    },
  };
}
