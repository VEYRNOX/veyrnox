// lib/walletMeta.js — NON-SECRET per-wallet UI metadata (multi-wallet portfolio).
//
// SCOPE & SECURITY BOUNDARY
// -------------------------
// This module stores ONLY non-secret presentation preferences for the wallets
// held in the multi-seed vault: a display NAME, a "backed up?" flag, and the set
// of ASSETS the user wants shown for each wallet — plus which wallet is active.
// It NEVER stores seeds, keys, addresses, or anything derived from them. The
// seeds live exclusively in the encrypted vault (see wallet-core/multiVault.js);
// this is the deliberate split chosen so renaming / toggling assets / switching
// the active wallet stay cheap and DON'T require the vault password or a KDF
// re-encrypt (those are reserved for actually mutating the SEED SET).
//
// AT-REST NOTE (flagged for audit): wallet ids + names + asset prefs persist in
// localStorage in plaintext, so a device-access observer can see HOW MANY
// wallets the primary vault holds and their names. This is acceptable for the
// PRIMARY vault (its existence is already observable) and is a minor metadata
// leak, NOT key material. It is independent of the duress/stealth deniability
// features, whose hidden wallets are SEPARATELY encrypted and are NOT referenced
// here — so this never weakens count-hiding/plausible-deniability. If at-rest
// name privacy is later required, this map can move inside the encrypted vault.
//
// SAFE-FAIL: every read is guarded and falls back to defaults; a cleared/lost
// meta store degrades to "Wallet N" names with backedUp=false — i.e. it WARNS
// MORE, never less (you can never lose a backup warning by losing this file).

import { ASSETS } from '@/wallet-core/assets.js';

const META_KEY = 'veyrnox-wallet-meta';     // { [walletId]: { name, backedUp, enabledAssets } }
const ACTIVE_KEY = 'veyrnox-active-wallet';  // walletId string

// Default assets shown for a NEWLY created wallet: the headline five. The other
// five EVM chains are opt-in so a new wallet isn't cluttered (the user enables
// them per-wallet). The migrated legacy wallet keeps ALL assets (see
// WalletProvider) so existing users see no asset disappear.
export const DEFAULT_ENABLED_ASSETS = Object.freeze(['ETH', 'BTC', 'SOL', 'USDC', 'USDT']);
export const ALL_ASSET_SYMBOLS = Object.freeze(ASSETS.map((a) => a.symbol));

function readMap() {
  try {
    const raw = localStorage.getItem(META_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

function writeMap(map) {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(map));
  } catch {
    /* best-effort; preferences are non-fatal if storage is unavailable */
  }
}

// Keep only known asset symbols, de-duplicated, in canonical ASSETS order.
function sanitizeAssets(list) {
  const set = new Set(Array.isArray(list) ? list : []);
  return ALL_ASSET_SYMBOLS.filter((s) => set.has(s));
}

function defaultMeta(name) {
  return { name, backedUp: false, enabledAssets: [...DEFAULT_ENABLED_ASSETS] };
}

/** Full meta for one wallet, with safe defaults for any missing field. */
export function getWalletMeta(id, fallbackName = 'Wallet') {
  const m = readMap()[id] || {};
  return {
    name: typeof m.name === 'string' && m.name.trim() ? m.name : fallbackName,
    backedUp: m.backedUp === true,
    enabledAssets: m.enabledAssets ? sanitizeAssets(m.enabledAssets) : [...DEFAULT_ENABLED_ASSETS],
  };
}

/**
 * Ensure a meta record exists for `id`; create it from `seed` defaults if not.
 * Existing records are left untouched (idempotent). Used on wallet create/import
 * and on migration to seed the initial name / backup state / asset set.
 */
export function ensureWalletMeta(id, seed = {}) {
  const map = readMap();
  if (!map[id]) {
    map[id] = {
      name: typeof seed.name === 'string' && seed.name.trim() ? seed.name : 'Wallet',
      backedUp: seed.backedUp === true,
      enabledAssets: sanitizeAssets(seed.enabledAssets || DEFAULT_ENABLED_ASSETS),
    };
    writeMap(map);
  }
  return getWalletMeta(id, map[id]?.name);
}

export function setWalletName(id, name) {
  const map = readMap();
  const clean = (name || '').trim().slice(0, 40);
  map[id] = { ...(map[id] || defaultMeta('Wallet')), name: clean || 'Wallet' };
  writeMap(map);
}

export function setWalletBackedUp(id, backedUp) {
  const map = readMap();
  map[id] = { ...(map[id] || defaultMeta('Wallet')), backedUp: backedUp === true };
  writeMap(map);
}

export function setEnabledAssets(id, symbols) {
  const map = readMap();
  map[id] = { ...(map[id] || defaultMeta('Wallet')), enabledAssets: sanitizeAssets(symbols) };
  writeMap(map);
}

/** Toggle a single asset on/off for a wallet; returns the new enabled list. */
export function toggleWalletAsset(id, symbol) {
  const current = getWalletMeta(id).enabledAssets;
  const next = current.includes(symbol)
    ? current.filter((s) => s !== symbol)
    : [...current, symbol];
  setEnabledAssets(id, next);
  return sanitizeAssets(next);
}

export function removeWalletMeta(id) {
  const map = readMap();
  if (map[id]) { delete map[id]; writeMap(map); }
}

export function getActiveWalletId() {
  try { return localStorage.getItem(ACTIVE_KEY) || null; } catch { return null; }
}

export function setActiveWalletId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {
    /* best-effort */
  }
}

/**
 * Reconcile the meta store against the AUTHORITATIVE list of wallet ids from the
 * decrypted vault (in container order). Self-heals desync:
 *   - prunes meta for ids no longer in the vault,
 *   - creates default meta ("Wallet N", backedUp=false, default assets) for any
 *     vault wallet missing meta,
 *   - guarantees activeWalletId points at a real wallet (falls back to the first).
 * Returns { activeWalletId, metaById } for the caller to seed React state.
 *
 * @param {string[]} ids - wallet ids from the container, in order
 */
export function reconcileWalletMeta(ids) {
  const map = readMap();
  // Prune orphans.
  for (const key of Object.keys(map)) {
    if (!ids.includes(key)) delete map[key];
  }
  // Fill gaps with safe defaults (backedUp=false → warns; never silently "safe").
  ids.forEach((id, i) => {
    if (!map[id]) map[id] = defaultMeta(`Wallet ${i + 1}`);
    else map[id].enabledAssets = sanitizeAssets(map[id].enabledAssets || DEFAULT_ENABLED_ASSETS);
  });
  writeMap(map);

  let active = getActiveWalletId();
  if (!active || !ids.includes(active)) {
    active = ids[0] || null;
    setActiveWalletId(active);
  }

  const metaById = {};
  ids.forEach((id, i) => { metaById[id] = getWalletMeta(id, `Wallet ${i + 1}`); });
  return { activeWalletId: active, metaById };
}

/** Clear ALL wallet meta + active pointer (used on vault wipe / full reset). */
export function clearAllWalletMeta() {
  try { localStorage.removeItem(META_KEY); localStorage.removeItem(ACTIVE_KEY); } catch { /* noop */ }
}
