// src/lib/address.js
//
// Truncated-middle address display helper (design system §6). Pure + presentational:
// no network, no keys. Mirrors the inline `shorten` in TransactionPreview.jsx so
// every surface renders addresses the same way (e.g. 0x7099797…dc79C8). Verifiable
// values render in IBM Plex Mono at the call site.

/**
 * Truncate a long address to head…tail. Non-strings and short strings pass through.
 * @param {string} addr
 * @returns {string}
 */
export function shortenAddress(addr) {
  if (!addr || typeof addr !== 'string') return addr;
  if (addr.length <= 16) return addr;
  return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}
