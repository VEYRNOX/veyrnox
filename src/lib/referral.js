import { registerCode } from '@/api/referralApi';

const STORAGE_KEY = 'veyrnox-referral';
const PENDING_KEY = 'veyrnox-referral-pending';

export const EXTERNAL_REWARD_URL =
  import.meta.env.VITE_REFERRAL_REWARD_URL ||
  'mailto:rewards@veyrnox.com?subject=Referral%20Reward%20Claim';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode() {
  const arr = new Uint8Array(6);
  crypto.getRandomValues(arr);
  return 'VYX-' + Array.from(arr, (b) => CHARS[b % CHARS.length]).join('');
}

export function getLocalState() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function generateCode() {
  const state = getLocalState();
  if (state.code) return state.code;
  const code = randomCode();
  saveState({ ...state, code });
  void registerCode(code);
  return code;
}

export async function initCode(generateServerCode) {
  const state = getLocalState();
  if (state.code) return state.code;
  if (generateServerCode) {
    const serverCode = await generateServerCode();
    if (serverCode) {
      saveState({ ...state, code: serverCode, serverGenerated: true });
      return serverCode;
    }
  }
  const code = randomCode();
  saveState({ ...state, code });
  void registerCode(code);
  return code;
}

export const TIERS = [
  { key: 'platinum', label: 'Platinum', min: 10000, max: 100000, commission: 15 },
  { key: 'gold',     label: 'Gold',     min: 1000,  max: 10000,  commission: 10 },
  { key: 'silver',   label: 'Silver',   min: 100,   max: 1000,   commission: 5 },
  { key: 'bronze',   label: 'Bronze',   min: 0,     max: 100,    commission: 2.5 },
];

export function getTier(count) {
  if (count <= 0) return 'none';
  for (const t of TIERS) {
    if (count >= t.min) return t.key;
  }
  return 'bronze';
}

export function getTierInfo(count) {
  if (count <= 0) return { key: 'none', label: 'No referrals yet', commission: 0, next: TIERS[TIERS.length - 1] };
  for (const t of TIERS) {
    if (count >= t.min) {
      const idx = TIERS.indexOf(t);
      return { ...t, next: idx > 0 ? TIERS[idx - 1] : null };
    }
  }
  const bronze = TIERS[TIERS.length - 1];
  return { ...bronze, next: TIERS[TIERS.length - 2] };
}

export function applyRedemption(newCount) {
  const state = getLocalState();
  const tier = getTier(newCount);
  const info = getTierInfo(newCount);
  const unlockedFeatures = [...(state.unlockedFeatures || [])];
  if (tier === 'silver' || tier === 'gold' || tier === 'platinum') {
    if (!unlockedFeatures.includes('portfolio-snapshots')) {
      unlockedFeatures.push('portfolio-snapshots');
    }
  }
  const commission = info.commission;
  const externalEligible = tier === 'gold' || tier === 'platinum';
  saveState({ ...state, inviteCount: newCount, tier, commission, unlockedFeatures, externalEligible });
  return { tier, commission, unlockedFeatures, externalEligible };
}

export function markRedeemed(code) {
  saveState({ ...getLocalState(), redeemedCode: code });
}

export function hasRedeemed() {
  return !!getLocalState().redeemedCode;
}

export function setPendingReferral(code) {
  localStorage.setItem(PENDING_KEY, code);
}

export function getPendingReferral() {
  return localStorage.getItem(PENDING_KEY);
}

export function clearPendingReferral() {
  localStorage.removeItem(PENDING_KEY);
}

export function getRedeemedCode() {
  return getLocalState().redeemedCode || null;
}

export function markAttributed() {
  saveState({ ...getLocalState(), attributed: true });
}

export function hasAttributed() {
  return !!getLocalState().attributed;
}

export const PLAN_FULL_PRICE_CENTS = { monthly: 599, annual: 4999 };
export const PLAN_REVENUE_CENTS = PLAN_FULL_PRICE_CENTS;

export const TIER_OFFERING_ID = {
  bronze:   'referral-bronze',
  silver:   'referral-silver',
  gold:     'referral-gold',
  platinum: 'referral-platinum',
};

export function getOfferingIdForTier(tierKey) {
  return TIER_OFFERING_ID[tierKey] ?? null;
}

export function calculateDiscountCents(fullPriceCents, tierCommission) {
  return Math.round(fullPriceCents * tierCommission / 100);
}

export function calculateEarnings(attributions) {
  const totalDiscountCents = attributions.reduce((sum, a) => sum + (a.discount_cents || 0), 0);
  const totalRevenueCents = attributions.reduce((sum, a) => sum + (a.revenue_cents || 0), 0);
  return { totalRevenueCents, totalDiscountCents, count: attributions.length };
}
