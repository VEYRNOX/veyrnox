# Decisions

A log of **why** significant technical and product decisions were made, so nobody (human or
agent) re-litigates them without knowing the reasoning. Newest first. Detailed write-ups stay
in their own docs; this file is the index with the one-paragraph reason.

**How to add an entry:** copy the template at the bottom, date it, link the evidence (PR,
doc, issue). If you reverse a decision, add a new entry that says so and mark the old one
`Superseded by` rather than editing history.

Entries before 2026-10-01 were reconstructed from the linked docs and `CLAUDE.md`; dates are
the dates those sources record. Anything marked **(check)** was not independently re-verified
when this file was written.

---

## 2026-08-24 — Argon2id for new vaults: 96 MiB / t=6, old vaults stay 192 MiB / t=3
**Status:** BUILT (migration flag OFF)
**Decision:** New vaults use 96 MiB memory / 6 iterations. Existing vaults keep 192 MiB / 3
iterations. Total work is equal (192×3 = 96×6); lower memory cuts unlock latency and
out-of-memory risk on low-end devices.
**Why:** The KDF history oscillated (192 → 64 MiB for latency, back to 192 MiB once biometric
unlock gave a fast path, then to 96/6). KDF parameters are stored in the vault blob so each
vault unlocks under its own recorded params.
**Consequence:** Migrating old vaults is gated behind `KDF_PROFILE_V2_MIGRATION_ENABLED`,
which stays off. Issue #2101 was closed by the owner *without* the real-device benchmark
having been run or the flag flipped, so do not treat the flag as validated.
**See:** `src/wallet-core/vault.js`, [`CHANGELOG.md`](CHANGELOG.md)

## 2026-08-08 — Personal Backup (2-of-3 Shamir) may be built before the independent audit
**Status:** BUILT (UNAUDITED-PROVISIONAL)
**Decision:** Owner override of the rule that cloud-recovery features wait for the audit.
Personal Backup (share A on device, B in cloud, C physical) is authorized to proceed.
**Why:** Recorded as a deliberate, owner-authorized override after Codex flagged the
affected PR. It does not lift the audit gate for other cloud-recovery work.
**See:** `AGENTS.md`, `docs/cloud-recovery-shard-spec.md`

## 2026-08-11 — Core infra wiring locked
**Status:** IN FORCE
**Decision:** The TIP worker, `tip-chat` / `tip-screen` edge functions, Supabase secrets,
Transak/Buy flow, RevenueCat IDs and the client advisor wiring are locked. Changes need an
explicit owner request naming the change.
**Why:** The pieces are coupled by HMAC signing, shared secrets and entitlement checks; a
partial change (for example rotating a secret without the matching worker update) takes prod
chat down. The Transak relay is also tied to a security checklist submitted to Transak.
**See:** "Hard rules" in [`CLAUDE.md`](CLAUDE.md), `docs/Feature-Status.md` (2026-08-11 entry),
`docs/transak-relay.md`

## 2026-07-13 — RASP remote attestation allowed, but disclosed and deniability-gated (Option B)
**Status:** BUILT, UNAUDITED-PROVISIONAL, not device-verified
**Decision:** Play Integrity / App Attest may be used, but only at pre-sign time, only on an
explicit disclosed user action, never on unlock, never under decoy/duress, identical across
primary sets, with the verdict validated on-device (no backend authority over signing),
failing closed.
**Why:** An attestation call is network egress, and in a coercion-resistant wallet *whether
and when* a call fires is itself a signal. A call that differs by unlocked set is a
deniability oracle. Option A (no attestation) was rejected for weaker detection of OS-level
compromise.
**Known gap:** on-device RS256 JWS verification is absent (no pinned Google root cert).
**See:** [`docs/rasp-attestation-egress-decision.md`](docs/rasp-attestation-egress-decision.md)

## 2026-06-30 — Decoy wallet has no second factor (H2, Option B)
**Status:** HONEST-DISABLED by design
**Decision:** A decoy wallet is PIN-only, with no second factor.
**Why:** A decoy that demands extra friction the real wallet doesn't would itself be a
distinguisher. Storage groundwork remains; enforcement wiring was deliberately not built.
**See:** [`docs/h2-threat-model-decision-required.md`](docs/h2-threat-model-decision-required.md)

## 2026-06-17 — Mainnet unlocked after the internal audit
**Status:** IN FORCE
**Decision:** Mainnet (ETH, BTC, SOL; all 10 assets) opened on owner sign-off after the
internal audit found 0 critical/high/medium. The independent ECC audit (2026-06-23) later
satisfied §24.
**Why / caveat:** The internal audit is the gate. "Internal" is never presented as
"independent". The independent audit of the *full stack* (including hardware KEK and native
RASP) remains outstanding.
**See:** `docs/Feature-Status.md`, `docs/audit-triage/`

## 2026-06-16 — Audit log wired for primary sessions only, ahead of the audit
**Status:** BUILT, not surfaced (no UI)
**Decision:** The audit-log primitive is wired for the primary session only, hard-off in
decoy/hidden, with a denylist refusing duress/stealth/hidden/panic/decoy/seed events.
Login Activity stays HONEST-DISABLED.
**Why:** Logs are state, and state that distinguishes real from decoy defeats I3. The
per-set storage shape (D1–D7) is deferred to the auditor; the narrow primitive avoids the
hazard by refusing to log sensitive events at all.
**See:** [`docs/audit-log-login-activity-deniability-decision.md`](docs/audit-log-login-activity-deniability-decision.md)

## Face ID resolves to the decoy (single unlock mode)
**Status:** BUILT (design in `docs/kek-architecture-spec.md`) **(check date)**
**Decision:** Biometric unlock opens the decoy wallet; only the typed real PIN opens the real
one. There is exactly one unlock machine, with no "real-only" or "duress-off" mode and no
deniability toggle.
**Why:** A biometric can be compelled, knowledge cannot. If Face ID opened the real set it
would bypass the whole duress stack. If some devices ran a different mode, the mode itself
would be an oracle ("is duress configured?").
**See:** [`docs/kek-architecture-spec.md`](docs/kek-architecture-spec.md) §2, §11

## Remote images are not loaded from arbitrary hosts
**Status:** DECISION recorded; check Feature-Status for which fixes landed **(check)**
**Decision:** No auto-loading of attacker-controllable image URLs (NFT metadata). Preferred:
same-origin proxy plus per-image opt-in; bundle the Unsplash placeholders locally.
**Why:** An airdropped NFT with a tracking-pixel URL is a deanonymization beacon against a
wallet whose premise is coercion resistance (I2/I5).
**See:** [`docs/remote-image-egress-decision.md`](docs/remote-image-egress-decision.md)

## CryptoSigning playground: relabel, don't gate
**Status:** DECISION recorded **(check)**
**Decision:** `/crypto-signing` only handles ephemeral, user-generated keys (never the vault
seed), so it was rated LOW and not an I1 violation. Drop the "(Live)" label; add a shared
clipboard auto-clear helper app-wide.
**See:** [`docs/CryptoSigning-key-handling-decision.md`](docs/CryptoSigning-key-handling-decision.md)

## Backend stays optional, thin and untrusted
**Status:** IN FORCE
**Decision:** Any backend is adopted only if it passes a per-feature wedge-alignment filter,
holds no keys and no recovery, and egress is structurally disabled in deniability sessions.
**Why:** Re-coupling to a hosted backend reverses the serverless, no-hosted-account decision;
it must be a conscious, audited choice.
**See:** [`docs/Backend-security-architecture.md`](docs/Backend-security-architecture.md)

---

## Template

```
## YYYY-MM-DD — Short decision title
**Status:** BUILT | TARGET | PLANNED | HONEST-DISABLED | IN FORCE | Superseded by <link>
**Decision:** What we chose, in one or two sentences.
**Why:** The reasoning and the alternatives rejected. This is the part that matters.
**Consequence:** What this constrains or commits us to.
**See:** PR / issue / doc links
```
