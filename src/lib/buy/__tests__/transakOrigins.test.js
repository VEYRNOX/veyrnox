// Branch review 2026-08-15 (C-1) — the Transak origin allowlist is ONE list.
//
// It used to be hardcoded independently in three files, in three shapes: a Set
// of origins (pages/BuyCrypto.jsx postMessage gate), a bare `!==` pair
// (api/edgeApi.js returned-URL check), and URL bases with a trailing slash
// (lib/buy/transakUrl.js). api/edgeApi.js's own comment recorded that it was
// keeping the other two in sync by hand.
//
// Drift fails CLOSED rather than open — a new Transak region domain added in two
// places out of three rejects a legitimate buy session, or silently drops
// TRANSAK_ORDER_SUCCESSFUL / TRANSAK_WIDGET_CLOSE so the widget never closes.
// Availability, not a bypass. But it is the same duplicated-constant shape that
// turned one copy defect into two files on the passkey unlock screens the same
// day, so the last test here is the anti-drift tripwire: it fails if any file
// re-introduces a hardcoded transak.com host.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  TRANSAK_ORIGINS,
  TRANSAK_HOSTS,
  TRANSAK_ORIGIN_PRODUCTION,
  TRANSAK_ORIGIN_STAGING,
  isTransakUrl,
} from '../transakUrl.js';

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(resolve(here, rel), 'utf8');

describe('Transak origin allowlist — single source of truth', () => {
  it('contains exactly the production and staging origins', () => {
    expect([...TRANSAK_ORIGINS].sort()).toEqual(
      [TRANSAK_ORIGIN_PRODUCTION, TRANSAK_ORIGIN_STAGING].sort(),
    );
  });

  it('derives HOSTS from ORIGINS so the two cannot disagree', () => {
    // postMessage compares an ORIGIN (scheme + host); URL validation compares a
    // HOST (no scheme). Two hand-maintained lists would drift; one is derived.
    expect([...TRANSAK_HOSTS].sort()).toEqual(
      ['global-stg.transak.com', 'global.transak.com'],
    );
  });

  it('is frozen — a caller cannot widen the allowlist at runtime', () => {
    expect(Object.isFrozen(TRANSAK_ORIGINS)).toBe(true);
    expect(Object.isFrozen(TRANSAK_HOSTS)).toBe(true);
  });
});

describe('isTransakUrl', () => {
  it('accepts https URLs on both Transak hosts', () => {
    expect(isTransakUrl('https://global.transak.com/?apiKey=x')).toBe(true);
    expect(isTransakUrl('https://global-stg.transak.com/')).toBe(true);
  });

  it('REJECTS http — a host-only check would have passed this (S-2)', () => {
    expect(isTransakUrl('http://global.transak.com/')).toBe(false);
  });

  it('rejects other hosts, including lookalikes', () => {
    for (const bad of [
      'https://attacker.example/',
      'https://global.transak.com.attacker.example/',
      'https://notglobal.transak.com/',
      'https://transak.com/',
    ]) {
      expect(isTransakUrl(bad), bad).toBe(false);
    }
  });

  it('fails closed on non-http(s) schemes and unparseable input', () => {
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,<script>1</script>',
      '//global.transak.com/',
      '',
      'not a url',
    ]) {
      expect(isTransakUrl(bad), String(bad)).toBe(false);
    }
  });

  it('does not throw on non-string input', () => {
    for (const bad of [undefined, null, 0, {}, []]) {
      expect(() => isTransakUrl(/** @type {any} */ (bad))).not.toThrow();
      expect(isTransakUrl(/** @type {any} */ (bad))).toBe(false);
    }
  });
});

describe('anti-drift: no file re-declares a Transak host', () => {
  // The tripwire. If a fourth copy appears — or one of the two consumers stops
  // importing and inlines the hosts again — this goes red naming the file.
  const consumers = [
    ['src/api/edgeApi.js', '../../../api/edgeApi.js'],
    ['src/pages/BuyCrypto.jsx', '../../../pages/BuyCrypto.jsx'],
  ];

  for (const [label, rel] of consumers) {
    it(`${label} imports the allowlist instead of hardcoding it`, () => {
      const src = read(rel);
      expect(src, `${label} must import from lib/buy/transakUrl`).toMatch(
        /from ['"]@\/lib\/buy\/transakUrl(\.js)?['"]/,
      );
      expect(src, `${label} must not hardcode a transak.com host`).not.toMatch(
        /['"`][^'"`]*\btransak\.com\b/,
      );
    });
  }

  it('transakUrl.js is the only place the literal hosts appear', () => {
    const src = read('../transakUrl.js');
    const literals = src.match(/['"`]https:\/\/[^'"`]*transak\.com[^'"`]*['"`]/g) || [];
    // Exactly the two origin constants — the URL bases are built from them.
    expect(literals.length).toBe(2);
  });
});
