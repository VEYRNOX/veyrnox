import { describe, expect, it } from 'vitest';

import { deriveSigningPolicy, POLICY_DECISION } from '@/policy/signingPolicy.js';

describe('deriveSigningPolicy', () => {
  it('stays pending while the shared verdict is pending', () => {
    const policy = deriveSigningPolicy({ verdict: { status: 'pending' } });
    expect(policy.decision).toBe(POLICY_DECISION.PENDING);
    expect(policy.canProceed).toBe(false);
  });

  it('blocks when the presign gate says the signer is unreachable', () => {
    const policy = deriveSigningPolicy({
      verdict: { status: 'ready', level: 'BLOCK' },
      presign: { signerReachable: false },
    });
    expect(policy.decision).toBe(POLICY_DECISION.BLOCK);
    expect(policy.canProceed).toBe(false);
  });

  it('requires acknowledgement before proceedAllowed becomes true', () => {
    const policy = deriveSigningPolicy({
      verdict: { status: 'ready', level: 'RISK' },
      presign: { signerReachable: true, proceedAllowed: false },
      acknowledged: false,
    });
    expect(policy.decision).toBe(POLICY_DECISION.ACKNOWLEDGE);
    expect(policy.requiresAcknowledgement).toBe(true);
  });

  it('requires biometric step-up after acknowledgement on warn-tier devices', () => {
    const policy = deriveSigningPolicy({
      verdict: { status: 'ready', level: 'RISK' },
      presign: { signerReachable: true, proceedAllowed: true },
      acknowledged: true,
      raspNeedsBio: true,
      biometricCleared: false,
    });
    expect(policy.decision).toBe(POLICY_DECISION.STEP_UP);
    expect(policy.requiresBiometric).toBe(true);
  });

  it('is allow once active checks have settled and current friction is satisfied', () => {
    const policy = deriveSigningPolicy({
      verdict: {
        status: 'ready',
        level: 'RISK',
        contributors: [{ id: 'runtime', level: 'CAUTION' }],
      },
      presign: { signerReachable: true, proceedAllowed: true },
      acknowledged: true,
      raspNeedsBio: true,
      biometricCleared: true,
    });
    expect(policy.decision).toBe(POLICY_DECISION.ALLOW);
    expect(policy.canProceed).toBe(true);
    expect(policy.recommendHardwareSigner).toBe(true);
  });

  it('escalates stacked first-time + TIP + degraded-runtime risk before acknowledgement', () => {
    const policy = deriveSigningPolicy({
      verdict: {
        status: 'ready',
        level: 'RISK',
        owner: 'composite',
        contributors: [
          { id: 'tip', level: 'RISK' },
          { id: 'review', level: 'INFO' },
          { id: 'runtime', level: 'CAUTION' },
        ],
      },
      presign: { signerReachable: true, proceedAllowed: false },
      acknowledged: false,
    });
    expect(policy.decision).toBe(POLICY_DECISION.ACKNOWLEDGE);
    expect(policy.actionLabel).toBe('Escalated review');
    expect(policy.reason).toMatch(/first-time recipient/i);
    expect(policy.recommendHardwareSigner).toBe(true);
  });

  it('requires biometric step-up for the stacked risk profile even without native warn-bio', () => {
    const policy = deriveSigningPolicy({
      verdict: {
        status: 'ready',
        level: 'RISK',
        owner: 'composite',
        contributors: [
          { id: 'tip', level: 'RISK' },
          { id: 'review', level: 'INFO' },
          { id: 'runtime', level: 'CAUTION' },
        ],
      },
      presign: { signerReachable: true, proceedAllowed: true },
      acknowledged: true,
      raspNeedsBio: false,
      biometricCleared: false,
    });
    expect(policy.decision).toBe(POLICY_DECISION.STEP_UP);
    expect(policy.requiresBiometric).toBe(true);
    expect(policy.actionLabel).toBe('Verify and re-check');
  });
});
