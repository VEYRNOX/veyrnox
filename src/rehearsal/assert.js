// src/rehearsal/assert.js — Deniability Rehearsal Simulator checks (brief §6).
//
// Pure assertions over the rehearsal snapshot (and, for parity, over the view's
// own source). They encode the deniability rules a coercer actually reasons
// about — D2 (structural indistinguishability), D4 (no credential-type
// disclosure), D7 (no size/existence oracle) — and fail HONEST, fail CLOSED:
// any non-pass surfaces a plain-language leak; an indeterminate input is treated
// as a leak, never downgraded to a pass (I4, LLD decision #4).
//
// The snapshot scans look for app-introduced STRUCTURAL tells: forbidden keys
// anywhere in the snapshot tree. User-content values (wallet/portfolio names)
// are intentionally NOT keyword-scanned — a user may legitimately name a wallet
// "Decoy"; structural indistinguishability concerns the app's own fields.

// Forbidden keys per rule (matched case-insensitively, exact key name). These
// are fields that would encode session cardinality, the unlock credential, or an
// on-disk/size footprint — none of which may appear in the adversary view.
const D2_KEYS = [
  'isDecoy', 'isHidden', 'wasWiped', 'isDuress', 'isStealth',
  'setCount', 'vaultCount', 'hiddenCount', 'decoyCount', 'numSets',
  'siblingSets', 'otherSets', 'hasHidden', 'hasDecoy', 'isReal',
];
const D4_KEYS = [
  'unlockedVia', 'authMethod', 'credentialType', 'unlockMethod',
  'viaPin', 'viaBiometric', 'viaPasskey', 'viaDuress', 'viaPassword',
  'isRealUnlock', 'pinUsed', 'biometricUsed', 'passkeyUsed', 'faceId', 'fingerprint',
];
const D7_KEYS = [
  'vaultBytes', 'blobSize', 'blobBytes', 'ciphertextLength', 'ciphertextBytes',
  'diskFootprint', 'footprintBytes', 'onDiskBytes', 'reservedSlots',
  'setCount', 'vaultCount', 'storedSets',
];

/** Collect dotted paths of every key in `obj` whose name is in `forbidden`. */
function findForbiddenKeys(obj, forbidden, path = '', out = []) {
  if (obj == null || typeof obj !== 'object') return out;
  const lc = new Set(forbidden.map((k) => k.toLowerCase()));
  for (const [key, value] of Object.entries(obj)) {
    const here = path ? `${path}.${key}` : key;
    if (lc.has(key.toLowerCase())) out.push(here);
    if (value && typeof value === 'object') findForbiddenKeys(value, forbidden, here, out);
  }
  return out;
}

function scan(snapshot, keys, rule) {
  // Indeterminate input is a leak (fail closed), never a pass.
  if (snapshot == null || typeof snapshot !== 'object') {
    return { pass: false, rule, evidence: ['indeterminate: snapshot missing'] };
  }
  const offenders = findForbiddenKeys(snapshot, keys);
  return { pass: offenders.length === 0, rule, evidence: offenders };
}

/** D2 — no element/prop/count encodes "number of sets" or implies another set. */
export function cardinalityScan(snapshot) {
  return scan(snapshot, D2_KEYS, 'D2');
}

/** D4 — no field reveals HOW the set was unlocked (real/duress/biometric/PIN). */
export function credentialTypeScan(snapshot) {
  return scan(snapshot, D4_KEYS, 'D4');
}

/** D7 — no value scales with set count or exposes an on-disk footprint. */
export function sizeOracleScan(snapshot) {
  return scan(snapshot, D7_KEYS, 'D7');
}

/**
 * D2 (component parity) — RehearsalView must render the PRODUCTION dashboard, not
 * a fork. A forked renderer would no longer verify the real decoy (LLD #3). Pure
 * over the view's source text so it composes with the source-scanning suite.
 */
export function componentParity(viewSource) {
  if (typeof viewSource !== 'string') {
    return { pass: false, rule: 'D2', evidence: ['indeterminate: view source missing'] };
  }
  const importsProd = /import\s+WalletPortfolioPage\s+from\s+['"][^'"]*pages\/WalletPortfolioPage['"]/.test(viewSource);
  const rendersProd = /<WalletPortfolioPage\b/.test(viewSource);
  // A fork would introduce its own balance/dashboard renderer.
  const fork = viewSource.match(/\b(RehearsalDashboard|MockDashboard|ForkedPortfolio|FakePortfolio)\b/);
  const evidence = [];
  if (!importsProd) evidence.push('does not import the production WalletPortfolioPage');
  if (!rendersProd) evidence.push('does not render <WalletPortfolioPage>');
  if (fork) evidence.push(`forked renderer: ${fork[1]}`);
  return { pass: evidence.length === 0, rule: 'D2', evidence };
}

/**
 * Composite: run the snapshot checks and fail closed. Returns the first failing
 * rule as `leak` (never a silent pass). A missing snapshot is itself a leak (I4).
 * @returns {{pass:boolean, leak:({rule:string,evidence:string[]}|null), results:Array}}
 */
export function runDeniabilityChecks(snapshot) {
  if (snapshot == null || typeof snapshot !== 'object') {
    return { pass: false, leak: { rule: 'indeterminate', evidence: ['snapshot missing'] }, results: [] };
  }
  const results = [cardinalityScan(snapshot), credentialTypeScan(snapshot), sizeOracleScan(snapshot)];
  const failed = results.find((r) => !r.pass);
  return {
    pass: !failed,
    leak: failed ? { rule: failed.rule, evidence: failed.evidence } : null,
    results,
  };
}
