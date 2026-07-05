# Backend cost model — Cloudflare Workers + R2 vs credit-metered

Status: ADVISORY / cost-model. Not a security control. Informs infra choice only.
Last updated: 2026-06-07

## Summary

For Veyrnox's on-device-first backend — which only ever handles **encrypted
artifacts** (cloud-backup blobs, attestation relays), never plaintext seeds or
keys — Cloudflare Workers + R2 costs between **$5/mo (≤100K users) and ~$227/mo
(10M users)**. A credit-metered managed backend (Base44-style) costs **$71–$102/mo
at 1K users rising to $310K–$620K/mo at 10M users**: a 20×–2,700× gap that widens
with adoption.

The cost gap is real but secondary. The deciding factor is **architectural control**:
a managed credit backend cannot honor the cloud-backup guardrails (encrypted artifact
in the user's *own* cloud, no app-exclusivity) because you do not own the runtime,
data location, or auth surface. That reintroduces the soft-custody / app-exclusivity
coupling already rejected as fake security.

## Pricing inputs (Cloudflare, Workers Paid plan)

| Item | Price | Included in $5 base |
|---|---|---|
| Workers base | $5/mo | 10M requests + 30M CPU-ms |
| Extra requests | $0.30 / million | — |
| Extra CPU-ms | $0.02 / million | — |
| R2 storage | $0.015 / GB-month | — |
| R2 Class A (writes/PUT/LIST) | $4.50 / million | — |
| R2 Class B (reads/GET) | $0.36 / million | — |
| R2 egress | $0 | decisive line item |

Verify against current Cloudflare pricing before relying on these for planning.

## Workload assumptions (per active user / month)

| Parameter | Value | Rationale |
|---|---|---|
| Encrypted-blob writes | 4 | config / vault-metadata changes |
| Restores | 0.2 | rare (device loss / reinstall) |
| Attestation relays | 2 | occasional liveness |
| Blob size | 64 KB | keys + metadata, not chain data |
| Worker CPU-ms / request | 8 | thin: auth check + R2 passthrough |
| Storage model | 1 current blob/user | overwrite, not append |

## Cloudflare cost by scale

| Users | Requests/mo | Workers $ | R2 ops $ | R2 storage $ | Total $/mo | $/user |
|---|---|---|---|---|---|---|
| 1,000 | 6,200 | 5.00 | 0.02 | 0.00 | 5.02 | 0.0050 |
| 10,000 | 62,000 | 5.00 | 0.19 | 0.01 | 5.20 | 0.0005 |
| 100,000 | 620,000 | 5.00 | 1.88 | 0.10 | 6.98 | 0.0001 |
| 1,000,000 | 6.2M | 5.39 | 18.79 | 0.96 | 25.14 | 0.00003 |
| 10,000,000 | 62M | 29.92 | 187.92 | 9.60 | 227.44 | 0.00002 |

Per-user cost *falls* with scale (fixed base amortizes) — the cheap-at-scale property.
Storage and egress stay near-invisible: blobs are small and overwritten, egress is free.

## Credit-metered comparison (Base44-style)

Model: `$40 base (representative production tier) + 6.2 actions/user/mo x rate`,
rate $0.005 (low) to $0.01 (high) per user-triggered backend action.

| Users | Cloudflare $/mo | Credit low $/mo | Credit high $/mo | Multiplier (high) |
|---|---|---|---|---|
| 1,000 | 5.02 | 71 | 102 | 20x |
| 10,000 | 5.20 | 350 | 660 | 127x |
| 100,000 | 6.98 | 3,140 | 6,240 | 895x |
| 1,000,000 | 25.14 | 31,040 | 62,040 | 2,467x |
| 10,000,000 | 227.44 | 310,040 | 620,040 | 2,726x |

The divergence is structural, not a tuning artifact: credit pricing carries a
per-user marginal cost; Cloudflare's marginal cost is ~zero until generous included
tiers are exhausted.

## Sensitivity (levers that move the Cloudflare numbers)

- **Blob size.** Storage and Class B reads scale with it. 64 KB is noise; 1 MB
  is 16x the (tiny) storage line — still small absolutely.
- **Restore frequency.** Modeled 0.2/user/mo. A client that re-fetches on every
  launch makes reads dominate. Add a client-side guard.
- **Worker CPU-ms.** Modeled thin at 8 ms. Doing crypto verification server-side
  would inflate CPU-ms — and is wrong on security grounds anyway. Keep the Worker
  a dumb authenticated passthrough: same architecture is both secure and cheap.

## Decision

Cloudflare Workers + R2 for the backend. Lower cost, linear/transparent scaling,
zero egress, and — decisively — full control over runtime, data location, and auth,
which is what makes the cloud-backup guardrails (C1-C6) auditable. A managed credit
backend is acceptable only for non-sensitive UI prototyping, never for the artifact
backend.
