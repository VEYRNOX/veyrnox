# Veyrnox RASP vs. commercial app shielding (Promon SHIELD) — gap analysis & roadmap

**Status:** ANALYSIS · current Veyrnox RASP state **BUILT (policy) / detection BUILT-UNVALIDATED / attested leg PARKED**
**Owner:** —
**Date:** 2026-07-12
**Related:** `src/rasp/` (implementation), `docs/rasp-validation-roadmap.md` (the *validate-what-exists* axis), `docs/audit-triage/rasp-attestation-egress-decision.md`, CLAUDE.md §24 (audit gate), invariants I1–I5.

> **Two different roadmaps, do not conflate them.**
> - `docs/rasp-validation-roadmap.md` answers: *"how do we prove the detection legs we already built actually work on hostile hardware?"* (BUILT → VALIDATED).
> - **This doc** answers: *"what whole categories of protection does a commercial shield have that Veyrnox does not, and should we close them?"* (capability gaps → roadmap).
>
> A gap closed here still has to walk the validation roadmap before it can be called VALIDATED. Nothing in this doc is "verified" — it is a design/gap document.

---

## 1. The category difference

**Promon SHIELD is an app-*shielding* product.** It wraps a compiled binary (no source changes) and layers **obfuscation + anti-tamper + active runtime defense + white-box crypto** across the whole app lifecycle. Its design goal is to *resist* reverse-engineering and tampering, and to *protect the protection itself*.

**Veyrnox RASP is a home-grown runtime *detector*** scoped to one decision: *should this send be allowed to sign?* It is a small set of pure-JS policy files (`conditions.js`, `degrade.js`, `detect.js`, `compose.js`) plus one native probe per platform (`RaspIntegrityPlugin.kt` / `.m`). It does not shield the app; it observes the environment at the pre-sign chokepoint and degrades signing (`ALLOW` / `WARN` / `BLOCK`).

They are **not peers.** Promon is defense-in-depth shielding; Veyrnox RASP is a single fail-closed send-gate tripwire, backed by hardware key isolation (Secure Enclave / StrongBox / WebAuthn PRF) for the thing that actually matters — the seed.

---

## 2. Feature-by-feature comparison

Legend: ✅ present/strong · ⚠️ present but weak/evadable/unvalidated · 🚧 parked/planned · ❌ absent by design or omission.

| Capability | Promon SHIELD | Veyrnox RASP | Veyrnox source |
|---|---|---|---|
| Root / jailbreak detection | ✅ extensive, anti-hider, continuously updated | ⚠️ path/binary/build-tag checks; **Magisk Hide defeats it** (disclosed 2026-07-12) | `RaspIntegrityPlugin.kt:59` |
| Hook / Frida / Xposed detection | ✅ deep, anti-evasion | ⚠️ Frida port 27042 + `/proc/self/maps` + Xposed pkg list; evadable (non-default port, renamed lib); **never tested vs real Frida** | `RaspIntegrityPlugin.kt:113` |
| Emulator detection | ✅ | ⚠️ build-props + qemu files | `RaspIntegrityPlugin.kt:165` |
| Repackaging / re-sign detection | ✅ binary integrity | ⚠️ signing-cert SHA-256 compare; depends on `RELEASE_CERT_SHA256` Gradle prop | `RaspIntegrityPlugin.kt:220` |
| Anti-debugging (prevent attach) | ✅ actively blocks/crashes | ❌ can only *notice*, then refuse to sign | — |
| Code obfuscation | ✅ core feature | ❌ none — JS bundle ships readable in APK/IPA assets | `android/app/src/main/assets/public/assets/RaspSecurity-*.js` |
| Anti-decompilation / packing | ✅ | ❌ `jadx`/`apktool`/reading the web bundle all work | — |
| White-box cryptography | ✅ protects keys in use | ❌ — but uses **hardware-backed keys** (SE/StrongBox/WebAuthn) instead, a legitimate alternative | `src/wallet-core/keystore/` |
| Overlay / tapjacking defense | ✅ | ❌ not in scope | — |
| Screen-capture / screenshot block | ✅ | ❌ not in scope | — |
| Keylogger / IME protection | ✅ | ❌ not in scope | — |
| Memory / anti-dump protection | ✅ | ❌ attacker can hook the JS that reads the verdict; heap residue is a known open item (iOS-F5) | — |
| Remote attestation (Play Integrity / App Attest) | ✅ integrated | 🚧 **parked** — Phase 2b, behind the audit + I2/I3 egress decision | `src/rasp/detect.js:5`, `docs/audit-triage/rasp-attestation-egress-decision.md` |
| Continuous runtime coverage | ✅ whole lifecycle, reactive callbacks | ❌ sampled at **sign time only** (fresh per read, but only pre-sign) | `src/rasp/browserProbe.js:34` |
| Protecting the protection (self-defense) | ✅ | ❌ RASP JS is unshielded and hookable | — |
| Independent audit / maturity | ✅ commercial, banking-grade, threat-intel updates | ❌ **BUILT / INTERNAL**, not independently audited; iOS never device-tested | CLAUDE.md §24 |

---

## 3. Where each side is stronger than a naïve read suggests

**In Veyrnox's favour (do not undersell):**
- RASP is **fail-closed (I4) and deniability-safe (I3) by construction** — `degrade()` is a pure function of the environment condition with no wallet-set handle in scope, so its output is byte-identical across real and decoy sessions. A commercial shield does not have to solve for coercion-resistance / plausible deniability; Veyrnox does, and its RASP respects it. This is a real design property Promon does not provide.
- Key protection leans on **hardware key isolation** (Secure Enclave / StrongBox / WebAuthn PRF) rather than white-box crypto. For a self-custody wallet this is arguably a *stronger* posture than white-boxing a key inside an obfuscated binary — the key never exists as extractable material in the app process at all.
- **No egress (I2)** — every probe is on-device. Promon's attestation and threat telemetry inherently egress.

**In Promon's favour (do not oversell Veyrnox):**
- Veyrnox's heuristics are the *same class* of checks, but Promon's are hardened, evasion-resistant, and continuously updated against new bypasses; Veyrnox's are honestly labelled BUILT-UNVALIDATED, fail against Magisk Hide, and have never met a real Frida.
- Promon protects the *whole app lifecycle*; Veyrnox RASP only guards the pre-sign moment. Everything before the send (unlock, seed reveal, clipboard, screen) is outside RASP's coverage.

---

## 4. Gap roadmap

Ranked by **leverage** (impact ÷ effort). Each item is a *capability* gap; closing it means BUILT at most until it walks `docs/rasp-validation-roadmap.md`.

### G1 — Production-build obfuscation + anti-tamper on the JS/native bundle  · **HIGHEST LEVERAGE · PLANNED**
The single largest missing category. Today the entire app logic (RASP included) ships as readable JS in the APK/IPA assets; a static scanner reads everything, and the RASP verdict-reading code is trivially locatable and hookable.
- [ ] Evaluate a JS obfuscation/minification-hardening pass in the Vite/Capacitor production build (control-flow flattening, string encryption, dead-code injection) — measure bundle-size and startup-latency cost.
- [ ] Android: enable R8/ProGuard full mode + resource shrinking on the native shell; confirm it does not strip the Capacitor plugin registration (`packageClassList` — see the local-plugin registration note in project memory).
- [ ] Decide **build vs buy**: a hardened obfuscator (or a commercial shield like Promon/Guardsquare/Appdome) vs. in-house tooling. In-house obfuscation is a known arms-race sink; a commercial shield wrapping the compiled binary is the pragmatic path for a small team.
- [ ] Honesty guard: obfuscation is *raise-the-cost*, never *prevent*. Do not let any status copy imply the code is unreadable.
- **Effort:** medium (tooling) → high (if in-house hardening). **Impact:** high — closes the "no protection against code scanning" gap entirely.

### G2 — Remote attestation (Play Integrity / App Attest)  · **PARKED, ready to unpark · TARGET**
Already scoped as Phase 2b in the validation roadmap and blocked only on the I2/I3 egress decision.
- [ ] Land the signed-off `rasp-attestation-egress-decision.md` (what is transmitted, to whom, disclosure surface, and **no attestation egress under decoy/duress** per I3).
- [ ] Android Play Integrity verdict client → `INTEGRITY_FAIL` / `INTEGRITY_UNAVAILABLE`.
- [ ] iOS App Attest / DeviceCheck → same conditions.
- [ ] Fail-closed when the verdict is unreachable (never silently clean).
- **Effort:** medium. **Impact:** high — this is the check Magisk Hide / re-sign cannot easily fool, because the verdict is Google/Apple-signed off-device.
- **Cross-ref:** `docs/rasp-validation-roadmap.md` Phase 1 + 2b.

### G3 — Evasion-hardening + real hostile-device testing of the existing probes  · **BUILT-UNVALIDATED · TARGET**
The current probes are honest but weak. Before trusting them, harden and *actually attack* them.
- [ ] Root: add mount-namespace / `/proc/mounts` inspection, native-layer `stat` (not just `File.exists()`, which Magisk Hide intercepts at the Java layer), and defeat-the-hider techniques where feasible. Accept that Magisk Hide + Zygisk is a losing battle at the JS/Java layer — this is *why* G2 (attestation) matters more.
- [ ] Frida: scan beyond the default port; check for `frida-agent` maps under renamed libs, thread names, and named pipes; add a native ptrace-self anti-debug.
- [ ] Run the **Phase 4 scenario matrix** (`rasp-validation-roadmap.md`): real rooted device, real Frida attach, repackaged APK, on both platforms — capture evidence per scenario.
- [ ] **False-positive sweep** across clean devices/OS versions — RASP must not brick legitimate users.
- **Effort:** high (needs physical hostile devices; iOS needs a Mac). **Impact:** medium — raises the bar on the existing legs but does not beat a determined attacker without G1/G2.

### G4 — Broaden runtime coverage beyond the pre-sign moment  · **PLANNED**
RASP only guards signing. High-value moments — seed reveal, export, clipboard, unlock — are outside its window.
- [ ] Extend the `detect → degrade` chokepoint to seed-reveal / export / import entry (the `SENSITIVE` set already exists in `degrade.js:41` but is only consulted for the strongest tiers).
- [ ] Consider overlay/tapjacking protection (Android `FLAG_SECURE`, `filterTouchesWhenObscured`) and screenshot-block on seed-reveal screens — cheap, high-signal, and independent of the RASP detector.
- **Effort:** low–medium. **Impact:** medium — `FLAG_SECURE` on seed-reveal is a quick win with disproportionate value.

### G5 — Independent audit of the RASP path  · **OUTSTANDING · gates VALIDATED**
Per CLAUDE.md §24, RASP is a device-attestation-adjacent control and must not be trusted until externally reviewed.
- [ ] Audit scope: the egress/attestation design (G2), probe evasion-resistance (G3), the pre-sign wiring, and the I3/I4 construction.
- **Effort:** external. **Impact:** required for any honest "validated" claim.
- **Cross-ref:** `rasp-validation-roadmap.md` Phase 5.

---

## 5. Recommendation

For a small team, **do not try to out-build Promon in-house.** The pragmatic split:

1. **License a commercial shield** (Promon SHIELD / Guardsquare / Appdome) for the **shielding layer** Veyrnox structurally lacks — obfuscation, anti-tamper, anti-debug, memory protection, overlay/screen-capture defense (G1 + parts of G4). These wrap the compiled binary and need no source changes, which suits a Capacitor app.
2. **Keep the home-grown RASP** as the **deniability-safe, fail-closed send-gate policy** on top (`conditions.js` / `degrade.js` / `compose.js`). This is the part Promon *cannot* give you, because it does not know about I3 deniability or the wallet's coercion-resistance model.
3. **Land G2 (attestation) regardless** — it is already scoped, and a Google/Apple-signed verdict is the most cost-effective answer to the root/re-sign evasions that the local probes (and even a shield) struggle with.

The two approaches are layers, not alternatives: a commercial shield hardens the *binary*, Veyrnox RASP governs the *signing decision*, and attestation corroborates the *device* — defense in depth.

**Honesty lock (unchanged):** none of the above is "verified" until it walks `docs/rasp-validation-roadmap.md` Phases 4–6 with real device evidence and independent sign-off. This doc scopes the work; it does not claim any of it is done.
