# RASP attestation — I2 egress-disclosure decision

**Status:** PRE-AUDIT · **DECISION PROPOSED (awaiting sign-off)** · surface state unchanged (RASP stays `roadmap`, detection parked)
**Phase:** Validation roadmap Phase 1 — the documented prerequisite (a) for the attested detection leg.
**Scope:** decides *whether and how* RASP may use **remote device attestation** (a network egress), separately from the **on-device self-attested probes** (no egress, Phase 2a). Pure analysis — no code, touches no detector/signer/key.
**Related:** `docs/rasp-validation-roadmap.md`, `src/rasp/index.js` (§8a build seam), `docs/audit-log-login-activity-deniability-decision.md` (same posture), invariants I1–I5.

> **Why this decision must exist before the attested leg is built.** Remote attestation is a network call that leaves the device. In a coercion-resistant wallet, *when* and *whether* a network call fires is itself a signal — and a signal that differs by which wallet-set was unlocked is a deniability oracle, every bit as fatal as a visible wallet count. So the egress cannot be added "because it improves detection" without first deciding what it discloses, to whom, and under which unlocks it is allowed to fire at all. This is exactly the kind of backend/egress design CLAUDE.md §24 says the audit must review *before* the build.

---

## 1. The two detection legs are NOT the same decision

| Leg | Egress? | Decided by | This doc |
|---|---|---|---|
| **2a — self-attested probes** (root/jailbreak, emulator, hook/debugger, tamper) | **No** — on-device inspection only | Already pre-audit-safe (§8a) | out of scope here |
| **2b — remote attestation** (Play Integrity / App Attest / DeviceCheck) | **Yes** — a network call to Google/Apple | This decision | the subject |

The probes (2a) need no egress decision — they read the local runtime and feed `degrade()` without a packet leaving the device. **This doc only governs the attested leg (2b).**

## 2. What each attestation channel discloses, and to whom

- **Android — Play Integrity API.** The app requests a signed integrity verdict (device integrity, app licensing, app recognition). The request reaches **Google**, which observes: the calling app identity, the device's Play context/IP, and timing. The verdict is a signed token typically **decoded server-side** — i.e. it traditionally implies a **backend** in the trust path.
- **iOS — App Attest / DeviceCheck.** The app generates a hardware-backed key that **Apple** attests; DeviceCheck persists per-device bits. **Apple** observes app + device identity and timing.

In all cases the payload is **device/app integrity signals, never the seed or keys (I1 holds)** — but the *fact of the call* and *its timing* are observable to the platform vendor and to a network observer.

## 3. The invariant tensions (why this is hard)

- **I2 — no silent egress.** An attestation call is egress. It may not fire silently; it must be disclosed to the user as a network action.
- **I5 — backend untrusted by design.** Play Integrity's usual shape puts a server in the path of decoding/deciding the verdict. Letting a backend hold authority over whether the device may sign **contradicts I5**. Any design must keep the *signing gate decision* on-device; a backend may at most relay a signed token the device itself validates.
- **I3 — deniability is sacred; deniability mode makes ZERO backend calls.** This is the sharp edge. If a **real** unlock triggers an attestation call and a **decoy/duress** unlock does not, a network observer (or a coercer watching traffic) learns which unlock occurred → a **wallet-set oracle**. Therefore attestation **must not fire under any decoy/duress unlock**, and across *primary* sets its trigger/timing/payload must be byte-identical.
- **I1 — keys never leave device.** Confirmed: attestation transmits integrity signals, not key material. Must stay that way.
- **I4 — fail honest / fail closed.** When attestation is unreachable/unavailable, the result is `INTEGRITY_UNAVAILABLE` (→ WARN), never silently read as "clean."

## 4. The deniability trap, concretely

The dangerous pattern is **attestation-on-unlock**: unlock the real set → token fetched; unlock the decoy → no fetch. A coercer who has tapped the network, or simply watches for the request, distinguishes the sets. Even *identical* attestation on every unlock leaks "this app attests on unlock" but at least doesn't distinguish sets — however it still violates I3's "deniability mode makes zero backend calls." So the only safe positions are:

1. **No attestation egress at all** (the probes carry RASP v1), or
2. **Attestation only on an explicit, user-initiated, disclosed action** (e.g. a production-mainnet high-value sign), **never automatically on unlock**, **never under a decoy/duress unlock**, identical across primary sets, fail-closed.

## 5. Options

- **Option A — No attestation egress in v1 (RECOMMENDED).** Ship RASP detection as **on-device self-attested probes only** (Phase 2a). RASP still detects root/jailbreak, emulator, hook/debugger, and tamper locally and gates signing accordingly — with **zero new egress**, no I5 trust delegation, and no I3 oracle. The attested leg is **specced and deferred** to a post-audit cycle. Honest, minimal, sidesteps the three hardest invariant conflicts; the probes are where most real coercion-context value is anyway (a coercer's modified device trips them without any network call).
- **Option B — Attestation egress, disclosed + deniability-gated.** Build 2b under strict rules: never on unlock; only on an explicit disclosed user action; never under decoy/duress; identical across primary sets; on-device verdict validation (no backend authority over signing); fail-closed. More device coverage (catches OS-level compromise the probes miss), but it is precisely the egress/deniability surface the audit must scrutinize, and it carries real residual oracle risk if any trigger is mis-placed.
- **Option C — Attestation always-on at unlock. REJECTED.** Silent-on-unlock egress (I2) and a per-set oracle (I3). Off the table.

## 6. Recommendation

**Adopt Option A for v1.** Reasons: (1) it delivers honest RASP detection now with no egress and no new trust in a backend (I2/I5 clean); (2) it cannot create a wallet-set oracle because nothing leaves the device (I3 trivially safe); (3) attestation's *marginal* benefit over local probes is real but is exactly the backend/egress capability §24 says to gate behind the audit; (4) deferring 2b keeps the build seam honest — we don't ship an egress path we can't yet verify or audit.

If attestation is later pursued (Option B), it returns as its own audit-reviewed cycle with the §4-(2) constraints as hard requirements.

## 7. Invariant compliance of the recommendation (Option A)

| Invariant | How Option A holds it |
|---|---|
| **I1** keys never leave device | Probes read runtime signals only; no key material, no egress. |
| **I2** no silent egress | No network call at all in the detection path. |
| **I3** deniability sacred | Nothing leaves the device → no per-set network signal → no oracle. Zero backend calls in any mode. |
| **I4** fail honest/closed | Probe unavailable → `INTEGRITY_UNAVAILABLE` → WARN; never read as clean. |
| **I5** backend untrusted | No backend in the detection or gating path. |

## 8. Open items for sign-off (genuinely your / the audit's call — not mine to decide)

1. **Accept Option A** (no attestation egress in v1; on-device probes only)? — *recommended.*
2. If/when **Option B** is pursued: confirm the hard constraints — never on unlock, never under decoy/duress, explicit disclosed trigger only, on-device verdict validation (no backend authority over signing), identical across primary sets.
3. Confirm that **on-device probe *results* are never transmitted anywhere** — they stay local and only drive the local pre-sign gate (no telemetry, no "we detected root" beacon, which would itself be egress + a fingerprint).
4. Confirm RASP detection v1 may proceed to **Phase 2a build** on the strength of Option A (probes are pre-audit-safe; no egress decision blocks them).

---

**Until signed off, this is a proposal.** No detection code lands and no status changes on the strength of a proposal. Sign-off on item 1 (or 4) unblocks Phase 2a (the no-egress probe scaffolding); the attested leg (2b) stays parked behind the audit regardless.
