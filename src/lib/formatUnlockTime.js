// Pure display helper for the last-successful-unlock tamper signal.
// Shows an absolute local date+time the owner can recognise (or not). Returns a
// first-open string when there is no prior value — we never fabricate a time.

/**
 * @param {number|null|undefined} ts epoch ms of the previous successful unlock
 * @returns {string}
 */
export function formatUnlockTime(ts) {
  if (typeof ts !== 'number' || !Number.isFinite(ts)) {
    return 'First open on this device';
  }
  // Absolute local date + time. Local (not UTC) so the owner recognises the
  // wall-clock moment they last opened the wallet.
  return new Date(ts).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}
