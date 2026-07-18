// hooks/useRecentPages.js
//
// Tracks the 6 most recently visited feature pages for the More drawer.
// Persisted in sessionStorage (not localStorage — deniability: no residual
// across sessions, cleared on lock/reload). Fixes #1154.

import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';

const KEY = 'veyrnox-recent-pages';
const MAX = 6;
const EXCLUDED = ['/', '/send', '/receive', '/settings'];

function readRecents() {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

export default function useRecentPages() {
  const location = useLocation();
  const [recents, setRecents] = useState(readRecents);

  useEffect(() => {
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
    try { sessionStorage.removeItem(KEY); } catch {}
  }, []);

  return { recents, clear };
}
