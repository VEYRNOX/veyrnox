# Veyrnox — Competitive Landscape & Prior-Art Research

**Date:** 2026-07-17
**Scope:** Four axes: (1) competitive analysis, (2) WebAuthn PRF for KEK derivation, (3) coercion-resistance / duress-PIN prior art, (4) mobile RASP state-of-the-art in 2026.
**Method:** Synthesis of 23 3-vote-verified claims from a deep-research workflow (`wf_df2bd57f-ae8`). Confidence per finding is stamped HIGH / MEDIUM / LOW based on source tier and vote unanimity.
**Status:** INTERNAL research report. Does not substitute for the outstanding independent third-party audit.

---

## Executive summary

Veyrnox's specific stack — WebAuthn PRF on web, Secure Enclave HMAC on iOS, StrongBox HMAC on Android, all combining a hardware factor `H` and a password/PIN factor `C` via `HKDF(H‖C)` under an AES-256-GCM vault with Argon2id (192 MiB) and a pre-sign RASP gate — is technically well-founded and matches current cryptographic best practice (HIGH confidence). Its user-visible differentiator is the coercion-resistance surface (duress PIN, stealth wallets, panic wipe, deniability sessions); however, the academic literature is unambiguous that any deniability design is defeated by a multi-snapshot adversary and, on mobile, by raw-NAND-layer forensics (HIGH). The publicly commissioned security-review posture that competitors like Obsidian now hold (Cure53 + Trail of Bits, both scoped to API, server, and cryptographic mechanisms) is the bar Veyrnox has not yet met; NCC Group's Crypto-Custody and Operational Security Assessment is the closest off-the-shelf fit for Veyrnox's scope (HIGH). RASP evasion in 2026 is dominated by Zygisk-family injection (ZygiskFrida, Shamiko, Play Integrity Fix), which Veyrnox has partially addressed through its 2026-07-13/14 detection rework — but the arms race is asymmetric and none of the surveyed competitors advertise comparable controls.

---

## Axis 1 — Competitive analysis

The research pass explicitly attempted to find published statements from MetaMask, Rabby, Phantom, Trust Wallet, Zerion, Exodus, Zengo, and Backpack about coercion resistance, hardware-backed key encryption, or root/jailbreak detection. A summarising claim that "none of the major software wallets surveyed address" these features was **REFUTED 0-3** — meaning the verifiers could not accept that categorical negative, not that competitors do address these features. In practice, the absence of primary-source claims that survived verification is itself the finding: **the surveyed competitor set does not publicly advertise coercion resistance, hardware-KEK, or RASP as product features** — and Veyrnox does. (Confidence: MEDIUM — absence-of-evidence is a weaker signal than evidence-of-absence.)

### Comparison table (as of 2026-07)

| Wallet | Duress / coercion mode | Hardware-bound KEK | Mobile RASP gate on signing | Public independent audit(s) |
|---|---|---|---|---|
| **Veyrnox** | Duress PIN, stealth, hidden, panic wipe (BUILT, INTERNAL-audited) | iOS SE HMAC + StrongBox HMAC + WebAuthn PRF, `HKDF(H‖C)` (BUILT, device-verified INTERNAL) | Composite pre-sign gate (RASP + attestation), fail-closed, device-verified INTERNAL | **Outstanding** |
| MetaMask | Not advertised | Not advertised (encrypted vault, no HW-KEK) | Not advertised | Multiple public audits over years, but not the coercion/HW-KEK surface |
| Rabby | Not advertised | Not advertised | Not advertised | Public bug bounty; scope varies |
| Zerion | Not advertised | Not advertised | Not advertised | Not surfaced in this research |
| Phantom | Not advertised | Not advertised | Not advertised | Not surfaced in this research |
| Trust Wallet | Not advertised | Not advertised | Not advertised | Prior third-party audits scoped to core wallet |
| Exodus | Not advertised | Not advertised | Not advertised | Not surfaced in this research |
| Zengo | MPC-based key sharing (different architecture — no local seed) | N/A (MPC replaces local KEK) | Not advertised | Public audits of MPC scheme |
| Backpack | Not advertised | Not advertised | Not advertised | Not surfaced in this research |

**Reference benchmark — Obsidian (non-wallet, but the model to imitate):** Obsidian commissioned two independent audits of its Sync product from **Cure53** (completed October 2024, 4 low + 1 medium findings) and **Trail of Bits** (completed December 2025, 11 issues remediated with 3 documented limitations), both scoped to API, server, and cryptographic mechanisms [obsidian.md]. This is the format and depth Veyrnox should aim for. (HIGH.)

**Veyrnox differentiation (as advertised in-repo):**
1. Coercion-resistance stack (duress, stealth, hidden, panic) is a stated feature, not a hidden mode. No surveyed competitor advertises equivalent.
2. Per-platform hardware-KEK, actually enforced end-to-end (device-verified INTERNAL on iOS SE + Android StrongBox + Web WebAuthn PRF).
3. Pre-sign RASP composite gate (browser + native OS probe + Play Integrity attestation, fail-closed on any leg).
4. Honest status tagging (BUILT / TARGET / PLANNED / HONEST-DISABLED) — no other surveyed wallet uses this discipline publicly.

---

## Axis 2 — WebAuthn PRF for KEK derivation

The WebAuthn PRF extension is the standardised mechanism Veyrnox uses on the web side of its KEK stack. The 2026 literature and browser landscape support this design choice:

- **Spec foundation.** The PRF extension is defined by the W3C WebAuthn WG as a wrapper over the CTAP2 `hmac-secret` extension, exposing an authenticator-backed pseudo-random function to web contexts [github.com/w3c/webauthn]. It produces a per-credential 32-byte secret suitable for symmetric key derivation via WebCrypto — explicitly targeting the "combine authentication and release of a secret key" pattern that Veyrnox's web KEK implements [github.com/w3c/webauthn]. (HIGH — primary W3C source.)
- **Correct use is HKDF, not direct.** Yubico's primary developer guidance is explicit: the raw 32-byte PRF output is **Input Keying Material**, not a final encryption key — callers must run it through HKDF (RFC 5869) with domain-separation info parameters to derive purpose-bound keys [developers.yubico.com]. Veyrnox's `HKDF(H‖C)` construction under domain `veyrnox/kek/v1/combine(H||C)` matches this best practice. (HIGH.)
- **Cross-context domain separation.** WebAuthn PRF applies browser-side domain separation via `actualSalt = SHA-256("WebAuthn PRF" || 0x00 || developerSalt)` before hitting the authenticator's `hmac-secret`, isolating web-derived KEKs from any native-app hmac-secret usage [developers.yubico.com; groups.google.com/a/chromium.org]. (HIGH.)
- **Hardware anchoring.** The authenticator's PRF seed key never leaves the secure element; the raw PRF secret is derived on-device from the caller-supplied salt [developers.yubico.com]. This is architecturally equivalent to Veyrnox's iOS Secure Enclave HMAC and Android StrongBox HMAC constructions — the three platforms converge on the same primitive (HMAC-over-HW-seed) exposed through different APIs. (HIGH.)
- **Client-side residual risk.** Once PRF output crosses the CTAP2 boundary and reaches the client, malware / heap-scraping is the residual threat; developers should securely zero raw secrets using compiler-optimization-resistant routines (`OPENSSL_cleanse`, `explicit_bzero`, `memset_s`) [developers.yubico.com]. Veyrnox's `try/finally` zeroing of `H`, `KEK`, `H2` (per PR #723/#735/#743 and the S1–S4 audit) directly addresses this. On iOS, the `NSString hB64` bridge copy (M-6) remains an accepted architectural residual. (HIGH.)
- **Browser landscape.** Chromium's Intent to Ship for the WebAuthn PRF extension was published **28 April 2023**, targeting all six Blink platforms (Windows, macOS, Linux, ChromeOS, Android, WebView) [groups.google.com/a/chromium.org]. At that time both Firefox (Gecko) and Safari (WebKit) had given "No signal" [groups.google.com/a/chromium.org], meaning cross-browser support was not guaranteed. Veyrnox's own posture (Chrome ≥118 supported, Safari fallback to password-only) is consistent with the real 2026 support matrix. (HIGH for Chromium; MEDIUM for current cross-vendor status — a specific claim about Windows/Mac/Android PRF availability was **REFUTED** in this research pass, so treat any absolute browser-support statement as needing re-verification against caniuse/passkeys.dev at each release.)
- **Context-string isolation.** HMAC inputs are hashed with a fixed context string before being passed to the authenticator, so a website cannot cause the authenticator to compute an HMAC over an input that could collide with one a native platform would request via raw hmac-secret [groups.google.com/a/chromium.org]. This closes the cross-caller collision class. (HIGH.)

**Verdict — Axis 2.** Veyrnox's web KEK design is aligned with the current W3C specification, Yubico's primary guidance, and the Chromium implementation posture. Recommended clarification for the outstanding independent audit: an explicit review of the HKDF info string, salt handling, and PRF output zeroization across the WebAuthn PRF path — the exact residuals PR #723/#735/#743 addressed internally but which have never been independently reviewed.

---

## Axis 3 — Coercion resistance / duress prior art

The academic and product literature on plausible-deniability storage is mature and consistent:

- **VeraCrypt is the canonical lineage.** VeraCrypt (inheriting from TrueCrypt) provides plausible deniability via **hidden volumes nested inside outer encrypted containers**, so that under duress the user can reveal the outer password while the hidden volume remains undetectable [veracrypt.io]. The design explicitly targets scenarios "in case an adversary forces you to reveal your password" [veracrypt.io]. (HIGH.)
- **The deniability property rests on indistinguishability from random.** A VeraCrypt partition/device "appears to consist of nothing more than random data" — no magic bytes, no header signature; only supplying a valid password produces structure [veracrypt.io]. (HIGH.) This is the same property Veyrnox's stealth-pool 256-slot FIXED_LEN chaffed store aims for at the vault-metadata layer.
- **Multi-snapshot adversary defeats every implemented deniable design.** The dominant academic finding is that **multi-snapshot attacks are practically realizable** by comparing block-level changes across disk snapshots to detect writes to hidden volumes [arxiv.org/abs/2110.04618]. The class **generalises to essentially all implemented deniable storage systems** including the TrueCrypt/VeraCrypt lineage [arxiv.org/abs/2110.04618]. Systems designed around a stronger threat model (HIVE, DataLair, PD-DM) explicitly cite this as the reason for their construction [arxiv.org/abs/1706.10276]. (HIGH.)
- **Mobile block-layer PDE is compromisable at the flash layer.** Block-layer plausibly deniable encryption systems on mobile devices — the direct analogue of the VeraCrypt hidden-volume approach on phones — are **experimentally compromisable by adversaries with raw NAND flash access** through flash translation layer artifacts and wear-leveling patterns [arxiv.org/abs/2203.16349]. (HIGH.)

**Implication for Veyrnox.** The threat model Veyrnox's deniability stack can honestly claim to defeat is a **single-observation coercer** — someone forcing the user to unlock the device once in a room, without pre- and post-observation of the device's persistent state. It does **not** and cannot defeat a multi-snapshot adversary (custody scenario, forensic disk imaging at seizure vs. release), and on-mobile a raw-NAND forensics adversary can in principle discriminate. This aligns with Veyrnox's stated I4 discipline of honest fail-scope, and should be surfaced in-product and in the audit scope as an explicit residual, not a bug.

---

## Axis 4 — Mobile RASP state-of-the-art in 2026

The 2026 evasion toolchain that Veyrnox's RASP must defend against is dominated by **Zygisk-family injection**:

- **ZygiskFrida injects the Frida Gadget without modifying the APK.** ZygiskFrida is a Magisk/Zygisk module that injects the Frida gadget at Zygote fork time; because the gadget is **not embedded into the APK itself**, APK integrity and signature checks continue to pass [github.com/lico-n/ZygiskFrida]. (HIGH.) This is the exact class Veyrnox's PR #948 `checkGadgetThreads()` / `checkFridaPipes()` / expanded `checkProcMapsForHook()` targets — scanning for the GLib runtime thread names and named-pipe FDs that Zygisk-injected Gadgets still spawn.
- **ZygiskFrida avoids ptrace detection.** Because Zygisk modules run inside the Zygote and specialised app processes rather than attaching from outside like `frida-server` does, **no external process ptraces the target** — so anti-Frida checks scanning `/proc/self/status` for `TracerPid` will not fire [github.com/lico-n/ZygiskFrida]. (HIGH.) Veyrnox's device-verified detection (2026-07-14, Samsung SM-N981B, Frida 17.15.4) confirmed that thread-comm scan (`gum-js-loop`) fires correctly against a live Gadget — this is the correct mitigation class.
- **Play Integrity Fix targets the API verdict, not app-level probes.** Play Integrity Fix (released **October 2023**) is a Zygisk module that spoofs device fingerprint/keybox to pass Play Integrity API verdicts; it requires **root and Zygisk-enabled environments** and explicitly **does not aim to hide root from other apps** [docs.talsec.app]. (HIGH.) Implication for Veyrnox: a device that hides Magisk from the app but still fails on-device RASP probes will pass the Play Integrity leg. Veyrnox's composite compose lattice (OS probe outranks attestation CLEAN) is architecturally correct for this exact scenario.
- **Shamiko masks root indicators with advanced hooking.** Shamiko uses "advanced hooking techniques to mask root indicators more effectively" than earlier hide mechanisms [docs.talsec.app]. (HIGH.) Veyrnox's PR #949 kernel-level `/proc/net/unix` scan (`checkProcNetUnix`) and `SystemProperties` reflection (`checkDangerousProps` — device-verified firing on `verifiedbootstate=orange`) are the correct kernel-below-Hide vectors. The 2026-07-14 device evidence that `checkDangerousProps` fired while `checkProcNetUnix` did not (Magisk v30.7 uses different socket names) is honest — the marker set needs to be a living list.

**Verdict — Axis 4.** Veyrnox's RASP posture is congruent with the current evasion literature and toolchain. The 2026-07-12–14 detection rework (PRs #832, #834, #947, #948, #949, #953) directly addresses the Zygisk/Frida-Gadget/Shamiko/Play-Integrity-Fix quartet, with device-verified INTERNAL evidence on both Android (Samsung SM-N981B, Magisk v30.7) and iOS (iPhone 8 Plus, palera1n rootful). The remaining honest gaps — syslog-unavailability of individual iOS detection contributions, Magisk-Hide bypass marker freshness — are documented in `docs/Feature-Status.md`, not obscured.

---

## Recommendations for the outstanding independent third-party audit

Veyrnox is currently INTERNAL-audited only. Given the design's density, the following scope is recommended — in priority order — for the independent engagement:

1. **Split-scope audit, matched to firm strengths.** Follow the Obsidian precedent [obsidian.md] and commission **two** firms, one for cryptographic mechanisms and one for application/mobile RASP:
   - **Cryptographic path (Trail of Bits or NCC Group Cryptography Services):** `HKDF(H‖C)` construction and info-string domain separation; WebAuthn PRF salt & IKM handling; iOS SE ECIES + StrongBox HMAC parity; the M-8 vault AAD binding (PR #1076); the M-1 EVM private-key architectural residual (ethers v6); the M-9 short-PIN offline-exhaustion time under a real Argon2id 192 MiB parameter set on target devices.
   - **Mobile / RASP path (NCC Group Crypto-Custody and Operational Security Assessment):** NCC's service explicitly covers "evaluation of key management systems, approval workflows, and supporting infrastructure" through architecture reviews and end-to-end testing of Web3 and mobile applications [nccgroup.com] — a good structural fit. Scope should include the composite pre-sign gate, the Zygisk/Frida/Shamiko detection surface, and the Play Integrity Fix / App Attest limits.
2. **Include the deniability stack under an explicit threat-model.** Ask the auditor to certify that Veyrnox's deniability guarantee is scoped to a **single-observation coercer**, and to enumerate any residuals under multi-snapshot and raw-NAND-forensic adversaries [arxiv.org/abs/2110.04618; arxiv.org/abs/2203.16349]. This converts a marketing risk into a documented scope statement.
3. **Include live-device work on both platforms.** Repeat the internal Face-ID / SE / StrongBox / palera1n / Magisk / Frida-Gadget sessions on the auditor's own devices, so the evidence carries external provenance. Real-device timing is the only way to close M-9 credibly.
4. **Explicitly test the cross-context PRF domain separation.** Attempt to derive a colliding PRF output from a native caller versus a web caller against the same authenticator under Veyrnox's info-string [developers.yubico.com; groups.google.com/a/chromium.org]. A passing negative test here directly retires a class of concern that internal review cannot retire.
5. **Publish the redacted report.** The Obsidian model (public blog post naming both firms, both timeframes, and both finding counts) is the credibility multiplier. Veyrnox's honest status tagging is worthless externally if the audit itself is not visible.

---

## Caveats

- **INTERNAL synthesis only.** This report is derived from a research pass, not from primary-source re-reading; treat exact quotes as needing verification if you republish them.
- **Refuted claims (2, both 0-3 verdicts).** A blanket "no major software wallet addresses coercion/HW-KEK/RASP" claim was refuted; treat the competitor table as **absence of evidence in this pass**, not proof of absence. A specific WebAuthn PRF browser-support matrix (Windows / macOS / Android / iOS) was refuted; use `caniuse.com` / `passkeys.dev` at each release for the current matrix rather than the numbers in this report.
- **Time-sensitivity.** WebAuthn PRF browser support, Zygisk/Frida/Shamiko marker sets, and Play Integrity Fix behaviour are all moving targets. This report is a **2026-07-17 snapshot**. Anything RASP-related has a ~3-month useful shelf life; the cryptographic-primitive claims are stable for years.
- **Source-tier mix.** All 23 confirmed claims cite primary sources (W3C, Yubico, Chromium blink-dev, VeraCrypt, arXiv, GitHub repos, vendor blogs) except for two Talsec claims about Shamiko and Play Integrity Fix, which are secondary but corroborated by broad community documentation.
- **This report is not the outstanding independent audit.** It is INTERNAL research to *scope* that audit.

---

## Sources cited (deduplicated)

- W3C WebAuthn PRF explainer — github.com/w3c/webauthn (wiki, Explainer: PRF-extension)
- Yubico Developer Guide to PRF — developers.yubico.com/WebAuthn/Concepts/PRF_Extension/Developers_Guide_to_PRF.html
- Yubico CTAP2 hmac-secret deep dive — developers.yubico.com/WebAuthn/Concepts/PRF_Extension/CTAP2_HMAC_Secret_Deep_Dive.html
- Chromium blink-dev "Intent to Ship: WebAuthn PRF extension" (2023-04-28) — groups.google.com/a/chromium.org/g/blink-dev/c/iTNOgLwD2bI
- VeraCrypt Plausible Deniability docs — veracrypt.io/en/Plausible%20Deniability.html
- Multi-snapshot attacks against deniable storage — arxiv.org/abs/2110.04618
- DataLair (multi-snapshot PD storage) — arxiv.org/abs/1706.10276
- Mobile block-layer PDE compromise via NAND — arxiv.org/abs/2203.16349
- ZygiskFrida — github.com/lico-n/ZygiskFrida
- Talsec — root detection challenges (Magisk Hide, Zygisk, Shamiko, Play Integrity Fix) — docs.talsec.app
- Obsidian Cure53 + Trail of Bits audits blog — obsidian.md/blog/cure53-tob-sync-audits/
- NCC Group blockchain security / Crypto-Custody service — nccgroup.com/technical-assurance/blockchain-security/
