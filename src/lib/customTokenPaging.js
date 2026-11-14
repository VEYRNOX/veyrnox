// lib/customTokenPaging.js — pure helpers for showing custom tokens 10 at a time.
// Only rendered rows run a balance read, so paging also bounds RPC traffic.

export const CUSTOM_TOKEN_PAGE_SIZE = 10;

/** First `visibleCount` items (clamped to [PAGE_SIZE, total]) and the count still hidden. */
export function pageCustomTokens(tokens, visibleCount) {
  const list = Array.isArray(tokens) ? tokens : [];
  const wanted = Number.isInteger(visibleCount) ? visibleCount : CUSTOM_TOKEN_PAGE_SIZE;
  const count = Math.min(list.length, Math.max(CUSTOM_TOKEN_PAGE_SIZE, wanted));
  return { shown: list.slice(0, count), hidden: list.length - count };
}

/** Next visible count after "show more" / reaching the bottom of the list. */
export function nextCustomTokenCount(visibleCount, total) {
  const base = Number.isInteger(visibleCount) ? visibleCount : CUSTOM_TOKEN_PAGE_SIZE;
  return Math.min(total, Math.max(CUSTOM_TOKEN_PAGE_SIZE, base) + CUSTOM_TOKEN_PAGE_SIZE);
}
