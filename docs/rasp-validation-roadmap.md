# RASP validation roadmap — from BUILT policy to VALIDATED defense

**Status:** PRE-AUDIT · current RASP state **BUILT (policy only) / detection PARKED**
**Owner:** —
**Related:** `src/rasp/` (§8a build seam), `src/pages/RaspSecurity.jsx` (honest dashboard, PR #170), CLAUDE.md §24 (audit gate), invariants I1–I5.

> **What "validated" means here.** RASP is not an asset send, so its evidence is **not a txid**. For RASP, *validated* means: the detector has been **exercised on real devices against a genuinely hostile runtime**, behaves correctly across the scenario matrix (§Phase 4), does **not** brick legitimate users, and the construction has passed the **independent audit** (§24). Passing unit tests, clean review, or a green CI suite get you to **BUILT at most — never validated** (CLAUDE.md: "Verify, don't assert"). An emulator green check is false confidence and is explicitly not evidence.

---

## The honesty contract (do not break)

Nothing between Phase 0 and Phase 6 may display or record RASP as "validated", "verified", "active", or "monitoring". The dashboard's `Detection` stays `pending`, `Wired to send path` stays `no`, and `Independent audit` stays `not yet`, until the phase that legitimately flips each — driven by the feature-catalogue status, not by hand (the §5 honesty-lock already enforces this: the surface cannot claim active unless `resolveStatus('RASP') === verified`).

| Phase | Gate cleared | Catalogue/dashboard after | Evidence required to advance |
|---|---|---|---|
| 0. Foundations | — | `roadmap` · policy BUILT | ✅ `degrade.js` + I3 test + honest dashboard (done) |
| 1. I2 egress decision | I2 / I5 | `roadmap` (unchanged) | Signed-off decision doc |
| 2. Build detection legs | — | `roadmap` (detection BUILT, unwired) | Unit + integration tests green |
| 3. Wire to pre-sign path | I3 / I4 | `roadmap` (BUILT, wired behind flag) | Deniability + fail-closed tests green |
| 4. Real-device verification | §24 (b) | still not validated | Device evidence record (per scenario) |
| 5. Independent audit | §24 (a) | still not validated | Auditor sign-off |
| 6. Status flip | "Verify, don't assert" | **VALIDATED** | Phase-4 evidence **and** Phase-5 sign-off, both real |

---

## Phase 0 — Foundations  ✅ DONE

- [x] Pure degradation policy `degrade(condition) → artifact` — `src/rasp/degrade.js`.
- [x] Condition/tier vocabulary — `src/rasp/conditions.js`.
- [x] I3 deniability test (response byte-identical real-vs-decoy) — `src/rasp/__tests__/i3-deniability.test.js`.
- [x] I4 fail-closed test (unknown condition → strongest BLOCK).
- [x] Honest current-state dashboard + Security tile — `src/pages/RaspSecurity.jsx` (PR #170).

**State:** policy BUILT, pre-audit-safe. Detection does not run; nothing is wired.

---

## Phase 1 — I2 egress-disclosure decision  *(prerequisite (a) for the attested leg)*

**Goal:** decide, on paper and before any code, whether/how remote attestation can run without violating I2 (no silent egress) or I5 (backend untrusted). Pure analysis — pre-audit-safe.

- [ ] Enumerate exactly what each attestation channel transmits and to whom: Android **Play Integrity** (device + app signals → Google), iOS **App Attest / DeviceCheck** (→ Apple).
- [ ] Decide the **user-disclosure surface** — an attestation call is a network egress and must be disclosed, never silent (I2).
- [ ] Prove **deniability neutrality (I3):** an attestation call must be byte-identical across real and decoy sets — same trigger, same timing, same payload — or it is a wallet-set oracle. Decide whether attestation runs *at all* in deniability mode (I3: "deniability mode makes zero backend calls" → likely **no attestation egress under a decoy/duress unlock**).
- [ ] Decide **fail-closed semantics** when the verdict is unavailable/unreachable → `INTEGRITY_UNAVAILABLE` (WARN), never silently treated as clean.
- [ ] Decide whether the attested leg is even in scope v1, given I5 (backend untrusted) — the self-attested probes (Phase 2a, no egress) may carry v1 alone, with attestation deferred.
- **Output:** `docs/rasp-attestation-egress-decision.md` (a decision doc with options + recommendation + open sign-off items, mirroring the audit-log deniability decision doc).

**Open calls for sign-off** (not for me to decide unilaterally): whether to ship attestation egress at all v1; what exactly is disclosed and where; behavior under decoy/duress unlock.

---

## Phase 2 — Build the detection legs → `src/rasp/detect.js`  *(BUILT, not validated)*

**Goal:** turn a real runtime into a `CONDITION` that feeds `degrade()`. Composed as `detect() → condition → degrade()`.

### 2a — Self-attested probes (on-device, NO egress) — startable now, pre-audit-safe
- [ ] Root / jailbreak indicators (su binaries, suspicious paths, Cydia/Magisk signals) via a Capacitor native plugin.
- [ ] Emulator detection (build props, sensors, known emulator fingerprints).
- [ ] Debugger / hook detection (e.g. Frida/Xposed signals, ptrace).
- [ ] Binary tamper / repackage detection (signature/checksum of the app bundle).
- [ ] **Web / no-native fallback fail-closes to `INTEGRITY_UNAVAILABLE`** — never reports "clean" off a runtime it cannot inspect.
- [ ] Unit + integration tests for every probe → condition → tier mapping.
- **Status: BUILT.** Ships as UNAUDITED-PROVISIONAL, unwired, dashboard stays `pending`.

### 2b — Attested verdict client (EGRESS) — only after Phase 1
- [ ] Android Play Integrity verdict client; iOS App Attest / DeviceCheck.
- [ ] Integrate verdict → `INTEGRITY_FAIL` / `INTEGRITY_UNAVAILABLE` conditions.
- [ ] Honor the Phase-1 disclosure + deniability decision (no egress under decoy/duress).
- **Status: BUILT.** Still not validated — a verdict path is only trustworthy once exercised on real devices.

---

## Phase 3 — Wire to the chokepoint (the pre-sign path)  *(BUILT, wired behind flag)*

**Goal:** make the verdict actually gate signing, at the single pre-sign chokepoint.

- [ ] Insert `detect → degrade → composeGate` at the pre-sign chokepoint, behind a flag, defaulting fail-closed.
- [ ] BLOCK refuses signing with **no override** (a hostile runtime can hook the confirmation); WARN requires biometric re-confirm; ALLOW = normal flow; EMULATOR keeps testnet available.
- [ ] **I3 deniability test:** gate behavior identical across sets.
- [ ] **I4 fail-closed test:** unavailable/unknown → strongest safe tier.
- [ ] Keep RASP (environment plane) and tx-risk (`src/risk`) as two planes, one chokepoint, **no shared inputs** (§6).
- This is what would flip the dashboard's `Wired to send path` `no → yes` — but only the *flag-on, real-detector* path counts; do not flip the catalogue while detection is unverified.

---

## Phase 4 — Real-device verification  *(prerequisite (b) — the actual validation)*

**Goal:** prove correct behavior on real hardware. **Cannot be done in the current dev environment** (Windows; iOS needs a Mac; needs physical devices + attestation backends).

- [ ] Native builds: iOS (Mac) + Android.
- [ ] Run the **scenario matrix** on real devices; capture evidence (logs + screen recordings) for each:
  - [ ] Clean device → `ALLOW`
  - [ ] Rooted / jailbroken → `WARN` (biometric re-confirm)
  - [ ] Emulator → `BLOCK` production sign, testnet allowed
  - [ ] Frida / debugger attached → `BLOCK`
  - [ ] Repackaged / tampered binary → `BLOCK`
  - [ ] Attestation fails → `INTEGRITY_FAIL`
  - [ ] Attestation unreachable → `INTEGRITY_UNAVAILABLE` (fail-closed)
- [ ] **False-positive sweep** across a range of genuine clean devices / OS versions — RASP must not block legitimate users.
- **Output:** a device-verification evidence record (the RASP analogue of `docs/verified-evidence.json`) listing scenario → observed condition/tier → evidence artifact.

---

## Phase 5 — Independent audit (§24)

**Goal:** external review *before* RASP is trusted — required for any seed-touching / device-attestation build.

- [ ] Audit reviews: the Phase-1 egress/attestation design; the deniability + storage-shape construction; probe evasion-resistance; the pre-sign wiring.
- **Output:** auditor sign-off.

---

## Phase 6 — Flip the status  *(only now, with real evidence)*

- [ ] Update `src/lib/featureCatalogue.js` RASP `roadmap → built →` validated **only** with the Phase-4 evidence record **and** the Phase-5 sign-off.
- [ ] Dashboard updates automatically via the honesty-lock (`resolveStatus`): banner → active, `Detection: live`, `Wired: yes`, `Audit: passed`.
- [ ] **Keep the honest caveat even then:** "validated" = "verified correct against the *tested* hostile scenarios on real devices, and audited" — **not** "unbypassable." RASP is an arms race; the status claims only what was actually proven.

---

## What can start now (honestly), and what cannot

- **Now, pre-audit-safe:** Phase 1 (I2 egress decision doc) and Phase 2a (no-egress self-attested probe scaffolding, landed as BUILT/unwired). Per the §8a staging, Phase 2a should follow Phase 1.
- **Cannot be done in this environment:** Phases 4–5 — they need real hardware (a Mac for iOS), physical rooted/jailbroken/emulator devices, attestation backends, and the external auditor. No amount of local work substitutes for them, and the status stays `roadmap`/BUILT until they happen.
