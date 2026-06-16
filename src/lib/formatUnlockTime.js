// Pure display helper for the last-successful-unlock tamper signal.
// Shows an absolute local date+time the owner can recognise (or not). Returns a
// first-open string when there is no prior value — we never fabricate a time.

/**
 * @param {number|null|undefined} ts epoch ms of the previous successful unlock
 * @returns {string}
 */
export function formatUnlockTime(ts) {
  // A real unlock timestamp is always a positive finite epoch-ms (the only writer
  // is withLastUnlockAt(container, Date.now()), which itself rejects ts <= 0). Treat
  // anything else — null/undefined/non-number/non-finite/non-positive — as no prior
  // value so a stray 0 or negative can never render a 1970/1969 date. We never
  // fabricate a time.
  if (typeof ts !== 'number' || !Number.isFinite(ts) || ts <= 0) {
    return 'First open on this device';
  }
  // Absolute local date + time. Local (not UTC) so the owner recognises the
  // wall-clock moment they last opened the wallet.
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
