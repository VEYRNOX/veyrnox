# Veyrnox — Backend Security Architecture, Threat Model & Risk Assessment

**Scope:** Optional base44 backend to enable user-facing features (analytics, enrichment,
notifications, advisory) WITHOUT compromising the self-custody / coercion-resistant wedge.
**Date:** 2026-06-04 · **Status:** DRAFT design input — NOT a security sign-off.

> THIS IS NOT AN AUDIT. Provisional design input and a brief for the independent security
> audit (a tracked launch blocker). Not reviewed by a qualified auditor. No security claim
> here is verified. Do not market any of this as "secure" or "audited." Every control is a
> hypothesis to be tested, not a guarantee.

## ADOPTION STATUS (PR A)
This architecture is ADOPTED as the REQUIRED design IF/WHEN Veyrnox integrates a base44
backend. It does NOT commit Veyrnox to building that integration. The decision to build
remains GATED on: (a) passing the §2 wedge-alignment filter per feature, and (b) the
independent security audit reviewing this architecture FIRST. Build after the audit weighs
in, not before. Re-coupling to base44 reverses the project's serverless/no-hosted-account
decision and must be a conscious, audited choice.

## 0. Invariants (non-negotiable)
- I1 — Keys never leave the device. Seeds/keys/signing on-device ONLY. Backend has NO key
  material, NO signing, NO recovery. Total backend compromise must lose ZERO funds.
- I2 — No silent data egress. Backend learns nothing by default; every byte off-device is
  explicit per-feature informed opt-in.
- I3 — Deniability mode is sacred. Duress/decoy/hidden sessions make ZERO backend calls;
  backend egress is structurally hard-disabled in that context.
- I4 — Fail honest, fail closed. If a feature can't be delivered without violating the above,
  honest-disable it; never fake or silently degrade privacy.
- I5 — Backend is untrusted by design. Architect as if base44 (and providers behind it) are
  honest-but-curious at best, breached at worst. Minimise what they are given.

## 1. Assets (ranked)
| # | Asset | Why it matters | Loss class |
|---|---|---|---|
| A1 | Private keys / seeds | Direct fund theft | Catastrophic |
| A2 | Address ↔ identity linkage | Targeting list for coercion | Severe / unrecoverable |
| A3 | Existence of hidden/decoy wallets | Defeats deniability | Severe |
| A4 | Real-time balance / holdings | "Who is worth attacking" | Severe |
| A5 | Behavioural metadata (IP, timing) | Correlation → deanonymisation | High |
| A6 | Account/auth credentials | Pivot to A2–A5 | High |
| A7 | Feature data (notes, tax, labels) | Privacy | Moderate |

I1 removes the backend from A1 risk. The backend's ENTIRE risk surface is A2–A7; for this
persona A2/A3/A4 (identity↔address↔wealth↔hidden-wallets) are near-fund-loss in severity —
a breach exposing them is a physical-targeting brief.

## 2. Threat actors
| Actor | Capability | In scope |
|---|---|---|
| T1 Network observer | Traffic metadata, IP, timing | Yes |
| T2 base44 insider/breach | Reads all backend stores/receives | PRIMARY |
| T3 Downstream provider (LLM/indexer) | Sees forwarded data | Yes |
| T4 Targeted physical attacker | Device + coerced PIN | Persona core |
| T5 Supply-chain (bad update/dep) | On-device code exec | Yes |
| T6 Multi-tenant leakage | base44 tenancy failure | Yes |

## 3. Per-feature naive leak
| Feature | Naive leak | Asset | Actor |
|---|---|---|---|
| Net worth / fiat | balance query for addresses | A2,A4 | T2,T3 |
| Token/NFT enrichment | resolve what's at address | A2,A4 | T2,T3 |
| Price/market | timing/IP only | A5 | T1,T2 |
| Push/alerts | address→token map | A2,A5 | T2 |
| AI/LLM advisor | wallet context to LLM | A2,A4 | T2,T3 |
| Tax/report | full tx history upload | A2,A4,A7 | T2,T3 |
| Social | identity+holdings published | A2,A4 | all (CUT) |

## 4. Risk assessment (pre-mitigation)
| Risk | Rating |
|---|---|
| R1 Breach exposes address↔identity↔balance | CRITICAL |
| R2 Network observer correlates user↔addresses | CRITICAL |
| R3 LLM provider retains/trains on wallet data | HIGH |
| R4 Hidden-wallet existence leaked | CRITICAL |
| R5 Push-token enables tracking | HIGH |
| R6 Multi-tenant boundary failure | HIGH |
| R7 Backend used as key/recovery shortcut (I1 erosion) | CRITICAL if violated |
| R8 Privacy theatre (looks private, isn't) | HIGH |

## 5. Defence-in-depth (no single control load-bearing)
- L0 On-device boundary: keystore unreachable from backend-client (CI-enforced); deniability
  egress cutoff (I3); egress allowlist (build fails on undeclared endpoints).
- L1 Data minimisation (most important): compute on-device where possible (net worth, P&L,
  tax = local math, backend not involved); address blinding / broad-fetch-filter-locally so
  backend never learns WHICH address matters; strip/anonymise LLM context or use on-device
  inference; tokenise push (token→delivery, never token→address).
- L2 Trust placement: user-controlled RPC default (base44 NOT in chain-read path); BYO
  provider keys (calls provider-direct under user secret); base44 as stateless orchestration,
  not a data lake.
- L3 In-transit/at-rest: TLS; privacy-proxy/Tor option for high-risk features; CLIENT-SIDE
  ENCRYPT anything base44 persists (breach yields opaque blobs); no persistent address↔account
  map server-side.
- L4 Access/tenancy: per-app least-privilege secrets; verify (don't assume) base44 isolation;
  auth decoupled from wallet identity.
- L5 Detection/honesty: user-inspectable on-device egress log (verifiable I2, kills R8);
  per-feature disclosure UI, off by default, hard-off in deniability mode.

## 6. Per-feature disposition
| Feature | Without leaking A2? | Disposition |
|---|---|---|
| Net worth, P&L, spending, snapshots, fees | Yes (on-device) | WIRE (no backend) |
| Notes/labels/address book | Yes (client-encrypted if synced) | WIRE |
| Price/market | Yes (broad fetch, filter local) | WIRE (+proxy) |
| Chain reads | Yes (user RPC) | WIRE, base44 not in path |
| Token/NFT enrichment | Partly | OPT-IN or honest-disable |
| Tax export | Yes (on-device, client-encrypted) | WIRE |
| Push/alerts | Yes (tokenised) | WIRE carefully |
| AI/LLM advisor | Only on-device or stripped opt-in | OPT-IN(stripped) or disable; NEVER raw wallet data |
| Social | No | CUT |
| Anything in deniability mode | N/A | DISABLED (I3) |

Most wanted features ARE retainable — by keeping base44 OUT of the sensitive path (on-device
compute + user RPC + client-side encryption). Inherently-server features become explicit,
off-by-default, labelled opt-ins, or are honest-disabled.

## 7. base44-specific notes
Stateless orchestration + delivery, not a holdings store; client-encrypt anything persisted;
BYO provider keys; auth decoupled from wallet identity; verify tenancy/retention/deletion as
audit line-items; disclose in privacy policy exactly what base44 can see per feature; weigh
platform re-coupling vs self-hosting the few needed functions.

## 8. Residual risk (disclose, don't hide)
- RR1 Enabled opt-in features still leak to the server when on — say so; "you control your
  data," not "private."
- RR2 Metadata (IP/timing) leaks persist without proxy/Tor.
- RR3 Breach exposes data a feature actively needs to read (client-encryption protects stored
  blobs, not in-use data).
- RR4 Supply-chain (T5) needs its own review.
- RR5 None of this is audited; all ratings pre-audit estimates.

## 9. Recommendations (priority)
1. Enforce I1–I5 in code (module boundaries + CI guards, extend check:rng pattern).
2. Default to on-device compute + user-controlled RPC (keeps base44 out of sensitive path).
3. Client-side-encrypt anything base44 persists.
4. Build the user-inspectable egress log.
5. Per-feature opt-in + disclosure; off by default; hard-off in deniability.
6. Make every server-touching feature an explicit audit line-item; this doc is the brief.
7. Reconsider platform re-coupling vs self-hosting.

## 10. NOT
Not an audit, not a guarantee, not a basis for "secure"/"audited" marketing. Design hypothesis
+ audit brief. Provisional pending independent review (hard launch blocker).

## Related
- docs/Data-source-privacy-posture.md · positioning-scope-design spec (§2,§6) ·
  docs/Production-readiness.md · docs/Salvage-roadmap.md · docs/Security-scan-2026-06.md
