---
description: Orchestrate building a full MVP scope — decompose into feature slices, sequence phases, run each slice through /orch-add-feature, and gate the whole thing through /delivery-gate before merge.
argument-hint: <MVP name and the shipping goal — e.g. "onboarding v2: paste-seed, generate-seed, and PIN setup, ready to ship on native">
---

# orch-build-mvp — multi-feature MVP pipeline

Orchestrate MVP: **$ARGUMENTS**

## 1. Scope the MVP
- Invoke `superpowers:brainstorming` to enumerate the smallest set of feature slices that
  ship the stated user outcome. Cut ruthlessly — MVP means smallest coherent shippable set.
- List each slice with: name, files touched (approx.), security-sensitive?, order dependency.

## 2. Sequence phases
- Group slices into phases. A phase = slices that can run in parallel (no shared files, no
  ordering dependency). Between phases is a checkpoint.
- Present the plan (phases + slices in each) to the user; wait for confirmation before
  running Phase 1. Do not proceed if the user has not yet confirmed the phase plan.

## 3. Execute each phase
For each phase, in order:
- For each slice in the phase, run the same skeleton as `/orch-add-feature` — recon → plan
  → TDD implement → honest review → docs sync — but dispatch slices in parallel where the
  phase permits (a SINGLE message with multiple Agent calls).
- Any slice touching keys / signing / seed / auth / RASP / KEK / IAP goes through
  `veyrnox-security-tdd`, not any other agent.
- Between phases, dispatch `veyrnox-honest-reviewer` over the phase's combined diff before
  moving on.

## 4. MVP-level delivery gate
When all phases are done, run `/delivery-gate` on the full branch. Do not consider the MVP
shippable until it passes.

## 5. Report
- BUILT slices, TARGET slices (deferred by design), and any HONEST-DISABLED items.
- Explicit list of what would be required to move each TARGET → BUILT and each BUILT →
  device-verified / independently audited.
- Never write "shipped" or "verified" without evidence per the hard rules.
