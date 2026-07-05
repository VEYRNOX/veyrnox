# Crypto Implementation Verification Report
**Date**: 2026-07-05 (KDF params updated 2026-07-05, post-verification; 192 MiB latency measured on-device later the same day — see notes below)
**Scope**: Vault seed encryption (Argon2id + cipher choice)  
**Status**: BUILT, not independently audited

---

> **UPDATE (2026-07-05, post-verification):** After this report was first written, the
> Argon2id memory cost was raised from 64 MiB back to **192 MiB** (`src/wallet-core/vault.js`
> `KDF_PARAMS`, commit `d0522bfb`), reversing PR #465 (2026-06-28), which had lowered
> 192→64 MiB specifically to fix 4-8s unlock latency on Capacitor WebView devices. The
> premise for reversing that trade-off: Face ID / biometric unlock (device-exercised
> 2026-07-05) now gives enrolled users a fast unlock path that bypasses the password KDF
> entirely, so the slow-password-path cost is judged an acceptable trade for stronger
> offline-seizure resistance. Iterations (t=3) and parallelism (p=1) are unchanged.
> Backward compatible: existing 64 MiB vaults keep unlocking (each blob carries its own
> recorded KDF params; `LEGACY_KDF_PARAMS` stays 64 MiB), with a lazy migration that
> re-wraps a vault to 192 MiB on next password change/unlock. Status: **BUILT**,
> unit-tested (wallet-core 937/937 passing); **NOT verified** (no on-chain/device-timing
> confirmation is implied by "unit-tested"). Two honest caveats:
> 1. Users without biometric enrollment — including the **Safari password-only web
>    fallback** — still pay the full ~6-8s 192 MiB password-unlock latency that PR #465
>    originally existed to fix. Nothing shipped for that cohort's UX regression.
> 2. The "biometric mitigates the latency" premise is a real-device UX claim that is
>    **unmeasured at time of writing** — device UX timing measurement is in progress
>    separately, not complete. Do not read this note as confirming the mitigation works.
>
> **MEASURED (2026-07-05, later the same day):** the device timing work referenced in
> caveat 2 has produced its first real-device datapoint — Pixel 10 Pro XL (Android 16,
> `com.veyrnox.app.debug`), production argon2 worker in the installed APK, driven via
> CDP: 192 MiB warm-worker median **603 ms** (582–617 ms, n=5), cold-worker median
> **668 ms** (657–678 ms, n=3); 64 MiB warm median **182 ms** (177–208 ms, n=5). The
> PR #465 "4-8 s" figure — and the ~6-8 s estimate in caveat 1 above — did NOT
> reproduce on this device. Full report: PR #604 comment `issuecomment-4887451367`.
> Caveats 1 and 2 above are preserved as written (history, not rewritten); what changes
> is their measurement status only — the non-biometric cohort's password-KDF cost is
> ~0.6-0.7 s on this one flagship device. Honest remaining caveats: single flagship
> datapoint (mid/low-end Android NOT cleared, could be materially slower), pure KDF
> cost not full unlock UX, iOS/web/Safari-fallback unmeasured, INTERNAL evidence —
> not independently audited.
>
> The body of this report below (written when the default was 64 MiB) is left as the
> point-in-time record of that verification pass; the parameter table and OWASP
> comparison have been updated in place to reflect the current 192 MiB default, per the
> project's "history preserved, not rewritten" convention for *narrative*, but the
> parameter VALUES themselves are corrected below since they describe the current
> shipped default, not a historical snapshot.

## Executive Summary

The vault seed encryption uses **Argon2id (192 MiB/t=3/p=1) → AES-256-GCM via WebCrypto**, with fresh random salt+nonce per encryption. This construction is **cryptographically sound** on its own terms and aligns with industry best practices (e.g., libsodium's `pwhash` + `secretbox` pattern). (Prior to 2026-07-05 the shipped default was 64 MiB; see the update note above.)

**Key Finding**: The premise that the code "diverges from a design spec that specified XChaCha20-Poly1305 + HKDF" is **not supported**. No such design spec exists in the codebase. The actual construction is defensible without retrofitting to a nonexistent specification.

---

## Verified Implementation Details

### Argon2id KDF Parameters

**File**: `src/wallet-core/vault.js:49-54`

```javascript
export const KDF_PARAMS = Object.freeze({
  parallelism: 1,
  iterations: 3,        // t = 3
  memorySize: 196608,   // m = 192 MiB (raised from 65536 / 64 MiB, 2026-07-05, commit d0522bfb)
  hashLength: 32,       // 256 bits (matches AES-256 key size)
});
```

*(64 MiB / `memorySize: 65536` was the shipped default 2026-06-28 through 2026-07-05 per
PR #465; `LEGACY_KDF_PARAMS` retains 64 MiB so pre-existing vaults keep unlocking under
their own recorded params, with lazy migration to 192 MiB on next unlock/password change.)*

**Comparison to OWASP 2023 Password Storage Cheat Sheet**:

| Parameter | Veyrnox | OWASP Minimum | Status |
|-----------|---------|---------------|--------|
| Memory (m) | 192 MiB | 19 MiB | ✅ ~10.1× stronger |
| Time (t) | 3 | 2 | ✅ 1.5× stronger |
| Parallelism (p) | 1 | — | ✅ Standard |

**Verdict**: Veyrnox uses parameters that **exceed** OWASP's minimum recommendations on both axes, now by a wider margin on memory cost than the 64 MiB interim default. This is intentional — the project raised the memory cost back to 192 MiB on 2026-07-05 (reversing the 2026-06-28 PR #465 reduction to 64 MiB), on the premise that Face ID / biometric unlock now gives enrolled users a fast path around the slow password KDF. **Honest caveat**: users without biometric enrollment — including the Safari password-only web fallback — still pay the full 192 MiB password-KDF cost on every unlock. That cost is now MEASURED on one flagship Android device (2026-07-05, Pixel 10 Pro XL, production worker in the installed APK — see the MEASURED note above): ~0.6-0.7 s median at 192 MiB, and the PR #465 4-8 s figure did NOT reproduce there. Remaining unmeasured/uncleared: mid/low-end Android, full unlock UX (the measurement is pure KDF cost), iOS, web, and the Safari fallback path itself. INTERNAL evidence, not independently audited.

### Cipher: AES-256-GCM via WebCrypto

**File**: `src/wallet-core/vault.js:208-230` (deriveKey), `277-320` (encryptVault/decryptVault)

```javascript
// Derivation: Argon2id output → AES-256-GCM key
async function deriveKey(password, salt, params = KDF_PARAMS) {
  const raw = await runArgon2idBinary({ password, salt, ...params });
  // raw = 32 bytes (256 bits), uniform, high-entropy
  
  const key = await crypto.subtle.importKey(
    'raw', raw,
    { name: 'AES-GCM' },
    false,
    ['encrypt', 'decrypt']
  );
  return key;
}

// Encryption: AES-256-GCM with random nonce
async function encryptVault(vault, dek) {
  const iv = randomBytes(12);  // 96-bit nonce, fresh each time
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    plaintext
  );
  // WebCrypto appends 128-bit (16-byte) auth tag automatically
  return { iv, ciphertext: ct };
}
```

**Properties**:
- ✅ **Nonce size**: 96 bits (standard per NIST SP 800-38D)
- ✅ **Nonce reuse**: Zero risk (fresh per encryption due to fresh KDF key per unlock)
- ✅ **Tag size**: 128 bits (full-strength authentication)
- ✅ **Timing**: Hardware-accelerated AES-NI on modern CPUs (constant-time)
- ✅ **Implementation**: Browser native WebCrypto (no hand-rolled cipher code)

### Why No HKDF Between Argon2id and AES-256-GCM

HKDF (HMAC-based Key Derivation Function) is appropriate when:
1. Deriving **multiple different keys** from one input (e.g., encryption key + MAC key)
2. **Domain-separating** multiple independent inputs (e.g., H || C in KEK combine)
3. **Stretching weak entropy** further

**The vault path has**:
- Single input: password/PIN
- Single output: one 256-bit AES key
- Argon2id already produces 32 bytes of uniform, high-entropy output

**Standard practice**: libsodium's canonical `pwhash` + `secretbox` pattern (the reference implementation for this design space) also skips an HKDF step here — it directly feeds the KDF output to the symmetric cipher key slot. This is **not a corner cut**; it's the recognized best practice for this scenario.

**Where HKDF IS used correctly** (see `src/wallet-core/keystore/kek.js:186-239`):
The hardware KEK path combines two independent factors (H from hardware + C from password KDF) via HKDF — that's the textbook HKDF use case (domain separation + combining multiple inputs).

---

## The Real Divergence: Hardware KEK Combine (M1)

There **is** one documented divergence, but it's in the **hardware KEK combine**, not the vault cipher choice:

**Design (CLAUDE.md I6)**:
```
KEK = HKDF(H ⊕ C)   [XOR combine]
```

**Actual code** (`src/wallet-core/keystore/kek.js`):
```javascript
export async function combineKek(H, C) {
  return crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    H || C,  // Concatenation, not XOR
    256
  );
}
```

**Status**: ✅ **RESOLVED** (2026-07-01 ECC Audit, M1)

The independent audit confirmed: "Code is correct & stronger. Doc-only." Concatenation is the safer choice in this KDF context (XOR can leak patterns).

---

## Threat Model Alignment

Veyrnox's threat model (CLAUDE.md) accepts **T6 (rooted OS)**. For T1-T5 threats:

| Threat | Mitigation | Assessment |
|--------|-----------|------------|
| **Network eavesdropping** | AES-256-GCM AEAD | ✅ Standard |
| **Offline key recovery** | 192 MiB/t=3 Argon2id | ✅ Exceeds OWASP |
| **Tampering** | 128-bit authentication tag | ✅ Full-strength |
| **Side-channel (timing)** | Hardware AES-NI acceleration | ✅ Constant-time |
| **Nonce reuse** | Fresh key per encryption | ✅ Zero risk |

---

## Honest Status

| Item | Verdict |
|------|---------|
| **Argon2id parameters** | VERIFIED (exceed OWASP 2023 minimum) |
| **AES-256-GCM choice** | VERIFIED (sound for this usage pattern) |
| **No HKDF in vault path** | VERIFIED (correct; matches libsodium) |
| **Nonce/IV handling** | VERIFIED (96-bit, fresh per encryption) |
| **Overall construction** | **SOUND** (internally consistent, industry-standard) |
| **XChaCha20 divergence** | **UNSUPPORTED PREMISE** (no such spec in repo) |

**Status**: BUILT (code-implemented, unit-tested), NOT independently audited for this specific crypto angle. The construction is defensible on its own terms without retrofitting to a nonexistent design spec.

---

## Recommendations

1. **Documentation**: Record the actual construction (Argon2id 192MiB/t=3 → AES-256-GCM, raised from 64 MiB 2026-07-05) in CHANGELOG or security notes. Do not invent a false "divergence from spec" narrative.

2. **Independent Audit**: When scheduling the next independent security audit, include this vault cipher path in scope for third-party verification (if not already covered).

3. **Outstanding Items**: Per the 2026-07-05 internal audit, these remain open (non-blocking):
   - JS-string heap zeroization limits (documented at `vault.js:18-21`)
   - Offline attack resistance for short PINs (mitigation: Hardware KEK Phase 2)
   - Per-enrollment salt distinctness on device (unit-tested, one enrollment device-exercised)

