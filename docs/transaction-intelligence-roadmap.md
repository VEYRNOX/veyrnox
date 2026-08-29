# Transaction Intelligence Roadmap

**Status:** PROPOSED  
**Date:** 2026-08-21  
**Scope:** next implementation steps after the first send-flow transaction-intelligence slice  
**Companion docs:**

- `docs/transaction-intelligence-architecture.md`
- `src/risk/composeVerdict.js`
- `src/policy/signingPolicy.js`
- `src/components/TransactionIntelligencePanel.jsx`

## 1. Goal

Turn the current send-flow slice into a full wallet-wide transaction-intelligence system that:

- uses one shared verdict shape across surfaces
- uses one shared policy model across sign-capable actions
- keeps AI Advisor explanatory, never authoritative
- improves detection quality without violating I1–I5
- creates an auditable feedback loop for false positives and missed threats

## 2. Current state

Already landed:

- shared UI-facing verdict composition
- shared UI-facing signing policy
- send-flow transaction-intelligence panel
- Advisor integration for send-flow live context

Still not unified:

- WalletConnect uses its own direct path
- signer chokepoints still recompute raw inputs directly instead of consuming the shared verdict/policy object
- approval-specific intelligence is partial
- typed-data / permit / multicall risk is not first-class
- analyst/promote/review loop is absent

## 3. Priority order

### P0 — WalletConnect unification

Why first:

- highest-risk surface after native send
- already partially wired for risk, but still thinner and more bespoke
- strongest reduction in “same action, different verdict” drift

### P1 — Shared-policy enforcement at chokepoints

Why second:

- today UI and enforcement are aligned but parallel
- this removes future drift risk
- strongest architecture cleanup after the send slice

### P2 — Approval / typed-data / permit hardening

Why third:

- most common real-world drainer path
- strongest product/security differentiation

### P3 — Advisor follow-up depth

Why fourth:

- valuable, but explanatory rather than authoritative
- should sit on top of a stronger policy core

### P4 — Analyst loop / intelligence flywheel

Why fifth:

- compounds quality over time
- worth doing once decision objects are stable

## 4. PR-sized roadmap

## PR 1 — WalletConnect consumes shared verdict composition

**Objective:** move WalletConnect from local direct risk wiring to the same transaction-intelligence verdict shape used by native send.

**Files likely touched:**

- `src/lib/WalletConnectProvider.jsx`
- `src/risk/fromWalletConnect.js`
- `src/risk/composeVerdict.js`
- `src/risk/__tests__/fromWalletConnect.test.js`
- `src/lib/__tests__/WalletConnectProvider.txRiskGate.test.js`
- new: `src/lib/__tests__/WalletConnectProvider.txIntelVerdict.test.js`

**Changes:**

- build a shared verdict for WC send requests
- expose contributor state for:
  - local tx risk
  - TIP result where applicable
  - runtime / RASP posture
- stop treating WC as “risk level only”

**Acceptance criteria:**

- WC `eth_sendTransaction` produces a composed verdict object
- same unlimited-approval request produces comparable verdict shape in native send and WC
- same TIP unavailable path reads as unknown/caution, not clean

**Risk notes:**

- do not let the modal invent a second interpretation layer
- keep presign enforcement fail-closed

## PR 2 — WalletConnect corpus enrichment

**Objective:** give WalletConnect the same active-set local context quality as native send.

**Files likely touched:**

- `src/lib/WalletConnectProvider.jsx`
- `src/risk/fromWalletConnect.js`
- new: `src/risk/buildCorpus.js`
- `src/risk/__tests__/fromWalletConnect.test.js`
- new: `src/risk/__tests__/buildCorpus.test.js`

**Changes:**

- feed active-set send history into WC scoring
- feed known counterparties into S4
- feed trusted spenders into S3
- feed prior send magnitudes into S8 where honest/applicable

**Acceptance criteria:**

- WC can fire S1, S3, S4, and S8 from real local corpus instead of mostly empty inputs
- no cross-set leakage
- no new egress

**Risk notes:**

- keep corpus active-set scoped only
- do not persist anything extra for this feature

## PR 3 — Shared policy object becomes signer-facing input

**Objective:** let the send chokepoint consume the same policy object the UI sees.

**Files likely touched:**

- `src/policy/signingPolicy.js`
- `src/lib/sendGate.js`
- `src/pages/SendCrypto.jsx`
- new: `src/lib/__tests__/sendGate.policy-object.test.js`
- existing `sendGate` and `presign` tests

**Changes:**

- extend `signingPolicy.js` from UI guidance into enforcement-ready shape
- teach `evaluateSendGate()` to accept policy-derived inputs or a normalized policy snapshot
- keep current raw-gate checks until parity is proven, then simplify

**Acceptance criteria:**

- send UI and send gate are driven by one normalized policy decision model
- risk-confirm / runtime-block / biometric-step-up still fail closed
- no regression to gate order

**Risk notes:**

- do this incrementally; keep current gate order authoritative until tests prove equivalence
- preserve the current sign-time recomputation discipline

## PR 4 — WalletConnect signer-facing policy unification

**Objective:** make WC enforcement consume the same policy model as native send.

**Files likely touched:**

- `src/lib/WalletConnectProvider.jsx`
- `src/policy/signingPolicy.js`
- new: `src/lib/__tests__/WalletConnectProvider.signingPolicy.test.js`

**Changes:**

- use policy object to decide:
  - reject
  - require stronger auth if surface supports it
  - route destructive confirm behavior cleanly

**Acceptance criteria:**

- WC and native send use the same decision vocabulary
- no surface-specific drift for block/confirm semantics

## PR 5 — Approval intelligence v2

**Objective:** make approvals first-class transaction-intelligence objects.

**Files likely touched:**

- `src/risk/calldata.js`
- `src/risk/signals/s2-unlimited-approval.js`
- `src/risk/signals/s3-fresh-spender-approval.js`
- new: `src/risk/signals/s10-permit-risk.js`
- new: `src/risk/signals/s11-multicall-approval-risk.js`
- `src/risk/score.js`
- `src/lib/wcTypedLevel.js`
- tests under `src/risk/__tests__`

**Changes:**

- distinguish:
  - finite approval
  - unlimited approval
  - permit / permit2 approval
  - multicall approval bundle
- add spender trust categories
- add explicit reasons for why a spender is untrusted

**Acceptance criteria:**

- approval flows produce clearer, higher-confidence verdicts than plain transfer flows
- known risky approval patterns escalate correctly

## PR 6 — Typed-data / permit / message-sign intent classification

**Objective:** bring non-transaction signature flows into the same intelligence model.

**Files likely touched:**

- `src/lib/wcTypedLevel.js`
- `src/lib/WalletConnectProvider.jsx`
- new: `src/risk/fromTypedData.js`
- new: `src/risk/signals/s12-typed-data-permission-risk.js`
- new tests for typed-data classification

**Changes:**

- classify typed-data signatures into:
  - benign auth/sign-in
  - approval-like
  - unknown dangerous
- pass them through shared verdict/policy composition

**Acceptance criteria:**

- typed-data that authorizes asset movement is not treated like a harmless login message

## PR 7 — Advisor transaction follow-up chips

**Objective:** deepen the Advisor’s usefulness without changing trust boundaries.

**Files likely touched:**

- `src/components/SecurityAdvisor.jsx`
- `src/components/TransactionIntelligencePanel.jsx`
- `src/lib/advisorKnowledge.js`
- new: `src/lib/advisorTransactionPrompts.js`
- Advisor tests

**Changes:**

- generate follow-up chips from live verdict, such as:
  - Why is this blocked?
  - What should I verify?
  - Why is hardware signing recommended?
  - What does this source mean?
- use live transaction context to answer with contributor-specific grounding

**Acceptance criteria:**

- Advisor answers reference the actual live verdict/policy object
- no new authority is granted to the Advisor

**Risk notes:**

- keep “Advisor is explanatory only” pinned by tests

## PR 8 — Advisor contract tests: explain-only, never-authoritative

**Objective:** harden the trust boundary around AI.

**Files likely touched:**

- `src/components/__tests__/SecurityAdvisor.*`
- new: `src/components/__tests__/SecurityAdvisor.explain-only.test.jsx`

**Changes:**

- pin that Advisor:
  - never changes signing policy
  - never opens blocked paths
  - never mutates risk state
  - only consumes live context

**Acceptance criteria:**

- any future attempt to give AI authority over sign/no-sign fails loudly in tests

## PR 9 — Source confidence + provenance weighting

**Objective:** separate severity from confidence.

**Files likely touched:**

- `src/risk/composeVerdict.js`
- `src/api/tipScreen.js`
- new: `src/risk/confidence.js`
- UI panel + tests

**Changes:**

- add confidence fields to contributors
- render “high severity / low confidence” differently from “high severity / high confidence”
- improve “unknown vs clean” honesty

**Acceptance criteria:**

- verdict composition can distinguish:
  - clean
  - suspicious
  - blocked
  - unavailable / unknown

## PR 10 — Local decision artifact logging

**Objective:** make each sign decision auditable and reviewable.

**Files likely touched:**

- new: `src/lib/txDecisionLog.js`
- `src/pages/SendCrypto.jsx`
- `src/lib/WalletConnectProvider.jsx`
- `src/wallet-core/panic.js`
- tests

**Changes:**

- write a local structured record of:
  - verdict
  - contributors
  - policy
  - override used
  - signer type
- ensure panic wipe clears it if persisted

**Acceptance criteria:**

- local-only
- no deniability leaks
- helps explain false positives/negatives later

## PR 11 — Analyst review and promotion path

**Objective:** start the intelligence flywheel.

**Files likely touched:**

- `src/lib/threatIntelStore.js`
- TIP/Sentinel-side schemas
- possible `supabase/functions/*` review endpoints
- docs

**Changes:**

- promote reviewed indicators into local cache/seed manifests
- allow down-weighting of noisy sources
- attach review notes to promoted signals

**Acceptance criteria:**

- false positives and misses can improve future decisions systematically

## 5. Suggested milestone groupings

### Milestone A — Surface unification

- PR 1
- PR 2
- PR 3
- PR 4

Outcome:

- native send and WalletConnect share one verdict/policy model

### Milestone B — Dangerous-intent depth

- PR 5
- PR 6

Outcome:

- approvals and typed-data become truly first-class security cases

### Milestone C — Advisor maturity

- PR 7
- PR 8

Outcome:

- AI helps users understand risk without ever controlling it

### Milestone D — Quality flywheel

- PR 9
- PR 10
- PR 11

Outcome:

- the intelligence system gets more explainable and better over time

## 6. What not to do yet

Avoid these until the above is done:

- adding more remote providers before verdict/policy unification
- making AI part of the sign/no-sign authority
- adding background monitoring that violates current I2 framing
- adding surface-specific custom policy branches that bypass the shared model

## 7. Recommended next three PRs

If we want the strongest near-term sequence:

1. **PR 1 — WalletConnect consumes shared verdict composition**
2. **PR 2 — WalletConnect corpus enrichment**
3. **PR 3 — Shared policy object becomes signer-facing input**

That sequence gives the biggest security and architecture payoff for the least product sprawl.

## 8. Definition of done for the roadmap

This roadmap is meaningfully complete when:

- all sign-capable surfaces use one verdict model
- all sign-capable surfaces use one policy model
- dangerous intents beyond plain transfer are first-class
- AI explains the live decision but never controls it
- reviewed incidents can improve future local or remote intelligence
