# Native Security Session — Handoff Runbook (H-2 + §3)

> Single entry point for the **NATIVE** audit work that is parked LAST (see
> `docs/Internal-Audit-2026-06.md` → "Remediation ordering"). Everything web/JS-
> fixable from the internal audit is done and merged (PRs #204–#208, #210–#212).
> What remains are the two **load-bearing blockers** for a mainnet flip — they
> need native code + **real devices** + audit, and cannot be built or honestly
> verified in the JS/web environment. This doc maps those findings to the existing
> design specs and gives an ordered, prerequisite-aware task list.
>
> **Until this work lands and is audited: `ALLOW_MAINNET` stays `false`.**

## The two findings

- **H-2** — a 6-digit PIN is the sole at-rest factor on web; a seized vault is
  offline-brute-forceable. Fix = a **hardware-bound KEK** so seed decryption is
  bound to device hardware (PIN stays the spine; hardware is an added gate, never
  the only one — preserves the duress/stealth/panic deniability model).
- **§3** — native secure storage is app-layer only (M2b). Fix = an **OS-enforced
  biometric ACL** bound to the stored item (iOS `kSecAttrAccessControl`
  `biometryCurrentSet` on a Secure Enclave key; Android `setUserAuthenticationRequired`
  (+ StrongBox where present)), and "keys never in webview/IndexedDB on native".

## Prerequisites (none satisfiable in the JS/web env)

- **macOS** + Xcode for the iOS build; a **physical iPhone with Secure Enclave**
  (simulators have no SE).
- A **physical Android device with StrongBox** (Pixel 3+ / recent Samsung;
  emulators have no secure hardware) plus one without (to test the degrade path).
- A throwaway testnet wallet (never a seed holding real funds).

## Ordered tasks (each maps to an existing spec — do not re-design)

0. **PRF WebView spike** — `docs/prf-webview-spike-brief.md`. Probe whether WebAuthn
   PRF works in the Capacitor WebView; **gates** the KEK build (kek-spec §8). If PRF
   is unavailable, fall back to the native-plugin KEK path. Throwaway investigation.
   - **Harness: BUILT** (web side, unit-tested, DEV-gated) — `src/dev/prfSpike.js`
     (probe + pure `classifyOutcome` classifier; 14/14 unit tests pass) and the
     DEV-only screen `src/pages/dev/PrfSpike.jsx`, route `/dev/prf-spike` behind
     `import.meta.env.DEV` (dead-code-eliminated from any `vite build`). On branch
     `claude/fervent-banzai-6be759`. Run steps + result blanks: kek-spec **§8.1**.
   - **Verdict: UNRESOLVED — §8 stays "open."** The probe is a hardware test: it
     needs an AVD Pixel_7 + ≥1 physical Android device with an enrolled biometric, a
     human to approve the biometric prompt, and a run → kill → re-run for cross-restart
     stability. **It cannot run in this environment** (host had no Android toolchain at
     all — no SDK/`adb`/emulator/AVD/JDK — and no physical device). Do NOT fill §8.1's
     result blanks or flip §8 to "resolved" without a real on-device run (verify, don't
     assert). Next session needs: Android Studio + AVD (API 34+, fingerprint enrolled),
     a JDK, and a physical Android device.
1. **§3 — native ACL plugin (M2c/M2d)** — `docs/M2cd.native-acl-plan.md`. Thin Swift
   (SE/Keychain) + Kotlin (Keystore/StrongBox) plugin exposing per-item biometric
   ACL binding; `isSecureHardwareAvailable()` must report truthfully per-device and
   the UI must degrade to the software vault (and say so) when OS-ACL is absent.
2. **H-2 — hardware-bound KEK** — `docs/kek-architecture-spec.md`. Layer the KEK
   ON TOP OF the existing password/PIN-derived key (Argon2id+AES-GCM unchanged); the
   password path MUST remain an independent recovery route (an OS-bound key as the
   *only* gate = fund-loss footgun on biometric reset / device migration).
3. **RASP native detector** (adjacent, also parked) — `docs/rasp-validation-roadmap.md`.
   The policy lane is BUILT; the native probe + remote attestation are the unbuilt part.

## Verification gates (what "done" requires — none satisfiable in JS)

Per `kek-architecture-spec.md` and `Feature-Status.md` §4 decision note:
1. Build the native app on a **real device with the hardware**; install and run.
2. **Functional:** enroll biometric → lock → confirm the OS blocks decrypt without a
   fresh biometric; confirm a biometric-set change **invalidates** (biometryCurrentSet).
3. **Adversarial (the real test):** attempt to read the stored item WITHOUT satisfying
   the biometric (e.g. a debug build skipping the JS gate) and confirm the OS still
   refuses. This is what distinguishes OS-ACL from app-layer; a JS test cannot exercise it.
4. **Recovery:** confirm the password path still recovers the vault after an ACL
   invalidation (no fund-loss footgun).
5. **Independent audit sign-off** — key-at-rest is core crypto; this expands audit scope.
   Run the manual device tests: `docs/biometric-keychain-binding.manual-test.md`,
   `docs/multi-wallet-portfolio.manual-ios.md`.

## JS-seam work that CAN be pre-written (with the native layer mocked)

When the plugin interface exists: interface-contract tests, capability-gating
fallback (degrade to software vault when no secure hardware), and no-plaintext-
caching assertions. These verify the code's *use* of the hardware, not the hardware
guarantee itself — so they are necessary but **not sufficient** to drop the status.

## Status discipline

Native key-at-rest stays **TARGET → (on build) UNAUDITED-PROVISIONAL** until the
device + adversarial + recovery gates pass AND the independent audit signs off.
Do not present the wallet as coercion-resistant on web (PIN-only) or claim
OS-enforced protection on a device that only has the app-layer gate. Only then is a
mainnet flip (`ALLOW_MAINNET`) on the table — never before.
