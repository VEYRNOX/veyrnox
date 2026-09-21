// src/lib/__tests__/WalletProvider.decoyReferral.test.js
//
// Audit 2026-08-03 M-3 — a decoy/hidden unlock destroyed the real user's
// pending-referral state.
//
// The pending-referral redemption block runs inside unlock() and was ungated, so
// it executed for EVERY session type. Its first action is clearPendingReferral(),
// a plain localStorage write — performed before the network call, and before any
// check of what kind of session this is.
//
// Sequence that loses real state: the user applies a referral code at wallet
// creation (setPendingReferral), is later coerced into unlocking the decoy, and
// the decoy session silently deletes the pending marker. When they next unlock
// for real, the referral is gone.
//
// NOT a deniability leak — redeemCode() is correctly gated inside referralApi.js
// (I3's "zero backend calls" always held, so nothing observable left the device).
// The defect is that a decoy session mutated REAL persisted state, which is the
// same class as the K-2 referral-tracker finding.
//
// STRUCTURAL assertions over the provider source — the established pattern for
// provider-internal callbacks that are awkward to drive through jsdom (see
// WalletProvider.m6.test.js, WalletProvider.clearActionPassword.test.js,
// WalletProvider.confirmWalletBackup.decoy.test.js).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../WalletProvider.jsx'), 'utf8');

// Isolate the pending-referral block: from the getPendingReferral() read to the
// end of the IIFE that wraps it.
const startIdx = src.indexOf('const pending = getPendingReferral();');
const block = src.slice(Math.max(0, startIdx - 400), startIdx + 2600);

describe('M-3 — a decoy/hidden unlock must not touch real referral state', () => {
  it('the pending-referral block still exists', () => {
    expect(startIdx).toBeGreaterThan(-1);
  });

  it('is gated on the session being primary', () => {
    // `isPrimary` is `!decoy && !hidden`, already computed in unlock() and used
    // to pick the persist-vs-ephemeral branch. Reusing it keeps one definition
    // of "this is the real session" rather than a second, driftable one.
    expect(block).toMatch(/if\s*\(\s*!isPrimary\s*\)\s*return\s*;/);
  });

  it('the guard runs BEFORE clearPendingReferral can wipe the marker', () => {
    // Presence is not enough: clearPendingReferral() is the destructive call and
    // it is the FIRST thing the block used to do.
    const guardIdx = block.search(/if\s*\(\s*!isPrimary\s*\)\s*return\s*;/);
    const clearIdx = block.indexOf('clearPendingReferral()');
    expect(guardIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeGreaterThan(-1);
    expect(guardIdx).toBeLessThan(clearIdx);
  });

  it('clears a pending referral only after redeemCode has succeeded (#2640)', () => {
    const redeemIdx = block.indexOf('await redeemCode(pending)');
    const markIdx = block.indexOf('markRedeemed(pending)');
    const clearAfterSuccessIdx = block.indexOf('clearPendingReferral();', redeemIdx);
    expect(redeemIdx).toBeGreaterThan(-1);
    expect(markIdx).toBeGreaterThan(redeemIdx);
    expect(clearAfterSuccessIdx).toBeGreaterThan(markIdx);
  });

  it('clears a permanent 4xx (never 429) with an honest message (#2640)', () => {
    // Any 4xx except 429 is a server-confirmed rejection — bad format, code
    // not found, duplicate, validation — and cannot recover on retry.
    expect(block).toMatch(/status\s*>=\s*400\s*&&\s*status\s*<\s*500\s*&&\s*status\s*!==\s*429/);
    expect(block).toContain("Referral code couldn't be applied. Check the code and try another one.");
  });

  it('keeps a transient failure (429/5xx/network) for retry, bounded by an attempt cap (#2640)', () => {
    expect(block).toContain("Referral code will be retried when you're connected.");
    expect(block).toContain('bumpPendingReferralAttempts()');
    expect(block).toMatch(/attempts\s*>=\s*REFERRAL_REDEEM_MAX_ATTEMPTS/);
    expect(block).toContain("Referral code couldn't be applied after several tries.");
  });

  it('the retry cap clears the pending code once exhausted, not before', () => {
    const capIdx = block.search(/attempts\s*>=\s*REFERRAL_REDEEM_MAX_ATTEMPTS/);
    const clearAfterCapIdx = block.indexOf('clearPendingReferral();', capIdx);
    const retryMsgIdx = block.indexOf("Referral code will be retried when you're connected.");
    expect(capIdx).toBeGreaterThan(-1);
    // clearPendingReferral() must appear inside the cap-exceeded branch...
    expect(clearAfterCapIdx).toBeGreaterThan(capIdx);
    // ...and strictly BEFORE the still-retrying message, i.e. in the `if`
    // branch of the cap check rather than the `else`.
    expect(clearAfterCapIdx).toBeLessThan(retryMsgIdx);
  });

  it('the guard also precedes every other referral mutator in the block', () => {
    const guardIdx = block.search(/if\s*\(\s*!isPrimary\s*\)\s*return\s*;/);
    for (const fn of ['markRedeemed(', 'applyRedemption(', 'redeemCode(']) {
      const idx = block.indexOf(fn);
      if (idx === -1) continue; // tolerate refactors that drop one
      expect(guardIdx, `${fn} should come after the guard`).toBeLessThan(idx);
    }
  });

  it('isPrimary is still defined as !decoy && !hidden', () => {
    // If this definition ever changes, the guard above changes meaning silently.
    expect(src).toMatch(/const\s+isPrimary\s*=\s*!decoy\s*&&\s*!hidden\s*;/);
  });
});
