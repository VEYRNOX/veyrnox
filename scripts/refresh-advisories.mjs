#!/usr/bin/env node
/**
 * refresh-advisories.mjs
 *
 * Weekly refresh of src/data/security-advisories.json.
 *
 * Sources NVD (CVE 2.0 API), keyword-searches each vendor, filters to the last
 * `window_days` and CVSS >= `cvss_floor`, and rewrites the JSON.
 *
 * NVD unauth rate limit: 5 req / 30s. With ~8 vendors and one request each,
 * we stay under it. Set NVD_API_KEY env var to raise the limit if needed.
 *
 * Run:   node scripts/refresh-advisories.mjs
 * Wired: .github/workflows/advisories-refresh.yml (cron: Mon 03:00 UTC)
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.resolve(__dirname, '..', 'src', 'data', 'security-advisories.json');
const NVD_URL = 'https://services.nvd.nist.gov/rest/json/cves/2.0';
const REQ_GAP_MS = 6500; // NVD asks for ~6s between unauth requests

const cfg = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
const vendors = cfg.vendors;
const windowDays = cfg.window_days ?? 90;
const cvssFloor = cfg.cvss_floor ?? 7.0;

const now = new Date();
const start = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

function iso(d) {
  return d.toISOString().replace(/\.\d{3}Z$/, '.000');
}

async function fetchVendor(vendor) {
  const url = new URL(NVD_URL);
  url.searchParams.set('keywordSearch', vendor);
  url.searchParams.set('pubStartDate', iso(start));
  url.searchParams.set('pubEndDate', iso(now));
  const headers = { 'User-Agent': 'veyrnox-advisories/1.0' };
  if (process.env.NVD_API_KEY) headers['apiKey'] = process.env.NVD_API_KEY;
  const resp = await fetch(url, { headers });
  if (!resp.ok) throw new Error(`NVD ${vendor} ${resp.status}`);
  return resp.json();
}

function extract(vendor, payload) {
  const out = [];
  for (const item of payload.vulnerabilities ?? []) {
    const cve = item.cve;
    if (!cve?.id) continue;
    const metric =
      cve.metrics?.cvssMetricV31?.[0]?.cvssData ??
      cve.metrics?.cvssMetricV30?.[0]?.cvssData ??
      cve.metrics?.cvssMetricV2?.[0]?.cvssData;
    const score = metric?.baseScore;
    if (score == null || score < cvssFloor) continue;
    const desc =
      cve.descriptions?.find(d => d.lang === 'en')?.value ??
      cve.descriptions?.[0]?.value ??
      '';
    out.push({
      vendor,
      cve: cve.id,
      published: cve.published?.slice(0, 10) ?? null,
      cvss: score,
      severity: metric.baseSeverity ?? null,
      summary: desc.length > 300 ? desc.slice(0, 297) + '...' : desc,
    });
  }
  return out;
}

const entries = [];
for (const vendor of vendors) {
  try {
    const payload = await fetchVendor(vendor);
    entries.push(...extract(vendor, payload));
  } catch (err) {
    console.error(`skip ${vendor}: ${err.message}`);
  }
  await new Promise(r => setTimeout(r, REQ_GAP_MS));
}

// Dedup by CVE id (a CVE can hit multiple vendor keywords).
const seen = new Set();
const deduped = entries
  .filter(e => (seen.has(e.cve) ? false : (seen.add(e.cve), true)))
  .sort((a, b) => (b.published ?? '').localeCompare(a.published ?? ''));

cfg.generated = new Date().toISOString();
cfg.entries = deduped;

writeFileSync(JSON_PATH, JSON.stringify(cfg, null, 2) + '\n');
console.log(`wrote ${deduped.length} advisories`);
