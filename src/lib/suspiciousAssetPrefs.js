import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

export const CONTRACT_INTEL_CONSENT_KEY = 'veyrnox-contract-intel-consent';
export const DISMISSED_SUSPICIOUS_NFTS_KEY = 'veyrnox-dismissed-suspicious-nfts';

export function isContractIntelConfigured() {
  return !!import.meta.env.VITE_CONTRACT_INTEL_BASE_URL;
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
