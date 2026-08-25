// @ts-nocheck
// src/policy/signingPolicy.js
//
// Shared signing-policy mapper for the transaction-intelligence UI.
//
// This is a pure presentation-policy layer: it does not replace the audited
// chokepoint gates in SendCrypto/sendGate. It explains what the current verdict
// demands from the user right now.

export const POLICY_DECISION = Object.freeze({
  PENDING: 'PENDING',
  ALLOW: 'ALLOW',
  ACKNOWLEDGE: 'ACKNOWLEDGE',
  STEP_UP: 'STEP_UP',
  BLOCK: 'BLOCK',
});

function hasContributor(verdict, id, level) {
  return verdict?.contributors?.some((c) => c.id === id && c.level === level);
}

/**
 * @param {object} opts
 * @param {object|null} [opts.verdict]
 * @param {object|null} [opts.presign]
 * @param {boolean} [opts.acknowledged]
 * @param {boolean} [opts.raspNeedsBio]
 * @param {boolean} [opts.biometricCleared]
 * @returns {{
 *   decision: string,
 *   canProceed: boolean,
 *   requiresAcknowledgement: boolean,
 *   requiresBiometric: boolean,
 *   actionLabel: string,
 *   reason: string,
 *   recommendHardwareSigner: boolean,
 * }}
 */
export function deriveSigningPolicy({
  verdict = null,
  presign = null,
  acknowledged = false,
  raspNeedsBio = false,
  biometricCleared = false,
} = {}) {
  const stackedRisk = verdict?.owner === 'composite'
    || (
      verdict?.level === 'RISK'
      && hasContributor(verdict, 'tip', 'RISK')
      && hasContributor(verdict, 'review', 'INFO')
      && hasContributor(verdict, 'runtime', 'CAUTION')
    );

  if (verdict?.status === 'pending') {
    return {
      decision: POLICY_DECISION.PENDING,
      canProceed: false,
      requiresAcknowledgement: false,
      requiresBiometric: false,
      actionLabel: 'Wait for checks',
      reason: 'Transaction-intelligence checks are still running.',
      recommendHardwareSigner: false,
    };
  }

  if (presign?.signerReachable === false) {
    return {
      decision: POLICY_DECISION.BLOCK,
      canProceed: false,
      requiresAcknowledgement: false,
      requiresBiometric: false,
      actionLabel: 'Signing blocked',
      reason: 'Runtime safety policy has disabled signing for this transaction.',
      recommendHardwareSigner: false,
    };
  }

  if (presign && !presign.proceedAllowed && !acknowledged) {
    return {
      decision: POLICY_DECISION.ACKNOWLEDGE,
      canProceed: false,
      requiresAcknowledgement: true,
      requiresBiometric: false,
      actionLabel: stackedRisk ? 'Escalated review' : 'Acknowledge risk',
      reason: stackedRisk
        ? 'This transaction combines a first-time recipient, a threat-intel hit, and degraded device posture. Review it as a high-confidence risk before signing.'
        : 'You must explicitly acknowledge the warning before signing.',
      recommendHardwareSigner: stackedRisk,
    };
  }

  if ((raspNeedsBio || stackedRisk) && !biometricCleared) {
    return {
      decision: POLICY_DECISION.STEP_UP,
      canProceed: false,
      requiresAcknowledgement: false,
      requiresBiometric: true,
      actionLabel: stackedRisk ? 'Verify and re-check' : 'Verify biometrics',
      reason: stackedRisk
        ? 'This stacked risk profile requires a biometric step-up and a final manual review before signing.'
        : 'This device posture requires a biometric step-up before signing.',
      recommendHardwareSigner: stackedRisk,
    };
  }

  const recommendHardwareSigner = stackedRisk || (
    verdict?.level === 'RISK'
    && verdict?.contributors?.some((c) => c.id === 'runtime' && c.level === 'CAUTION')
  );

  return {
    decision: POLICY_DECISION.ALLOW,
    canProceed: true,
    requiresAcknowledgement: false,
    requiresBiometric: false,
    actionLabel: stackedRisk ? 'Ready after escalated review' : 'Ready to sign',
    reason: recommendHardwareSigner
      ? (stackedRisk
          ? 'You can proceed now, but this stacked risk profile still warrants a hardware-backed signer and a deliberate final review.'
          : 'You can proceed now, but a hardware-backed signer is recommended for this risk profile.')
      : 'All active transaction-intelligence checks have settled.',
    recommendHardwareSigner,
  };
}
