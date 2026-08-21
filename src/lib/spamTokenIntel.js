import { annotateTokens } from '@/wallet-core/evm/spam';

export const SPAM_TOKEN_OVERRIDES_KEY = 'veyrnox-spam-overrides';

function safeLocalStorage() {
  if (typeof localStorage === 'undefined') return null;
  return localStorage;
}

export function readSpamTokenOverrides() {
  try {
    const storage = safeLocalStorage();
    if (!storage) return {};
    const raw = storage.getItem(SPAM_TOKEN_OVERRIDES_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function writeSpamTokenOverrides(overrides) {
  try {
    const storage = safeLocalStorage();
    if (!storage) return;
    storage.setItem(SPAM_TOKEN_OVERRIDES_KEY, JSON.stringify(overrides || {}));
  } catch {
    // Display-only preference write. Ignore storage failures.
  }
}

export function setSpamTokenOverride(tokenId, mode) {
  if (!tokenId) return;
  const next = { ...readSpamTokenOverrides() };
  if (mode === 'show' || mode === 'hide') next[tokenId] = mode;
  else delete next[tokenId];
  writeSpamTokenOverrides(next);
}

export function clearSpamTokenOverride(tokenId) {
  if (!tokenId) return;
  const next = { ...readSpamTokenOverrides() };
  delete next[tokenId];
  writeSpamTokenOverrides(next);
}

export function buildAssetSpamIntel(tokenRows = [], symbol, overrides = {}) {
  const normalizedSymbol = String(symbol || '').trim().toUpperCase();
  const matching = tokenRows.filter((token) => String(token?.symbol || '').trim().toUpperCase() === normalizedSymbol);
  const annotated = annotateTokens(matching, overrides);
  const flagged = annotated.filter((token) => token.spam);
  const hidden = flagged.filter((token) => token.hidden);
  const visible = flagged.filter((token) => !token.hidden);
  return {
    symbol: normalizedSymbol,
    total: matching.length,
    flaggedCount: flagged.length,
    hiddenCount: hidden.length,
    visibleCount: visible.length,
    tokens: annotated,
    flagged,
    hidden,
    visible,
    hasRisk: flagged.length > 0,
  };
}

