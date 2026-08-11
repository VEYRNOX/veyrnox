#!/usr/bin/env node
/**
 * refresh-advisories.mjs
 *
 * Weekly refresh of src/data/security-advisories.json.
 *
 * Data source: OpenRouter -> perplexity/sonar (web-search-capable). Vendor
 * blogs + GHSA + NVD do not give consistent coverage for hardware and
 * browser-extension wallets (Coldcard, Ledger, Trezor, etc.), so we ask a
 * search-augmented LLM for the digest and PR it for human review.
 *
 * Trust envelope: NEVER merge without human review of the PR diff. The
 * model can hallucinate CVE numbers. Reviewer must spot-check entries
 * against the linked vendor page before merging. This is why the workflow
 * always PRs and never pushes directly to main.
 *
 * Run:   OPENROUTER_API_KEY=sk-... node scripts/refresh-advisories.mjs
 * Wired: .github/workflows/advisories-refresh.yml (cron: Mon 03:00 UTC)
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const JSON_PATH = path.resolve(__dirname, '..', 'src', 'data', 'security-advisories.json');
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODEL = process.env.ADVISORIES_MODEL || 'perplexity/sonar';

const apiKey = process.env.OPENROUTER_API_KEY;
if (!apiKey) {
  console.error('OPENROUTER_API_KEY not set — refusing to run');
  process.exit(1);
}

const cfg = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
const vendors = cfg.vendors;
const windowDays = cfg.window_days ?? 90;
const cvssFloor = cfg.cvss_floor ?? 7.0;

const prompt = `You are a security-advisory curator for a self-custody crypto wallet.

Return the security advisories, CVEs, and vendor-published vulnerability disclosures affecting these wallets published in the LAST ${windowDays} DAYS (from ${new Date(Date.now() - windowDays * 86400000).toISOString().slice(0, 10)} to ${new Date().toISOString().slice(0, 10)}):

${vendors.map((v, i) => `${i + 1}. ${v}`).join('\n')}

Rules:
- Include ONLY items with CVSS >= ${cvssFloor}, or clearly high/critical severity if no CVSS is published.
- Include vendor security bulletins even without a CVE number (use the vendor's advisory ID or URL as identifier).
- One entry per issue. Deduplicate.
- If you find nothing for a vendor, that is a valid result — do not fabricate.
- Never invent CVE numbers or vendor IDs. If uncertain, omit the entry.

Return ONLY a JSON object matching this schema, nothing else:
{
  "entries": [
    {
      "vendor": "string (which vendor from the list)",
      "cve": "string (CVE-YYYY-NNNN or GHSA id or vendor advisory id)",
      "published": "YYYY-MM-DD",
      "cvss": number or null,
      "severity": "CRITICAL" | "HIGH" | null,
      "summary": "string (max 300 chars, one sentence describing impact)",
      "source_url": "string (vendor advisory URL or NVD URL)"
    }
  ]
}`;

const resp = await fetch(OPENROUTER_URL, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': 'https://veyrnox.com',
    'X-Title': 'Veyrnox Advisories Refresh',
  },
  body: JSON.stringify({
    model: MODEL,
    messages: [{ role: 'user', content: prompt }],
    temperature: 0,
    max_tokens: 4000,
    response_format: { type: 'json_object' },
  }),
});

if (!resp.ok) {
  console.error(`OpenRouter ${resp.status}: ${await resp.text()}`);
  process.exit(1);
}

const data = await resp.json();
const raw = data.choices?.[0]?.message?.content;
if (!raw) {
  console.error('No content in model response');
  process.exit(1);
}

let parsed;
try {
  // Sonar sometimes wraps JSON in ```json fences even under response_format.
  const cleaned = raw.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
  parsed = JSON.parse(cleaned);
} catch (err) {
  console.error(`Model returned non-JSON: ${err.message}\n--raw--\n${raw}`);
  process.exit(1);
}

const entries = Array.isArray(parsed.entries) ? parsed.entries : [];

// Schema validation. Reject the whole payload if any entry is malformed —
// safer than silently dropping bad rows.
for (const e of entries) {
  const bad =
    typeof e.vendor !== 'string' ||
    typeof e.cve !== 'string' ||
    typeof e.published !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}$/.test(e.published) ||
    (e.cvss != null && typeof e.cvss !== 'number') ||
    (e.severity != null && !['CRITICAL', 'HIGH'].includes(e.severity)) ||
    typeof e.summary !== 'string' ||
    e.summary.length > 500 ||
    typeof e.source_url !== 'string' ||
    !e.source_url.startsWith('https://');
  if (bad) {
    console.error('Malformed entry, aborting:', JSON.stringify(e));
    process.exit(1);
  }
  if (e.cvss != null && e.cvss < cvssFloor) {
    console.error(`Entry below cvss_floor=${cvssFloor}, aborting:`, JSON.stringify(e));
    process.exit(1);
  }
}

const sorted = entries.sort((a, b) => b.published.localeCompare(a.published));

cfg.generated = new Date().toISOString();
cfg.entries = sorted;

writeFileSync(JSON_PATH, JSON.stringify(cfg, null, 2) + '\n');
console.log(`wrote ${sorted.length} advisories (model: ${MODEL})`);
