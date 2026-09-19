#!/usr/bin/env node
// OTA release tooling — see docs/ota-updates.md for the full runbook.
//
//   node scripts/ota/release.mjs prepare [distDir] [outDir]
//     Re-hashes dist against its ota-manifest.json, refuses a dev-flagged
//     bundle, and lays out the upload tree:
//       <outDir>/<channel>/<version>/ota-manifest.json
//       <outDir>/<channel>/<version>/files/<path>
//       <outDir>/<channel>/latest.json
//     It does NOT sign. Signing happens offline, on the hardware key.
//
//   node scripts/ota/release.mjs seal <releaseDir> <signatureFile>
//     Writes <releaseDir>/ota-manifest.sig from a signature produced by the
//     hardware token, converting the raw r||s form PKCS#11 emits into the DER the
//     app verifies, then checking it against the pinned keys. Refuses to write a
//     signature that does not verify.
//
//   node scripts/ota/release.mjs verify <releaseDir> [publicKeySpkiBase64]
//     Checks <releaseDir>/ota-manifest.sig against the manifest bytes. With no
//     key argument it uses the keys pinned in the native source (one per hardware
//     token) and passes if ANY of them verifies, so a typo in a pinned key is
//     caught here rather than on devices. Run it before uploading.
import { createPublicKey, verify as verifySig } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { BUILD_FLAGS_NAME, buildManifest, DEV_FLAGS, MANIFEST_NAME, SIGNATURE_NAME } from './manifest.mjs';

// Same pattern CLAUDE.md mandates for .ipa archives. Match the VALUE: Vite
// inlines the whole env object, so a clean build still contains the key names.
export const DEV_FLAG_PATTERN = /VITE_(BYPASS_RASP|DEV_UNGATE_SEND|DEMO_MODE):"1"/;

export function prepareRelease(distDir, outDir) {
  const manifestBytes = readFileSync(join(distDir, MANIFEST_NAME));
  const manifest = JSON.parse(manifestBytes);
  const rebuilt = buildManifest(distDir, manifest);
  if (JSON.stringify(rebuilt) !== manifestBytes.toString('utf8')) {
    throw new Error('dist changed after ota-manifest.json was written — rebuild before releasing');
  }
  if (!manifest.files[BUILD_FLAGS_NAME]) throw new Error(`${BUILD_FLAGS_NAME} missing — not built with the OTA vite plugin`);
  const flags = JSON.parse(readFileSync(join(distDir, BUILD_FLAGS_NAME), 'utf8'));
  for (const flag of DEV_FLAGS) {
    if (flags[flag] === '1') throw new Error(`refusing to release: built with ${flag}=1`);
  }
  // Backstop for unobfuscated builds; the flag file above is the real check.
  for (const path of Object.keys(manifest.files)) {
    if (!/\.(m?js|html)$/.test(path)) continue;
    const hit = readFileSync(join(distDir, path), 'utf8').match(DEV_FLAG_PATTERN);
    if (hit) throw new Error(`refusing to release: ${path} contains ${hit[0]}`);
  }
  const releaseDir = join(outDir, manifest.channel, String(manifest.bundleVersion));
  for (const path of Object.keys(manifest.files)) {
    const dest = join(releaseDir, 'files', path);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(join(distDir, path), dest);
  }
  writeFileSync(join(releaseDir, MANIFEST_NAME), manifestBytes);
  writeFileSync(join(outDir, manifest.channel, 'latest.json'), JSON.stringify({ bundleVersion: manifest.bundleVersion }));
  return { releaseDir, manifest };
}

/**
 * ECDSA P-256 signatures come in two encodings: DER (what the app verifies, and
 * what `openssl dgst -sign` emits) and the raw 64-byte r||s pair that PKCS#11
 * tools like pkcs11-tool emit. Accept either and always store DER.
 */
export function toDerSignature(sig) {
  if (sig.length !== 64) return sig; // already DER
  const trim = (b) => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    const v = b.subarray(i);
    return v[0] & 0x80 ? Buffer.concat([Buffer.from([0]), v]) : Buffer.from(v);
  };
  const r = trim(sig.subarray(0, 32));
  const s = trim(sig.subarray(32));
  const body = Buffer.concat([Buffer.from([0x02, r.length]), r, Buffer.from([0x02, s.length]), s]);
  return Buffer.concat([Buffer.from([0x30, body.length]), body]);
}

/** Every key pinned in the native source — one per hardware token. */
export function pinnedPublicKeys(kotlinPath = 'android/app/src/main/java/com/veyrnox/app/OtaBundleVerifier.kt') {
  const list = readFileSync(kotlinPath, 'utf8').match(/PUBLIC_KEYS_SPKI_B64:\s*List<String>\s*=\s*(listOf\(([^)]*)\)|emptyList\(\))/)?.[2] ?? '';
  const keys = [...list.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  if (!keys.length) throw new Error('no public key pinned in OtaBundleVerifier.kt (OTA is disabled)');
  return keys;
}

/** True if the signature verifies under ANY of the given keys — same rule as native. */
export function verifyRelease(releaseDir, publicKeysSpkiB64) {
  const keys = Array.isArray(publicKeysSpkiB64) ? publicKeysSpkiB64 : [publicKeysSpkiB64];
  const manifest = readFileSync(join(releaseDir, MANIFEST_NAME));
  const sig = Buffer.from(readFileSync(join(releaseDir, SIGNATURE_NAME), 'utf8').trim(), 'base64');
  return keys.some((k) => {
    try {
      return verifySig('sha256', manifest, createPublicKey({ key: Buffer.from(k, 'base64'), format: 'der', type: 'spki' }), sig);
    } catch {
      return false;
    }
  });
}

/**
 * Store a token's signature as DER and prove it verifies under a pinned key.
 * `signature` is a Buffer (raw or DER) or a base64 string of either.
 */
export function sealRelease(releaseDir, signature, publicKeysSpkiB64 = pinnedPublicKeys()) {
  const raw = Buffer.isBuffer(signature) ? signature : Buffer.from(String(signature).trim(), 'base64');
  const der = toDerSignature(raw);
  const sigPath = join(releaseDir, SIGNATURE_NAME);
  const previous = existsSync(sigPath) ? readFileSync(sigPath) : null;
  writeFileSync(sigPath, der.toString('base64'));
  if (!verifyRelease(releaseDir, publicKeysSpkiB64)) {
    if (previous) writeFileSync(sigPath, previous);
    else rmSync(sigPath, { force: true });
    throw new Error('signature does NOT verify under any pinned key — nothing written');
  }
  return sigPath;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === 'prepare') {
      const { releaseDir, manifest } = prepareRelease(a ?? 'dist', b ?? 'ota-release');
      console.log(`prepared ${manifest.channel} bundle ${manifest.bundleVersion} (${Object.keys(manifest.files).length} files) at ${releaseDir}`);
      console.log(`sign offline, then: node scripts/ota/release.mjs verify ${releaseDir}`);
    } else if (cmd === 'seal') {
      if (!a || !b) throw new Error('usage: seal <releaseDir> <signatureFile>');
      console.log(`sealed ${sealRelease(a, readFileSync(b))} — verifies under a pinned key`);
    } else if (cmd === 'verify') {
      if (!a) throw new Error('usage: verify <releaseDir> [publicKeySpkiBase64]');
      const keys = b ? [b] : pinnedPublicKeys();
      if (!verifyRelease(a, keys)) throw new Error('signature does NOT verify — do not upload');
      console.log(b ? 'signature OK (key from argument)' : `signature OK against one of ${keys.length} pinned key(s)`);
    } else {
      throw new Error('usage: release.mjs prepare [distDir] [outDir] | seal <releaseDir> <signatureFile> | verify <releaseDir> [publicKeySpkiBase64]');
    }
  } catch (e) {
    console.error(`[ota] ${e.message}`);
    process.exit(1);
  }
}
