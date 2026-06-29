// src/lib/seedQr.js
//
// PROVISIONAL / UNAUDITED. Encrypted seed-backup artifact seam (Slice 1 of the
// real seed-backup feature; parent spec docs/superpowers/specs/
// 2026-06-05-real-seed-backup-design.md). The parent spec gates the cryptographic
// construction on an independent audit (§12); the owner has deliberately
// overridden that gate. To minimize risk this module invents NO crypto — it
// reuses the wallet's in-production vault construction (wallet-core/vault.js:
// Argon2id 64 MiB / t=3 -> AES-256-GCM, CSPRNG salt/IV). Treat as provisional
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
