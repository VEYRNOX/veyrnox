/**
 * snapshotStore — localStorage-backed portfolio snapshot CRUD.
 *
 * Key isolation design: each wallet address set maps to a unique fingerprint,
 * so real and decoy sessions see only their own snapshots with no active
 * clearing needed on vault lock.
 */

/**
 * Derives a deterministic key from a wallet address set.
 * @param {Record<string, {evm?: string|null, btc?: string|null, sol?: string|null}>} walletAddresses
 * @returns {string} fingerprint, or '' if no addresses
 */
function walletSetFingerprint(walletAddresses) {
  try {
    const addrs = [];
    for (const wallet of Object.values(walletAddresses)) {
      if (!wallet) continue;
      for (const addr of [wallet.evm, wallet.btc, wallet.sol]) {
        if (addr != null && addr !== '') addrs.push(addr);
      }
    }
    addrs.sort();
    return addrs.join(',');
  } catch {
    return '';
  }
}

function storageKey(fingerprint) {
  return `veyrnox-snapshots-${fingerprint}`;
}

function defaultLabel() {
  const d = new Date();
  return (
    d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }) +
    ' ' +
    d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  );
}

/**
 * Returns snapshots for this wallet address set, newest first.
 * @param {Record<string, {evm?: string|null, btc?: string|null, sol?: string|null}>} walletAddresses
 * @returns {Array}
 */
export function listSnapshots(walletAddresses) {
  try {
    const fp = walletSetFingerprint(walletAddresses);
    if (!fp) return [];
    const raw = localStorage.getItem(storageKey(fp));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

/**
 * Saves a new snapshot and returns it, or null if the address set is empty/invalid.
 * @param {Record<string, {evm?: string|null, btc?: string|null, sol?: string|null}>} walletAddresses
 * @param {{ grandTotal?: number, assetTotals?: Record<string, {usd: number}> | object, indeterminate?: boolean, byWallet?: object }} portfolio
 * @param {string} label
 * @param {string} note
 * @returns {object|null}
 */
export function saveSnapshot(walletAddresses, portfolio, label, note) {
  try {
    const fp = walletSetFingerprint(walletAddresses);
    if (!fp) return null;

    const breakdown = {};
    if (portfolio?.assetTotals) {
      for (const [symbol, data] of Object.entries(portfolio.assetTotals)) {
        breakdown[symbol] = data?.usd ?? 0;
      }
    }

    const snap = {
      // audit: Math.random() here is intentional — this ID is a UI dedup/display
      // key only, not a secret or entropy source for any cryptographic operation.
      id: `snap-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      created_date: new Date().toISOString(),
      label: label || defaultLabel(),
      note: note ?? '',
      total_usd: portfolio?.grandTotal ?? 0,
      breakdown,
      indeterminate: !!portfolio?.indeterminate,
    };

    const existing = listSnapshots(walletAddresses);
    localStorage.setItem(storageKey(fp), JSON.stringify([snap, ...existing]));
    return snap;
  } catch {
    return null;
  }
}

/**
 * Removes a snapshot by id. Best-effort — never throws.
 * @param {Record<string, {evm?: string|null, btc?: string|null, sol?: string|null}>} walletAddresses
 * @param {string} id
 */
export function deleteSnapshot(walletAddresses, id) {
  try {
    const fp = walletSetFingerprint(walletAddresses);
    if (!fp) return;
    const existing = listSnapshots(walletAddresses);
    const updated = existing.filter((s) => s.id !== id);
    localStorage.setItem(storageKey(fp), JSON.stringify(updated));
  } catch {
    // best-effort
  }
}
