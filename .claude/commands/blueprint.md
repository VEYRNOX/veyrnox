---
description: Produce an architectural blueprint doc for a subsystem — component boundaries, data flow, threat model, invariants, failure modes, and platform matrix. Written to docs/blueprints/. Design-only, no implementation.
argument-hint: <subsystem to blueprint — e.g. "Hardware KEK Phase 3", "iOS App Attest server verification", "Cosmos xpub export">
---

# blueprint — architectural design document

Blueprint: **$ARGUMENTS**

## 1. Recon the existing shape
Dispatch `veyrnox-recon` over the subsystem. Enumerate current components, files, and
tests. Read any existing docs under `docs/` that touch this area — do not re-invent what
already exists.

## 2. Write the blueprint
Create `docs/blueprints/YYYY-MM-DD-<slug>.md` with these sections:

```
# <subsystem>

## Problem statement
What is broken / missing / at risk today. Cite file:line evidence.

## Scope
In scope. Out of scope. Platforms (web / iOS / Android / Capacitor). Networks (mainnet / testnet).

## Component diagram
ASCII or mermaid. Every box is a real file / native class. Arrows are real call directions.

## Data flow
For each user-visible operation: inputs → transformations → outputs. Where key material
lives at each hop. Where it is zeroed.

## Threat model
Adversaries: coercer, offline-seizure attacker, network attacker, malicious dApp,
compromised bridge, rooted/jailbroken OS, malicious backend (untrusted by design — I5).
For each: attack path, mitigating control, residual risk.

## Security invariants
Which of I1–I6 apply. For each: how this design preserves it. What would break it.

## Failure modes
For every external call, plugin bridge, cryptographic op: what happens on error. Must be
fail-closed (I4). Never mock a control (no fake security).

## Platform matrix
Table: platform → what's supported here → what's HONEST-DISABLED → why.

## Status tags per component
BUILT / TARGET / PLANNED / HONEST-DISABLED. Never write "verified" — that requires an
on-chain txid or device evidence per the runbooks.

## Migration
How existing installs upgrade. Backward compatibility for vault format / storage keys /
KEK version / IAP entitlements.

## Open questions
Numbered. Each one blocks a decision the owner has to make.

## Exit criteria
What must be true for the blueprint to be considered ready to hand off to /plan-canvas +
/orch-add-feature.
```

## 3. Do NOT implement
Blueprint = design only. No code changes in this command. Handoff to `/plan-canvas` then
`/orch-add-feature` (or `/orch-change-feature`) is separate and explicit.
