const STORAGE_KEY = 'veyrnox-referral';
const PENDING_KEY = 'veyrnox-referral-pending';

export const EXTERNAL_REWARD_URL =
  import.meta.env.VITE_REFERRAL_REWARD_URL ||
  'mailto:rewards@veyrnox.app?subject=Referral%20Reward%20Claim';

const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode() {
  const arr = new Uint8Array(4);
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
  return code;
}

export function getTier(count) {
  if (count >= 10) return 'gold';
  if (count >= 5) return 'silver';
  if (count >= 1) return 'bronze';
  return 'none';
}

export function applyRedemption(newCount) {
  const state = getLocalState();
  const tier = getTier(newCount);
  const unlockedFeatures = [...(state.unlockedFeatures || [])];
  if (tier === 'silver' || tier === 'gold') {
    if (!unlockedFeatures.includes('portfolio-snapshots')) {
      unlockedFeatures.push('portfolio-snapshots');
    }
  }
  const referralCredit = tier === 'gold';
  const externalEligible = tier === 'gold';
  saveState({ ...state, inviteCount: newCount, tier, unlockedFeatures, referralCredit, externalEligible });
  return { tier, unlockedFeatures, referralCredit, externalEligible };
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
