// src/risk/index.js
//
// Risk Scoring v1 — UNAUDITED-PROVISIONAL.
//
// Public surface of the on-device pre-sign risk module. Pure functions only; this
// module imports NO signer, NO seed, NO vault.js derivation, and NO network
// client. It is called by the send flow BETWEEN tx construction and signing.
//
// Status: merges as UNAUDITED-PROVISIONAL. The signal logic (S2/S4/S5 in
// particular) must be reviewed by the independent audit before the caveat drops.
// Code-ready ≠ verified: a signal is only "verified" once exercised against a
// real malicious-pattern tx on testnet, not just unit fixtures.

export { score, SIGNALS } from './score.js';
export { LEVEL, PRIORITY } from './levels.js';
export { buildRiskInputs } from './fromSendState.js';

export { s1FreshRecipient } from './signals/s1-fresh-recipient.js';
export { s2UnlimitedApproval } from './signals/s2-unlimited-approval.js';
export { s3FreshSpenderApproval } from './signals/s3-fresh-spender-approval.js';
export { s4AddressPoisoning } from './signals/s4-address-poisoning.js';
export { s5EnsMismatch } from './signals/s5-ens-mismatch.js';
export { s6DustInput } from './signals/s6-dust-input.js';
export { s7CalldataMismatch } from './signals/s7-calldata-mismatch.js';
export { s8ValueAnomaly } from './signals/s8-value-anomaly.js';
