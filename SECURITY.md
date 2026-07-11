# Security Policy

Veyrnox is a self-custody, coercion-resistant wallet; the seed is the identity; keys never leave the device.

## Reporting a Vulnerability

Please use GitHub private vulnerability reporting first: open this repository's **Security** tab and choose **Report a vulnerability**.

If private reporting on GitHub is unavailable, contact:

- **Email:** security@veyrnox.com

Please do **not** open a public issue for a suspected vulnerability.

## What to Include

Please include:

- Reproduction steps
- Impact
- Affected component or chain
- Version or commit

## Disclosure Expectations

- Please follow responsible disclosure practices.
- We target an initial acknowledgement within 72 hours.
- Please keep vulnerability details private until a fix or mitigation is ready.

## PIN strength and offline attack resistance — honest disclosure

This section discloses, in plain language, what an attacker who obtains your encrypted
vault blob (e.g. from a stolen device backup or a compromised sync destination) can and
cannot do against it. Numbers below are **ESTIMATES from an INTERNAL audit (2026-07-08,
S1–S4 + crypto audit, finding M-9)** — they are not independently verified and are not a
guarantee.

**If you unlock with an 8-digit numeric PIN and have NOT enrolled a hardware factor:**
Your vault key is derived from your PIN alone using Argon2id at 192 MiB memory cost. An
8-digit PIN has roughly 100 million possible combinations. Estimated offline exhaustion
time against the vault blob:

- **~1.9 years, single-threaded**, on ordinary consumer hardware.
- **Potentially DAYS**, not years, on a purpose-built cracking cluster (many parallel
  Argon2id units, e.g. FPGA/ASIC or a large GPU farm) — Argon2id at this memory cost
  raises the bar per-guess but does not make a well-funded, targeted attack infeasible if
  the attacker already has the vault blob and you have no hardware factor.

**Why enrolling a hardware factor changes this:** Veyrnox's Hardware Binding design
(invariant I6) wraps your vault key using both your PIN/password (factor C) and a
hardware-bound secret (factor H) — WebAuthn PRF on supported browsers, Secure Enclave on
iOS, or StrongBox/TEE on Android. When H is enrolled, an attacker with only the vault
blob **cannot brute-force the PIN offline at all**, because the correct H is never
present in the blob — it lives inside the device's secure hardware and is required for
every guess. This removes the offline-exhaustion path described above entirely, and is
the single most effective step you can take to protect a short PIN.

**Safari has no hardware-factor enrollment path.** WebAuthn PRF is not available in
Safari (or any browser without PRF support) as of this writing. If you use Veyrnox in
Safari, there is no H factor to enroll — your vault security rests **entirely** on the
strength of your password/PIN entropy, with no hardware backstop. This is exactly why
Veyrnox enforces a ≥12-character password minimum on the web surface when mainnet is
unlocked (`H-A`, `validateWebVaultPassword()`) rather than allowing a short numeric PIN
there.

**Practical guidance:**

- **Enroll a hardware factor wherever your platform supports it** (WebAuthn PRF on
  Chrome/Firefox, Secure Enclave on iOS, StrongBox/TEE on Android). This is the real fix
  for short-PIN offline exhaustion, not a longer PIN.
- **If you are on Safari** (or any browser without a hardware factor), treat your
  password as a genuine passphrase, not a PIN — use the full ≥12-character minimum as a
  floor, not a target, and prefer a longer, high-entropy passphrase you can still recall.
- **Native mobile users:** the numeric PIN cohort is intended to be used together with
  the platform's hardware factor (Secure Enclave / StrongBox); a PIN used without an
  enrolled hardware factor carries the offline-exhaustion exposure described above.

This disclosure does not change any code path — it documents the existing, audited
behavior. See `docs/Feature-Status.md` (§"2026-07-08 INTERNAL S1–S4 + crypto audit",
finding M-9, issue #753/#754) for the underlying audit finding.

## Scope Note

Per project convention, asset readiness is confirmed only by real on-chain testnet transactions with explorer txids.
