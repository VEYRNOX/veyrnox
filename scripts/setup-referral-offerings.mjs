#!/usr/bin/env node
// setup-referral-offerings.mjs — Creates the 4 tier-based referral offerings
// in RevenueCat via their v2 REST API.
//
// PREREQUISITES:
//   1. Store products must already exist in App Store Connect + Google Play Console
//      (see docs/iap-referral-tier-setup-checklist.md Tasks 1 & 2).
//   2. Store products must be synced into RevenueCat (they appear under Products).
//   3. All 8 products must be attached to the `safety_plus` entitlement.
//
// RUN:
//   REVENUECAT_V2_SECRET_KEY=sk_xxx REVENUECAT_PROJECT_ID=proj_xxx node scripts/setup-referral-offerings.mjs
//
// WHAT IT DOES (idempotent — safe to re-run):
//   For each tier (bronze, silver, gold, platinum):
//     1. Creates offering `referral-{tier}` (skips if exists)
//     2. Creates $rc_monthly + $rc_annual packages on it (skips if exist)
//     3. Attaches the tier-specific store products to each package (skips if attached)
//
// DRY RUN:
//   DRY_RUN=1 REVENUECAT_V2_SECRET_KEY=sk_xxx REVENUECAT_PROJECT_ID=proj_xxx node scripts/setup-referral-offerings.mjs

const SECRET_KEY = process.env.REVENUECAT_V2_SECRET_KEY;
const PROJECT_ID = process.env.REVENUECAT_PROJECT_ID;
const DRY_RUN = process.env.DRY_RUN === '1';

if (!SECRET_KEY || !PROJECT_ID) {
  console.error('Missing REVENUECAT_V2_SECRET_KEY or REVENUECAT_PROJECT_ID');
  console.error('Run: REVENUECAT_V2_SECRET_KEY=sk_xxx REVENUECAT_PROJECT_ID=proj_xxx node scripts/setup-referral-offerings.mjs');
  process.exit(1);
}

const BASE = `https://api.revenuecat.com/v2/projects/${PROJECT_ID}`;
const HEADERS = {
  'Authorization': `Bearer ${SECRET_KEY}`,
  'Content-Type': 'application/json',
  'Accept': 'application/json',
};

const C = { reset: '\x1b[0m', red: '\x1b[31m', green: '\x1b[32m', yellow: '\x1b[33m', dim: '\x1b[2m', bold: '\x1b[1m', cyan: '\x1b[36m' };

// ── Tier definitions ────────────────────────────────────────────────────────
// Product IDs must match what exists in RevenueCat (including the Google Play
// base plan suffix after the colon). Offering IDs must match TIER_OFFERING_ID
// in src/lib/referral.js.
//
// NOTE: Bronze and Silver annuals use `:annual-1` because the first base plan
// was created with the wrong billing period (Monthly) and the corrected plan
// got the `-1` suffix. Gold and Platinum got it right on the first try (`:annual`).
const TIERS = [
  {
    key: 'bronze',
    offeringId: 'referral-bronze',
    displayName: 'Referral Bronze (2.5% off)',
    monthlyProduct: 'safety_plus_monthly_bronze:monthly',
    annualProduct: 'safety_plus_annual_bronze:annual-1',
  },
  {
    key: 'silver',
    offeringId: 'referral-silver',
    displayName: 'Referral Silver (5% off)',
    monthlyProduct: 'safety_plus_monthly_silver:monthly',
    annualProduct: 'safety_plus_annual_silver:annual-1',
  },
  {
    key: 'gold',
    offeringId: 'referral-gold',
    displayName: 'Referral Gold (10% off)',
    monthlyProduct: 'safety_plus_monthly_gold:monthly',
    annualProduct: 'safety_plus_annual_gold:annual',
  },
  {
    key: 'platinum',
    offeringId: 'referral-platinum',
    displayName: 'Referral Platinum (15% off)',
    monthlyProduct: 'safety_plus_monthly_platinum:monthly',
    annualProduct: 'safety_plus_annual_platinum:annual',
  },
];

// ── API helpers ─────────────────────────────────────────────────────────────
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
  const { ok, data } = await rc('GET', path);
  if (!ok) return [];
  return data?.items ?? data ?? [];
}

// ── Step 1: Verify store products exist in RevenueCat ───────────────────────
async function verifyProducts() {
  console.log(`\n${C.bold}Step 1: Verify store products exist in RevenueCat${C.reset}`);
  const products = await listAll('/products');

  // Build map: store_identifier → RC product id
  const productMap = new Map();
  for (const p of products) {
    const storeId = p.store_identifier ?? p.id;
    productMap.set(storeId, p.id);
  }

  const needed = TIERS.flatMap(t => [t.monthlyProduct, t.annualProduct]);
  const missing = needed.filter(id => !productMap.has(id));

  if (missing.length > 0) {
    console.log(`  ${C.red}✗ Missing products in RevenueCat (create in stores first, then sync):${C.reset}`);
    missing.forEach(id => console.log(`    - ${id}`));
    console.log(`\n  ${C.yellow}Products found:${C.reset} ${[...productMap.keys()].join(', ') || '(none)'}`);
    return null;
  }

  console.log(`  ${C.green}✓ All ${needed.length} tier products found in RevenueCat${C.reset}`);
  return productMap;
}

// ── Step 2: Create offerings ────────────────────────────────────────────────
async function findOfferingByLookupKey(lookupKey) {
  const offerings = await listAll('/offerings');
  const match = offerings.find(o => o.lookup_key === lookupKey);
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
    if (res.status === 409) {
      console.log(`  ${C.yellow}⚠ Offering ${tier.offeringId} already exists (409)${C.reset}`);
      const id = await findOfferingByLookupKey(tier.offeringId);
      return id ?? tier.offeringId;
    }
    console.log(`  ${C.red}✗ Failed to create offering ${tier.offeringId}: ${JSON.stringify(res.data)}${C.reset}`);
    return null;
  }
  console.log(`  ${C.green}✓ Created offering ${tier.offeringId}${C.reset}`);
  return res.data.id ?? tier.offeringId;
}

// ── Step 3: Create packages on each offering ────────────────────────────────
async function ensurePackage(offeringId, packageId, displayName) {
  const packages = await listAll(`/offerings/${offeringId}/packages`);
  const existing = packages.find(p => p.lookup_key === packageId || p.identifier === packageId);
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
    if (res.status === 409) {
      console.log(`    ${C.yellow}⚠ Package ${packageId} already exists (409)${C.reset}`);
      return packageId;
    }
    console.log(`    ${C.red}✗ Failed to create package ${packageId}: ${JSON.stringify(res.data)}${C.reset}`);
    return null;
  }
  console.log(`    ${C.green}✓ Created package ${packageId}${C.reset}`);
  return res.data.id ?? packageId;
}

// ── Step 4: Attach products to packages ─────────────────────────────────────
async function attachProduct(offeringId, packageId, storeProductId, rcProductId) {
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

// ── Step 5: Verify entitlement attachments ──────────────────────────────────
async function verifyEntitlement() {
  console.log(`\n${C.bold}Step 5: Verify safety_plus entitlement${C.reset}`);
  const entitlements = await listAll('/entitlements');
  const sp = entitlements.find(e => e.lookup_key === 'safety_plus' || e.identifier === 'safety_plus');
  if (!sp) {
    console.log(`  ${C.red}✗ Entitlement 'safety_plus' not found${C.reset}`);
    console.log(`  ${C.yellow}Create it in the RevenueCat dashboard and attach all tier products to it${C.reset}`);
    return false;
  }
  console.log(`  ${C.green}✓ Entitlement 'safety_plus' exists${C.reset}`);
  console.log(`  ${C.yellow}⚠ Verify all 8 tier products are attached to it in the dashboard${C.reset}`);
  return true;
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`${C.bold}Referral Tier Offerings — RevenueCat Setup${C.reset}`);
  if (DRY_RUN) console.log(`${C.yellow}DRY RUN — no changes will be made${C.reset}`);
  console.log(`Project: ${PROJECT_ID}`);

  // Step 1: verify products and build store_identifier → RC id map
  let productMap = new Map();
  if (!DRY_RUN) {
    productMap = await verifyProducts();
    if (!productMap) {
      console.log(`\n${C.red}${C.bold}BLOCKED:${C.reset} Create the store products first (see docs/iap-referral-tier-setup-checklist.md).`);
      console.log('Then sync them into RevenueCat and re-run this script.');
      process.exit(1);
    }
  }

  // Steps 2–4: for each tier, create offering → packages → attach products
  console.log(`\n${C.bold}Steps 2–4: Create offerings, packages, and attach products${C.reset}`);
  let allOk = true;

  for (const tier of TIERS) {
    console.log(`\n${C.bold}── ${tier.key.toUpperCase()} (${tier.offeringId}) ──${C.reset}`);

    const offeringId = await ensureOffering(tier);
    if (!offeringId) { allOk = false; continue; }

    const monthlyPkgId = await ensurePackage(offeringId, '$rc_monthly', `${tier.displayName} — Monthly`);
    const annualPkgId = await ensurePackage(offeringId, '$rc_annual', `${tier.displayName} — Annual`);

    const monthlyRcId = productMap.get(tier.monthlyProduct) ?? tier.monthlyProduct;
    const annualRcId = productMap.get(tier.annualProduct) ?? tier.annualProduct;

    if (monthlyPkgId) await attachProduct(offeringId, monthlyPkgId, tier.monthlyProduct, monthlyRcId);
    if (annualPkgId) await attachProduct(offeringId, annualPkgId, tier.annualProduct, annualRcId);
  }

  // Step 5: check entitlement
  if (!DRY_RUN) await verifyEntitlement();

  // Summary
  console.log(`\n${'─'.repeat(60)}`);
  if (allOk) {
    console.log(`${C.green}${C.bold}✓ All 4 tier offerings configured${C.reset}`);
    console.log(`\nNext steps:`);
    console.log(`  1. Verify in RevenueCat dashboard that each offering has 2 packages`);
    console.log(`  2. Attach all 8 tier products to the 'safety_plus' entitlement`);
    console.log(`  3. Run: npm run check:iap-preflight (with API keys set)`);
    console.log(`  4. Rebuild the app and test a sandbox purchase with a referral code`);
  } else {
    console.log(`${C.red}${C.bold}✗ Some steps failed — check output above${C.reset}`);
  }
}

main().catch(err => {
  console.error(`${C.red}Fatal: ${err.message}${C.reset}`);
  process.exit(1);
});
