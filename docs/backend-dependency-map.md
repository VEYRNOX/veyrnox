# Backend dependency map — mobile features

Status: DESIGN reference — provisional, PRE-AUDIT. Not a security sign-off.
Last updated: 2026-06-07

## Purpose

Documents which mobile features depend on the thin backend, and which do not.
The design goal (per Technical & Security Architecture and Backend Security
Architecture) is that almost nothing hard-depends on the backend: most features
compute on-device or read via user-controlled RPC, and the backend is kept out of
the sensitive path. Every backend-dependent feature below is PLANNED/audit-gated,
not BUILT. Build of any backend component is GATED on the independent audit.

Status tags: BUILT (in code, testnet, provisional) · TARGET (designed, not yet real) ·
PLANNED (gated on audit) · HONEST-DISABLED (no fabrication).

## Dependency matrix

| Feature | Backend dependency | Why / mitigation | Status |
|---|---|---|---|
| Push / smart alerts | Hard — required | Server must route the notification; device can't receive a push it isn't awake to request. Tokenised, address-decoupled (token to delivery, never token to address). | PLANNED, audit-gated |
| Cloud self-recovery (encrypted backup sync) | Soft — sync path only | Backend is thin glue to the user's own cloud; blob is client-encrypted (C1-C6); backend sees only ciphertext. Personal cloud is user-owned (Zone 2). | PLANNED, audit-gated |
| NFT/token enrichment, ERC-20 discovery, analytics-by-address | Conditional — opt-in | Needs external data the device can't get privately; off-by-default, disclosure-gated, or honest-disabled. | PLANNED (shells) |
| AI advisor | Only if server-side | On-device inference means no dependency. Stripped/anonymised LLM context is backend-mediated. Currently disabled. | HONEST-DISABLED |
| Net worth, P&L, spending, snapshots, tax export, fee analytics | None | On-device compute. | PLANNED (shells) / BUILT core |
| Balances, transaction history | None | User-controlled RPC (Zone 2). | BUILT |
| Send, receive, signing | None | On-device only (I1). | BUILT |
| Local notes / labels / address book | None (client-encrypted if synced) | Compute local; ciphertext-only if backed up. | BUILT / PLANNED sync |
| Anything in deniability mode | None — structurally cut | I3 hard-disables all egress; fails closed. | BUILT |

## Per-feature reasoning

### Hard dependency

Push / smart alerts. The only true hard dependency. Delivering a notification
requires a server endpoint to route to the device — the device cannot receive a push
it is not awake to request. Mitigated by the tokenised, address-decoupled design: the
backend holds `token -> delivery`, never `token -> address`. The `token -> address`
link exists only on-device and the token rotates, so a backend breach yields rotating
tokens, not a targeting list. This is the integration where "untrusted by design" is
most load-bearing and most worth pressure-testing in the audit.

### Soft dependency

Cloud self-recovery (encrypted backup sync). Storing/retrieving the encrypted
backup artifact involves the backend as thin glue to the user's OWN cloud
(iCloud/Drive/OneDrive). The blob is client-encrypted (invariants C1-C6), so the
backend sees only ciphertext; the passphrase is the whole defence. The sync path
touches the backend, but no plaintext does. The personal cloud is treated as
user-owned infrastructure (Zone 2), with the backend as orchestration, not a data lake.

### Conditional / opt-in

External-data features — NFT/token enrichment, ERC-20 discovery,
analytics-by-address. These need data the device does not have and cannot fetch
privately. They are explicit off-by-default, disclosure-gated opt-ins — or
honest-disabled. Enabling one leaks to the server it queries (disclosed, not hidden).

AI advisor. Currently HONEST-DISABLED. If rebuilt as on-device inference, it
depends on nothing. If it ever sends stripped/anonymised context to an LLM, that path
is backend-mediated. Today: disabled, no dependency. Never raw wallet data.

### No dependency (the majority, by design)

- Net worth, P&L, spending, snapshots, tax export, fee analytics — on-device compute.
- Balances, transaction history — user-controlled RPC (backend not in the path).
- Send, receive, signing — on-device only (I1).
- Local notes/labels/address book — compute local; client-encrypted if synced.
- Deniability mode — zero backend calls of any kind; I3 hard-cuts egress structurally,
  fails closed.

## Drift guard

If a feature appears to need the backend but does not fit one of the four
dependency classes above (hard / soft / conditional opt-in / server-side AI), treat
that as a signal it is drifting toward privacy theatre. Flag it for review rather
than wiring it. The default is: compute on-device, or read via user RPC, or make it
an explicit disclosed opt-in, or honest-disable it.

## Related
docs/Backend-security-architecture.md · docs/Technical-security-architecture.md ·
seed-backup + cloud-recovery spec (C1-C6) · docs/Feature-Status.md ·
docs/backend-cost-model.md
