# Veyrnox — Real Encrypted Seed Backup & Scan-to-Recovery: Design Spec

**Date:** 2026-06-05 · **Status:** DESIGN SPEC — cryptographic construction GATED on independent audit; implementation structure approved (pre-plan).
**Scope:** Make `/wallet-seed-qr` a real, honest backup: reveal the seed from the unlocked vault behind a re-authentication gate, produce a **password-encrypted** backup artifact (file and/or QR), let the user verify their own backup restores, and add **scan-to-recovery** to onboarding so the artifact has a genuine in-app consumer.

> ⚠️ HIGHEST-STAKES FEATURE IN THE WALLET. This handles the seed directly — the asset whose
> compromise or loss is CATASTROPHIC and UNRECOVERABLE (A1). This document fixes the FEATURE
> SHAPE (flows, modules, invariants), but it deliberately does NOT fix the final KDF parameters,
> cipher, or artifact encoding as authoritative — those MUST be chosen and reviewed by a qualified
> cryptographer / the independent audit BEFORE any build. Shipping unaudited crypto on this feature
> is the exact risk the audit blocker exists to prevent. A spec existing here does NOT mean the
> crypto is "designed."
>
> CONTEXT: This replaces the FAKE seed-QR removed in #87 (a decorative canvas that encoded nothing
> but was printable as a "backup" → fund loss on restore). The bar: a real backup must never be
> able to silently fail to restore.
>
> RECONCILIATION NOTE: An earlier draft of this feature proposed a **plaintext** raw-BIP-39
> mnemonic QR (interoperable, no password on the artifact). That approach is **rejected** here: a
> scannable plaintext seed is a standalone bearer secret — a targeting/exfiltration artifact that
> cuts against the coercion-resistant-vault wedge. The artifact is therefore **encrypted under a
> user password** (B2/B3 below). The interoperability cost of that choice is accepted and called
> out in §6.

## 1. Why this is dangerous (failure modes that lose funds or seeds)
- Silent restore failure — a backup that looks valid but can't reconstruct the seed (the #87 sin). MUST be impossible by construction (verify-on-create, §2 B1).
- Weak/again-the-#87 encoding — a QR/file that doesn't actually contain recoverable data.
- Weak key derivation — password → key with too-cheap KDF → brute-forceable backup → seed theft.
- Cipher misuse — nonce reuse, missing authentication (tamper/partial-corruption undetected), wrong mode.
- Plaintext leakage — seed in memory/disk/logs/clipboard during export; temp files; swap.
- Bearer-artifact risk — a scannable/printable artifact that is itself a usable secret (the rejected plaintext-QR shape).
- Backup confusion — restoring the wrong/old backup; no way to tell which wallet without leaking which wallet.
- Deniability interaction — a backup that reveals the existence of a hidden/decoy wallet (A3) defeats the deniability stack.

## 2. Invariants (non-negotiable — a design violating any is rejected)
- **B1 — No silent restore failure.** The system MUST verify, at creation time, that the backup actually round-trips to the exact seed (decrypt + derive + compare) BEFORE telling the user it succeeded. If it can't prove restorability, it fails honestly and produces nothing.
- **B2 — Confidentiality at rest.** The backup artifact is useless without the user's password. Key derived from the password with an audited, deliberately-expensive KDF (parameters = audit decision).
- **B3 — Authenticated.** Tampering or corruption is DETECTED on restore (authenticated encryption), never silently producing a wrong seed.
- **B4 — No plaintext seed egress.** Seed plaintext never written to disk, logs, analytics, clipboard history, temp files, or any backend. All crypto on-device. (Ties to backend invariants I1/I2.)
- **B5 — Deniability-safe.** A backup of a normal wallet must not reveal the existence of hidden/decoy wallets. Decoy/hidden sessions never produce a "the backup." Exact behaviour = a deniability-design decision, flagged for review.
- **B6 — Honest UX.** The user is told, in plain language: this protects the backup with their PASSWORD; if they lose BOTH the backup and the password, funds are gone; the password is not recoverable. No false reassurance.
- **B7 — Versioned format.** The artifact carries a clear version/format identifier so future formats can be distinguished and migrated without ambiguity.
- **B8 — Re-auth on reveal.** Surfacing the seed (to back it up) requires a fresh re-authentication (vault password + the biometric/passkey factors the user has enabled), every time. A briefly-unlocked, unattended device cannot leak the seed.

## 3. Functional requirements
- **Export:** user authenticates to the vault → chooses "encrypted backup" → re-authenticates (B8) → sets a backup password (with strength guidance) → system reveals the real mnemonic, produces an encrypted artifact (file and/or QR) → VERIFIES it round-trips (B1) → presents it for the user to store. The plaintext mnemonic words are ALSO shown (behind the same reveal) for hand-writing — the durable human backup — with a blunt warning.
- **Restore (scan-to-recovery):** on a fresh/empty device, the user scans the backup QR (or loads the file) → supplies the backup password → system decrypts + authenticates (B3) → fills the existing onboarding mnemonic input → the EXISTING `importWallet` checksum-validated path runs (single import mechanism). Confirms by deriving the expected address(es) before adopting.
- **Verify-my-backup:** the user can scan/load their just-created artifact, decrypt with the password, and confirm it reconstructs the revealed seed — a *verified* backup, not merely a viewed one.
- **Format:** self-describing (version, KDF id + params, cipher id, salt, nonce, ciphertext, auth tag). Compact binary for QR (capacity limits — may require compact encoding or multi-part QR; a known constraint to design around, NOT a fragile bespoke scheme).
- **No partial success:** either a fully-verified backup is produced, or nothing is.

## 4. Threat model (who attacks the backup)
| Actor | Threat | Defended by |
|---|---|---|
| Thief who finds the file/QR | Brute-force the password → seed | B2 (expensive KDF) + strong-password guidance |
| Tamperer | Corrupt backup → wrong seed on restore | B3 (authenticated encryption) |
| Malware on-device during export | Capture plaintext seed | B4 + minimise plaintext lifetime in memory; B8 re-auth |
| Opportunist with a briefly-unlocked device | Open backup screen and exfiltrate the seed | B8 (re-auth on every reveal) |
| Coercion (the persona) | Forced to reveal backup + password | Deniability interaction (B5); decoy/hidden never reveal |
| Cloud/backup-sync (if user stores in cloud) | Provider reads artifact | B2 makes artifact opaque; warn user where they store it |
| Shoulder-surf / screen capture of QR | Read the artifact visually | Encrypted artifact is ciphertext, not the seed; still treat as sensitive and warn |

> Why not a plaintext mnemonic QR: it would make the artifact itself a bearer secret — anyone who
> photographs the QR has the wallet, with no second factor. Encrypting under the password keeps the
> "no backup without the password" property (B2) and aligns with the wedge. The cost (loss of
> standard-tool interop) is accepted (§6).

## 5. Architecture (implementation structure — crypto seams are audit-decided)

Three units with clear boundaries. The cryptographic construction lives behind the `seedQr` seam so it can be chosen/replaced by the audit without touching the page or provider.

### `src/lib/seedQr.js` (new, pure, shared)
The testable artifact seam. Encapsulates encrypt/decrypt + QR encode/decode of the **encrypted** artifact (NOT the raw mnemonic).
- `encryptSeedBackup(mnemonic, password): Promise<Artifact>` — derives a key (audited KDF), encrypts with an authenticated cipher (audited AEAD), returns the self-describing versioned artifact (§3 format). Salt/nonce from a CSPRNG only (`crypto.getRandomValues`, never `Math.random` — extends the existing `check:rng` guard).
- `decryptSeedBackup(artifact, password): Promise<string>` — authenticates + decrypts; THROWS on wrong password or tamper (B3); never returns a wrong seed.
- `artifactToQrDataUrl(artifact): Promise<string>` / `artifactToImageData(artifact): ImageData` — encode the artifact for display/print; the ImageData path is DOM-free so it is unit-testable in jsdom/node.
- `decodeArtifactQr(imageData): Artifact | null` — decode the QR back to the artifact (via `jsqr` or equivalent); `null` if not a valid Veyrnox backup artifact.
- **Round-trip property (CI-enforced, B1):** `decryptSeedBackup(decodeArtifactQr(artifactToImageData(encryptSeedBackup(m, pw))), pw) === m`.
- The concrete KDF/cipher/params/encoding are AUDIT decisions; this module is the single place they are wired, so the audit changes one file.

### `WalletProvider.revealMnemonicWithReauth(walletId, password)` (new method)
The gated reveal — gate logic stays in the security layer, not the page.
1. If `isDecoy || isHidden` → throw (`'Backup is unavailable in this session.'`), mirroring `addWallet`/`removeWallet` (B5). A decoy/hidden seed is never surfaced as "the backup."
2. Run the existing `runBiometricGate()` and `runPasskeyGate()` (the same factors `unlock` uses) — B8.
3. Verify the password via the existing decrypt-to-verify path (`keyStore.unlock(password)` throws the generic error on a wrong password and changes nothing).
4. Return the active/selected wallet's real mnemonic from the in-memory container.

Returns the mnemonic string; throws on wrong password / cancelled gate / decoy session. Never persists anything. The caller (page) hands the mnemonic straight to `encryptSeedBackup` and wipes it from state after.

### `src/components/SeedScanner.jsx` (new, reusable)
Wraps the existing `QRScanner`: decodes a scanned QR to an artifact via `decodeArtifactQr`, and calls back with the artifact (or an error). It does NOT decrypt — decryption requires the password and happens in the consuming flow (verify, or recovery). Used by Component 1 (verify) and Component 2 (recovery).

## 6. Encoding / interoperability trade-off (consequence of encryption)
- The artifact is a **Veyrnox-specific encrypted format**, NOT a standard BIP-39 mnemonic. It is therefore NOT restorable by third-party wallets from the QR alone — only by Veyrnox's scan-to-recovery (with the password). The hand-written **words** remain the standard, interoperable, tool-agnostic backup; the encrypted QR/file is the convenience digital copy.
- Encrypted payloads are larger than a bare mnemonic. A 12/24-word mnemonic plus KDF/cipher headers may approach single-QR capacity limits depending on the chosen construction; the design must use compact binary encoding and, if required, multi-part QR — chosen during the crypto-construction step, not invented ad hoc.

## 7. Component 1 — Honest encrypted backup (`/wallet-seed-qr`)
The urgent honesty fix; eliminates the fund-loss trap on its own.
- **Wallet selector** from `useWallet().wallets` (real per-wallet `{id,name,...}`), not the demo entity store. The seed `<textarea>` is **removed** — a seed is never typed to back it up.
- **Guards:** locked (`!isUnlocked`) → prompt to unlock; `isDecoy || isHidden` → honest "Seed backup is unavailable in this session" notice, no reveal.
- **Reveal + export flow:** "I understand the risks" confirm → password field + biometric/passkey gate (if enabled) → `revealMnemonicWithReauth(walletId, password)` → set/confirm a backup password (strength guidance) → `encryptSeedBackup(mnemonic, backupPassword)` → render the **words** (monospace, show/hide) for hand-writing AND the **encrypted QR** (`artifactToQrDataUrl`) / downloadable file.
- **Verify-my-backup:** "Scan to verify your backup" → `SeedScanner` → `decryptSeedBackup(artifact, backupPassword)` → compare to the revealed mnemonic:
  - match → green "✓ Verified — this backup restores your wallet," then `confirmWalletBackup(walletId)` (clears the unbacked-wallet warning; a *verified* backup).
  - mismatch/throw → "This backup did not restore your seed — do not rely on it" (the explicit anti-trap message).
- **Print:** kept, only after reveal, re-labelled with a blunt warning (a printed seed is a plaintext key; printers/spoolers can retain it — hand-writing is safer). Prints the words; the encrypted QR optionally.
- **Clear from memory:** wipes the revealed mnemonic and backup password from component state; resets the flow.
- **Rename:** nav label "Seed Key QR" → "Seed Backup". The route path stays `/wallet-seed-qr` (avoids breaking links/registry/classification keys); only the user-facing label changes.

## 8. Component 2 — Scan-to-recovery (onboarding)
Gives the artifact a genuine restore consumer; ships after Component 1.
- `SeedScanner` is added to the **import-existing-wallet onboarding flow** (the fresh/empty-device path reached via the wallet gate / `WalletEntry`).
- Flow: "Scan backup QR" → `SeedScanner` decodes the artifact → prompt for the backup password → `decryptSeedBackup` → on success it **fills the existing mnemonic input**; the user then sets a (new vault) password and the existing `importWallet(mnemonic, password)` runs. The scanner+decrypt only *fill* the field — the existing checksum-validated import path stays the single import mechanism.
- Wrong password / tampered / non-artifact scan → "Could not read this backup" / "Not a valid Veyrnox backup QR"; nothing is imported.

## 9. Security model (summary)
- Revealed mnemonic and backup password live only in component state, only during an active reveal; "Clear from memory" wipes them; navigating away unmounts them (B4).
- Re-auth on every reveal (B8); decoy/hidden sessions never reveal (B5).
- The artifact is ciphertext under the backup password (B2) and authenticated (B3) — a found/cloud-synced/shoulder-surfed artifact is not a usable seed without the password.
- Vault password verified by the unchanged decrypt-to-verify path; a wrong password throws the generic error and reveals nothing.

## 10. Error handling
| Case | Behaviour |
|---|---|
| Wallet locked | Reveal blocked; prompt to unlock |
| Decoy/hidden session | Honest "unavailable in this session"; `revealMnemonicWithReauth` throws |
| Wrong vault password / cancelled gate | Generic failure; no reveal |
| Verify: decrypt fails or seed mismatch | "This backup did not restore your seed — do not rely on it" |
| Recovery: wrong backup password / tampered | "Could not read this backup"; no import |
| Scan decodes to non-artifact | "Not a valid Veyrnox backup QR"; no import/verify |

## 11. Testing
- `src/lib/__tests__/seedQr.test.js` (pure): round-trip `decryptSeedBackup(decodeArtifactQr(artifactToImageData(encryptSeedBackup(m, pw))), pw) === m` for 12- and 24-word mnemonics; wrong password THROWS (B2); a tampered artifact THROWS (B3); `decodeArtifactQr` returns `null` for an unrelated QR.
- `WalletProvider` reveal-gate tests: `revealMnemonicWithReauth` throws on wrong password and in decoy/hidden sessions; returns the correct mnemonic on the happy path. (Follow existing `WalletProvider`/keystore patterns; `fake-indexeddb` is configured.)
- Scan/recovery: a non-artifact or wrong-password payload is rejected; the happy path fills the onboarding mnemonic input and defers to `importWallet`.
- Components (`SeedScanner`, page, onboarding) verified by `npx vite build` — the repo has no React Testing Library; logic lives in the tested pure modules.
- CSPRNG: salt/nonce sourced from `crypto.getRandomValues` — covered by the existing `check:rng` guard.

## 12. Build gate (REQUIRED order)
1. This spec → reviewed/extended by a qualified cryptographer / the independent audit.
2. Cryptographic construction (KDF, AEAD, params, artifact encoding) chosen and reviewed BEFORE coding.
3. Implementation against B1–B8, with round-trip verification (B1) and the CSPRNG guard enforced in code + tests.
4. Audit of the implementation (test vectors, restore-failure tests, tamper tests, KDF cost).
5. Only then: ship — marketed as provisional until the broader audit completes.

DO NOT build the crypto from this document alone. It fixes the feature shape; the cryptographic design is the audit's.

## 13. Acceptance criteria (what "done safely" looks like)
- Every created backup is proven to round-trip before the user is told it worked (B1) — tested.
- The artifact is useless without the password (B2) and tamper is rejected on restore (B3) — tested.
- No seed plaintext appears in disk/logs/clipboard/temp/backend (B4) — verified.
- Reveal requires fresh re-auth every time (B8) — tested.
- Deniability behaviour decided and tested (B5).
- UX copy reviewed for honest loss/recovery messaging (B6).
- Scan-to-recovery restores a real wallet end-to-end via the existing `importWallet` path.
- All crypto choices carry an audit sign-off (build gate).

## 14. Dependencies & integration
- **Depends on the fabricator sweep (#104), now merged.** It added the classification audit + central `FeatureGate`, which currently classifies `/wallet-seed-qr` as `disabled (unverified)` and renders the honest "not available" notice.
- **The implementation MUST flip the classification to `live`** once the page is real: update `CLASSIFICATION['/wallet-seed-qr']` in `src/lib/featureClassification.js` from `{ verdict: 'disabled', reason: 'unverified', ... }` to `{ verdict: 'live', dataSource: 'wallet-core', note: '<reads the real vault via revealMnemonicWithReauth; backup artifact encrypted under a user password>' }`. The audit↔registry consistency tests (incl. `routeAudit.test.js`) make this update mechanically required.
- Build on a branch off the post-#104 `main`.

## 15. Non-goals (YAGNI)
- **Plaintext mnemonic QR** — considered and rejected (§4): a scannable bare seed is a bearer secret against the wedge.
- Social/shard-based recovery (separate, harder spec).
- Cloud auto-backup (conflicts with the wedge; if ever considered, client-encrypted only, opt-in, per the backend security architecture).
- A general downloadable plaintext seed file (the encrypted artifact file is fine; a plaintext file is not).
- In-session add-wallet QR import (recovery lives in onboarding; add-wallet scanning is a later, separate decision).
- The exact, final cryptographic parameters (audit decides).

## 16. Open items deferred to the plan
- Exact onboarding component to host the scanner (the import-existing path in the wallet-gate/`WalletEntry` flow).
- Whether `confirmWalletBackup` fires on verify-success only, or also offers a manual "I wrote it down" confirm for users who decline the scan step.
- Single vs multi-part QR, and exact compact encoding — pinned alongside the crypto construction.

## Related
- #87 (fake seed-QR removal — the reason this exists) · #104 (classification audit + FeatureGate) ·
  docs/Production-readiness.md (audit blocker) · docs/Backend-security-architecture.md (I1/I2 on-device, no egress) ·
  wallet-core RNG (`check:rng`).
