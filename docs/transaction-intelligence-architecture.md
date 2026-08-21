# Transaction Intelligence Architecture

**Status:** PROPOSED  
**Date:** 2026-08-21  
**Audience:** product, wallet-core, security, TIP/Sentinel  
**Goal:** turn Veyrnox from "wallet with risk checks" into a coherent, higher-confidence
transaction-intelligence system that influences signing policy across all send surfaces.

## 1. Executive summary

Veyrnox is **not missing transaction security**. It already has:

- a pure local risk scorer in `src/risk/score.js`
- multiple local pre-sign signals in `src/risk/signals/*`
- opt-in remote screening in `src/api/tipScreen.js`
- a local threat-intel cache in `src/lib/threatIntelStore.js`
- a pure pre-sign policy gate in `src/sign-gate/presign.js`
- WalletConnect pre-sign risk wiring in `src/lib/WalletConnectProvider.jsx`

What is missing is a **program-level transaction-intelligence layer**:

1. one composite verdict across every signing surface
2. one policy engine that maps that verdict to friction / auth / signer choice
3. broader and higher-confidence intelligence inputs
4. a feedback loop that improves decisions over time
5. analyst/operator tooling for curation, review, and incident learning

The key shift is:

> from "run some checks before send"  
> to "every signing request passes through a policy-controlled intelligence decision"

## 2. Current repo state

### 2.1 Local deterministic scoring

The current scoring spine is already present:

- `src/risk/score.js`
- `src/risk/fromSendState.js`
- `src/risk/fromWalletConnect.js`
- `src/risk/signals/s1-*` through `s9-*`

This is the strongest part of the design because it is:

- on-device
- testable
- set-blind / I3-safe by construction
- backend-independent
- able to fail closed

Current signal set:

- `S1` fresh recipient
- `S2` unlimited approval
- `S3` approval to fresh spender
- `S4` address poisoning / lookalike
- `S5` ENS mismatch
- `S6` dust input
- `S7` calldata mismatch
- `S8` value anomaly
- `S9` TIP remote threat signal

### 2.2 Remote screening

TIP is already wired in the right architectural shape:

- `src/api/tipScreen.js` is the single client egress point
- secrets are server-side in the Edge Function path, not client-side
- TIP is suppressed in deniability/demo
- TIP is treated as one contributor, not as the decision authority
- invalid or unavailable responses fail closed to caution

That shape should be preserved.

### 2.3 Local threat cache

The local threat store in `src/lib/threatIntelStore.js` already provides:

- seeded known-bad indicators
- learned/cached indicators
- zero-latency local lookups
- deniability-safe suppression

This is the right base for "instant first opinion" without new egress.

### 2.4 Policy gate

`src/sign-gate/presign.js` already expresses the critical idea:

- environment posture and transaction risk are distinct planes
- a pure gate composes them
- only the gate can make the signer reachable

That should be expanded from a send-path helper into the canonical signing-policy layer.

### 2.5 Main weakness today

The current design is good at **point checks** but weaker at **system coordination**.

Today the repo still has:

- partial signal coverage across surfaces
- partial corpus availability in WalletConnect
- limited external reputation depth
- weak linkage between verdict severity and step-up auth / hardware signer policy
- no explicit analyst workflow for adjudication and learning

## 3. Design principles

The target architecture should keep these repo truths intact:

### 3.1 Local-first

The wallet should always be able to produce a useful first-pass verdict from:

- unsigned tx
- active-set local state
- chain data already fetched for transaction construction

Remote intelligence should improve confidence, not create dependency.

### 3.2 Policy before signer

Every sign-capable action must cross the same chokepoint:

1. build canonical risk inputs
2. gather applicable contributors
3. compute composite verdict
4. map verdict to policy
5. only then decide whether the signer is reachable

No surface should be allowed to "advisory-only" its way around this.

### 3.3 Backend untrusted

Remote intelligence is evidence, not truth.

Server output may:

- enrich
- escalate
- increase confidence

It must not:

- bypass local checks
- directly authorize signing
- silently downgrade local risk

### 3.4 Explainability

Every verdict must be renderable as:

- one top-level decision
- one owning reason
- structured supporting evidence
- source provenance
- explicit unknowns/unavailable contributors

This is required for trust, auditability, and false-positive review.

### 3.5 Deniability-safe by construction

No intelligence feature may create a real-vs-decoy tell through:

- different control flow
- different prompt cadence
- different output shape
- persistence side effects
- background fetch timing

The current repo already takes this seriously; the transaction-intelligence layer must inherit that discipline.

## 4. Target architecture

## 4.1 Three planes

Build the system as three planes.

### Plane A: Local deterministic risk

Purpose:

- instant on-device scoring
- auditable baseline
- works without network

Inputs:

- unsigned tx / signing payload
- active-set corpus
- chain metadata already fetched

Examples:

- approval risk
- first-seen recipient
- value anomaly
- address lookalike
- code/data mismatch

Primary code home:

- `src/risk/*`

### Plane B: External intelligence

Purpose:

- malicious address / contract / domain enrichment
- campaign intelligence
- sanctions / drainer / exploit reporting
- multi-source corroboration

Inputs:

- recipient
- contract target
- serialized transaction where available
- selective local context that is explicitly disclosed and permitted

Primary code home:

- `src/api/tipScreen.js`
- `src/api/tipClient.js`
- `supabase/functions/tip-screen`
- future TIP/Sentinel ingestion + adjudication paths

### Plane C: Signing policy

Purpose:

- decide friction
- decide auth strength
- decide whether to hard-block
- decide whether hardware signer is required

Inputs:

- local risk composite
- external intelligence verdict
- RASP posture
- recent auth state
- signer capabilities

Primary code home:

- `src/sign-gate/*`
- `src/lib/sendReauth.js`
- `src/lib/twoFactorGate.js`
- `src/lib/WalletConnectProvider.jsx`
- send-flow chokepoints

## 4.2 Core modules to add

The repo already has the pieces; what is missing is the orchestration layer.

### A. `src/risk/composeVerdict.js`

Purpose:

- canonicalize all contributors into one shared verdict shape

Inputs:

- local score result
- TIP result
- threat store hits
- signer context
- optional surface metadata

Output shape:

```js
{
  level: 'ok' | 'info' | 'caution' | 'risk' | 'block',
  owner: 'local' | 'tip' | 'policy' | 'rasp',
  primaryReason: string | null,
  evidence: object | null,
  contributors: [
    { id, type, applicable, settled, level, evidence, source }
  ],
  unknowns: [
    { id, reason }
  ],
}
```

Why:

- `score()` today returns the local composite only
- `presignGate()` today composes RASP + tx level only
- there is no single shared "transaction intelligence verdict" object

### B. `src/policy/signingPolicy.js`

Purpose:

- map verdict + environment into required action

Output shape:

```js
{
  decision: 'allow' | 'ack' | 'step_up' | 'hardware_only' | 'block',
  requiredAuth: 'none' | 'action_password' | 'biometric' | 'passkey',
  requireRecentAuth: boolean,
  requireHardwareSigner: boolean,
  allowOverride: boolean,
  reason: string,
}
```

Why:

- today risk and auth are adjacent but not centrally coordinated
- this becomes the single business-policy layer

### C. `src/risk/buildCorpus.js`

Purpose:

- normalize active-set corpus for all surfaces

Contents:

- recent recipients
- known counterparties
- known-good spenders
- ENS cache
- prior send magnitudes
- local IOC/threat hits

Why:

- `fromSendState.js` and `fromWalletConnect.js` currently map similar data separately
- WalletConnect today runs with intentionally sparse corpus

### D. `src/risk/explanations.js`

Purpose:

- one plain-language explanation generator

Why:

- one decision should own one explanation
- UI surfaces should not re-invent risk prose

### E. `src/tip/adjudication/*`

Purpose:

- analyst feedback loop for false positives / false negatives / promoted indicators

Likely contents:

- source confidence weighting
- promoted local IOC manifests
- campaign clustering metadata
- review notes / resolution trail

Why:

- intelligence quality does not improve by code alone

## 5. Canonical data flow

Every sign-capable path should converge on this flow.

```text
Surface intent
  -> Build canonical tx/signing request
  -> Build active-set corpus
  -> Run local deterministic signals
  -> Query local IOC/threat cache
  -> Optionally run remote TIP screening
  -> Compose one shared verdict
  -> Map verdict through signing policy
  -> Render one decision + supporting evidence
  -> If required, step up auth / require stronger signer
  -> If policy allows, reach signer
  -> Record decision outcome for review/learning
```

### Surfaces that must use this

- in-app send
- WalletConnect `eth_sendTransaction`
- token approvals
- typed-data signing where asset authorization is implied
- message signing where a known dApp risk model applies
- future Trezor / Digital Shield / hardware signing adapters

## 6. Target policy model

The missing strategic value is not another signal. It is better **policy use** of the verdict.

Suggested default policy:

### `OK`

- allow
- no extra friction

### `INFO`

- show context
- no extra friction

### `CAUTION`

- require explicit acknowledgement
- if device posture is degraded, require step-up auth

### `RISK`

- require explicit destructive confirm
- require recent auth
- require stronger factor on native where available

### `BLOCK`

- hard block
- no signer reachability
- no soft override on clearly malicious / policy-prohibited cases

### Policy escalators

Escalate one notch when:

- RASP is `WARN`
- transaction is first-seen + approval-related
- remote intelligence reports corroborated maliciousness
- signer is software-only on a degraded device
- amount is high relative to local behavioral baseline

### Hardware routing

Add a policy rule for high-risk actions:

- `RISK + hostile device` -> require hardware-backed signing or block
- `RISK + unlimited approval + unknown spender` -> hardware-only or block

This is where a Digital Shield integration would become strategic:

> Veyrnox owns policy  
> hardware options satisfy the policy

## 7. Confidence model

The target system should distinguish:

- **signal severity**
- **source confidence**
- **verdict certainty**

These are not the same.

Example:

- local unlimited approval = high severity, high certainty
- remote unknown source hit = medium confidence, high severity claim
- local lookalike match = high severity, medium certainty
- TIP unavailable = unknown certainty, should escalate honesty but not fabricate certainty

This suggests every contributor should carry:

```js
{
  severity: 'info' | 'caution' | 'risk' | 'block',
  confidence: 'low' | 'medium' | 'high',
  certaintyReason: string,
}
```

The policy layer should be able to say:

- "high severity, low confidence" -> destructive confirm
- "high severity, high confidence" -> hard block

## 8. Intelligence sources roadmap

The next uplift should come from source quality, not just more local heuristics.

Recommended source categories:

### 8.1 Address / contract reputation

- drainer families
- exploit wallets
- sanction/screening providers
- malicious token deployers
- known scam recipient clusters

### 8.2 dApp / domain intelligence

- phishing domains
- spoofed wallet-connect targets
- known bad app origins
- domain age / reputation / hosting anomalies

### 8.3 Transaction-shape intelligence

- approval patterns
- permit / permit2 abuse
- suspicious multicall compositions
- wallet-draining call sequences
- fake bridge / fake claim / sweep patterns

### 8.4 Local behavioral baselines

- active-set send magnitude profile
- first-seen vs recurrent counterparties
- asset- and chain-specific norms
- user-maintained local trust lists

### 8.5 Analyst-promoted intelligence

- reviewed false negatives promoted to seed/local IOC
- reviewed false positives down-weighted or allowlisted
- campaign-level fingerprints promoted to heuristics

## 9. Surface-specific requirements

## 9.1 In-app send

This should become the reference implementation.

Must support:

- full local corpus
- local cache hit before remote TIP
- amount-aware policy
- chain-specific render/explanation
- post-verdict policy routing to auth + signer

## 9.2 WalletConnect

This is the most important upgrade surface.

Current weakness:

- corpus is intentionally sparse in `fromWalletConnect.js`
- policy is partly surface-local in `WalletConnectProvider.jsx`

Required improvements:

- feed active-set corpus into WC risk inputs
- classify approvals as first-class risk objects
- inspect typed-data and contract intents with the same canonical engine
- route policy through the same signing policy module as native send

## 9.3 Message / typed-data signing

Not every sign request is a transaction, but many are economically dangerous.

Build a parallel intent model for:

- EIP-712 approvals / permits
- auth messages for suspicious dApps
- session-bound wallet actions

These should use the same explanation and policy framework, even if signal sets differ.

## 10. Logging, review, and learning

A real intelligence program needs a structured review trail.

For every sign attempt, capture a local decision artifact:

```js
{
  timestamp,
  surface,
  chain,
  actionType,
  verdict,
  policyDecision,
  contributors,
  overrideUsed,
  signerType,
}
```

Rules:

- must remain local unless explicitly disclosed and consented
- no cross-set leakage
- panic wipe must clear it if persisted
- use for false-positive review and regression testing

This is the backbone for future Sentinel/operator views.

## 11. Proposed file layout

### Existing modules to keep

- `src/risk/score.js`
- `src/risk/fromSendState.js`
- `src/risk/fromWalletConnect.js`
- `src/sign-gate/presign.js`
- `src/api/tipScreen.js`
- `src/lib/threatIntelStore.js`

### New modules to add

- `src/risk/composeVerdict.js`
- `src/risk/buildCorpus.js`
- `src/risk/explanations.js`
- `src/policy/signingPolicy.js`
- `src/policy/policyLevels.js`
- `src/policy/__tests__/signingPolicy.test.js`
- `src/risk/__tests__/composeVerdict.test.js`

### Future TIP / Sentinel paths

- `supabase/functions/tip-screen/*` expand response provenance
- `supabase/functions/tip-chat/*` stay separate from signing path
- `tip/` or `apps/tip/` analyst console, if productized

## 12. Phased implementation plan

## Phase 1: unify verdicts

Goal:

- one shared transaction-intelligence verdict object

Deliverables:

- add `src/risk/composeVerdict.js`
- update send flow to consume it
- update WalletConnect send flow to consume it
- keep existing signal implementations unchanged

Acceptance:

- native send and WalletConnect both render the same verdict shape
- one source of truth for contributor readiness / settled state
- one owning explanation per decision

## Phase 2: unify policy

Goal:

- one shared signing policy engine

Deliverables:

- add `src/policy/signingPolicy.js`
- map verdict -> required auth / override / block / hardware requirement
- route both send and WalletConnect through it

Acceptance:

- no surface-specific ad hoc risk/auth branching at chokepoints
- signer reachability depends on policy output only

## Phase 3: enrich corpus

Goal:

- stronger local confidence, especially in WalletConnect

Deliverables:

- add `src/risk/buildCorpus.js`
- feed active-set history/counterparties/allowlists into WC paths
- add dApp/session context where safe

Acceptance:

- WalletConnect can fire S1/S3/S4/S8 meaningfully instead of mostly inert operation

## Phase 4: approvals and typed-data hardening

Goal:

- make approvals first-class security objects

Deliverables:

- richer approval/permit signal set
- known dangerous spender categories
- spender explainability
- policy rules specific to approvals

Acceptance:

- unknown unlimited approval on degraded device cannot reach signer without strong friction

## Phase 5: confidence and provenance

Goal:

- improve decision quality and auditability

Deliverables:

- contributor confidence fields
- explicit unknown/unavailable contributor rendering
- source provenance surfaced in UI and stored in decision artifacts

Acceptance:

- "clean" is distinguishable from "unavailable"
- reviewed incidents can identify why a decision happened

## Phase 6: analyst loop

Goal:

- intelligence gets better over time

Deliverables:

- reviewed false-positive / false-negative workflow
- local IOC promotion path
- TIP/Sentinel adjudication schema

Acceptance:

- reviewed incidents can produce deterministic local protections in future builds

## 13. Testing strategy

### Unit

- verdict composition
- policy mapping
- confidence escalation
- per-surface corpus adaptation

### Integration

- send path reaches same decision for same canonical inputs across surfaces
- WalletConnect cannot bypass shared policy
- TIP unavailable vs clean stays distinguishable

### Security regression

- no new deniability tells
- no client-held TIP secrets
- no surface can reach signer before policy allows
- local persistence cleared by panic/decoy invariants where applicable

### Real-world verification targets

- malicious unlimited approval pattern
- known drainer destination
- address poisoning lookalike
- high-value anomaly with degraded device posture
- TIP unavailable path remains honest and safe

## 14. Product outcome

If this architecture lands, Veyrnox's transaction story becomes:

> The wallet does not just protect keys.  
> It evaluates what the key is being asked to sign, explains the risk, and changes the signing policy accordingly.

That is the right complement to:

- local hardware-backed KEK protection
- RASP/device posture
- passkey/biometric/action-password auth
- future external hardware signers such as Trezor or Digital Shield

## 15. Recommended first PRs

1. Add `src/risk/composeVerdict.js` and tests.
2. Add `src/policy/signingPolicy.js` and tests.
3. Refactor native send to consume both.
4. Refactor WalletConnect to consume both.
5. Add corpus enrichment for WalletConnect.

This order gives the biggest architectural payoff with the smallest security surface jump.
