#!/usr/bin/env node
// scripts/refresh-ofac-blocklist.mjs
//
// Rebuild the LOCAL OFAC sanctioned digital-currency-address snapshot from the
// CURRENT official OFAC SDN advanced XML. Run it to refresh the bundled file:
//
//   node scripts/refresh-ofac-blocklist.mjs
//   node scripts/refresh-ofac-blocklist.mjs --from-file ./some.xml   # offline/dev
//
// WHAT THIS PRODUCES
//   src/wallet-core/data/ofac-sanctioned.json — a dated, bundled snapshot the
//   in-app OFAC provider (src/wallet-core/evm/suspicious.js) reads. The app never
//   phones OFAC at runtime; only THIS script touches the network, and only when a
//   maintainer runs it.
//
// HARD GUARANTEES (the guardrails this script is built around)
//   • REBUILD-FROM-CURRENT: every run extracts the FULL current list and OVERWRITES
//     the snapshot. It NEVER appends to the prior file — so addresses OFAC has
//     DELISTED (e.g. the Tornado Cash contracts delisted 2025) simply disappear.
//   • FAIL-LOUD on no network / bad response / zero extracted addresses. It throws
//     and exits non-zero WITHOUT writing, so a transient outage can never silently
//     replace real data with an empty/partial snapshot.
//   • SANCTIONS-ONLY scope: this is the OFAC SDN list. It is NOT a scam/drainer/
//     phishing feed. Absence from it means "not OFAC-sanctioned", never "safe".
//
// ATTRIBUTION (MIT)
//   The extraction approach (FeatureType IDs → digital-currency VersionDetail) is
//   adapted from github.com/0xB10C/ofac-sanctioned-digital-currency-addresses
//   (MIT licensed). That upstream author DISCLAIMS completeness and correctness;
//   so do we. Data itself is U.S. Treasury OFAC public-domain source data.

import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SDN_URL = 'https://www.treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_PATH = resolve(__dirname, '../src/wallet-core/data/ofac-sanctioned.json');

// OFAC "Digital Currency Address - X" FeatureType IDs we extract. SOL (1167) is
// deliberately EXCLUDED per scope — Solana is out of coverage for this snapshot.
// XBT is Bitcoin. The EVM-family chains (ETH/USDC/USDT/ARB/BSC) all use 0x
// addresses; XBT uses raw base58/bech32 strings.
const FEATURE_TYPES = {
  344: { ticker: 'XBT', chain: 'BTC', kind: 'btc' },
  345: { ticker: 'ETH', chain: 'ETH', kind: 'evm' },
  887: { ticker: 'USDT', chain: 'ETH', kind: 'evm' },
  998: { ticker: 'USDC', chain: 'ETH', kind: 'evm' },
  1007: { ticker: 'ARB', chain: 'ARB', kind: 'evm' },
  1008: { ticker: 'BSC', chain: 'BSC', kind: 'evm' },
};

async function loadXml() {
  const fileFlag = process.argv.indexOf('--from-file');
  if (fileFlag !== -1) {
    const p = process.argv[fileFlag + 1];
    if (!p) throw new Error('--from-file requires a path argument');
    console.error(`[refresh-ofac] reading local XML: ${p} (OFFLINE/DEV mode — not the live list)`);
    return readFileSync(p, 'utf8');
  }

  console.error(`[refresh-ofac] downloading current OFAC SDN advanced XML…\n  ${SDN_URL}`);
  let res;
  try {
    res = await fetch(SDN_URL);
  } catch (e) {
    // FAIL LOUD: network unreachable. Do NOT write anything.
    throw new Error(
      `NETWORK FAILURE fetching OFAC SDN XML — refusing to write a partial/empty snapshot.\n` +
      `  The existing bundled snapshot (if any) is left untouched.\n` +
      `  Underlying error: ${e.message}`
    );
  }
  if (!res.ok) {
    throw new Error(`OFAC server returned HTTP ${res.status} ${res.statusText} — refusing to write.`);
  }
  const xml = await res.text();
  if (!xml || xml.length < 1_000_000) {
    throw new Error(`OFAC XML looks truncated (${xml ? xml.length : 0} bytes) — refusing to write.`);
  }
  console.error(`[refresh-ofac] downloaded ${xml.length.toLocaleString()} bytes`);
  return xml;
}

// Parse the SDN advanced XML for digital-currency addresses.
//
// Each address lives in a self-contained <Feature> block whose FeatureTypeID
// identifies the currency, e.g.:
//   <Feature ID="50215" FeatureTypeID="345">
//     <FeatureVersion …>
//       <VersionDetail DetailTypeID="1432">0x098B716B8Aaf21512996dC57EB0615e2383E2f96</VersionDetail>
//     </FeatureVersion>
//   </Feature>
// We match each bounded Feature block first (lazy up to the first </Feature>, and
// Features are never nested), THEN read the VersionDetail inside — so a Feature
// that carries no VersionDetail can't bleed into the next one's address.
function extractAddresses(xml) {
  const FEATURE_RE = /<Feature ID="\d+" FeatureTypeID="(\d+)">([\s\S]*?)<\/Feature>/g;
  const DETAIL_RE = /<VersionDetail[^>]*>([^<]+)<\/VersionDetail>/;

  // Keyed by normalized address; merge the tickers an address is listed under.
  const byNorm = new Map();

  for (const m of xml.matchAll(FEATURE_RE)) {
    const meta = FEATURE_TYPES[Number(m[1])];
    if (!meta) continue; // not a currency we cover (incl. SOL, XMR, LTC, …)
    const dm = m[2].match(DETAIL_RE);
    if (!dm) continue;
    const raw = dm[1].trim();
    if (!raw) continue;

    // EVM addresses normalize to lowercase 0x (matches poison.js norm()).
    // BTC stays a raw, case-sensitive string (base58/bech32) — no isAddress().
    const norm = meta.kind === 'evm' ? raw.toLowerCase() : raw;

    const existing = byNorm.get(norm);
    if (existing) {
      if (!existing.tickers.includes(meta.ticker)) existing.tickers.push(meta.ticker);
    } else {
      byNorm.set(norm, { address: norm, kind: meta.kind, chain: meta.chain, tickers: [meta.ticker] });
    }
  }

  return [...byNorm.values()];
}

function snapshotDateUTC() {
  // scripts/ is outside the RNG-guarded crypto path; new Date() is fine here.
  return new Date().toISOString().slice(0, 10);
}

async function main() {
  const xml = await loadXml();
  const entries = extractAddresses(xml);

  // FAIL LOUD: extracting zero addresses means the schema changed or the body was
  // bad. Writing an empty snapshot would silently "clear" the blocklist.
  if (entries.length === 0) {
    throw new Error(
      'Extracted ZERO digital-currency addresses — OFAC XML schema may have changed.\n' +
      '  Refusing to overwrite the bundled snapshot with an empty list.'
    );
  }

  const evm = entries.filter((e) => e.kind === 'evm').length;
  const btc = entries.filter((e) => e.kind === 'btc').length;

  // Stable ordering (BTC raw strings then EVM lowercased) so re-runs that find the
  // same set produce a minimal, reviewable diff.
  entries.sort((a, b) => (a.kind === b.kind ? a.address.localeCompare(b.address) : a.kind.localeCompare(b.kind)));

  const snapshot = {
    _meta: {
      title: 'OFAC SDN sanctioned digital-currency addresses (LOCAL bundled snapshot)',
      category: 'sanctioned',
      source: SDN_URL,
      sourceName: 'U.S. Treasury OFAC — SDN advanced XML',
      attribution:
        'Extraction approach adapted from github.com/0xB10C/ofac-sanctioned-digital-currency-addresses (MIT). ' +
        'That upstream author disclaims completeness and correctness; so do we.',
      license: 'MIT (tooling) / U.S. Treasury OFAC public-domain (data)',
      snapshotDate: snapshotDateUTC(),
      currencies: ['XBT (BTC)', 'ETH', 'USDC', 'USDT', 'ARB', 'BSC'],
      excludes: ['SOL is NOT covered by this snapshot', 'XMR/LTC/ZEC/TRX/XRP and other SDN tickers are out of scope'],
      honesty: [
        'SANCTIONS-ONLY: this is the OFAC SDN list, NOT a scam/drainer/phishing feed.',
        'DATED SNAPSHOT: rebuilt only when a maintainer runs scripts/refresh-ofac-blocklist.mjs. It WILL go stale.',
        'REBUILD-FROM-CURRENT: each refresh reflects OFAC DELISTINGS (removed addresses disappear).',
        'ADVISORY: the app WARNS, it does not hard-block, and it NEVER asserts an address is "safe".',
        'Absence here means "not on this snapshot of the OFAC SDN list" — never "safe".',
      ],
      counts: { total: entries.length, evm, btc },
    },
    entries: entries.map((e) => ({
      address: e.address,
      kind: e.kind,
      chain: e.chain,
      tickers: e.tickers,
      category: 'sanctioned',
      source: 'OFAC SDN',
      note: 'OFAC SDN-listed digital-currency address',
    })),
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');

  console.error(
    `[refresh-ofac] wrote ${OUT_PATH}\n` +
    `  snapshotDate=${snapshot._meta.snapshotDate}  total=${entries.length}  evm=${evm}  btc=${btc}`
  );
}

main().catch((e) => {
  console.error('\n✗ refresh-ofac-blocklist FAILED:\n' + e.message + '\n');
  process.exit(1);
});
