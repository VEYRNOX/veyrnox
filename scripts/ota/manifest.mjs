// OTA web-bundle manifest — see docs/ota-updates.md.
//
// Every `vite build` writes dist/ota-manifest.json listing the sha256 of every
// file in dist. The copy embedded in the store binary tells the native loader
// which bundle version and channel the binary shipped with, and which files it
// already has (so an update only downloads what changed). An OTA release uses
// the SAME file, signed offline, as the thing the native loader verifies.
//
// The manifest is the signed payload, so its bytes must be deterministic:
// keys are written in a fixed order and `files` is sorted.
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

export const MANIFEST_NAME = 'ota-manifest.json';
export const SIGNATURE_NAME = 'ota-manifest.sig';
// Written into dist (and hashed like any other file) so release.mjs can refuse a
// dev-flagged build from the flag VALUES, not from grepping bundle text: store
// builds are obfuscated, which hides the inlined `VITE_…:"1"` string.
export const BUILD_FLAGS_NAME = 'ota-build-flags.json';
export const DEV_FLAGS = ['VITE_BYPASS_RASP', 'VITE_DEV_UNGATE_SEND', 'VITE_DEMO_MODE'];

// Bump together with OtaConfig.nativeApi (ios/App/App/VeyrnoxOta.swift) and
// OtaConfig.NATIVE_API (android/.../OtaBundleVerifier.kt) whenever the web
// bundle starts depending on native code an older binary does not have.
// ota-manifest.test.js pins all three to the same value.
export const NATIVE_API = 1;

// Mirrors the native path check: no absolute paths, no `..`, no backslashes.
// Vite output only ever uses this character set.
const SAFE_PATH = /^[A-Za-z0-9._@-]+(\/[A-Za-z0-9._@-]+)*$/;

function listFiles(root, dir = root) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(root, full));
    else if (entry.isFile()) out.push(relative(root, full).split(sep).join('/'));
  }
  return out;
}

export function buildManifest(distDir, { channel, bundleVersion, minNativeApi = NATIVE_API }) {
  if (channel !== 'production' && channel !== 'staging') throw new Error(`bad channel: ${channel}`);
  if (!Number.isSafeInteger(bundleVersion) || bundleVersion <= 0) throw new Error(`bad bundleVersion: ${bundleVersion}`);
  const files = {};
  for (const path of listFiles(distDir).sort()) {
    if (path === MANIFEST_NAME || path === SIGNATURE_NAME) continue;
    if (!SAFE_PATH.test(path) || path.split('/').includes('..')) throw new Error(`unsafe path in bundle: ${path}`);
    files[path] = createHash('sha256').update(readFileSync(join(distDir, path))).digest('hex');
  }
  if (!files['index.html']) throw new Error('bundle has no index.html');
  return { v: 1, channel, bundleVersion, minNativeApi, files };
}

// UTC yyyyMMddHHmm — monotonic across builds without a counter file to keep in sync.
export function timestampVersion(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return Number(`${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}${p(date.getUTCHours())}${p(date.getUTCMinutes())}`);
}

export function otaManifestPlugin() {
  let config;
  return {
    name: 'veyrnox-ota-manifest',
    apply: 'build',
    enforce: 'post',
    configResolved(c) { config = c; },
    closeBundle() {
      const outDir = join(config.root, config.build.outDir);
      const bundleVersion = process.env.OTA_BUNDLE_VERSION ? Number(process.env.OTA_BUNDLE_VERSION) : timestampVersion();
      const channel = config.mode === 'staging' ? 'staging' : 'production';
      const flags = Object.fromEntries(DEV_FLAGS.map((k) => [k, config.env[k] ?? null]));
      writeFileSync(join(outDir, BUILD_FLAGS_NAME), JSON.stringify(flags));
      const manifest = buildManifest(outDir, { channel, bundleVersion });
      writeFileSync(join(outDir, MANIFEST_NAME), JSON.stringify(manifest));
    },
  };
}
