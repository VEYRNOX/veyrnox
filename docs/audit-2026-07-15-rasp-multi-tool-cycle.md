# Veyrnox Audit-Session Summary

**Session dates:** 2026-07-14 → 2026-07-15
**Reviewer surface:** Claude Opus 4.7 (main) + Claude subagents (honest-reviewer, security-reviewer, security-tdd, recon, docs) + OpenAI Codex GPT-5 (second-model, read-only)
**Scope reviewed:** RASP + attestation + WalletConnect chokepoint + SEND signing path + iOS App Attest + on-device probes (Android/iOS/JS)

> **⚠️ Honesty banner (I4).** Every audit and every fix in this document is **INTERNAL AI code-and-artifact review**. It is **NOT** the independent third-party audit that the codebase's own hard rules still list as outstanding. Codex is a second-model reviewer — tier-equivalent to the internal AI review, not a substitute for a real security-firm engagement.

---

## Audit chain — four distinct passes

The session ran four progressively broader audits, each producing findings that were adversarially verified against source before being filed as issues or fixed.

### Audit 1 — Original RASP two-finding pass (early session)

Initial internal AI review of the RASP surface pre-existing at session start.

| ID | Severity | Finding | Fix PR | Landed |
|---|---|---|---|---|
| **H-1** | HIGH | `WalletConnectProvider.presignGateOrReject()` used only `browserProbeSource` — on native, hard-coded `rooted/emulator/tampered:false` meant a rooted/hooked device signed with zero RASP friction. Same fail-open class as the Send-path C-01. | [#954](https://github.com/VEYRNOX/veyrnox/pull/954) | `184e81bb` |
| **H-2** | HIGH | `PlayIntegrityPlugin.verifyJwsSignature` ES256 branch passed raw R‖S bytes to JCA's `Signature("SHA256withECDSA").verify()`, which requires DER-encoded ECDSA-Sig-Value. Every real ES256 token silently returned false → INTEGRITY_UNAVAILABLE. | [#955](https://github.com/VEYRNOX/veyrnox/pull/955) | `11fb990d` |

Both fixes BUILT / unit-tested only, INTERNAL, no device-verification.

### Audit 2 — SEND audit (mid-session)

Follow-up: is the RASP fix pattern consistent across the Send flow, or does the Trezor hardware path have a divergent implementation?

| ID | Severity | Finding | Fix PR | Landed |
|---|---|---|---|---|
| **SEND H-1** | HIGH | `SendCrypto.jsx` Trezor EVM branch bypassed the audited `hw-send.js` helpers — inlined a duplicated flow that skipped the M-2 signer-recovery check (HW_SIGNER_MISMATCH), pending-nonce block-tag + sanity window, and estimated gasLimit. Malicious/buggy device could sign a tx recovering to a different sender. | [#963](https://github.com/VEYRNOX/veyrnox/pull/963) | `7ccaab4` |

Also filed follow-up issue [#962](https://github.com/VEYRNOX/veyrnox/issues/962) for the smaller M-1..M-4 + L-1..L-3 SEND/Scanner cleanup items (still open).

### Audit 3 — Post-#963 Codex second-pass (I3 hotfix cascade)

Codex second-model review of PR #963's merged state found a P1 the internal reviewer missed — the deniability gate that lived in the old `hw/trezor.js` was not carried over into the new `hw-send.js` helpers. Four subsequent codex rounds each surfaced additional layers.

| Round | Codex-found P1 | Fix commit |
|---|---|---|
| Round 1 | `assertNotDeniabilitySession` missing in the new helpers | `f7aa2e1` |
| Round 2 | `SendCrypto.jsx` fires `getFeeData()` RPC before the helper gate | `e5b31e7` |
| Round 3 | The gate only checked session marker, not persisted `veyrnox-demo=1` flag | `c018ea0` |
| Round 4 | `DEMO` from `@/api/demoClient` is a load-time IIFE snapshot — mid-session flag flips don't propagate | `61f0c81` |
| Round 4b | `DEMO` covers `VITE_DEMO_MODE` and native-dev builds — must stay additive to the LIVE helper | `7903403` |

All five commits landed as [PR #978](https://github.com/VEYRNOX/veyrnox/pull/978), `6d2077c7`. The shared `isDeniabilityOrDemoActive()` LIVE helper in `wallet-core/deniabilitySession.js` was extracted here — used by three sites (hw-send.js, SendCrypto mutationFn, FeeSelector render conditional).

**Why so many rounds:** each fix closed a surface that revealed the next layer. Codex found different surfaces at each iteration; convergence at round 4b (only R4 finding was a preexisting attack surface, out of hotfix scope — filed as follow-up #977, later closed by PR #1011).

### Audit 4 — Full RASP multi-tool audit (main event, 2026-07-15)

The largest and most rigorous pass of the session. Explicit user request: *"an Independent Security Audit on Veyrnox RASP using ECC tools"* — I pushed back on "Independent" (I can only run internal AI reviews) and ran the maximally thorough internal audit possible.

**Method — four parallel reviewers:**

| Reviewer | Model / kind | Angle |
|---|---|---|
| `veyrnox-recon` | Claude subagent | Read-only surface mapping — files, gate topology, invariant enforcement points, prior audit residuals |
| `veyrnox-honest-reviewer` | Claude subagent | Correctness + honesty-tag audit — do labels match code, are docs stale, is fail-closed reachable |
| `security-reviewer` | Claude subagent | OWASP-style vuln hunt — bypass paths, races, injection, deniability tells, signal spoofing |
| `codex review` | OpenAI GPT-5 CLI (read-only) | Second-model independent-context pass — different training, different priors |

**Adversarial verification:** each reviewer's findings ran against actual source before filing. Codex's aggressive P1-list (15 initial candidates) reduced to 2 verified P1s after refutation — some codex findings were misreads of deliberate design intent (ROOTED→WARN is intentional biometric-gated ladder), some misidentified Google API contracts (Classic vs Standard Play Integrity), some restated already-tracked residuals as new P1s.

**Final verified findings after triangulation:**

- **2 P1s** (real live-vulnerability class with concrete failure mode)
- **10 P2s** (real weakness, bounded exploitability)
- **5 P3s** (doc-lag, dead code, hardening)

**Fixes landed in five PRs across the day 2026-07-15:**

| PR | Findings closed | Merge commit |
|---|---|---|
| [#1009](https://github.com/VEYRNOX/veyrnox/pull/1009) | **P1-1** Play Integrity nonce binding (replay defense — the only codex-catch neither Claude reviewer flagged) | `02f3b277` |
| [#1010](https://github.com/VEYRNOX/veyrnox/pull/1010) | **P1-2** sensitiveGate fail-closed on null artifact · **P2-3** attestation I3 guard covers DEMO flag · **P2-6** shape validation across detect/nativeProbe/attestation | `1a919711` |
| [#1012](https://github.com/VEYRNOX/veyrnox/pull/1012) | **P2-1** fresh RASP re-probe at sign-time (TOCTOU) · **P2-4** attestation deferred until sign intent · **P2-7** SendCrypto uses shared `useRaspArtifact()` hook + attestation freshness in G4-A/G4-B | `422ddddc` |
| [#1013](https://github.com/VEYRNOX/veyrnox/pull/1013) | **P2-5** iOS App Attest honest scope rewrite (SE-key intact ≠ jailbreak-free) · **P2-8** RaspSecurity dashboard uses `useRaspArtifact()` (composes attestation axis, no more stale mount-only reads) | `855f26e8` |
| [#1014](https://github.com/VEYRNOX/veyrnox/pull/1014) | **P2-9** useRaspArtifact bypass moved below hooks (rules-of-hooks) · **P2-10** CertPinManager CI regression guard · 5× P3 (dead-code deletion, doc-lag corrections) | `8ff8fd18` |
| [#1015](https://github.com/VEYRNOX/veyrnox/pull/1015) | Docs sync (CLAUDE.md + Feature-Status.md) | `da2c1366` |

**Refuted findings** (kept in record so a future pass doesn't re-file):

- **ROOTED → WARN with biometric ack** (codex flagged as P1). Deliberate ladder design — see `degrade.js` LADDER comments. Rooted-but-warn allows a user with an intentionally-rooted device to sign after explicit consent. Not a bypass.
- **"Play Integrity uses encrypted JWE not JWS"** (codex). Codebase uses Classic Play Integrity API which returns JWS. Codex confused Standard API (newer, encrypted).
- **"Heuristic root/hook checks fail open per-check"** (codex). Design tradeoff — closing on any uncertainty would false-positive on legitimate devices. OR-chain overlap is the intended defense; `checkDangerousProps` reflection-based is the operative modern-Android signal.
- **Security-reviewer's P1 on JS↔native bridge integrity.** Real limitation, but architectural to any client-side RASP; already disclosed in-repo as "PROVISIONAL" and open for the independent audit. Not a new finding.
- **Security-reviewer's P1 on G2-ROOTCERT-PIN.** Real exploitability, but already tracked openly. Not a new finding.

### Audit 5 — P2-2 residual decision (WC timing side-channel)

Not fixed with code — accepted as documented residual per the audit-cycle recommendation:

- Padding decoy latency to match real would introduce its own oracle (behavior of the padding logic itself is observable — jitter, animation frames).
- Threat model requires an in-room physically-present coercer with fine-grained UI-latency instrumentation across multiple sessions. Narrow.
- Padding worsens UX for real users (every WC sign takes 1.5s minimum even when attestation resolves faster).
- Matches the codebase's existing "documented residuals" shelf: G2-ROOTCERT-PIN, iOS detectTamper cert-fingerprint parity, Android checkProcNetUnix SELinux inertness.
- Revisit trigger: server-side attestation verification lands (would introduce timing consistency by construction), OR a future audit surfaces exploitation in the wild.

---

## Score sheet

| Class | Total | Fixed | Accepted-residual | Refuted-on-verification |
|---|---|---|---|---|
| P1 | 2 | 2 | 0 | 0 |
| P2 | 10 | 9 | 1 (P2-2) | — |
| P3 | 5 | 5 | 0 | — |
| **Codex-initial candidates** | 15 | 2 real P1 · 3 P2-class · 3 P3-class · **7 refuted** | | |

---

## Still open — beyond this session's scope

| Item | Blocker |
|---|---|
| **G2-ROOTCERT-PIN** — real SPKI fingerprint pin instead of `issuer.contains("Google")` | Needs Google-published root CA fingerprint OR captured real Play Integrity token from a registered Play Console app |
| **iOS App Attest entitlement wiring** — currently no-op, `AppAttestPlugin.m` fails at `DCAppAttestService.isSupported` | Apple Developer account + `App.entitlements` edit + `DeviceCheck.framework` link |
| **Device-verification against hostile hardware** — every "BUILT / INTERNAL" tag stays until on-chain txid session on real rooted/jailbroken/Frida'd device | Physical devices + session runbook |
| **[#957](https://github.com/VEYRNOX/veyrnox/issues/957)** — full `verifyJwsSignature` Kotlin JVM harness (currently only extracted `EcdsaDerTranscoder` is JVM-tested) | Time — small scope, well defined |
| **[#962](https://github.com/VEYRNOX/veyrnox/issues/962)** — SEND / Scanner cleanup (M-1..M-4 / L-1..L-3) | Time — several small orthogonal items |
| **Independent third-party audit** — the ONLY thing that flips any of the INTERNAL tags to Independent | Real security firm engagement (Trail of Bits / Zellic / Cure53 / etc.) |

---

## Method notes — what worked, what to reuse

**What worked well:**
1. **Recon before review.** Feeding the same recon map to three independent reviewers meant each attacked the same surface with different lenses. No two produced identical findings, but findings that TWO or THREE flagged had much stronger signal.
2. **Adversarial verification against actual source.** Every P1 was grep-verified before filing. Codex filed 15 P1 candidates; only 2 survived source-check. Filing them all as-is would have been a review-time footgun.
3. **Codex as second-model reviewer.** Caught 1 P1 (nonce replay) that both Claude reviewers missed. Different training, different priors, real value — but nowhere near "independent audit" tier.
4. **Multi-round codex on high-touch surfaces.** The SEND H-1 hotfix needed 4 codex rounds before it converged. Each round tightened the surface further. Individually, each round's fix was smallish; cumulatively, they closed a real class of gap that a single-round review would have missed.

**What to change next cycle:**
1. **Push back on "Independent" harder, sooner.** User's initial framing violated the codebase's own I4 rule. Correcting terminology up-front (before firing tools) sets the honest scope for the entire review.
2. **Time-box multi-round codex.** Round 4+ found real preexisting attack surfaces, not audit-scope regressions. Filing follow-up issues (like #977) was the right split — but recognizing "this is now preexisting, not scope-of-hotfix" earlier saves a round.
3. **Load Feature-Status.md rows as part of the docs-sync agent's context.** The docs agent flagged that `Documentation.jsx` / `Features.jsx` catalogue tiles may need parallel updates. Worth a quick grep in future doc-sync passes.

---

*Every entry in this document is INTERNAL, code-and-artifact only. Nothing here substitutes for the outstanding independent third-party audit.*
