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

/**
 * Aggregate ERC-20 allowance rows (base44 TokenApproval shape) into counts.
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
 * Aggregate token holdings (base44 WalletToken shape) into a spam count, reusing
 * the SAME classifyToken() the Spam Token Filter uses. Display-only signal — these
 * tokens are never moved; the count is "what the filter would hide".
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
