// Nav icon-collision guard.
//
// Finding F5 (2026-07-19 branch review): eaf7361a changed /hd-wallet from
// KeyRound to Layers to resolve a KeyRound clash with /wallet-access
// ("Access & Recovery") — but Layers was already on /nft-multichain and
// /solana, so it traded a 2-way clash for a 3-way one. Two nav rows sharing a
// glyph makes the sidebar and the ⌘K palette harder to scan, because the icon
// stops being a distinguishing signal.
//
// Auditing the whole file turned up a systemic version of the same problem:
// 65 entries drawing on only 50 distinct icons, with ShieldAlert used 4x.
// Fixing all of it at once would be a large, subjective re-skin, so this guard
// follows the repo's existing grandfathering pattern (see
// RULE3_LEGACY_EXEMPT_PATHS in scripts/check-deniability-strings.mjs):
// the known collisions are listed as legacy, and ANY NEW collision fails.
// The list is a ratchet — entries should only ever be removed from it.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../navigation.js'), 'utf8');

/** Every `{ path, label, icon }` nav entry, in file order. */
function navEntries() {
  return [...src.matchAll(/\{\s*path:\s*"([^"]+)",\s*label:\s*"([^"]+)",\s*icon:\s*(\w+)/g)]
    .map(m => ({ path: m[1], label: m[2], icon: m[3] }));
}

/** icon -> [entries], only where more than one entry shares it. */
function collisions() {
  const by = new Map();
  for (const e of navEntries()) {
    if (!by.has(e.icon)) by.set(e.icon, []);
    by.get(e.icon).push(e);
  }
  return new Map([...by].filter(([, v]) => v.length > 1));
}

// Collisions present when this guard was written. RATCHET: only ever shrink
// this list. A new icon reused across two rows must fail instead of being
// appended here.
const LEGACY_ICON_COLLISIONS = {
  Activity: ['/advanced-analytics', '/login-activity'],
  BellRing: ['/notifications', '/alerts'],
  Cpu: ['/hardware-wallet', '/rasp-security'],
  Eye: ['/watchlist', '/watch-wallets'],
  Layers: ['/nft-multichain', '/solana'],
  Network: ['/onchain', '/network-manager'],
  Newspaper: ['/correlation-timeline', '/news-sentiment'],
  PieChart: ['/spending', '/budget'],
  ShieldAlert: ['/security', '/dapp-alerts', '/anomaly-detection', '/fraud'],
  ShieldCheck: ['/security-dashboard', '/session-manager'],
  ShieldQuestion: ['/risk-score', '/address-checker'],
};

describe('navigation icons', () => {
  it('parses a plausible number of nav entries (guard is live)', () => {
    expect(navEntries().length).toBeGreaterThan(50);
  });

  // The actual F5 fix.
  it('/hd-wallet does not share its icon with any other route', () => {
    const entries = navEntries();
    const hd = entries.find(e => e.path === '/hd-wallet');
    expect(hd, '/hd-wallet entry not found').toBeTruthy();
    const sharers = entries.filter(e => e.icon === hd.icon && e.path !== hd.path);
    expect(
      sharers.map(e => `${e.label} (${e.path})`),
      `/hd-wallet icon "${hd.icon}" is also used by: ${sharers.map(e => e.path).join(', ')}`
    ).toEqual([]);
  });

  it('introduces no NEW icon collisions beyond the grandfathered set', () => {
    const found = collisions();
    const unexpected = [];
    for (const [icon, entries] of found) {
      const allowed = LEGACY_ICON_COLLISIONS[icon];
      const paths = entries.map(e => e.path).sort();
      if (!allowed) {
        unexpected.push(`${icon}: NEW collision on ${paths.join(', ')}`);
        continue;
      }
      // An existing collision must not grow.
      const added = paths.filter(p => !allowed.includes(p));
      if (added.length) {
        unexpected.push(`${icon}: collision widened to include ${added.join(', ')}`);
      }
    }
    expect(unexpected, `new nav icon collisions:\n  ${unexpected.join('\n  ')}`).toEqual([]);
  });

  it('the legacy list is a ratchet — no stale entries left behind', () => {
    // If a collision was fixed, drop it from LEGACY_ICON_COLLISIONS so the
    // guard tightens rather than silently permitting a regression later.
    const found = collisions();
    const stale = Object.keys(LEGACY_ICON_COLLISIONS).filter(icon => !found.has(icon));
    expect(stale, `these icons no longer collide — remove them from LEGACY_ICON_COLLISIONS: ${stale.join(', ')}`).toEqual([]);
  });

  it('every icon referenced by an entry is actually imported', () => {
    const importBlock = src.slice(0, src.indexOf('lucide-react'));
    for (const { icon, path } of navEntries()) {
      expect(
        new RegExp(`\\b${icon}\\b`).test(importBlock),
        `icon "${icon}" used by ${path} is not imported`
      ).toBe(true);
    }
  });
});
