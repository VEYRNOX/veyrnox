// src/lib/seedVerifyGate.js — Gate sends for deferred-verification wallets.
//
// STATUS: INERT TODAY. isDeferred() is only ever set by the SeedVerification
// quiz, which has no route and no production import, so requiresVerification()
// currently returns false for every wallet. This is written to be correct and
// fail-closed for when the reauth-gated quiz is wired; it is NOT a control
// that protects anyone right now, and nothing should describe it as one.
import { isVerified, isDeferred } from '@/lib/seedVerifyState';

export const VERIFY_THRESHOLD_USD = 50;

/**
 * Does this send need the backup-verification quiz completed first?
 *
 * FAIL CLOSED on an unknown amount (I4). `amountUsd` is null whenever the USD
 * rate is unavailable (SendCrypto computes it as null if sendUsdRate == null).
 * Comparing null/undefined against the threshold yields false, which silently
 * disabled the gate exactly when pricing was broken — and an unpriced send is
 * as likely to be large as small. Unknown value => require verification.
 */
export function requiresVerification(walletId, amountUsd) {
  if (!walletId) return false;
  if (isVerified(walletId)) return false;
  if (!isDeferred(walletId)) return false;
  if (amountUsd == null || !Number.isFinite(amountUsd)) return true;
  return amountUsd >= VERIFY_THRESHOLD_USD;
}
