// lib/__tests__/sendGate.test.js
//
// Pins the ordered pre-sign enforcement the Send chokepoint obeys (defense-in-
// depth, re-asserted at signing time). Each gate must BITE when tripped, the
// messages must match what the signer throws, and an earlier gate must always win
// over a later one (so a tripped lock is never masked by a downstream allow).

import { describe, it, expect } from 'vitest';
import { evaluateSendGate, SEND_GATE } from '../sendGate.js';

// A fully-clearing send: every gate satisfied. Individual tests trip one field.
const PASS = Object.freeze({
  canSend: true,
  devUngated: false,
  currency: 'ETH',
  isUnlocked: true,
  demo: false,
  reauthRequired: false,
  limit: { blocked: false, reasons: [] },
  limitAck: false,
  riskScoreFailed: false,
  presign: { proceedAllowed: true, signerReachable: true },
  blockedByApproval: false,
});

describe('evaluateSendGate — the allow path', () => {
  it('allows when every gate is satisfied', () => {
    expect(evaluateSendGate(PASS)).toEqual({ allowed: true, code: SEND_GATE.ALLOW, message: null });
  });

  it('fails closed (does not throw, not allowed) on empty / missing input', () => {
    const r = evaluateSendGate();
    expect(r.allowed).toBe(false);
    expect(r.code).toBe(SEND_GATE.NOT_SENDABLE); // defaults: canSend=false, devUngated=false
  });
});

describe('gate 2/3 — capability (canSend / dev ungate)', () => {
  it('blocks a non-live asset', () => {
    const r = evaluateSendGate({ ...PASS, canSend: false, currency: 'USDC' });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe(SEND_GATE.NOT_SENDABLE);
    expect(r.message).toBe('Sending is not yet enabled for USDC.');
  });

  it('the dev testnet ungate relaxes ONLY this gate (status unchanged elsewhere)', () => {
    const r = evaluateSendGate({ ...PASS, canSend: false, devUngated: true });
    expect(r.allowed).toBe(true);
  });

  it('a live asset passes the capability gate without the ungate', () => {
    expect(evaluateSendGate({ ...PASS, canSend: true, devUngated: false }).allowed).toBe(true);
  });

  it('falls back to "this asset" when currency is absent', () => {
    const r = evaluateSendGate({ ...PASS, canSend: false, currency: undefined });
    expect(r.message).toBe('Sending is not yet enabled for this asset.');
  });
});

describe('gate 5 — vault unlocked', () => {
  it('blocks when locked', () => {
    const r = evaluateSendGate({ ...PASS, isUnlocked: false });
    expect(r.code).toBe(SEND_GATE.LOCKED);
    expect(r.message).toBe('Unlock your wallet to send');
  });
});

describe('gate 6 — step-up re-auth', () => {
  it('blocks when re-auth is pending', () => {
    const r = evaluateSendGate({ ...PASS, reauthRequired: true });
    expect(r.code).toBe(SEND_GATE.REAUTH);
    expect(r.message).toBe('Re-enter your PIN or password to authorise this send.');
  });

  it('is exempt in demo mode (no vault)', () => {
    expect(evaluateSendGate({ ...PASS, demo: true, reauthRequired: true }).allowed).toBe(true);
  });
});

describe('gate 7 — spend limits', () => {
  it('blocks a per-transaction breach with the per-tx message', () => {
    const r = evaluateSendGate({
      ...PASS,
      limit: { blocked: true, reasons: [{ kind: 'per_tx', limitUSD: 500 }] },
    });
    expect(r.code).toBe(SEND_GATE.LIMIT);
    expect(r.message).toBe('This send exceeds your per-transaction spending limit.');
  });

  it('blocks a daily breach with the daily message + formatted cap', () => {
    const r = evaluateSendGate({
      ...PASS,
      limit: { blocked: true, reasons: [{ kind: 'daily', limitUSD: 10000 }] },
    });
    expect(r.code).toBe(SEND_GATE.LIMIT);
    expect(r.message).toBe(
      "Daily spending limit reached: this send would put today's total over your $10,000 cap.",
    );
  });

  it('prefers the daily message when both per-tx and daily are breached', () => {
    const r = evaluateSendGate({
      ...PASS,
      limit: {
        blocked: true,
        reasons: [
          { kind: 'per_tx', limitUSD: 500 },
          { kind: 'daily', limitUSD: 2500 },
        ],
      },
    });
    expect(r.message).toContain('Daily spending limit reached');
  });

  it('allows a breach once acknowledged', () => {
    expect(
      evaluateSendGate({
        ...PASS,
        limit: { blocked: true, reasons: [{ kind: 'daily', limitUSD: 10000 }] },
        limitAck: true,
      }).allowed,
    ).toBe(true);
  });
});

describe('gate 8a — risk score must compute (fail closed)', () => {
  it('blocks when the risk score threw', () => {
    const r = evaluateSendGate({ ...PASS, riskScoreFailed: true, presign: null });
    expect(r.code).toBe(SEND_GATE.RISK_SCORE_FAILED);
    expect(r.message).toBe('Could not complete the pre-sign risk checks — not signing.');
  });
});

describe('gate 8b — composite pre-sign verdict', () => {
  it('hard-BLOCKs (no override) when the signer is unreachable', () => {
    const r = evaluateSendGate({
      ...PASS,
      presign: { proceedAllowed: false, signerReachable: false },
    });
    expect(r.code).toBe(SEND_GATE.RISK_BLOCK);
    expect(r.message).toBe('Signing is turned off: this device did not pass a runtime safety check.');
  });

  it('asks for CONFIRM when reachable but not yet acknowledged', () => {
    const r = evaluateSendGate({
      ...PASS,
      presign: { proceedAllowed: false, signerReachable: true },
    });
    expect(r.code).toBe(SEND_GATE.RISK_CONFIRM);
    expect(r.message).toBe('Confirm the risk warning before signing.');
  });

  it('allows when the verdict permits proceeding', () => {
    expect(
      evaluateSendGate({ ...PASS, presign: { proceedAllowed: true, signerReachable: true } }).allowed,
    ).toBe(true);
  });

  it('ignores a null presign (e.g. non-EVM send, not scored)', () => {
    expect(evaluateSendGate({ ...PASS, presign: null }).allowed).toBe(true);
  });
});

describe('gate 8c — BTC pre-sign risk acknowledgement (M-2)', () => {
  it('blocks an unacknowledged high-severity BTC risk as RISK_CONFIRM', () => {
    const r = evaluateSendGate({ ...PASS, presign: null, btcRiskBlocked: true });
    expect(r.allowed).toBe(false);
    expect(r.code).toBe(SEND_GATE.RISK_CONFIRM);
    expect(r.message).toBe('Confirm the risk warning before signing.');
  });
  it('allows once the BTC risk is acknowledged (btcRiskBlocked false)', () => {
    const r = evaluateSendGate({ ...PASS, presign: null, btcRiskBlocked: false });
    expect(r.allowed).toBe(true);
  });
});

describe('gate 9 — unlimited approval acknowledgement', () => {
  it('blocks an unacknowledged unlimited approval', () => {
    const r = evaluateSendGate({ ...PASS, blockedByApproval: true });
    expect(r.code).toBe(SEND_GATE.APPROVAL);
    expect(r.message).toBe('Confirm the unlimited-approval warning before signing.');
  });
  it('the BTC risk gate (8c) outranks approval', () => {
    const r = evaluateSendGate({ ...PASS, presign: null, btcRiskBlocked: true, blockedByApproval: true });
    expect(r.code).toBe(SEND_GATE.RISK_CONFIRM);
  });
});

describe('ordering — the first tripped gate wins', () => {
  it('capability (2/3) outranks every later gate', () => {
    const r = evaluateSendGate({
      canSend: false,
      devUngated: false,
      currency: 'USDC',
      isUnlocked: false,
      reauthRequired: true,
      limit: { blocked: true, reasons: [{ kind: 'daily', limitUSD: 1 }] },
      riskScoreFailed: true,
      presign: { proceedAllowed: false, signerReachable: false },
      blockedByApproval: true,
    });
    expect(r.code).toBe(SEND_GATE.NOT_SENDABLE);
  });

  it('lock (5) outranks re-auth, limits, risk and approval', () => {
    const r = evaluateSendGate({
      ...PASS,
      isUnlocked: false,
      reauthRequired: true,
      limit: { blocked: true, reasons: [{ kind: 'per_tx', limitUSD: 1 }] },
      riskScoreFailed: true,
      blockedByApproval: true,
    });
    expect(r.code).toBe(SEND_GATE.LOCKED);
  });

  it('re-auth (6) outranks limits, risk and approval', () => {
    const r = evaluateSendGate({
      ...PASS,
      reauthRequired: true,
      limit: { blocked: true, reasons: [{ kind: 'daily', limitUSD: 1 }] },
      riskScoreFailed: true,
      blockedByApproval: true,
    });
    expect(r.code).toBe(SEND_GATE.REAUTH);
  });

  it('limits (7) outrank risk and approval', () => {
    const r = evaluateSendGate({
      ...PASS,
      limit: { blocked: true, reasons: [{ kind: 'per_tx', limitUSD: 1 }] },
      riskScoreFailed: true,
      presign: { proceedAllowed: false, signerReachable: false },
      blockedByApproval: true,
    });
    expect(r.code).toBe(SEND_GATE.LIMIT);
  });

  it('risk-score failure (8a) outranks the composite verdict and approval', () => {
    const r = evaluateSendGate({
      ...PASS,
      riskScoreFailed: true,
      presign: { proceedAllowed: false, signerReachable: false },
      blockedByApproval: true,
    });
    expect(r.code).toBe(SEND_GATE.RISK_SCORE_FAILED);
  });

  it('the composite verdict (8b) outranks approval', () => {
    const r = evaluateSendGate({
      ...PASS,
      presign: { proceedAllowed: false, signerReachable: true },
      blockedByApproval: true,
    });
    expect(r.code).toBe(SEND_GATE.RISK_CONFIRM);
  });
});
