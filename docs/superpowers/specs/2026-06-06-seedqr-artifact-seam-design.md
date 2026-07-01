# Seed Backup — Slice 1: `seedQr.js` artifact seam

**Date:** 2026-06-06
**Branch:** `feat/seed-backup-seedqr` (off `main`)
**Status:** Approved design — ready for implementation plan
**Parent spec:** `docs/superpowers/specs/2026-06-05-real-seed-backup-design.md` (§5, §11)

> ⚠️ AUDIT-GATE OVERRIDE. The parent spec gates the cryptographic construction on
> an independent audit (§12). The repo owner has **explicitly chosen to build
> without that audit**, accepting the risk. To minimize it, this slice **invents
> no crypto**: it reuses the wallet's existing in-production vault construction
> (`vault.js`: Argon2id 64 MiB / t=3 → AES-256-GCM, CSPRNG salt/IV). The module
> is labeled **provisional / unaudited** in-code; a real audit is still
> recommended before it guards significant funds. Implementation still honors the
> parent invariants B1 (round-trip), B2/B3 (confidential + authenticated),
> CSPRNG-only, B7 (versioned format).

## Scope

The pure, foundational artifact seam — **no UI, no provider changes**. It is the
single module the later slices (reveal gate, page, recovery, cloud) build on.
Fully unit-testable; the critical **B1 "no silent restore failure"** property is
CI-enforced here.

## Crypto construction (reuse — no new crypto)

`encryptSeedBackup`/`decryptSeedBackup` delegate to `vault.js`'s `encryptVault`/
`decryptVault`:
- KDF: Argon2id (`hash-wasm`), params from `vault.js` `KDF_PARAMS` (64 MiB,
  t=3, recorded in the blob for forward-migration).
- AEAD: AES-256-GCM (WebCrypto), 16-byte salt, 12-byte IV, both from
  `crypto.getRandomValues` (the only RNG — satisfies the `check:rng` guard).
- A wrong password OR a tampered blob **throws** (GCM auth) — `decryptVault`
  already maps both to a single generic error, never returning a wrong seed.

## Artifact format (B7 — self-describing, versioned, distinguishable)

```js
// What encryptSeedBackup returns / decodeArtifactQr yields:
{
  fmt: 'veyrnox-seed-backup', // format tag — distinguishes from a vault blob and from random QRs
  v: 1,                       // backup-artifact format version
  blob: { v, kdf, salt, iv, ct }, // exact vault.js encryptVault output (base64 fields)
}
```

`fmt` is the identity check for `decodeArtifactQr` (B7 + "return null for a
non-Veyrnox QR"). `v` versions the envelope independently of the inner blob.

## API — `src/lib/seedQr.js` (new, pure)

```js
// All async crypto returns Promises. LIVE SECRET handling: callers minimize the
// mnemonic's lifetime; this module never persists, logs, or copies it.

export async function encryptSeedBackup(mnemonic, password) -> Artifact
//   = { fmt:'veyrnox-seed-backup', v:1, blob: await encryptVault(mnemonic, password) }

export async function decryptSeedBackup(artifact, password) -> string (mnemonic)
//   - validates artifact.fmt === 'veyrnox-seed-backup' && artifact.v === 1 (throw 'Not a Veyrnox backup' otherwise)
//   - returns await decryptVault(artifact.blob, password)  // throws on wrong pw / tamper (B3)

export function artifactToImageData(artifact, opts?) -> { data: Uint8ClampedArray, width, height }
//   - JSON.stringify(artifact) -> qrcode QRCode.create(text, {errorCorrectionLevel:'M'}) -> module matrix
//   - render matrix to RGBA: black module = (0,0,0,255), white = (255,255,255,255),
//     with a quiet-zone margin (>=4 modules) and integer scale (default ~6 px/module)
//   - DOM-FREE (no canvas) so it is unit-testable in node/jsdom

export async function artifactToQrDataUrl(artifact) -> string (data: URL)
//   - qrcode.toDataURL(JSON.stringify(artifact), {errorCorrectionLevel:'M'}) for the page/print (canvas path)

export function decodeArtifactQr(imageData) -> Artifact | null
//   - jsqr(imageData.data, imageData.width, imageData.height)
//   - if no QR, or text isn't JSON, or fmt !== 'veyrnox-seed-backup' -> return null
//   - else return the parsed artifact
```

`artifactToImageData` accepts/returns a plain `{data,width,height}` (an
ImageData-shaped object), so it works in node without a real `ImageData`
constructor; `jsqr` consumes that shape directly.

## Error handling

| Case | Behaviour |
|---|---|
| `decryptSeedBackup` wrong password / tampered `blob` | throws (generic; from `decryptVault`) — B3 |
| `decryptSeedBackup` artifact not a backup (`fmt`/`v`) | throws `'Not a Veyrnox backup'` |
| `decodeArtifactQr` no QR found / not JSON / wrong `fmt` | returns `null` (never throws) |
| `encryptSeedBackup` empty/invalid mnemonic | encrypts whatever string it's given — mnemonic VALIDATION is the caller's job (it already runs on the existing `importWallet` path); this seam is crypto+encoding only |

## Testing — `src/lib/__tests__/seedQr.test.js` (the slice's real deliverable)

- **B1 round-trip (centerpiece):**
  `decryptSeedBackup(decodeArtifactQr(artifactToImageData(await encryptSeedBackup(m, pw))), pw) === m`
  for a **12-word** and a **24-word** mnemonic (use fixed valid BIP-39 test
  mnemonics).
- **B2/B3 confidentiality + authentication:**
  - wrong password → `decryptSeedBackup` **rejects/throws**.
  - tamper a byte of `artifact.blob.ct` → **throws**.
- **Format identity (B7):**
  - `decodeArtifactQr` of a QR encoding unrelated text (e.g. `"hello"`) → `null`.
  - `decodeArtifactQr` of all-white/garbage ImageData → `null`.
  - `decryptSeedBackup({fmt:'other',...})` → throws.
- **Determinism of structure:** two `encryptSeedBackup(m, pw)` calls produce
  **different** `salt`/`iv`/`ct` (fresh CSPRNG per call) but both round-trip — a
  nonce-reuse smoke check.

Tests run under the existing vitest/jsdom config; `hash-wasm` Argon2id at 64 MiB
is slow (~seconds/derivation) — keep the test count tight (a handful of
encrypt/decrypt) to stay within the suite's `testTimeout`.

## Risk called out

The B1 round-trip depends on `jsqr` decoding the programmatically rendered
matrix. Mitigation: error-correction level `M`, an adequate quiet zone (≥4
modules) and integer scale (~6 px/module). If `jsqr` still fails to decode in
node, the round-trip test fails loudly (B1 working as intended) — the encode
rendering is then the thing to fix, not the assertion.

## Affected files

- `src/lib/seedQr.js` — new.
- `src/lib/__tests__/seedQr.test.js` — new.
- No other files; no UI, no provider, no classification change (those are later
  slices). `qrcode` and `jsqr` are already dependencies.

## Out of scope (later slices)

`revealMnemonicWithReauth` (slice 2), the `/wallet-seed-qr` page + `SeedScanner`
+ classification flip (slice 3), onboarding scan-to-recovery (slice 4), cloud
self-recovery (slice 5).
