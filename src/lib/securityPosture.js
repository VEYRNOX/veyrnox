// @ts-nocheck
// lib/securityPosture.js — PURE aggregation of EXISTING security signals.
//
// SCOPE: this module is the read-only "posture" layer behind the Security
// Dashboard (S2). It AGGREGATES signals the app already computes — it adds NO
// new detection engine and touches NO key material, network, or vault crypto.
// Every risk classification here is delegated to the modules that already own it:
//
//   • approvals   → wallet-core/evm/approvals.js  summarizeAllowance()  (calldata
//                   decoder; "UNLIMITED" is flagged identically to the confirm
//                   screen and the Token Approvals page).
//   • spam tokens → wallet-core/evm/spam.js        classifyToken()
//   • addresses   → wallet-core/evm/poison.js      screenRecipient() / isLocallyFlagged()
//
// HONESTY CONTRACT (mirrors poison.js/spam.js): these are KNOWN, locally-detectable
// signals only — never a guarantee of safety. Nothing here ever returns or implies
// "safe"/"secure"; it returns counts + reasons the UI frames as "needs review".
// LOCAL-ONLY: pure functions over data the app already holds on-device. No I/O.

import { summarizeAllowance } from '@/wallet-core/evm/approvals';
import { classifyToken } from '@/wallet-core/evm/spam';
import { screenRecipient, isLocallyFlagged } from '@/wallet-core/evm/poison';
import { TIER } from '@/rasp';

/**
 * Aggregate ERC-20 allowance rows (local TokenApproval shape) into counts.
 * Reuses summarizeAllowance() (the same calldata decoder the confirm screen and
 * the Token Approvals page use) so "UNLIMITED" is classified identically. The
 * high-risk rule mirrors TokenApprovals.jsx riskOf(): an unlimited allowance to an
 * UNTRUSTED spender is high; unlimited to a trusted spender is medium (still worth
 * reviewing); a finite allowance is low.
 *
 * @param {Array<object>} rows
 * @returns {{ total:number, active:number, unlimited:number, highRisk:number }}
 */
export function summarizeApprovals(rows = []) {
  const active = rows.filter((r) => r.status === 'active');
  let unlimited = 0;
  let highRisk = 0;
  for (const a of active) {
    const summary = summarizeAllowance({
      rawAmount: a.allowance_raw ?? '0',
      spender: a.spender_address,
      tokenSymbol: a.token_symbol,
      decimals: a.decimals ?? 18,
    });
    if (summary.unlimited) {
      unlimited += 1;
      if (!a.trusted) highRisk += 1; // unlimited + untrusted = high (mirrors riskOf)
    }
  }
  return { total: rows.length, active: active.length, unlimited, highRisk };
}

/**
 * Aggregate token holdings (local WalletToken shape) into a spam count, reusing
 * the SAME classifyToken() that TrustScore uses. Display-only signal — these
 * tokens are never moved; the count reflects how many would be flagged.
 *
 * @param {Array<object>} tokens
 * @returns {{ total:number, spam:number }}
 */
export function summarizeSpamTokens(tokens = []) {
  let spam = 0;
  for (const t of tokens) if (classifyToken(t).spam) spam += 1;
  return { total: tokens.length, spam };
}

/**
 * Screen the EVM addresses the user has actually interacted with (their own tx
 * history / counterparties) for two locally-detectable risks, reusing poison.js:
 *   • flagged    — an address on the LOCAL_FLAGGED set (burn/null/known-bad sinks).
 *   • lookAlike  — a pair of addresses in the user's own history that are visual
 *                  look-alikes (same first/last nibbles, different middle): the
 *                  exact address-poisoning footprint screenRecipient() detects.
 * LOCAL-ONLY: compares strings the app already holds; calls nothing.
 *
 * @param {Array<{to_address?:string, address?:string}>} transactions
 * @returns {{ screened:number, flagged:number, lookAlikePairs:number }}
 */
export function screenAddressHistory(transactions = []) {
  const collected = [];
  for (const t of transactions) {
    if (t?.to_address) collected.push(String(t.to_address));
    if (t?.address) collected.push(String(t.address));
  }
  const uniq = [...new Set(collected)];

  let flagged = 0;
  const pairs = new Set();
  for (const a of uniq) {
    if (isLocallyFlagged(a)) flagged += 1;
    const others = uniq.filter((x) => x !== a);
    const res = screenRecipient(a, others);
    if (res.valid && res.suspicious) {
      for (const la of res.lookAlikes) {
        // Order-independent pair key so (A,B) and (B,A) count once.
        pairs.add([a.toLowerCase(), la.address.toLowerCase()].sort().join('|'));
      }
    }
  }
  return { screened: uniq.length, flagged, lookAlikePairs: pairs.size };
}

/**
 * Build the high-level posture read from already-aggregated signals + the boolean
 * feature toggles. Returns HONEST counts and a list of review items the UI links
 * to existing action pages — it NEVER asserts the wallet is safe/secure. An empty
 * `review` list means "no KNOWN locally-detectable items right now", not "safe".
 *
 * @param {{
 *   approvals: {highRisk:number, unlimited:number},
 *   spam: {spam:number},
 *   addresses: {flagged:number, lookAlikePairs:number},
 *   features: { autoLockNever?:boolean }
 * }} input
 * @returns {{ review: Array<{severity:'high'|'medium', text:string, path:string}> }}
 */
export function buildReviewItems({ approvals, spam, addresses, features = {} }) {
  const review = [];

  if (addresses?.flagged > 0) {
    review.push({
      severity: 'high',
      text: `${addresses.flagged} known-bad address${addresses.flagged > 1 ? 'es' : ''} seen in your activity`,
      path: '/address-checker',
    });
  }
  if (addresses?.lookAlikePairs > 0) {
    review.push({
      severity: 'high',
      text: `${addresses.lookAlikePairs} look-alike address pair${addresses.lookAlikePairs > 1 ? 's' : ''} in your history (poisoning pattern)`,
      path: '/address-checker',
    });
  }
  if (approvals?.highRisk > 0) {
    review.push({
      severity: 'high',
      text: `${approvals.highRisk} unlimited approval${approvals.highRisk > 1 ? 's' : ''} to an untrusted spender`,
      path: '/token-approvals',
    });
  }
  const mediumUnlimited = Math.max(0, (approvals?.unlimited || 0) - (approvals?.highRisk || 0));
  if (mediumUnlimited > 0) {
    review.push({
      severity: 'medium',
      text: `${mediumUnlimited} unlimited approval${mediumUnlimited > 1 ? 's' : ''} worth reviewing`,
      path: '/token-approvals',
    });
  }
  if (spam?.spam > 0) {
    review.push({
      severity: 'medium',
      text: `${spam.spam} suspected spam/scam token${spam.spam > 1 ? 's' : ''} in your wallet`,
      path: '/spam-filter',
    });
  }
  if (features.autoLockNever) {
    review.push({
      severity: 'medium',
      text: 'Auto-lock is set to Never — the wallet will not lock when idle',
      path: '/settings',
    });
  }

  return { review: /** @type {Array<{severity:'medium'|'high', text:string, path:string}>} */ (review) };
}

// ---------------------------------------------------------------------------
// Posture SCORE — pure numeric scoring of device security configuration
// (spec SS9.0.1a). No I/O, no key material, no network.
// ---------------------------------------------------------------------------

/** @typedef {'ALLOW'|'WARN'|'BLOCK'} RaspTier */
/** @typedef {'STRONGBOX'|'SECURE_ENCLAVE'|'TEE'|null} HardwareTier */

/**
 * @typedef {Object} PostureState
 * @property {boolean}      pinCreated
 * @property {number|null}  pinLength
 * @property {boolean}      biometricEnabled
 * @property {RaspTier}     raspTier
 * @property {boolean}      kekActive
 * @property {HardwareTier} hardwareTier
 * @property {boolean}      recoveryPassphraseSet
 * @property {boolean}      shareAWrapped
 * @property {boolean}      shareBUploaded
 * @property {boolean}      shareCExported
 * @property {boolean}      shareCVerified
 * @property {boolean}      wcSpendLimitSet
 * @property {boolean}      wcSessionExpiry
 * @property {boolean}      wcStepUpReauth
 */

/**
 * Score a single boolean/numeric check.
 * @param {string} id
 * @param {boolean} earned
 * @param {number} points
 * @returns {{ id: string, earned: boolean, points: number }}
 */
function item(id, earned, points) {
  return { id, earned, points: earned ? points : 0 };
}

/**
 * Score the authentication dimension (max 20).
 *
 * The shipping native cohort uses an 8-digit PIN, not a 12+ character unlock
 * secret. The posture score must therefore reward meeting the real product
 * minimum, not a legacy web-password threshold that native users cannot ever
 * satisfy. `pinLength` remains numeric so legacy callers can still pass their
 * observed length, but the earned-strength check keys off the current
 * product-wide minimum of 8.
 * @param {PostureState} s
 */
function scoreAuthentication(s) {
  const items = [
    item('pin_created', !!s.pinCreated, 10),
    item('pin_length_meets_min', !!s.pinCreated && typeof s.pinLength === 'number' && Number.isFinite(s.pinLength) && s.pinLength >= 8, 5),
    item('biometric_enrolled', !!s.biometricEnabled, 5),
  ];
  return { score: items.reduce((a, i) => a + i.points, 0), max: 20, items };
}

/**
 * Score the device integrity / RASP dimension (max 25).
 * @param {PostureState} s
 */
function scoreDeviceIntegrity(s) {
  const tier = s.raspTier;
  const pts = tier === TIER.ALLOW ? 25 : tier === TIER.WARN ? 10 : 0;
  const items = [item('rasp_tier', pts > 0, pts)];
  return { score: pts, max: 25, items };
}

/**
 * Score the hardware binding dimension (max 10).
 * KEK active = 5. StrongBox/SecureEnclave = 5, TEE = 3 (mutually exclusive).
 * @param {PostureState} s
 */
function scoreHardwareBinding(s) {
  const kekItem = item('kek_active', !!s.kekActive, 5);

  const isTopTier = !!s.kekActive && (s.hardwareTier === 'STRONGBOX' || s.hardwareTier === 'SECURE_ENCLAVE');
  const isTee = !!s.kekActive && s.hardwareTier === 'TEE';

  const hwItem = isTopTier
    ? item('hardware_top_tier', true, 5)
    : isTee
      ? item('hardware_tee', true, 3)
      : item('hardware_none', false, 0);

  const items = [kekItem, hwItem];
  return { score: items.reduce((a, i) => a + i.points, 0), max: 10, items };
}

/**
 * Score the recovery dimension (max 30).
 * @param {PostureState} s
 */
function scoreRecovery(s) {
  const items = [
    item('recovery_passphrase', !!s.recoveryPassphraseSet, 8),
    item('share_a_wrapped', !!s.recoveryPassphraseSet && !!s.shareAWrapped, 2),
    item('share_b_uploaded', !!s.recoveryPassphraseSet && !!s.shareBUploaded, 8),
    item('share_c_exported', !!s.recoveryPassphraseSet && !!s.shareCExported, 6),
    item('share_c_verified', !!s.recoveryPassphraseSet && !!s.shareCExported && !!s.shareCVerified, 6),
  ];
  return { score: items.reduce((a, i) => a + i.points, 0), max: 30, items };
}

/**
 * Score the session security dimension (max 10).
 * @param {PostureState} s
 */
function scoreSessionSecurity(s) {
  const items = [
    item('wc_spend_limit', !!s.wcSpendLimitSet, 3),
    item('wc_session_expiry', !!s.wcSessionExpiry, 3),
    item('wc_step_up_reauth', !!s.wcStepUpReauth, 4),
  ];
  return { score: items.reduce((a, i) => a + i.points, 0), max: 10, items };
}

// ---------------------------------------------------------------------------
// Color / label thresholds
// ---------------------------------------------------------------------------

/**
 * Map a percentage (0-100) to a hex color.
 * @param {number} pct
 * @returns {string}
 */
export function getPostureColor(pct) {
  if (pct <= 30) return '#E85A5A';
  if (pct <= 50) return '#E8A838';
  if (pct <= 70) return '#D4C44A';
  if (pct <= 85) return '#B8D44A';
  return '#4ADAC2';
}

/**
 * Map a percentage (0-100) to a human label.
 * @param {number} pct
 * @returns {string}
 */
export function getPostureLabel(pct) {
  if (pct <= 30) return 'Critical';
  if (pct <= 50) return 'Weak';
  if (pct <= 70) return 'Fair';
  if (pct <= 85) return 'Strong';
  return 'Complete';
}

// ---------------------------------------------------------------------------
// Banner message — context-aware, keyed to lowest dimension
// ---------------------------------------------------------------------------

const BANNER_MESSAGES = {
  deviceIntegrity: 'Device integrity issue detected — tap to review',
  authentication: 'Strengthen your authentication settings',
  hardwareBinding: 'Hardware protection available — enable for stronger binding',
  recovery: 'No recovery — set up backup to protect against device loss',
  sessionSecurity: 'Tighten WalletConnect session settings',
};

/**
 * Find the lowest-scoring dimension (by percentage) and return a banner message.
 * @param {Record<string, {score:number, max:number}>} dimensions
 * @returns {string}
 */
export function getBannerMessage(dimensions) {
  const lowest = findLowestDimension(dimensions);
  return BANNER_MESSAGES[lowest] || '';
}

/**
 * Find the key of the lowest-scoring dimension by percentage (score/max).
 * Ties broken by iteration order (authentication first).
 * @param {Record<string, {score:number, max:number}>} dimensions
 * @returns {string}
 */
function findLowestDimension(dimensions) {
  let lowestKey = '';
  let lowestPct = Infinity;
  for (const [key, dim] of Object.entries(dimensions)) {
    const pct = dim.max > 0 ? dim.score / dim.max : 1;
    if (pct < lowestPct) {
      lowestPct = pct;
      lowestKey = key;
    }
  }
  return lowestKey;
}

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

/**
 * Compute the full posture score from device security state.
 * Pure function -- no I/O, no side effects.
 *
 * @param {PostureState} state
 * @returns {{
 *   total: number,
 *   percentage: number,
 *   color: string,
 *   label: string,
 *   dimensions: Record<string, {score:number, max:number, items:Array}>,
 *   lowestDimension: string,
 *   bannerMessage: string,
 * }}
 */
export function computePostureScore(state) {
  const dimensions = {
    authentication: scoreAuthentication(state),
    deviceIntegrity: scoreDeviceIntegrity(state),
    hardwareBinding: scoreHardwareBinding(state),
    recovery: scoreRecovery(state),
    sessionSecurity: scoreSessionSecurity(state),
  };

  const total = Object.values(dimensions).reduce((a, d) => a + d.score, 0);
  const percentage = total; // max is 100
  const color = getPostureColor(percentage);
  const label = getPostureLabel(percentage);
  const lowestDimension = findLowestDimension(dimensions);
  const bannerMessage = getBannerMessage(dimensions);

  return { total, percentage, color, label, dimensions, lowestDimension, bannerMessage };
}
