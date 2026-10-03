# Veyrnox Roadmap

This is the **index and guardrail** for what gets built next. It does not replace the
detailed roadmaps; it says which one governs what, and what is off-limits. If you are an
agent (or a person) about to start work, read this first, then the linked doc for your area.

**Status tags** (same as everywhere else in this repo): **BUILT** (in code, tests green) ·
**TARGET** (designed, not in code) · **PLANNED** (roadmap, not yet specced) ·
**HONEST-DISABLED** (present but off on principle). "Verified" is reserved for a real
on-chain transaction with a txid; green tests are BUILT at most.

**Source of truth for status is [`docs/Feature-Status.md`](docs/Feature-Status.md).**
When it disagrees with a roadmap, it wins, then fix the roadmap. Roadmaps below were last
touched on the dates shown and some predate the current state (see "Known stale").

## Where Veyrnox is now

- iOS and Android 1.0.3 (59) are published to both stores (Google Play 2026-10-02, App Store
  2026-10-03; `docs/RELEASE-v1.0.3.md`). 1.0.3 carries the fix that lets Android take
  over-the-air updates. Mainnet has been unlocked since
  2026-06-17 (ETH, BTC, SOL, all 10 assets live).
- The internal audit is complete. The independent third-party audit of the full stack
  is **still outstanding** and "internal" is never presented as "independent" (invariant I4).
- Hardware KEK and RASP are device-verified internally; neither is independently audited.

Re-derive anything numeric from the code and `docs/Feature-Status.md` before quoting it.

## Current priorities

In order. Pull from the top; do not skip ahead.

1. **Independent third-party audit of the full stack** (hardware KEK, native RASP,
   vault, signing). Scope in [`docs/Audit.scope.md`](docs/Audit.scope.md). This is the
   gating item for dropping "UNAUDITED-PROVISIONAL" on KEK/RASP.
2. **Transaction-intelligence unification**, in the PR order laid out in
   [`docs/transaction-intelligence-roadmap.md`](docs/transaction-intelligence-roadmap.md)
   (status: PROPOSED). Next three PRs: WalletConnect consumes the shared verdict, then
   WalletConnect corpus enrichment, then the shared policy object becomes signer-facing.
3. **RASP validation**: remaining phases (real-device scenario matrix, then audit) in
   [`docs/rasp-validation-roadmap.md`](docs/rasp-validation-roadmap.md). Known gap:
   on-device attestation JWS verification needs a pinned root cert
   ([`docs/rasp-attestation-egress-decision.md`](docs/rasp-attestation-egress-decision.md)).
4. **Outstanding device-verification evidence** for hardware KEK (v2→v3 upgrade path,
   iOS salt-binding design): see [`docs/hardware-kek-phase-plan.md`](docs/hardware-kek-phase-plan.md)
   and [`docs/audit-2026-07-01-kek-internal.md`](docs/audit-2026-07-01-kek-internal.md).

The most recent weekly internal audit findings are in
[`docs/audit-2026-09-28-weekly.md`](docs/audit-2026-09-28-weekly.md); fixes for those are
tracked as GitHub issues, not here.

## Which roadmap governs what

| Doc | Governs | Last touched |
|---|---|---|
| [`docs/MVP.roadmap.md`](docs/MVP.roadmap.md) | Master plan tying build, legal and audit tracks together | 2026-07-21 |
| [`docs/Security.roadmap.md`](docs/Security.roadmap.md) | Security tiers S1–S4 (the product's differentiator) | 2026-08-08 |
| [`docs/WalletRoadmap.md`](docs/WalletRoadmap.md) | Build order for self-custody features | 2026-08-08 |
| [`docs/transaction-intelligence-roadmap.md`](docs/transaction-intelligence-roadmap.md) | Risk verdicts, signing policy, advisor | 2026-08-21 |
| [`docs/rasp-validation-roadmap.md`](docs/rasp-validation-roadmap.md) | Moving RASP from BUILT to validated | 2026-06-13 |
| [`docs/HDWalletManager.roadmap.md`](docs/HDWalletManager.roadmap.md) | Multi-asset registry and per-asset gating | 2026-05-30 |
| [`docs/Salvage-roadmap.md`](docs/Salvage-roadmap.md) | Wiring up shell pages to real data | 2026-06-05 |
| [`docs/FutureFeatures.roadmap.md`](docs/FutureFeatures.roadmap.md) | **Parking lot.** Nothing in it is greenlit. | 2026-05-31 |

## Rules for adding to the roadmap

- **Fewer things, genuinely real.** The project's historical risk is breadth over depth.
  A new feature adds build, attack surface and audit scope. It has to earn its place.
- **One at a time**, each with its own design doc, branch, PR and review.
- **Anything in `FutureFeatures.roadmap.md` stays parked** until the owner pulls it.
- **Custodial or regulated features are out of scope** (VASP/KYC machinery would break the
  non-custodial position).
- **AI is advisory only.** It never holds keys, never signs, never transacts.
- **Audit-gated work** (RASP, hardware KEK, attestation, network hardening, cloud recovery)
  needs real-device verification plus the audit before its status can drop the
  "UNAUDITED-PROVISIONAL" tag. Personal Backup (2-of-3 Shamir) is the recorded exception
  (see [`DECISIONS.md`](DECISIONS.md)).
- Anything touching a locked area (Transak/Buy, the TIP chat wiring, Supabase secrets,
  RevenueCat IDs) needs an explicit owner request; see the "Hard rules" in
  [`CLAUDE.md`](CLAUDE.md).

## Known stale

Flagged during the last docs pass. Fix at the source, don't work around them here.

- `docs/WalletRoadmap.md` still says "8 of 10 assets LIVE; AVAX and BNB receive_only".
  The README and `CLAUDE.md` say all 10 are live. Treat `docs/Feature-Status.md` as correct.
- `docs/MVP.roadmap.md` describes a 6-EVM-chain MVP and an "M2 native secure storage"
  next build, which predates BTC/SOL, hardware KEK and the store launches.
- `docs/kek-architecture-spec.md` and `docs/mobile-security-architecture.md` quote older
  Argon2id parameters than the current code (see [`ARCHITECTURE.md`](ARCHITECTURE.md)).
