import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

export const CONTRACT_INTEL_CONSENT_KEY = 'veyrnox-contract-intel-consent';
export const DISMISSED_SUSPICIOUS_NFTS_KEY = 'veyrnox-dismissed-suspicious-nfts';
export const CONTRACT_INTEL_CACHE_KEY = 'veyrnox-contract-intel-cache';
export const CONTRACT_INTEL_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export function isContractIntelConfigured() {
  return !!(
    import.meta.env.VITE_TIP_BASE_URL
    && import.meta.env.VITE_SUPABASE_URL
    && import.meta.env.VITE_SUPABASE_ANON_KEY
  );
}

export function getContractIntelConsentState() {
  try { return localStorage.getItem(CONTRACT_INTEL_CONSENT_KEY); } catch { return null; }
}

export function hasContractIntelConsent() {
  return getContractIntelConsentState() === 'granted';
}

export function setContractIntelConsent(granted) {
  if (isDeniabilityOrDemoActive()) return;
  try { localStorage.setItem(CONTRACT_INTEL_CONSENT_KEY, granted ? 'granted' : 'denied'); } catch { /* best-effort */ }
}

export function clearContractIntelConsent() {
  if (isDeniabilityOrDemoActive()) return;
  try { localStorage.removeItem(CONTRACT_INTEL_CONSENT_KEY); } catch { /* best-effort */ }
}

function readContractIntelCacheMap() {
  try {
    const raw = localStorage.getItem(CONTRACT_INTEL_CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function writeContractIntelCacheMap(map) {
  if (isDeniabilityOrDemoActive()) return;
  try { localStorage.setItem(CONTRACT_INTEL_CACHE_KEY, JSON.stringify(map)); } catch { /* best-effort */ }
}

export function readCachedContractIntelEntry(id, now = Date.now()) {
  if (!id) return null;
  const map = readContractIntelCacheMap();
  const entry = map[String(id)];
  if (!entry || typeof entry !== 'object') return null;
  const expiresAt = Number(entry.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) {
    delete map[String(id)];
    writeContractIntelCacheMap(map);
    return null;
  }
  return {
    value: entry.value ?? null,
    expiresAt,
    cachedAt: Number(entry.cachedAt) || null,
  };
}

export function readCachedContractIntel(id, now = Date.now()) {
  return readCachedContractIntelEntry(id, now)?.value ?? null;
}

export function cacheContractIntel(id, value, now = Date.now()) {
  if (!id || value == null) return;
  const map = readContractIntelCacheMap();
  map[String(id)] = {
    value,
    cachedAt: now,
    expiresAt: now + CONTRACT_INTEL_CACHE_TTL_MS,
  };
  writeContractIntelCacheMap(map);
}

export function clearCachedContractIntel(id) {
  if (!id) return;
  const map = readContractIntelCacheMap();
  delete map[String(id)];
  writeContractIntelCacheMap(map);
}

export function clearAllCachedContractIntel() {
  if (isDeniabilityOrDemoActive()) return;
  try { localStorage.removeItem(CONTRACT_INTEL_CACHE_KEY); } catch { /* best-effort */ }
}

export function readDismissedSuspiciousNfts() {
  try {
    const raw = localStorage.getItem(DISMISSED_SUSPICIOUS_NFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.map((value) => String(value)) : [];
  } catch {
    return [];
  }
}

function writeDismissedSuspiciousNfts(ids) {
  if (isDeniabilityOrDemoActive()) return;
  try { localStorage.setItem(DISMISSED_SUSPICIOUS_NFTS_KEY, JSON.stringify(ids)); } catch { /* best-effort */ }
}

export function dismissSuspiciousNft(id) {
  if (!id) return;
  const next = new Set(readDismissedSuspiciousNfts());
  next.add(String(id));
  writeDismissedSuspiciousNfts([...next]);
}

export function undismissSuspiciousNft(id) {
  if (!id) return;
  const next = new Set(readDismissedSuspiciousNfts());
  next.delete(String(id));
  writeDismissedSuspiciousNfts([...next]);
}

export function clearDismissedSuspiciousNfts() {
  if (isDeniabilityOrDemoActive()) return;
  try { localStorage.removeItem(DISMISSED_SUSPICIOUS_NFTS_KEY); } catch { /* best-effort */ }
}
