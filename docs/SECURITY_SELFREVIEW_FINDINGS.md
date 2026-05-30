# Security Self-Review — Findings Log

> Records what was actually VERIFIED in internal self-review passes (vs. the
> open checklist in SECURITY_REVIEW_CHECKLIST.md, which lists what to verify).
> Purpose: catch cheap issues before paid audit hours, and hand the auditor a
> record of what's already been checked (good prep cuts audit cost ~15–25%).
>
> This is NOT a substitute for the independent audit. "Reviewed by the team +
> Claude" ≠ audited. Mainnet stays gated until the external audit clears.

---

## Pass 1 — vault.js + signing.js (the crown-jewel files)

Reviewed line-by-line. **No vulnerabilities found.** Construction is sound.
Findings below.

### vault.js — VERIFIED CORRECT
- ✅ KDF = Argon2id (memory-hard; correct modern choice over PBKDF2/bcrypt).
- ✅ Cipher = AES-256-GCM via WebCrypto (authenticated; detects tampering).
- ✅ Fresh random salt (16B) + IV (12B/96-bit) per encryption from
  crypto.getRandomValues. No nonce reuse. 96-bit IV is correct for GCM.
- ✅ Derived key imported NON-EXTRACTABLE (importKey(..., false, ...)).
- ✅ Decrypt failure does NOT distinguish wrong-password vs tampered (no oracle).
- ✅ password.normalize('NFKC') before KDF (consistent unicode → stable key).
- ✅ Best-effort zeroization present, with honest comments on JS limits.

### vault.js — ITEMS TO CONFIRM (not bugs)
- ⚠️ **Argon2id params** = memorySize 65536 KiB (64 MiB), iterations 3,
  parallelism 1. Reasonable interactive defaults (≈OWASP lower bound), but
  CONFIRM against low-end MOBILE devices before launch (unlock time vs. cost).
  Deliberate tuning decision for the auditor to pressure-test.
- ⚠️ **base64 helpers (b64/unb64) build JS strings from secret bytes** — JS
  strings are immutable, can't be zeroed, linger until GC. Inherent web-JS
  limitation (already acknowledged in-file). Mitigated by M2 native keystore.
- ⚠️ **decryptVault returns the secret as a plain JS string** — same immutable-
  string limitation; caller (WalletProvider) must minimize hold time.

### signing.js — VERIFIED CORRECT
- ✅ Signing is LOCAL (ethers Wallet); private key never sent to server/RPC.
- ✅ chainId verified vs expected before broadcast (getNetwork() check) —
  genuine defense-in-depth vs wrong-network/replay.
- ✅ isAddress(to) validation rejects malformed recipients.
- ✅ RPC correctly treated as UNTRUSTED: a malicious RPC can misreport/refuse
  but cannot steal keys (signing is local; chainId check guards network).
- ✅ Honest live-secret / minimize-lifetime comments.

### signing.js — ITEMS TO CONFIRM / WATCH
- ⚠️ **privateKey passed as a JS string** — same immutable-string memory limit;
  unavoidable with ethers on web; M2/native is the mitigation.
- 📋 **signMessage signs arbitrary messages** — fine for MVP (native sends), but
  MUST NOT be wired to any untrusted/dApp caller until Phase D adds EIP-712 /
  permit decode + warnings. Confirm it stays internal in the MVP.

---

## The one cross-cutting limitation (most important for the threat model)

**JavaScript cannot securely zeroize secrets in memory.** Mnemonics/keys exist
transiently as immutable JS strings (in vault decrypt output, base64 handling,
and the ethers signer) that can't be reliably wiped and may linger in GC'd
memory. This is a known web-platform constraint, NOT a code defect.

Mitigations / actions:
- Document explicitly in the threat model handed to the auditor.
- M2 (native Secure Enclave/Keychain + Android Keystore) is the real mitigation
  on mobile — keys wrapped by hardware, password not the sole factor.
- Keep decrypted-secret lifetime minimal (verify in WalletProvider review).

---

## Still to self-review (future passes)
- [ ] mnemonic.js — entropy source, BIP-39 checksum, 12/24-word paths.
- [ ] derivation.js — BIP-32/44 path, vector match, index correctness.
- [ ] WalletProvider.jsx — in-memory session, clear-on-lock / idle / tab-hide,
      that no secret leaks into state/query-cache/props (this is where the
      "minimize lifetime" intent is actually implemented — important).
- [ ] vaultStore.js — only ciphertext persisted; non-encrypted-object guard.
- [ ] token-send.js / calldata.js — re-confirm decimals + approval guard.
- [ ] grep pass: no secret written to logs/analytics/network/storage anywhere.

## Reminder
These passes raise confidence and cut audit cost — they do NOT replace the
independent third-party audit, which remains the gate before any mainnet use.
