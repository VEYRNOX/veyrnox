// lib/sendGate.js
//
// The SINGLE ordered pre-sign enforcement decision the Send chokepoint obeys.
//
// SendCrypto's signer (the sendTx mutationFn) re-asserts every UI gate at signing
// time as defense-in-depth, so no stale UI state can broadcast past a tripped
// gate. That ordered sequence used to live inline in the component and was
// therefore not unit-testable. This pure function is now the ONE place the order
// and the user-facing messages live; the mutationFn (re)computes each raw input
// against live state / a fresh risk score and delegates the verdict here, so the
// enforced decision and these tests cannot drift apart (the same "UI and
// enforcement cannot diverge" discipline presignGate already follows).
//
// Gates, in the order they bite — the FIRST block wins:
//   2/3 capability   only `live` assets may send, unless the dev-only, testnet-
//                    only, build-eliminated ungate relaxes it (never changes status)
//   5   unlocked     the on-device vault must be unlocked
//   6   re-auth      step-up recent-auth must not be pending (demo has no vault)
//   6b  two-factor   the Action-Password / passkey second factor, WHEN configured,
//                    must be verified THIS action — enforced here at the chokepoint
//                    so a still-open recent-auth window can't broadcast on PIN
//                    recency alone (audit H1). Demo has no vault/credential → exempt.
//   7   spend limit  per-transaction / daily caps, unless explicitly acknowledged
//   8a  risk score   the pre-sign risk score must compute (fail closed if it throws)
//   8b  risk verdict composite RASP-env x tx-risk: BLOCK is a hard stop (no
//                    override — a hostile runtime can hook the confirm itself),
//                    CONFIRM needs the user's "sign anyway" acknowledgement
//   8c  btc risk     a high-severity BTC decode flag (e.g. entire_balance) needs
//                    the user's acknowledgement (BTC has no EVM-shaped verdict)
//   9   approval     an unlimited ERC-20 approval must be acknowledged
//
// Pure and SET-BLIND (I3): it takes plain values, nothing that can reach wallet-set
// identity. Returns { allowed, code, message }; `message` is null only when allowed.

export const SEND_GATE = Object.freeze({
  ALLOW: 'ALLOW',
  NOT_SENDABLE: 'NOT_SENDABLE',
  LOCKED: 'LOCKED',
  REAUTH: 'REAUTH',
  TWO_FACTOR: 'TWO_FACTOR',
  LIMIT: 'LIMIT',
  RISK_SCORE_FAILED: 'RISK_SCORE_FAILED',
  RISK_BLOCK: 'RISK_BLOCK',
  RISK_CONFIRM: 'RISK_CONFIRM',
  APPROVAL: 'APPROVAL',
});

const block = (code, message) => ({ allowed: false, code, message });

/**
 * Decide whether the signer may be reached for the current send.
 *
 * @param {object}  i
 * @param {boolean} i.canSend           production canSend(asset) — `live`-only truth
 * @param {boolean} [i.devUngated]      dev-only testnet ungate active (relaxes canSend ONLY)
 * @param {string}  [i.currency]        selected asset symbol, for the not-yet-enabled message
 * @param {boolean} [i.isUnlocked]      the vault is unlocked
 * @param {boolean} [i.demo]            demo mode (no vault → re-auth exempt)
 * @param {boolean} [i.reauthRequired]  step-up re-auth is pending
 * @param {boolean} [i.twoFactorRequired] a second factor (Action Password / passkey-2FA)
 *                                      is configured for this action and must be satisfied
 * @param {boolean} [i.twoFactorVerified] the second factor was verified THIS action
 *                                      (a one-shot token the signer consumes per send)
 * @param {{blocked:boolean, reasons?:Array<{kind:string, limitUSD:number}>}|null} [i.limit]
 *                                      result of evaluateSendAgainstLimits()
 * @param {boolean} [i.limitAck]        the user acknowledged the limit breach
 * @param {boolean} [i.riskScoreFailed] the pre-sign risk score threw (fail closed)
 * @param {{proceedAllowed:boolean, signerReachable:boolean}|null} [i.presign]
 *                                      result of presignGate()
 * @param {boolean} [i.btcRiskBlocked]  a high-severity BTC decode flag is unacknowledged
 * @param {boolean} [i.blockedByApproval] an unacknowledged unlimited approval
 * @returns {{ allowed: boolean, code: string, message: (string|null) }}
 */
export function evaluateSendGate({
  canSend = false,
  devUngated = false,
  currency,
  isUnlocked = false,
  demo = false,
  reauthRequired = false,
  twoFactorRequired = false,
  twoFactorVerified = false,
  limit = null,
  limitAck = false,
  riskScoreFailed = false,
  presign = null,
  btcRiskBlocked = false,
  blockedByApproval = false,
} = /** @type {any} */ ({})) {
  // 2/3 — capability. Only `live` assets send; the dev ungate relaxes the gate
  // decision for testnet verification but NEVER changes the asset's status.
  if (!canSend && !devUngated) {
    return block(SEND_GATE.NOT_SENDABLE, `Sending is not yet enabled for ${currency ?? 'this asset'}.`);
  }

  // 5 — the vault must be unlocked to reach a signing key.
  if (!isUnlocked) {
    return block(SEND_GATE.LOCKED, 'Unlock your wallet to send');
  }

  // 6 — step-up re-auth. Demo has no vault, so it is exempt.
  if (!demo && reauthRequired) {
    return block(SEND_GATE.REAUTH, 'Re-enter your PIN or password to authorise this send.');
  }

  // 6b — second factor (Action Password / passkey-2FA). When configured for this
  // action it must be verified THIS action. Enforced at the chokepoint (audit H1)
  // so a recently-authed session with the re-auth window still open cannot reach
  // the signer on PIN recency alone — the second factor is no longer UI-only.
  // Demo has no vault/credential, so it is exempt, exactly like re-auth.
  if (!demo && twoFactorRequired && !twoFactorVerified) {
    return block(SEND_GATE.TWO_FACTOR, 'Enter your Action Password to authorise this send.');
  }

  // 7 — spend limits (per-tx OR daily), unless the breach was acknowledged.
  if (limit && limit.blocked && !limitAck) {
    const daily = (limit.reasons || []).find((r) => r.kind === 'daily');
    return block(
      SEND_GATE.LIMIT,
      daily
        ? `Daily spending limit reached: this send would put today's total over your $${daily.limitUSD.toLocaleString()} cap.`
        : 'This send exceeds your per-transaction spending limit.',
    );
  }

  // 8a — the risk score itself must succeed; if it threw, do not sign.
  if (riskScoreFailed) {
    return block(SEND_GATE.RISK_SCORE_FAILED, 'Could not complete the pre-sign risk checks — not signing.');
  }

  // 8b — composite pre-sign verdict. BLOCK (signer unreachable) is a hard stop with
  // no override; CONFIRM is surfaced as the explicit "sign anyway" requirement.
  if (presign && !presign.proceedAllowed) {
    return presign.signerReachable
      ? block(SEND_GATE.RISK_CONFIRM, 'Confirm the risk warning before signing.')
      : block(SEND_GATE.RISK_BLOCK, 'Signing is turned off: this device did not pass a runtime safety check.');
  }

  // 8c — BTC pre-sign risk (internal audit M-2). BTC isn't EVM-shaped, so it has no
  // `presign` verdict; instead its honest decode (btc/simulate.js describeBtcPlan)
  // raises high-severity flags (e.g. entire_balance). When one is present and the
  // user hasn't acknowledged it, require the same explicit confirmation as an EVM
  // RISK_CONFIRM before signing. Warns-with-ack, never a hard BLOCK (these are
  // amount-sanity flags, not a hostile-runtime signal).
  if (btcRiskBlocked) {
    return block(SEND_GATE.RISK_CONFIRM, 'Confirm the risk warning before signing.');
  }

  // 9 — an unlimited token approval must be explicitly acknowledged.
  if (blockedByApproval) {
    return block(SEND_GATE.APPROVAL, 'Confirm the unlimited-approval warning before signing.');
  }

  return { allowed: true, code: SEND_GATE.ALLOW, message: null };
}
