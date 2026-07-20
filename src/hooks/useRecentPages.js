// hooks/useRecentPages.js
//
// Tracks the 5 most recently visited feature pages for the More drawer (#1154).
//
// DENIABILITY (I3, C-1). The recents list NAMES pages — '/duress-pin',
// '/stealth-wallets', '/panic-wipe' — so an unguarded list is a direct tell that
// a real coercion-resistance stack exists on this device. Three properties hold:
//
//   1. Both the WRITE and the READ are gated on the LIVE isDeniabilityOrDemoActive()
//      helper (session marker OR persisted `veyrnox-demo` flag, re-read on every
//      call). A decoy/hidden/demo session records nothing and renders nothing,
//      including entries a prior REAL session had already written. The read gate is
//      evaluated on every render, so a mid-session flip to decoy suppresses an
//      already-loaded list immediately. Fail CLOSED (I4): if the check throws we
//      treat the session as deniability-active and suppress. The gate also
//      ERASES the key outright (P2-1) — masking alone left a real session's
//      entries readable in tab storage on the `veyrnox-demo=1` path, where no
//      APP_LOCK_EVENT ever fires.
//   2. clear() is wired to APP_LOCK_EVENT (lib/copySecret.js), which
//      WalletProvider.lock() dispatches — so recents are dropped on lock rather
//      than surviving into the next unlock of the same tab.
//   3. The sessionStorage key is swept by wallet-core/panic.js
//      (SESSION_RESIDUE_KEYS) so a panic wipe destroys it too — sessionStorage is
//      per-TAB, so it otherwise survives the post-wipe reload.
//
// Storage remains sessionStorage (not localStorage): it dies with the tab, so it
// leaves no on-disk forensic residue after the browser/app is closed.

import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { APP_LOCK_EVENT } from '@/lib/copySecret';

const KEY = 'veyrnox-recent-pages';
const MAX = 5;
const EXCLUDED = ['/', '/send', '/receive', '/settings'];

/**
 * Fail-closed live deniability check (I4): any throw is treated as
 * "deniability active", i.e. record nothing and render nothing.
 * @returns {boolean}
 */
function deniabilityActive() {
  try {
    return isDeniabilityOrDemoActive() === true;
  } catch {
    return true;
  }
}

function readRecents() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw).slice(0, MAX) : [];
  } catch { return []; }
}

/**
 * P2-1: masking is not erasing. The gate below hides recents and blocks new
 * writes, but an entry a prior REAL session already wrote stayed in
 * sessionStorage — and nothing removes it unless APP_LOCK_EVENT fires. The
 * persisted `veyrnox-demo=1` / `?demo=1` path never fires a lock, so the
 * incriminating key ('/duress-pin', '/stealth-wallets', '/panic-wipe') remained
 * observable to anything with tab-storage access for the life of the tab.
 * Idempotent and non-throwing: a storage that refuses the removal leaves the
 * masking gate as the (weaker) remaining defence rather than crashing the shell.
 */
function eraseRecents() {
  try { sessionStorage.removeItem(KEY); } catch { /* masking gate still applies */ }
}

export default function useRecentPages() {
  const location = useLocation();
  const [recents, setRecents] = useState(() => (deniabilityActive() ? [] : readRecents()));

  // P2-1: ERASE on every render while the session is deniability/demo — not just
  // on APP_LOCK_EVENT, which never fires on the persisted `veyrnox-demo=1` path.
  // Deliberately dependency-free so a mid-mount flip to a decoy session is caught
  // on the very next render. setRecents returns the SAME array reference when it
  // is already empty, so this cannot loop.
  useEffect(() => {
    if (!deniabilityActive()) return;
    eraseRecents();
    setRecents((prev) => (prev.length === 0 ? prev : []));
  });

  useEffect(() => {
    // I3: a decoy/hidden/demo session must leave no navigation trace.
    if (deniabilityActive()) return;
    const path = location.pathname;
    if (EXCLUDED.includes(path)) return;
    setRecents((prev) => {
      const next = [path, ...prev.filter((p) => p !== path)].slice(0, MAX);
      try { sessionStorage.setItem(KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }, [location.pathname]);

  const clear = useCallback(() => {
    setRecents([]);
    eraseRecents();
  }, []);

  // Drop recents the instant the wallet locks (panic, duress, idle, manual).
  // WalletProvider.lock() dispatches APP_LOCK_EVENT on window.
  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    window.addEventListener(APP_LOCK_EVENT, clear);
    return () => window.removeEventListener(APP_LOCK_EVENT, clear);
  }, [clear]);

  // Live read gate: evaluated every render so a mid-session flip to a decoy/hidden
  // session hides an already-loaded list without waiting for an effect.
  return { recents: deniabilityActive() ? [] : recents, clear };
}
