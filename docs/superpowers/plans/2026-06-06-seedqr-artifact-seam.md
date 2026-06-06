# Seed Backup Slice 1 — `seedQr.js` Artifact Seam — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the pure `src/lib/seedQr.js` artifact seam — encrypt/decrypt a mnemonic into a versioned encrypted backup artifact and QR-encode/decode it — with a CI-enforced B1 round-trip test.

**Architecture:** Reuse `wallet-core/vault.js` (Argon2id 192 MiB/t=3 → AES-256-GCM, CSPRNG) for the crypto — NO new crypto. `seedQr.js` adds the versioned envelope `{fmt:'veyrnox-seed-backup', v:1, blob:<vault blob>}` plus `qrcode` encode + `jsqr` decode (DOM-free ImageData path for testability). Provisional/unaudited (owner-approved audit-gate override).

**Tech Stack:** Vitest (jsdom — provides `crypto.subtle`), `qrcode`, `jsqr`, `@/` alias.

**Pre-validated:** the full pipeline (vault encrypt → artifact → `QRCode.create` matrix → RGBA render → `jsQR` decode → vault decrypt) was run in node before this plan: 12-word (333 B → 486px) and 24-word (449 B → 534px) both round-trip; wrong-pw throws; garbage → null. The code below is that validated code.

Spec: `docs/superpowers/specs/2026-06-06-seedqr-artifact-seam-design.md`

**Setup note:** this worktree has no `node_modules`. Run `npm ci` once before the test steps (CI uses the same).

---

### Task 1: Write the failing test

The test imports from `@/lib/seedQr`, which doesn't exist yet → fails at import resolution (TDD red).

**Files:**
- Create: `src/lib/__tests__/seedQr.test.js`

- [ ] **Step 1: Install deps (worktree has none)**

Run: `npm ci`
Expected: completes without error.

- [ ] **Step 2: Create `src/lib/__tests__/seedQr.test.js` with EXACTLY this content**

```js
// src/lib/__tests__/seedQr.test.js
//
// B1 ("no silent restore failure") is the centerpiece: a created backup MUST
// round-trip to the exact mnemonic before anyone is told it worked. Also covers
// B2/B3 (wrong password / tamper rejected) and the B7 format check.
import { describe, it, expect, beforeAll } from 'vitest';
import {
  encryptSeedBackup,
  decryptSeedBackup,
  artifactToImageData,
  decodeArtifactQr,
} from '@/lib/seedQr';

// Trezor BIP-39 test vectors (12 & 24 words). Slice 1 is crypto+encoding only —
// it does not validate BIP-39, so these just need to be stable strings.
const MN12 = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
const MN24 = 'letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic avoid letter advice cage absurd amount doctor acoustic bless';
const PW = 'correct horse battery staple T3st!';

// Argon2id @192 MiB is ~2-3s per derivation; encrypt ONCE per mnemonic and reuse.
let art12, art24;
beforeAll(async () => {
  art12 = await encryptSeedBackup(MN12, PW);
  art24 = await encryptSeedBackup(MN24, PW);
}, 60000);

function flipFirstChar(s) {
  const repl = s[0] === 'A' ? 'B' : 'A';
  return repl + s.slice(1);
}

describe('seedQr artifact seam', () => {
  it('produces a versioned, self-describing artifact (B7)', () => {
    expect(art12).toMatchObject({ fmt: 'veyrnox-seed-backup', v: 1 });
    expect(art12.blob).toMatchObject({ v: 1, kdf: { name: 'argon2id' } });
  });

  it('B1: round-trips a 12-word mnemonic (encrypt -> QR -> decode -> decrypt)', async () => {
    const decoded = decodeArtifactQr(artifactToImageData(art12));
    expect(decoded).not.toBeNull();
    expect(await decryptSeedBackup(decoded, PW)).toBe(MN12);
  });

  it('B1: round-trips a 24-word mnemonic', async () => {
    const decoded = decodeArtifactQr(artifactToImageData(art24));
    expect(decoded).not.toBeNull();
    expect(await decryptSeedBackup(decoded, PW)).toBe(MN24);
  });

  it('B2/B3: a wrong password is rejected', async () => {
    await expect(decryptSeedBackup(art12, 'the wrong password')).rejects.toThrow();
  });

  it('B3: a tampered ciphertext is rejected', async () => {
    const tampered = { ...art12, blob: { ...art12.blob, ct: flipFirstChar(art12.blob.ct) } };
    await expect(decryptSeedBackup(tampered, PW)).rejects.toThrow();
  });

  it('rejects a non-Veyrnox artifact (B7 format check)', async () => {
    await expect(decryptSeedBackup({ fmt: 'other', v: 1, blob: art12.blob }, PW)).rejects.toThrow('Not a Veyrnox');
  });

  it('uses fresh CSPRNG salt/iv per encryption (no nonce reuse)', () => {
    expect(art12.blob.salt).not.toBe(art24.blob.salt);
    expect(art12.blob.iv).not.toBe(art24.blob.iv);
  });

  it('decodeArtifactQr returns null for a non-Veyrnox QR', () => {
    const foreign = artifactToImageData({ fmt: 'not-veyrnox', v: 1, blob: { hello: 'world' } });
    expect(decodeArtifactQr(foreign)).toBeNull();
  });

  it('decodeArtifactQr returns null for garbage image data', () => {
    expect(decodeArtifactQr({ data: new Uint8ClampedArray(64 * 64 * 4).fill(255), width: 64, height: 64 })).toBeNull();
  });
});
```

- [ ] **Step 3: Run it and confirm it FAILS**

Run: `npx vitest run src/lib/__tests__/seedQr.test.js`
Expected: FAIL — `Failed to resolve import "@/lib/seedQr"` (module doesn't exist).

- [ ] **Step 4: Commit the failing test**

```bash
git add src/lib/__tests__/seedQr.test.js
git commit -m "test(seedqr): add seed-backup artifact round-trip tests (red)"
```

---

### Task 2: Implement `seedQr.js`

**Files:**
- Create: `src/lib/seedQr.js`

- [ ] **Step 1: Create `src/lib/seedQr.js` with EXACTLY this content**

```js
// src/lib/seedQr.js
//
// PROVISIONAL / UNAUDITED. Encrypted seed-backup artifact seam (Slice 1 of the
// real seed-backup feature; parent spec docs/superpowers/specs/
// 2026-06-05-real-seed-backup-design.md). The parent spec gates the cryptographic
// construction on an independent audit (§12); the owner has deliberately
// overridden that gate. To minimize risk this module invents NO crypto — it
// reuses the wallet's in-production vault construction (wallet-core/vault.js:
// Argon2id 192 MiB / t=3 -> AES-256-GCM, CSPRNG salt/IV). Treat as provisional
// until independently audited. This file adds only the versioned artifact
// envelope and the QR encode/decode.
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { encryptVault, decryptVault } from '@/wallet-core/vault.js';

const FMT = 'veyrnox-seed-backup';
const VERSION = 1;

/**
 * Encrypt a mnemonic into a versioned, self-describing backup artifact.
 * @param {string} mnemonic LIVE SECRET — caller minimizes its lifetime.
 * @param {string} password backup password.
 * @returns {Promise<{fmt:string, v:number, blob:object}>}
 */
export async function encryptSeedBackup(mnemonic, password) {
  const blob = await encryptVault(mnemonic, password);
  return { fmt: FMT, v: VERSION, blob };
}

/**
 * Decrypt a backup artifact back to the mnemonic. THROWS on a wrong password, a
 * tampered blob (GCM auth), or a non-Veyrnox artifact — never returns a wrong seed.
 * @returns {Promise<string>} the mnemonic (LIVE SECRET).
 */
export async function decryptSeedBackup(artifact, password) {
  if (!artifact || artifact.fmt !== FMT || artifact.v !== VERSION) {
    throw new Error('Not a Veyrnox seed backup');
  }
  return decryptVault(artifact.blob, password);
}

/**
 * Render an artifact to an ImageData-shaped { data, width, height } (RGBA),
 * DOM-free so it is unit-testable and directly decodable by jsQR.
 */
export function artifactToImageData(artifact, { scale = 6, margin = 4 } = {}) {
  const qr = QRCode.create(JSON.stringify(artifact), { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const bits = qr.modules.data; // length size*size; truthy = dark module
  const dim = (size + margin * 2) * scale;
  const data = new Uint8ClampedArray(dim * dim * 4).fill(255); // white, opaque
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (!bits[r * size + c]) continue;
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          const x = (c + margin) * scale + dx;
          const y = (r + margin) * scale + dy;
          const i = (y * dim + x) * 4;
          data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; // black; alpha already 255
        }
      }
    }
  }
  return { data, width: dim, height: dim };
}

/** Encode an artifact to a PNG data: URL for on-screen display / print. */
export function artifactToQrDataUrl(artifact) {
  return QRCode.toDataURL(JSON.stringify(artifact), { errorCorrectionLevel: 'M' });
}

/**
 * Decode a scanned/rendered QR (ImageData-shaped) back to an artifact, or null
 * if it is not a valid Veyrnox backup QR. NEVER throws.
 */
export function decodeArtifactQr(imageData) {
  if (!imageData || !imageData.data) return null;
  const res = jsQR(imageData.data, imageData.width, imageData.height);
  if (!res) return null;
  try {
    const a = JSON.parse(res.data);
    return a && a.fmt === FMT && a.v === VERSION ? a : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 2: Run the test and confirm it PASSES**

Run: `npx vitest run src/lib/__tests__/seedQr.test.js`
Expected: PASS — all tests green. (~15-25s total; Argon2id @192 MiB dominates.)
If the B1 round-trip fails, the QR render didn't decode — do NOT weaken the
assertion; raise `scale` (e.g. 8) or check the `qr.modules` access. The pre-
validation used scale 6 / margin 4 successfully.

- [ ] **Step 3: Commit**

```bash
git add src/lib/seedQr.js
git commit -m "feat(seedqr): encrypted seed-backup artifact seam (vault crypto reuse)"
```

---

### Task 3: Full verification gate

**Files:** none (verification only).

- [ ] **Step 1: Lint the new files**

Run: `npx eslint src/lib/seedQr.js src/lib/__tests__/seedQr.test.js --quiet`
Expected: exit 0, no output.

- [ ] **Step 2: Production build (module resolves, no syntax issues)**

Run: `npm run build`
Expected: exit 0; `dist/` produced. (Confirms `@/lib/seedQr` and its `qrcode`/
`jsqr`/`@/wallet-core/vault.js` imports resolve in the bundler.)

- [ ] **Step 3: Full test suite**

Run: `npm test`
Expected: PASS — the previous green count **plus the 9 new seedQr tests**, 0
failures. (No other files changed, so nothing else moves.)

---

## Notes for the implementer

- Pure module only: `src/lib/seedQr.js` + its test. NO UI, NO provider, NO
  classification change — those are later slices. If you touch any other file, stop.
- Do NOT invent crypto or change `vault.js`. The construction is reused verbatim.
- The artifact `blob` IS a `vault.js` blob; `decryptSeedBackup` delegates to
  `decryptVault`, which already throws one generic error for wrong-password OR
  tamper — keep that (don't distinguish them).
- `artifactToQrDataUrl` has no slice-1 consumer/test (the page in slice 3 uses
  it); it's a thin `qrcode.toDataURL` wrapper. That's expected, not a gap.
