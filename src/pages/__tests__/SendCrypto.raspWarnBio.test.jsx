// B5 — RASP WARN biometric re-confirm.
//
// `degrade()` has signalled `requiresBiometric: true` on WARN conditions (ROOTED,
// INTEGRITY_UNAVAILABLE) since the initial RASP implementation, but nothing consumed
// the field — the WARN path only required a checkbox acknowledge. B5 wires the field:
// on native, a WARN verdict now also demands a biometric verify before the send
// button becomes active. `sendTx.mutate()` re-asserts the same condition at the
// enforcement chokepoint (fail-closed, I4).
//
// Structural pins (source-text) are used only for invariants that cannot be tested
// behaviourally without rendering the full Send stack. Behavioural assertions drive
// the real compose-gate + degrade modules so regressions in logic (not just naming)
// are caught.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { composeGate, DECISION } from '@/sign-gate/compose.js';
import { degrade } from '@/rasp/degrade.js';
import { CONDITION, TIER } from '@/rasp/conditions.js';
import { LEVEL } from '@/risk/levels.js';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../SendCrypto.jsx'), 'utf8');

// ── Structural pins ─────────────────────────────────────────────────────────

describe('SendCrypto.jsx — B5 structural pins', () => {
  it('tracks biometric confirmation state for RASP WARN (raspWarnBioOk)', () => {
    expect(src).toMatch(/raspWarnBioOk/);
  });

  it('derives raspNeedsBio from requiresBiometric AND isNativePlatform (no bio on web)', () => {
    expect(src).toMatch(/raspNeedsBio/);
    expect(src).toMatch(/requiresBiometric/);
    const bioIdx = src.indexOf('raspNeedsBio');
    const bioRegion = src.slice(bioIdx, bioIdx + 300);
    expect(bioRegion).toMatch(/isNativePlatform/);
  });

  it('derives blockedByRaspBio from raspNeedsBio and !raspWarnBioOk', () => {
    expect(src).toMatch(/blockedByRaspBio/);
    const blockIdx = src.indexOf('blockedByRaspBio');
    const blockRegion = src.slice(blockIdx, blockIdx + 150);
    expect(blockRegion).toMatch(/raspNeedsBio/);
    expect(blockRegion).toMatch(/raspWarnBioOk/);
  });

  it('threads blockedByRaspBio into the Confirm & Send button disabled prop', () => {
    const buttonIdx = src.indexOf('Confirm &amp; Send');
    expect(buttonIdx).toBeGreaterThan(-1);
    const buttonRegion = src.slice(Math.max(0, buttonIdx - 800), buttonIdx);
    expect(buttonRegion).toMatch(/blockedByRaspBio/);
  });

  it('renders the bio-verify button OUTSIDE the presign.owner branch (C-1 fix)', () => {
    // The bio button must be a sibling of the banner ternary, not nested inside
    // the owner==='rasp' branch. If it were inside, the WARN+RISK compose case
    // (owner='tx') would permanently block the send with no affordance to clear it.
    const bannerTernaryEnd = src.indexOf('<RiskVerdictBanner');
    expect(bannerTernaryEnd).toBeGreaterThan(-1);
    // The bio button (verifyBiometric2fa call) must appear AFTER RiskVerdictBanner
    const bioCallIdx = src.indexOf('await verifyBiometric2fa()');
    expect(bioCallIdx).toBeGreaterThan(bannerTernaryEnd);
  });

  it('bio button carries focus-visible outline (A-1 fix)', () => {
    const bioCallIdx = src.indexOf('await verifyBiometric2fa()');
    const buttonOpen = src.lastIndexOf('<button', bioCallIdx);
    const buttonRegion = src.slice(buttonOpen, bioCallIdx);
    expect(buttonRegion).toMatch(/focus-visible:/);
  });

  it('sets raspWarnBioOk(true) only on bio success (fail-closed: error/cancel stays false)', () => {
    const bioCallIdx = src.indexOf('await verifyBiometric2fa()');
    expect(bioCallIdx).toBeGreaterThan(-1);
    const bioRegion = src.slice(Math.max(0, bioCallIdx - 300), bioCallIdx + 300);
    expect(bioRegion).toMatch(/try/);
    expect(bioRegion).toMatch(/catch/);
    expect(bioRegion).toMatch(/setRaspWarnBioOk\(\s*true\s*\)/);
  });

  it('has a mutationFn enforcement check for RASP_BIO_REQUIRED (fail-closed at sign time)', () => {
    expect(src).toMatch(/RASP_BIO_REQUIRED/);
  });

  it('resets raspWarnBioOk when send inputs change (stale ack must not carry)', () => {
    const resetIdx = src.indexOf('setRaspWarnBioOk(false)');
    expect(resetIdx).toBeGreaterThan(-1);
  });
});

// ── Behavioural: compose-gate WARN+RISK produces owner='tx' (C-1 root cause) ─

describe('composeGate — WARN+RISK lattice case (owner=tx, C-1 root cause)', () => {
  it('WARN+RISK yields decision=confirm, owner=tx, signerReachable=true', () => {
    const result = composeGate(TIER.WARN, LEVEL.RISK);
    expect(result.decision).toBe(DECISION.CONFIRM);
    expect(result.owner).toBe('tx');
    expect(result.signerReachable).toBe(true);
  });

  it('WARN+RISK is NOT a block — raspNeedsBio must stay active (presign.decision !== block)', () => {
    // raspNeedsBio is gated on decision !== 'block'. If this lattice case ever
    // returned BLOCK the bio gate would silently drop — verify it stays CONFIRM.
    const result = composeGate(TIER.WARN, LEVEL.RISK);
    expect(result.decision).not.toBe(DECISION.BLOCK);
  });

  it('WARN+OK and WARN+INFO yield owner=rasp (bio button appears in RASP banner path)', () => {
    expect(composeGate(TIER.WARN, LEVEL.OK).owner).toBe('rasp');
    expect(composeGate(TIER.WARN, LEVEL.INFO).owner).toBe('rasp');
  });
});

// ── Behavioural: degrade() sets requiresBiometric on WARN-tier artifacts ────

describe('degrade() — requiresBiometric is set on WARN tiers that trigger B5', () => {
  it('ROOTED condition yields WARN and requiresBiometric: true', () => {
    const artifact = degrade(CONDITION.ROOTED);
    expect(artifact.tier).toBe(TIER.WARN);
    expect(artifact.requiresBiometric).toBe(true);
  });

  it('INTEGRITY_UNAVAILABLE condition yields WARN and requiresBiometric: true', () => {
    const artifact = degrade(CONDITION.INTEGRITY_UNAVAILABLE);
    expect(artifact.tier).toBe(TIER.WARN);
    expect(artifact.requiresBiometric).toBe(true);
  });

  it('CLEAN condition does NOT set requiresBiometric', () => {
    const artifact = degrade(CONDITION.CLEAN);
    expect(artifact.tier).toBe(TIER.ALLOW);
    expect(artifact.requiresBiometric).toBeFalsy();
  });

  it('HOOKED condition yields BLOCK and does NOT set requiresBiometric (block overrides bio gate)', () => {
    const artifact = degrade(CONDITION.HOOKED);
    expect(artifact.tier).toBe(TIER.BLOCK);
    expect(artifact.requiresBiometric).toBeFalsy();
  });
});
