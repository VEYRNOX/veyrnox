#!/usr/bin/env node
// Live OTA release check — see "Releasing a fix" in docs/ota-updates.md.
//
//   node scripts/ota/verify-live.mjs <releaseDir> [baseUrl]
//     <releaseDir> is a prepared and sealed release, ota-release/<channel>/<version>.
//     baseUrl defaults to https://updates.veyrnox.com.
//
// Run it AFTER uploading the files, manifest and signature and BEFORE uploading
// latest.json. It fetches every object back from the public host and compares it
// with what was signed:
//   - the live ota-manifest.json and ota-manifest.sig are byte-identical to local;
//   - every file in the manifest hashes to its manifest sha256.
// Exit 0 only if all of that holds.
//
// Why: the device checks every file's sha256 and refuses the whole bundle on one
// mismatch, so anything between R2 and the phone that changes a byte makes a
// release that never installs. That happened on 2026-10-01 — Cloudflare's email
// obfuscation rewrote one HTML file. Verifying the local copy proves nothing about
// what the host serves; this checks the host.
//
// It requests the exact URLs a device does (src/lib/otaUpdate.js): the manifest and
// signature at `<base>/<channel>/<version>/…` and each file at `…/files/<path>`,
// with the raw path and `cache: 'no-store'`, so no cache can answer for the origin.
import { createHash } from 'node:crypto';
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { MANIFEST_NAME, SAFE_PATH, SIGNATURE_NAME } from './manifest.mjs';

export const DEFAULT_BASE_URL = 'https://updates.veyrnox.com';
const DEFAULT_CONCURRENCY = 12;
const DEFAULT_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 400;

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

/**
 * The base must be https, because a check over plain http says nothing about what a
 * device receives. Plain http is allowed to localhost only, for local rehearsal.
 * Returns the base without a trailing slash.
 */
export function assertSafeBase(baseUrl) {
  const url = new URL(baseUrl); // throws on a non-URL
  if (url.username || url.password) throw new Error('base URL must not carry credentials');
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && LOCAL_HOSTS.has(url.hostname))) {
    throw new Error(`base URL must be https (got ${url.protocol}//${url.host})`);
  }
  return baseUrl.replace(/\/+$/, '');
}

function readLocalManifest(releaseDir) {
  const bytes = readFileSync(join(releaseDir, MANIFEST_NAME));
  const manifest = JSON.parse(bytes.toString('utf8'));
  const files = manifest?.files;
  if (!files || typeof files !== 'object' || Object.keys(files).length === 0) {
    throw new Error('manifest has no files');
  }
  if (manifest.channel !== 'production' && manifest.channel !== 'staging') {
    throw new Error(`bad channel in manifest: ${manifest.channel}`);
  }
  if (!Number.isSafeInteger(manifest.bundleVersion) || manifest.bundleVersion <= 0) {
    throw new Error(`bad bundleVersion in manifest: ${manifest.bundleVersion}`);
  }
  for (const path of Object.keys(files)) {
    // The path goes straight into a URL, so refuse anything the native loader would.
    if (!SAFE_PATH.test(path) || path.split('/').includes('..')) {
      throw new Error(`unsafe path in manifest: ${path}`);
    }
  }
  return { manifest, bytes };
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Size of the prepared copy of a bundle file, or undefined if it is not on disk.
function localFileSize(releaseDir, path) {
  try {
    return statSync(join(releaseDir, 'files', path)).size;
  } catch {
    return undefined;
  }
}

/**
 * One GET with retries on a network error or a 5xx. A 4xx is final: the object is
 * not there, and asking again changes nothing.
 * Returns { bytes } or { reason }.
 */
async function getBytes(url, { fetchImpl, retries, retryDelayMs }) {
  let reason = 'unreachable';
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0 && retryDelayMs > 0) await wait(retryDelayMs);
    try {
      const res = await fetchImpl(url, { cache: 'no-store' });
      if (res.ok) return { bytes: Buffer.from(await res.arrayBuffer()) };
      reason = `http ${res.status}`;
      if (res.status < 500) return { reason };
    } catch {
      reason = 'unreachable';
    }
  }
  return { reason };
}

/**
 * @param {string} releaseDir prepared and sealed release directory
 * @param {string} [baseUrl]
 * @returns {Promise<{ ok: boolean, checked: number, failures: Array<{ path: string, reason: string, liveBytes?: number, localBytes?: number }> }>}
 */
export async function verifyLive(releaseDir, baseUrl = DEFAULT_BASE_URL, opts = {}) {
  const {
    fetchImpl = fetch,
    concurrency = DEFAULT_CONCURRENCY,
    retries = DEFAULT_RETRIES,
    retryDelayMs = DEFAULT_RETRY_DELAY_MS,
  } = opts;
  const base = assertSafeBase(baseUrl);
  const { manifest, bytes: manifestBytes } = readLocalManifest(releaseDir);
  const release = `${base}/${manifest.channel}/${manifest.bundleVersion}`;
  const get = (url) => getBytes(url, { fetchImpl, retries, retryDelayMs });

  const failures = [];
  const signatureBytes = readFileSync(join(releaseDir, SIGNATURE_NAME));
  const checks = [
    // The signed payload and its signature must be exactly what was sealed locally.
    { path: MANIFEST_NAME, url: `${release}/${MANIFEST_NAME}`, want: sha256(manifestBytes), localBytes: manifestBytes.length },
    { path: SIGNATURE_NAME, url: `${release}/${SIGNATURE_NAME}`, want: sha256(signatureBytes), localBytes: signatureBytes.length },
    ...Object.entries(manifest.files).map(([path, want]) => ({ path, url: `${release}/files/${path}`, want })),
  ];

  let next = 0;
  const worker = async () => {
    while (next < checks.length) {
      const { path, url, want, localBytes } = checks[next++];
      const got = await get(url);
      if (!got.bytes) {
        failures.push({ path, reason: got.reason });
      } else if (sha256(got.bytes) !== want) {
        // Sizes are the quickest clue to what changed: a host that rewrites a file
        // makes the live copy a few bytes larger than local.
        failures.push({
          path,
          reason: 'hash mismatch',
          liveBytes: got.bytes.length,
          localBytes: localBytes ?? localFileSize(releaseDir, path),
        });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, worker));

  return { ok: failures.length === 0, checked: checks.length, failures };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [releaseDir, baseUrl] = process.argv.slice(2);
  try {
    if (!releaseDir) throw new Error('usage: verify-live.mjs <releaseDir> [baseUrl]');
    const { ok, checked, failures } = await verifyLive(releaseDir, baseUrl ?? DEFAULT_BASE_URL);
    if (ok) {
      console.log(`live copy OK: ${checked} objects match the signed manifest — safe to upload latest.json`);
    } else {
      console.error(`live copy DIFFERS: ${failures.length} of ${checked} objects failed — do NOT upload latest.json`);
      for (const f of failures.slice(0, 20)) {
        const size = f.liveBytes !== undefined && f.localBytes !== undefined ? ` (live ${f.liveBytes} bytes, local ${f.localBytes})` : '';
        console.error(`  ${f.path}: ${f.reason}${size}`);
      }
      if (failures.length > 20) console.error(`  … and ${failures.length - 20} more`);
      process.exit(1);
    }
  } catch (e) {
    console.error(`[ota] ${e.message}`);
    process.exit(1);
  }
}
