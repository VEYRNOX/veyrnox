// src/rehearsal/__tests__/assert.test.js
//
// Deniability Rehearsal Simulator — assertion checks (build brief §6, §8).
// Each check is a PURE function returning { pass, rule, evidence } over the
// snapshot (D2/D4/D7) or over the view source (component-parity). The composite
// runDeniabilityChecks FAILS CLOSED: a missing/indeterminate snapshot is treated
// as a leak (I4), never a silent pass.
//
// The scans target STRUCTURAL, app-introduced tells (forbidden keys in the
// snapshot tree). User-content values (wallet/portfolio names) are deliberately
// NOT keyword-scanned — a user may legitimately name a wallet "Decoy"; flagging
// that would be a false positive. Structural indistinguishability is about the
// app's own fields, which is exactly what these keys catch.
import { describe, it, expect } from 'vitest';
import {
  cardinalityScan,
  credentialTypeScan,
  sizeOracleScan,
  componentParity,
  runDeniabilityChecks,
} from '../assert.js';

const clean = () => ({
  available: true,
  portfolioName: 'Main',
  total: 3000,
  incomplete: false,
  wallets: [
    { name: 'Main', backedUp: true, assets: [{ symbol: 'ETH', amount: 1.5, usd: 3000, indeterminate: false }] },
    { name: 'Savings', backedUp: false, assets: [{ symbol: 'ETH', amount: 0, usd: 0, indeterminate: false }] },
  ],
});

describe('cardinalityScan (D2) — no "number of sets" / "another set exists" tell', () => {
  it('passes a clean active-set snapshot', () => {
    expect(cardinalityScan(clean())).toMatchObject({ pass: true, rule: 'D2' });
  });

  it('catches a planted session-type flag (isDecoy)', () => {
    const r = cardinalityScan({ ...clean(), isDecoy: true });
    expect(r.pass).toBe(false);
    expect(r.rule).toBe('D2');
    expect(JSON.stringify(r.evidence)).toMatch(/isDecoy/);
  });

  it('catches a nested set-count tell', () => {
    const r = cardinalityScan({ ...clean(), _meta: { vaultCount: 3 } });
    expect(r.pass).toBe(false);
    expect(JSON.stringify(r.evidence)).toMatch(/vaultCount/);
  });
});

describe('credentialTypeScan (D4) — no "how it was unlocked" tell', () => {
  it('passes a clean snapshot', () => {
    expect(credentialTypeScan(clean())).toMatchObject({ pass: true, rule: 'D4' });
  });

  it('catches a credential-type tell (unlockedVia)', () => {
    const r = credentialTypeScan({ ...clean(), unlockedVia: 'duress' });
    expect(r.pass).toBe(false);
    expect(r.rule).toBe('D4');
    expect(JSON.stringify(r.evidence)).toMatch(/unlockedVia/);
  });
});

describe('sizeOracleScan (D7) — no size / on-disk footprint oracle', () => {
  it('passes a clean snapshot', () => {
    expect(sizeOracleScan(clean())).toMatchObject({ pass: true, rule: 'D7' });
  });

  it('catches an on-disk footprint tell (vaultBytes)', () => {
    const r = sizeOracleScan({ ...clean(), vaultBytes: 4096 });
    expect(r.pass).toBe(false);
    expect(r.rule).toBe('D7');
    expect(JSON.stringify(r.evidence)).toMatch(/vaultBytes/);
  });
});

describe('componentParity (D2) — RehearsalView renders the production dashboard', () => {
  it('passes a view that imports and renders the real WalletPortfolioPage', () => {
    const src = `import WalletPortfolioPage from '@/pages/WalletPortfolioPage';\nexport default () => <WalletPortfolioPage />;`;
    expect(componentParity(src)).toMatchObject({ pass: true, rule: 'D2' });
  });

  it('fails a forked / re-implemented renderer', () => {
    const src = `function RehearsalDashboard(){ return <div>balances</div>; }\nexport default () => <RehearsalDashboard />;`;
    const r = componentParity(src);
    expect(r.pass).toBe(false);
    expect(r.rule).toBe('D2');
  });
});

describe('runDeniabilityChecks — composite, fails closed', () => {
  it('passes a clean snapshot with no leak', () => {
    const r = runDeniabilityChecks(clean());
    expect(r.pass).toBe(true);
    expect(r.leak).toBeNull();
  });

  it('fails closed when the snapshot is missing/indeterminate (I4)', () => {
    expect(runDeniabilityChecks(null).pass).toBe(false);
    expect(runDeniabilityChecks(null).leak.rule).toBe('indeterminate');
    expect(runDeniabilityChecks(undefined).pass).toBe(false);
  });

  it('surfaces the failing rule as the leak (never a silent pass)', () => {
    const r = runDeniabilityChecks({ ...clean(), isDecoy: true });
    expect(r.pass).toBe(false);
    expect(r.leak.rule).toBe('D2');
  });
});
