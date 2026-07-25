// src/lib/seedVerifyGate.js — Gate sends for deferred-verification wallets.
import { isVerified, isDeferred } from '@/lib/seedVerifyState';

export const VERIFY_THRESHOLD_USD = 50;

export function requiresVerification(walletId, amountUsd) {
  if (!walletId) return false;
  if (isVerified(walletId)) return false;
  if (!isDeferred(walletId)) return false;
  return amountUsd >= VERIFY_THRESHOLD_USD;
}
