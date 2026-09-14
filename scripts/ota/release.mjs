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
//   node scripts/ota/release.mjs verify <releaseDir> [publicKeySpkiBase64]
//     Checks <releaseDir>/ota-manifest.sig against the manifest bytes. With no
//     key argument it uses the key pinned in the native source, so a typo in the
//     pinned key is caught here rather than on devices. Run it before uploading.
import { createPublicKey, verify as verifySig } from 'node:crypto';
import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

export function pinnedPublicKey(kotlinPath = 'android/app/src/main/java/com/veyrnox/app/OtaBundleVerifier.kt') {
  const key = readFileSync(kotlinPath, 'utf8').match(/^\s*const val PUBLIC_KEY_SPKI_B64 = "([^"]*)"$/m)?.[1];
  if (!key) throw new Error('no public key pinned in OtaBundleVerifier.kt (OTA is disabled)');
  return key;
}

export function verifyRelease(releaseDir, publicKeySpkiB64) {
  const key = createPublicKey({ key: Buffer.from(publicKeySpkiB64, 'base64'), format: 'der', type: 'spki' });
  const sig = Buffer.from(readFileSync(join(releaseDir, SIGNATURE_NAME), 'utf8').trim(), 'base64');
  return verifySig('sha256', readFileSync(join(releaseDir, MANIFEST_NAME)), key, sig);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, a, b] = process.argv.slice(2);
  try {
    if (cmd === 'prepare') {
      const { releaseDir, manifest } = prepareRelease(a ?? 'dist', b ?? 'ota-release');
      console.log(`prepared ${manifest.channel} bundle ${manifest.bundleVersion} (${Object.keys(manifest.files).length} files) at ${releaseDir}`);
      console.log(`sign offline, then: node scripts/ota/release.mjs verify ${releaseDir}`);
    } else if (cmd === 'verify') {
      if (!a) throw new Error('usage: verify <releaseDir> [publicKeySpkiBase64]');
      if (!verifyRelease(a, b ?? pinnedPublicKey())) throw new Error('signature does NOT verify — do not upload');
      console.log(b ? 'signature OK (key from argument)' : 'signature OK against the pinned key');
    } else {
      throw new Error('usage: release.mjs prepare [distDir] [outDir] | verify <releaseDir> [publicKeySpkiBase64]');
    }
  } catch (e) {
    console.error(`[ota] ${e.message}`);
    process.exit(1);
  }
}
