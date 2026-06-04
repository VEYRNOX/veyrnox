# Veyrnox — Security Scan (2026-06-04)

> Pattern-and-secrets scan: npm audit + secrets/keys grep + SAST grep patterns.
> READ-ONLY; no fixes applied. This is NOT the independent audit — it catches
> obvious/embarrassing holes and leaked secrets. It does NOT verify KDF params,
> encryption correctness, timing-safety, or the cryptographic strength of the
> deniability stack. Those remain for the independent audit (see
> Production-readiness.md, a tracked launch blocker). A clean scan here must not
> substitute for that audit.

## Summary

| Layer | Result |
|---|---|
| Committed secrets / keys | CLEAN — none |
| Hardcoded API keys / tokens | CLEAN — none |
| .env / credentials in git | CLEAN — none |
| Insecure HTTP transport | CLEAN — none |
| Seed/key in localStorage | CLEAN — only demo balances + preferences |
| Crypto-path randomness | DEFENDED — wallet-core forbids Math.random; check:rng guard present |
| Math.random (non-crypto) | All cosmetic/demo; one latent 2FA note (see findings) |
| Dangerous sinks (XSS/eval) | LOW — print-window document.write + shadcn chart inject; trusted local input |
| Dependency vulns | 17 (11 moderate, 6 high); mostly dev-chain |

## Findings (none urgent, none drop-everything)

1. LATENT — weak RNG on 2FA code. `src/pages/SendCrypto.jsx` ~line 430 generates
   a 6-digit email 2FA code with Math.random (predictable PRNG). Currently DORMANT:
   gated behind `if (!EMAIL_AVAILABLE) return;` and email is not available in the
   local build, so the path does not run. ACTION: before email 2FA ships, switch to
   crypto.getRandomValues. Add a code comment now so it is not forgotten.

2. ROUTINE — vite dev-server vuln (high: path traversal / arbitrary file read via
   dev server). Affects the LOCAL dev server only, not shipped code. ACTION:
   `npm audit fix` (non-breaking) when convenient.

3. WATCH — ws memory-disclosure (moderate) via ethers v6. Fix wants ethers@5.8.0,
   a BREAKING downgrade. DO NOT force-fix (would break the wallet). Track for an
   ethers-v6 patch that bumps ws.

4. WATCH — uuid/jayson (moderate) via @solana/web3.js. Fix wants
   @solana/web3.js@0.0.3, a catastrophic downgrade. DO NOT force-fix. Solana is
   receive-only; defer.

## Verified false positives (recorded so they are not re-flagged)
- CryptoSigning.jsx:168 — displays wallet.privateKey behind a showKey toggle (masked
  by default). Rendering a key, not hardcoding one.
- txHistory.js:281 — a base58 alphabet constant, not a key.
- Dashboard.jsx:39 — Math.random generates fake addresses for the DEMO tour only;
  the real dashboard is vault-driven (WalletPortfolioPage). Documented in-code.
- DEMO_SEED_KEY (decoyBalance.js / hiddenBalance.js) — stores demo BALANCE data, not
  seed phrases. Misleading name; content is demo balances.

## What this scan did NOT cover (needs the independent audit)
- KDF parameter strength (Argon2id settings) and AES-GCM usage correctness
- Timing-safety / side-channel review (e.g. unlock timing, already SAST-fixed M-2)
- Cryptographic soundness of the deniability stack (duress/decoy/hidden/panic)
- Logic-level flaws grep cannot see

## Related docs
- docs/Production-readiness.md — launch gates (independent audit = hard blocker)
- docs/Feature-Status.md — build status; SAST history (M-1/M-2/M-3 fixes)
- docs/SAST_FINDINGS.md / docs/SECURITY_REVIEW_CHECKLIST.md — prior security work
