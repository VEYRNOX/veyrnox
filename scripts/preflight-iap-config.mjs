#!/usr/bin/env node
// preflight-iap-config.mjs — Step 0 config-consistency guard for the Safety Plus IAP.
//
// Plan: docs/superpowers/plans/2026-07-06-iap-subscription-stitching.md, Task 15 Step 0
// ("Pre-flight config-consistency — do this BEFORE touching a device; a mismatch here
//  silently fails the whole session — a purchase can succeed while the tier stays `free`").
//
// WHY: the #1 cause of a "purchase worked but nothing unlocked" false failure is an
// identifier drift between the RevenueCat dashboard and the strings the client code checks
// (entitlement `safety_plus`, package `$rc_monthly`, product `safety_plus_monthly`). A single
// character off and the sandbox purchase succeeds while resolveTier() stays `free` forever.
//
// This script catches that drift OFF-DEVICE, before a human burns a device session on it.
//
// HONESTY CONTRACT (matches this repo's verify-don't-assert / fail-honest rule):
//   - LOCAL checks (code constants, .env.local presence, capacitor appId) are deterministic
//     and ALWAYS run. They read the actual files — they cannot false-pass.
//   - REMOTE checks (RevenueCat dashboard state) only run when both REVENUECAT_V2_SECRET_KEY
//     and REVENUECAT_PROJECT_ID are set. Absent → the remote block SKIPs loudly. A SKIP is
//     NOT a pass: the summary says the dashboard was not verified. We never green-light the
//     dashboard from local checks alone.
//   - Product↔entitlement and product↔package ATTACHMENT are verified via the API where the
//     response shape is unambiguous; where the v2 API shape can't be parsed with certainty
//     the specific sub-check downgrades to WARN (verify manually) rather than a false PASS.
//
// This is a config guard, NOT device verification. Passing here means "the identifiers line
// up"; it does NOT mean a purchase unlocks the tier — only a real sandbox purchase on a
// device (Steps 1–9) proves that.
//
// RUN:
//   npm run check:iap-preflight              # local checks only (SKIPs the dashboard)
//   REVENUECAT_V2_SECRET_KEY=sk_xxx REVENUECAT_PROJECT_ID=proj_xxx npm run check:iap-preflight
//
// The v2 secret key (sk_...) is a SERVER key — never commit it, never put it in the client
// bundle. Pass it inline or via a gitignored file; this script reads it from process.env only.

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// ── Canonical identifiers (source of truth = the plan's Global Constraints) ──────────────
// Every one of these must match BOTH the client code AND the RevenueCat dashboard. The whole
// point of the script is to prove that equality, so they live here once and get cross-checked
// against the code (local) and the API (remote).
const EXPECT = {
  entitlement: 'safety_plus',              // purchases.js SAFETY_PLUS_ENTITLEMENT; code reads entitlements.active['safety_plus']
  package: '$rc_monthly',                  // Subscription.jsx availablePackages.find(p => p.identifier === '$rc_monthly')
  packageAnnual: '$rc_annual',             // Subscription.jsx annual package identifier — same entitlement, different price
  product: 'safety_plus_monthly',          // App Store Connect + Play Console product id (same string on both stores)
  productAnnual: 'safety_plus_annual',     // annual product id (both stores) — grants the same 'safety_plus' entitlement
  offering: 'default',                     // the RevenueCat offering that must be marked "current"
  appId: 'com.veyrnox.app',                // capacitor.config appId / bundle id / package name
};

// ── Result plumbing ──────────────────────────────────────────────────────────────────────
const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m' };
const results = []; // { level: 'pass'|'fail'|'warn'|'skip', name, detail }
const pass = (name, detail = '') => results.push({ level: 'pass', name, detail });
const fail = (name, detail = '') => results.push({ level: 'fail', name, detail });
const warn = (name, detail = '') => results.push({ level: 'warn', name, detail });
const skip = (name, detail = '') => results.push({ level: 'skip', name, detail });

function readIfExists(rel) {
  const p = join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}

// Parse a .env file into a plain object (no dependency on dotenv). Ignores comments/blanks.
function parseEnvFile(rel) {
  const text = readIfExists(rel);
  if (!text) return {};
  const out = {};
  for (const line of text.split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

// ── LOCAL CHECKS (always run) ──────────────────────────────────────────────────────────────
function localChecks() {
  // 1. Code constants: SAFETY_PLUS_ENTITLEMENT + monthly/annual package identifiers.
  const purchases = readIfExists('src/lib/purchases.js');
  if (!purchases) {
    fail('code: purchases.js present', 'src/lib/purchases.js not found');
  } else {
    const m = purchases.match(/SAFETY_PLUS_ENTITLEMENT\s*=\s*['"]([^'"]+)['"]/);
    if (!m) fail('code: SAFETY_PLUS_ENTITLEMENT defined', 'constant not found in purchases.js');
    else if (m[1] !== EXPECT.entitlement) fail('code: entitlement constant', `purchases.js has '${m[1]}', expected '${EXPECT.entitlement}'`);
    else pass('code: entitlement constant', `SAFETY_PLUS_ENTITLEMENT === '${EXPECT.entitlement}'`);

    const mMonthly = purchases.match(/SAFETY_PLUS_MONTHLY_PACKAGE\s*=\s*['"]([^'"]+)['"]/);
    if (!mMonthly) fail('code: SAFETY_PLUS_MONTHLY_PACKAGE defined', 'constant not found in purchases.js');
    else if (mMonthly[1] !== EXPECT.package) fail('code: monthly package constant', `purchases.js has '${mMonthly[1]}', expected '${EXPECT.package}'`);
    else pass('code: monthly package constant', `SAFETY_PLUS_MONTHLY_PACKAGE === '${EXPECT.package}'`);

    const mAnnual = purchases.match(/SAFETY_PLUS_ANNUAL_PACKAGE\s*=\s*['"]([^'"]+)['"]/);
    if (!mAnnual) fail('code: SAFETY_PLUS_ANNUAL_PACKAGE defined', 'constant not found in purchases.js');
    else if (mAnnual[1] !== EXPECT.packageAnnual) fail('code: annual package constant', `purchases.js has '${mAnnual[1]}', expected '${EXPECT.packageAnnual}'`);
    else pass('code: annual package constant', `SAFETY_PLUS_ANNUAL_PACKAGE === '${EXPECT.packageAnnual}'`);
  }

  // 2. Code: Subscription.jsx imports the package constants from purchases.js.
  //    (The strings themselves live in purchases.js — checked above.)
  const sub = readIfExists('src/pages/Subscription.jsx');
  if (!sub) {
    warn('code: Subscription.jsx present', 'src/pages/Subscription.jsx not found — cannot confirm package lookup');
  } else {
    const importsMonthly = sub.includes('SAFETY_PLUS_MONTHLY_PACKAGE');
    const importsAnnual = sub.includes('SAFETY_PLUS_ANNUAL_PACKAGE');
    if (importsMonthly) pass('code: monthly package lookup', 'Subscription.jsx imports SAFETY_PLUS_MONTHLY_PACKAGE');
    else fail('code: monthly package lookup', 'Subscription.jsx does not import SAFETY_PLUS_MONTHLY_PACKAGE — package identifier drift risk');
    if (importsAnnual) pass('code: annual package lookup', 'Subscription.jsx imports SAFETY_PLUS_ANNUAL_PACKAGE');
    else warn('code: annual package lookup', 'Subscription.jsx does not import SAFETY_PLUS_ANNUAL_PACKAGE — annual pricing UI not wired');
  }

  // 3. Capacitor appId / bundle id === com.veyrnox.app
  const capText = readIfExists('capacitor.config.ts') ?? readIfExists('capacitor.config.json') ?? readIfExists('capacitor.config.js');
  if (!capText) {
    warn('config: capacitor appId', 'no capacitor.config.* found');
  } else {
    const m = capText.match(/appId\s*:\s*['"]([^'"]+)['"]/);
    if (!m) warn('config: capacitor appId', 'appId not found in capacitor config');
    else if (m[1] !== EXPECT.appId) fail('config: capacitor appId', `appId is '${m[1]}', expected '${EXPECT.appId}'`);
    else pass('config: capacitor appId', `appId === '${EXPECT.appId}'`);
  }

  // 4. Optional: a StoreKit local-testing config (Task 13) — cross-check both product ids if present.
  const storekit = readIfExists('ios/App/App/Configuration.storekit') ?? readIfExists('ios/App/App/Products.storekit') ?? readIfExists('ios/App/Products.storekit');
  if (storekit) {
    if (storekit.includes(EXPECT.product)) pass('config: .storekit product id (monthly)', `.storekit config references '${EXPECT.product}'`);
    else fail('config: .storekit product id (monthly)', `.storekit config present but does not reference '${EXPECT.product}'`);
    if (storekit.includes(EXPECT.productAnnual)) pass('config: .storekit product id (annual)', `.storekit config references '${EXPECT.productAnnual}'`);
    else warn('config: .storekit product id (annual)', `.storekit config present but does not reference '${EXPECT.productAnnual}' — annual not wired for local StoreKit testing`);
  } else {
    skip('config: .storekit product id', 'no Products.storekit (Task 13 not done yet) — nothing to cross-check');
  }

  // 5. Build-time SDK keys present in .env.local (public keys; Vite inlines them at build time).
  const env = { ...parseEnvFile('.env.local'), ...process.env };
  const appleKey = env.VITE_REVENUECAT_APPLE_API_KEY;
  const googleKey = env.VITE_REVENUECAT_GOOGLE_API_KEY;
  if (appleKey && appleKey.trim()) pass('env: VITE_REVENUECAT_APPLE_API_KEY', 'set (iOS build will configure RevenueCat)');
  else fail('env: VITE_REVENUECAT_APPLE_API_KEY', 'empty/missing in .env.local → iOS throws REVENUECAT_API_KEY_MISSING → everyone resolves free');
  if (googleKey && googleKey.trim()) pass('env: VITE_REVENUECAT_GOOGLE_API_KEY', 'set (Android build will configure RevenueCat)');
  else warn('env: VITE_REVENUECAT_GOOGLE_API_KEY', 'empty/missing → Android build resolves free (fine if iOS-only for now)');
}

// ── REMOTE CHECKS (RevenueCat v2 dashboard state; opt-in) ───────────────────────────────────
const RC_BASE = 'https://api.revenuecat.com/v2';

async function rcFetch(secret, path) {
  const url = path.startsWith('http') ? path : `${RC_BASE}${path}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${secret}`, Accept: 'application/json' } });
  const body = await res.text();
  if (!res.ok) {
    const err = new Error(`RevenueCat API ${res.status} for ${path}: ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }
  return body ? JSON.parse(body) : {};
}

// List endpoint with next_page pagination.
async function rcList(secret, path) {
  const items = [];
  let next = path;
  let guard = 0;
  while (next && guard++ < 20) {
    const page = await rcFetch(secret, next);
    if (Array.isArray(page.items)) items.push(...page.items);
    next = page.next_page || null;
  }
  return items;
}

async function remoteChecks(secret, projectId) {
  const base = `/projects/${projectId}`;

  // 1. Entitlement `safety_plus` exists (matched on lookup_key — the string the SDK sees).
  let entitlement = null;
  try {
    const ents = await rcList(secret, `${base}/entitlements?limit=50`);
    entitlement = ents.find((e) => e.lookup_key === EXPECT.entitlement) ?? null;
    if (entitlement) pass('rc: entitlement exists', `lookup_key '${EXPECT.entitlement}' found (id ${entitlement.id})`);
    else fail('rc: entitlement exists', `no entitlement with lookup_key '${EXPECT.entitlement}' — code checks entitlements.active['${EXPECT.entitlement}'], purchase would never unlock`);
  } catch (e) {
    fail('rc: entitlement exists', e.message);
    return; // auth/project problem — later calls will just repeat the same error
  }

  // 2. Products exist (monthly + annual, matched on store_identifier).
  //    Both products grant the SAME entitlement — annual is a pricing choice,
  //    not a feature axis.
  let product = null;
  let productAnnual = null;
  try {
    const products = await rcList(secret, `${base}/products?limit=50`);
    product = products.find((p) => p.store_identifier === EXPECT.product) ?? null;
    productAnnual = products.find((p) => p.store_identifier === EXPECT.productAnnual) ?? null;
    if (product) pass('rc: product exists (monthly)', `store_identifier '${EXPECT.product}' found (id ${product.id})`);
    else fail('rc: product exists (monthly)', `no product with store_identifier '${EXPECT.product}' in the RevenueCat project`);
    if (productAnnual) pass('rc: product exists (annual)', `store_identifier '${EXPECT.productAnnual}' found (id ${productAnnual.id})`);
    else fail('rc: product exists (annual)', `no product with store_identifier '${EXPECT.productAnnual}' — annual pricing not configured`);
  } catch (e) {
    fail('rc: product exists', e.message);
  }

  // 3. Both products attached to the `safety_plus` entitlement.
  if (entitlement && (product || productAnnual)) {
    try {
      const attached = await rcList(secret, `${base}/entitlements/${entitlement.id}/products?limit=50`);
      if (product) {
        if (attached.some((p) => p.id === product.id || p.store_identifier === EXPECT.product)) {
          pass('rc: product ↔ entitlement (monthly)', `'${EXPECT.product}' is attached to entitlement '${EXPECT.entitlement}'`);
        } else {
          fail('rc: product ↔ entitlement (monthly)', `'${EXPECT.product}' is NOT attached to '${EXPECT.entitlement}' — purchase succeeds but grants nothing`);
        }
      }
      if (productAnnual) {
        if (attached.some((p) => p.id === productAnnual.id || p.store_identifier === EXPECT.productAnnual)) {
          pass('rc: product ↔ entitlement (annual)', `'${EXPECT.productAnnual}' is attached to entitlement '${EXPECT.entitlement}'`);
        } else {
          fail('rc: product ↔ entitlement (annual)', `'${EXPECT.productAnnual}' is NOT attached to '${EXPECT.entitlement}' — annual purchase succeeds but grants nothing`);
        }
      }
    } catch (e) {
      warn('rc: product ↔ entitlement', `could not auto-verify attachment via API (${e.message}) — confirm manually in the dashboard`);
    }
  }

  // 4. Offering `default` exists and is the current offering.
  let offering = null;
  try {
    const offerings = await rcList(secret, `${base}/offerings?limit=50`);
    offering = offerings.find((o) => o.lookup_key === EXPECT.offering) ?? null;
    if (!offering) {
      fail('rc: offering exists', `no offering with lookup_key '${EXPECT.offering}'`);
    } else {
      pass('rc: offering exists', `offering '${EXPECT.offering}' found (id ${offering.id})`);
      const current = offerings.find((o) => o.is_current === true) ?? null;
      if (current == null) {
        warn('rc: offering is current', 'no offering reports is_current — confirm the current offering in the dashboard (code reads getOfferings().current)');
      } else if (current.lookup_key === EXPECT.offering) {
        pass('rc: offering is current', `'${EXPECT.offering}' is the current offering`);
      } else {
        fail('rc: offering is current', `current offering is '${current.lookup_key}', not '${EXPECT.offering}' — getOfferings().current won't return the Safety Plus package`);
      }
    }
  } catch (e) {
    fail('rc: offering exists', e.message);
  }

  // 5. Referral tier offerings exist (referral-bronze, -silver, -gold, -platinum).
  //    These are NON-current offerings fetched via Purchases.getOfferings().all[id].
  const REFERRAL_TIERS = [
    { key: 'bronze',   offeringId: 'referral-bronze',   monthlyProduct: 'safety_plus_monthly_bronze',   annualProduct: 'safety_plus_annual_bronze' },
    { key: 'silver',   offeringId: 'referral-silver',   monthlyProduct: 'safety_plus_monthly_silver',   annualProduct: 'safety_plus_annual_silver' },
    { key: 'gold',     offeringId: 'referral-gold',     monthlyProduct: 'safety_plus_monthly_gold',     annualProduct: 'safety_plus_annual_gold' },
    { key: 'platinum', offeringId: 'referral-platinum', monthlyProduct: 'safety_plus_monthly_platinum', annualProduct: 'safety_plus_annual_platinum' },
  ];
  try {
    const offerings = await rcList(secret, `${base}/offerings?limit=50`);
    for (const tier of REFERRAL_TIERS) {
      const tierOff = offerings.find((o) => o.lookup_key === tier.offeringId) ?? null;
      if (!tierOff) {
        warn(`rc: referral offering (${tier.key})`, `offering '${tier.offeringId}' not found — run scripts/setup-referral-offerings.mjs`);
      } else {
        pass(`rc: referral offering (${tier.key})`, `'${tier.offeringId}' exists`);
      }
    }
  } catch (e) {
    warn('rc: referral offerings', `could not check referral offerings (${e.message})`);
  }

  // 6. Package `$rc_monthly` is on the offering, pointing at `safety_plus_monthly`.
  //    v2 has NO /offerings/{id}/packages/{id}/products sub-resource (it 404s). Instead we
  //    request the packages list with ?expand=items.product, which inlines each package's
  //    attached products as `package.products.items[].product.store_identifier` — one call,
  //    verified against the live API shape. A package can carry the RIGHT lookup_key while
  //    pointing at the WRONG product (e.g. a leftover test-store `monthly`), so this is a
  //    hard PASS/FAIL, not a warn — a wrong product here silently buys the wrong thing.
  if (offering) {
    try {
      const packages = await rcList(secret, `${base}/offerings/${offering.id}/packages?limit=50&expand=items.product`);

      const pkg = packages.find((p) => p.lookup_key === EXPECT.package) ?? null;
      if (!pkg) {
        fail('rc: package exists (monthly)', `offering '${EXPECT.offering}' has no package with lookup_key '${EXPECT.package}'`);
      } else {
        pass('rc: package exists (monthly)', `package '${EXPECT.package}' found on offering '${EXPECT.offering}'`);
        const attached = (pkg.products?.items ?? [])
          .map((it) => it?.product?.store_identifier)
          .filter(Boolean);
        if (attached.includes(EXPECT.product)) {
          pass('rc: package ↔ product (monthly)', `'${EXPECT.package}' points at '${EXPECT.product}'`);
        } else {
          fail('rc: package ↔ product (monthly)', `'${EXPECT.package}' points at [${attached.join(', ') || 'nothing'}], not '${EXPECT.product}' — the monthly purchase would buy the wrong product`);
        }
      }

      const pkgAnnual = packages.find((p) => p.lookup_key === EXPECT.packageAnnual) ?? null;
      if (!pkgAnnual) {
        fail('rc: package exists (annual)', `offering '${EXPECT.offering}' has no package with lookup_key '${EXPECT.packageAnnual}' — annual pricing UI will hide the toggle`);
      } else {
        pass('rc: package exists (annual)', `package '${EXPECT.packageAnnual}' found on offering '${EXPECT.offering}'`);
        const attached = (pkgAnnual.products?.items ?? [])
          .map((it) => it?.product?.store_identifier)
          .filter(Boolean);
        if (attached.includes(EXPECT.productAnnual)) {
          pass('rc: package ↔ product (annual)', `'${EXPECT.packageAnnual}' points at '${EXPECT.productAnnual}'`);
        } else {
          fail('rc: package ↔ product (annual)', `'${EXPECT.packageAnnual}' points at [${attached.join(', ') || 'nothing'}], not '${EXPECT.productAnnual}' — the annual purchase would buy the wrong product`);
        }
      }
    } catch (e) {
      fail('rc: package exists', e.message);
    }
  }
}

// ── Main ────────────────────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${C.bold}Safety Plus IAP — Step 0 pre-flight config check${C.reset}`);
  console.log(`${C.dim}Plan: docs/superpowers/plans/2026-07-06-iap-subscription-stitching.md (Task 15 Step 0)${C.reset}\n`);

  localChecks();

  const secret = process.env.REVENUECAT_V2_SECRET_KEY;
  const projectId = process.env.REVENUECAT_PROJECT_ID;
  if (secret && projectId) {
    try {
      await remoteChecks(secret, projectId);
    } catch (e) {
      fail('rc: dashboard reachable', e.message);
    }
  } else {
    skip('rc: dashboard state', 'REVENUECAT_V2_SECRET_KEY / REVENUECAT_PROJECT_ID not set — dashboard NOT verified (local checks only)');
  }

  // ── Report ──
  const glyph = { pass: `${C.green}✓${C.reset}`, fail: `${C.red}✗${C.reset}`, warn: `${C.yellow}⚠${C.reset}`, skip: `${C.dim}⊘${C.reset}` };
  console.log('');
  for (const r of results) {
    console.log(`  ${glyph[r.level]} ${r.name}${r.detail ? `  ${C.dim}— ${r.detail}${C.reset}` : ''}`);
  }

  const n = (lvl) => results.filter((r) => r.level === lvl).length;
  const fails = n('fail');
  const warns = n('warn');
  const skips = n('skip');
  console.log(`\n${C.bold}${n('pass')} passed, ${fails} failed, ${warns} warnings, ${skips} skipped${C.reset}`);

  if (skips > 0 && !(secret && projectId)) {
    console.log(`${C.yellow}NOTE: the RevenueCat dashboard was NOT verified. Re-run with REVENUECAT_V2_SECRET_KEY + REVENUECAT_PROJECT_ID to check the live config.${C.reset}`);
  }
  if (fails === 0) {
    console.log(`${C.green}Config is consistent as far as this check can see. This is NOT device verification — only a real sandbox purchase (Steps 1–9) proves the tier unlocks.${C.reset}`);
  } else {
    console.log(`${C.red}Fix the failures above before starting a device session — a mismatch here silently leaves the tier 'free' after a successful purchase.${C.reset}`);
  }

  process.exit(fails > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`${C.red}preflight-iap-config crashed:${C.reset}`, e);
  process.exit(2);
});
