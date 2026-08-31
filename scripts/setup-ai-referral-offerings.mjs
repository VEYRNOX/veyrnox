#!/usr/bin/env node
// setup-ai-referral-offerings.mjs — Creates the 4 tier-based referral offerings
// for AI Security Protection in RevenueCat via their v2 REST API.
//
// Unlike Safety Plus, the repo does NOT hard-code canonical AI referral product
// identifiers. This script stays honest about that: the plan family, offering
// prefix, entitlement, and Google Play base-plan suffixes are all env-driven.
//
// PREREQUISITES:
//   1. Base AI offering already exists in RevenueCat and is exposed in the app
//      by VITE_RC_AI_SECURITY_PROTECTION_OFFERING_ID.
//   2. AI monthly + annual referral products already exist in App Store Connect
//      and Google Play, and have been synced into RevenueCat.
//   3. All tier products should attach to the ai_security_protection entitlement.
//
// REQUIRED ENV:
//   REVENUECAT_V2_SECRET_KEY=sk_xxx
//   REVENUECAT_PROJECT_ID=proj_xxx
//   VITE_RC_AI_REFERRAL_OFFERING_PREFIX=<canonical offering prefix>
//
// OPTIONAL ENV:
//   AI_REFERRAL_PRODUCT_PREFIX=ai_security_protection
//   AI_REFERRAL_ENTITLEMENT_ID=ai_security_protection
//   AI_REFERRAL_MONTHLY_BASE_PLAN_ID=monthly
//   AI_REFERRAL_ANNUAL_BASE_PLAN_ID=annual
//   DRY_RUN=1
//
// Example:
//   VITE_RC_AI_REFERRAL_OFFERING_PREFIX=ai-referral \
//   REVENUECAT_V2_SECRET_KEY=sk_xxx \
//   REVENUECAT_PROJECT_ID=proj_xxx \
//   node scripts/setup-ai-referral-offerings.mjs

const SECRET_KEY = process.env.REVENUECAT_V2_SECRET_KEY;
const PROJECT_ID = process.env.REVENUECAT_PROJECT_ID;
const OFFERING_PREFIX = process.env.VITE_RC_AI_REFERRAL_OFFERING_PREFIX;
const PRODUCT_PREFIX = process.env.AI_REFERRAL_PRODUCT_PREFIX || 'ai_security_protection';
const ENTITLEMENT_ID = process.env.AI_REFERRAL_ENTITLEMENT_ID || 'ai_security_protection';
const MONTHLY_BASE_PLAN_ID = process.env.AI_REFERRAL_MONTHLY_BASE_PLAN_ID || 'monthly';
const ANNUAL_BASE_PLAN_ID = process.env.AI_REFERRAL_ANNUAL_BASE_PLAN_ID || 'annual';
const DRY_RUN = process.env.DRY_RUN === '1';

if (!SECRET_KEY || !PROJECT_ID || !OFFERING_PREFIX) {
  console.error('Missing REVENUECAT_V2_SECRET_KEY, REVENUECAT_PROJECT_ID, or VITE_RC_AI_REFERRAL_OFFERING_PREFIX');
  console.error('Run: VITE_RC_AI_REFERRAL_OFFERING_PREFIX=ai-referral REVENUECAT_V2_SECRET_KEY=sk_xxx REVENUECAT_PROJECT_ID=proj_xxx node scripts/setup-ai-referral-offerings.mjs');
  process.exit(1);
}

const BASE = `https://api.revenuecat.com/v2/projects/${PROJECT_ID}`;
const HEADERS = {
  Authorization: `Bearer ${SECRET_KEY}`,
  'Content-Type': 'application/json',
  Accept: 'application/json',
};

const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', bold: '\x1b[1m', cyan: '\x1b[36m', dim: '\x1b[2m' };

const TIERS = [
  { key: 'bronze', displayName: 'AI Referral Bronze' },
  { key: 'silver', displayName: 'AI Referral Silver' },
  { key: 'gold', displayName: 'AI Referral Gold' },
  { key: 'platinum', displayName: 'AI Referral Platinum' },
].map((tier) => ({
  ...tier,
  offeringId: `${OFFERING_PREFIX}-${tier.key}`,
  monthlyProducts: [
    `${PRODUCT_PREFIX}_monthly_${tier.key}:${MONTHLY_BASE_PLAN_ID}`,
    `${PRODUCT_PREFIX}_monthly_${tier.key}`,
  ],
  annualProducts: [
    `${PRODUCT_PREFIX}_annual_${tier.key}:${ANNUAL_BASE_PLAN_ID}`,
    `${PRODUCT_PREFIX}_annual_${tier.key}`,
  ],
}));

async function rc(method, path, body) {
  const url = `${BASE}${path}`;
  if (DRY_RUN) {
    console.log(`  ${C.dim}[DRY RUN] ${method} ${path}${body ? ' ' + JSON.stringify(body) : ''}${C.reset}`);
    return { ok: true, status: 200, data: { id: 'dry-run-id', items: [] } };
  }
  const res = await fetch(url, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  return { ok: res.ok, status: res.status, data };
}

async function listAll(path) {
  const sep = path.includes('?') ? '&' : '?';
  const { ok, data } = await rc('GET', `${path}${sep}limit=50`);
  if (!ok) return [];
  return data?.items ?? data ?? [];
}

async function findOfferingByLookupKey(lookupKey) {
  const offerings = await listAll('/offerings');
  const match = offerings.find((o) => o.lookup_key === lookupKey);
  return match?.id ?? null;
}

async function ensureOffering(tier) {
  const existingId = await findOfferingByLookupKey(tier.offeringId);
  if (existingId) {
    console.log(`  ${C.green}✓ Offering ${tier.offeringId} already exists (${existingId})${C.reset}`);
    return existingId;
  }

  console.log(`  ${C.cyan}→ Creating offering ${tier.offeringId}${C.reset}`);
  const res = await rc('POST', '/offerings', {
    lookup_key: tier.offeringId,
    display_name: tier.displayName,
  });
  if (!res.ok) {
    console.log(`  ${C.red}✗ Failed to create offering ${tier.offeringId}: ${JSON.stringify(res.data)}${C.reset}`);
    return null;
  }
  console.log(`  ${C.green}✓ Created offering ${tier.offeringId}${C.reset}`);
  return res.data.id ?? tier.offeringId;
}

async function ensurePackage(offeringId, packageId, displayName) {
  const packages = await listAll(`/offerings/${offeringId}/packages`);
  const existing = packages.find((p) => p.lookup_key === packageId || p.identifier === packageId);
  if (existing) {
    const pkgRcId = existing.id ?? packageId;
    console.log(`    ${C.green}✓ Package ${packageId} already exists (${pkgRcId})${C.reset}`);
    return pkgRcId;
  }

  console.log(`    ${C.cyan}→ Creating package ${packageId} on ${offeringId}${C.reset}`);
  const res = await rc('POST', `/offerings/${offeringId}/packages`, {
    lookup_key: packageId,
    display_name: displayName,
  });
  if (!res.ok) {
    console.log(`    ${C.red}✗ Failed to create package ${packageId}: ${JSON.stringify(res.data)}${C.reset}`);
    return null;
  }
  console.log(`    ${C.green}✓ Created package ${packageId}${C.reset}`);
  return res.data.id ?? packageId;
}

async function attachProduct(packageId, storeProductId, rcProductId) {
  console.log(`      ${C.cyan}→ Attaching ${storeProductId} (${rcProductId}) to package ${packageId}${C.reset}`);
  const res = await rc('POST', `/packages/${packageId}/actions/attach_products`, {
    products: [{ product_id: rcProductId, eligibility_criteria: 'all' }],
  });
  if (!res.ok) {
    if (res.status === 409 || res.status === 422) {
      console.log(`      ${C.yellow}⚠ Product ${storeProductId} may already be attached${C.reset}`);
      return true;
    }
    console.log(`      ${C.red}✗ Failed to attach ${storeProductId}: ${JSON.stringify(res.data)}${C.reset}`);
    return false;
  }
  console.log(`      ${C.green}✓ Attached ${storeProductId}${C.reset}`);
  return true;
}

async function verifyProducts() {
  console.log(`\n${C.bold}Step 1: Verify AI referral products exist in RevenueCat${C.reset}`);
  const products = await listAll('/products');
  const productMap = new Map();
  for (const p of products) {
    const storeId = p.store_identifier ?? p.id;
    productMap.set(storeId, p.id);
  }

  const needed = TIERS.flatMap((tier) => [...tier.monthlyProducts, ...tier.annualProducts]);
  const missing = needed.filter((id) => !productMap.has(id));
  if (missing.length > 0) {
    console.log(`  ${C.yellow}⚠ Missing ${missing.length}/${needed.length} AI referral products:${C.reset}`);
    missing.forEach((id) => console.log(`    - ${id}`));
  }
  console.log(`  ${C.green}✓ ${needed.length - missing.length}/${needed.length} AI referral products found${C.reset}`);
  return productMap;
}

async function verifyEntitlement() {
  console.log(`\n${C.bold}Step 5: Verify ${ENTITLEMENT_ID} entitlement${C.reset}`);
  const entitlements = await listAll('/entitlements');
  const ent = entitlements.find((e) => e.lookup_key === ENTITLEMENT_ID || e.identifier === ENTITLEMENT_ID);
  if (!ent) {
    console.log(`  ${C.red}✗ Entitlement '${ENTITLEMENT_ID}' not found${C.reset}`);
    return false;
  }
  console.log(`  ${C.green}✓ Entitlement '${ENTITLEMENT_ID}' exists${C.reset}`);
  console.log(`  ${C.yellow}⚠ Verify all AI tier products are attached to it in the dashboard${C.reset}`);
  return true;
}

async function main() {
  console.log(`${C.bold}AI Referral Tier Offerings — RevenueCat Setup${C.reset}`);
  if (DRY_RUN) console.log(`${C.yellow}DRY RUN — no changes will be made${C.reset}`);
  console.log(`Project: ${PROJECT_ID}`);
  console.log(`Offering prefix: ${OFFERING_PREFIX}`);
  console.log(`Product prefix: ${PRODUCT_PREFIX}`);
  console.log(`Entitlement: ${ENTITLEMENT_ID}`);

  let productMap = new Map();
  if (!DRY_RUN) productMap = await verifyProducts();

  console.log(`\n${C.bold}Steps 2–4: Create offerings, packages, and attach products${C.reset}`);
  for (const tier of TIERS) {
    console.log(`\n${C.bold}── ${tier.key.toUpperCase()} (${tier.offeringId}) ──${C.reset}`);

    const offeringId = await ensureOffering(tier);
    if (!offeringId) continue;

    const monthlyPkgId = await ensurePackage(offeringId, '$rc_monthly', `${tier.displayName} — Monthly`);
    const annualPkgId = await ensurePackage(offeringId, '$rc_annual', `${tier.displayName} — Annual`);

    if (monthlyPkgId) {
      for (const pid of tier.monthlyProducts) {
        const rcId = productMap.get(pid) ?? pid;
        if (productMap.has(pid) || DRY_RUN) await attachProduct(monthlyPkgId, pid, rcId);
        else console.log(`      ${C.yellow}⚠ Skipping ${pid} (not found in RC)${C.reset}`);
      }
    }

    if (annualPkgId) {
      for (const pid of tier.annualProducts) {
        const rcId = productMap.get(pid) ?? pid;
        if (productMap.has(pid) || DRY_RUN) await attachProduct(annualPkgId, pid, rcId);
        else console.log(`      ${C.yellow}⚠ Skipping ${pid} (not found in RC)${C.reset}`);
      }
    }
  }

  if (!DRY_RUN) await verifyEntitlement();

  console.log(`\n${'─'.repeat(60)}`);
  console.log(`${C.green}${C.bold}✓ AI referral offering setup complete${C.reset}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Set VITE_RC_AI_REFERRAL_OFFERING_PREFIX=${OFFERING_PREFIX}`);
  console.log(`  2. Set VITE_AI_SECURITY_PROTECTION_MONTHLY_PRICE_CENTS / VITE_AI_SECURITY_PROTECTION_ANNUAL_PRICE_CENTS`);
  console.log(`  3. Rebuild the app and verify a referred AI purchase on-device`);
}

main().catch((err) => {
  console.error(`${C.red}Fatal: ${err.message}${C.reset}`);
  process.exit(1);
});
