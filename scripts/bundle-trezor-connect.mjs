/**
 * bundle-trezor-connect.mjs
 *
 * Downloads the @trezor/connect-web iframe bundle from the versioned CDN URL
 * (matching the installed package) into public/trezor-connect/.
 *
 * Run via:  node scripts/bundle-trezor-connect.mjs
 * Also wired into:  npm run prebuild
 *
 * Why CDN-download and not a local copy?
 * The @trezor/connect-web npm package ships only the JS bindings; the iframe
 * bundle (iframe.html, popup.html, worker JS, etc.) lives on the CDN. We pin
 * the download to the exact version installed in node_modules, so the client-
 * side JS and the iframe are always in sync.
 *
 * I2/I3 note: once this script has run, the app sets connectSrc to the local
 * /trezor-connect/ path and no CDN call is made at runtime. The CDN is only
 * contacted once, at build time, by this script.
 *
 * Security (audit M-9, 2026-07-28):
 * - Redirects are only followed to https://connect.trezor.io/* (max depth 3).
 * - Downloaded bytes are SHA-256 verified against scripts/trezor-connect-manifest.json.
 * - Any integrity or network failure aborts the build (exit 1). Fail-closed (I4).
 */

import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import https from 'https';
import { createHash } from 'crypto';
import { fileURLToPath, URL } from 'url';

const require = createRequire(import.meta.url);

// Read the exact version installed in node_modules.
const { VERSION } = require('@trezor/connect/lib/data/version.js');

const majorVersion = VERSION.split('.')[0];
const BASE_URL = `https://connect.trezor.io/${majorVersion}/`;

// Assets to download — these are the files the iframe loader fetches.
const ASSETS = [
  'iframe.html',
  'popup.html',
  'webusb.html',
];

const DEST_DIR = path.resolve(process.cwd(), 'public', 'trezor-connect');
const MANIFEST_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'trezor-connect-manifest.json',
);

const MAX_REDIRECTS = 3;
const ALLOWED_PROTOCOL = 'https:';
const ALLOWED_HOSTS = new Set(['connect.trezor.io']);

/**
 * Fetch a URL and return the response body as a Buffer.
 * Redirects are validated against the allowlist (host + protocol) and depth-capped.
 * Exported for tests.
 */
export function fetchUrl(url, { redirectsRemaining = MAX_REDIRECTS, httpsImpl = https } = {}) {
  return new Promise((resolve, reject) => {
    let target;
    try {
      target = new URL(url);
    } catch (err) {
      return reject(new Error(`Invalid URL: ${url}`));
    }
    if (target.protocol !== ALLOWED_PROTOCOL || !ALLOWED_HOSTS.has(target.host)) {
      return reject(
        new Error(
          `Refusing to fetch from disallowed origin ${target.protocol}//${target.host} (M-9 allowlist)`,
        ),
      );
    }

    const req = httpsImpl.get(target, { timeout: 30_000 }, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302 || res.statusCode === 307 || res.statusCode === 308) {
        // Consume the body so the socket can be freed before we follow.
        res.resume();
        if (redirectsRemaining <= 0) {
          return reject(new Error(`Too many redirects (>${MAX_REDIRECTS}) starting from ${url}`));
        }
        const location = res.headers.location;
        if (!location) {
          return reject(new Error(`Redirect from ${url} with no Location header`));
        }
        let nextUrl;
        try {
          nextUrl = new URL(location, target).toString();
        } catch (err) {
          return reject(new Error(`Invalid redirect Location "${location}" from ${url}`));
        }
        const nextParsed = new URL(nextUrl);
        if (nextParsed.protocol !== ALLOWED_PROTOCOL || !ALLOWED_HOSTS.has(nextParsed.host)) {
          return reject(
            new Error(
              `Refusing redirect from ${target.host} to disallowed ${nextParsed.protocol}//${nextParsed.host} (M-9 allowlist)`,
            ),
          );
        }
        return resolve(fetchUrl(nextUrl, { redirectsRemaining: redirectsRemaining - 1, httpsImpl }));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode} for ${url}`));
      }
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', reject);
    });
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`Timeout fetching ${url}`));
    });
  });
}

/**
 * Compute the hex SHA-256 digest of a Buffer. Exported for tests.
 */
export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * Load the pinned manifest and return the { asset -> sha256 } map for the
 * given major version. Missing entries fail closed (throws).
 * Exported for tests.
 */
export function loadManifestForVersion(version, manifestPath = MANIFEST_PATH) {
  const raw = readFileSync(manifestPath, 'utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`Manifest ${manifestPath} is not valid JSON: ${err.message}`);
  }
  const entry = parsed && parsed.versions && parsed.versions[version];
  if (!entry || typeof entry !== 'object') {
    throw new Error(
      `No pinned SHA-256 manifest for Trezor Connect major version ${version}. ` +
        `Add hashes to ${path.basename(manifestPath)} before shipping (M-9).`,
    );
  }
  return entry;
}

/**
 * Verify the downloaded asset bytes against the pinned hash. Throws on mismatch.
 * Exported for tests.
 */
export function verifyAsset(asset, bytes, manifestEntry) {
  const expected = manifestEntry[asset];
  if (!expected) {
    throw new Error(`Manifest has no pinned SHA-256 for asset "${asset}" (M-9).`);
  }
  const actual = sha256(bytes);
  if (actual.toLowerCase() !== String(expected).toLowerCase()) {
    throw new Error(
      `Integrity check failed for ${asset}: expected ${expected}, got ${actual} (M-9).`,
    );
  }
}

async function main() {
  mkdirSync(DEST_DIR, { recursive: true });

  const manifestEntry = loadManifestForVersion(majorVersion);

  // Write a version stamp so we can skip re-downloading if already current.
  const stampFile = path.join(DEST_DIR, '.version');
  if (existsSync(stampFile)) {
    const stamp = readFileSync(stampFile, 'utf8').trim();
    if (stamp === VERSION) {
      console.log(`[bundle-trezor-connect] Already at v${VERSION} — skipping.`);
      return;
    }
  }

  console.log(`[bundle-trezor-connect] Downloading Trezor Connect v${VERSION} iframe bundle…`);
  console.log(`  Source: ${BASE_URL}`);
  console.log(`  Destination: ${DEST_DIR}`);

  for (const asset of ASSETS) {
    const url = `${BASE_URL}${asset}`;
    const dest = path.join(DEST_DIR, asset);
    process.stdout.write(`  Fetching ${asset}… `);
    const bytes = await fetchUrl(url);
    verifyAsset(asset, bytes, manifestEntry);
    writeFileSync(dest, bytes);
    console.log('done');
  }

  writeFileSync(stampFile, VERSION, 'utf8');

  console.log('[bundle-trezor-connect] Done.');
  console.log('  IMPORTANT: public/trezor-connect/ is in .gitignore.');
  console.log('  Re-run this script (or npm run build) after updating @trezor/connect-web.');
}

// Only run main() when invoked as a script (not when imported by tests).
const isDirectRun = (() => {
  try {
    return process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
  } catch {
    return false;
  }
})();

if (isDirectRun) {
  main().catch((err) => {
    // Fail-closed per audit finding M-9 (was exit(0), which silently shipped an
    // un-pinned or CDN-substituted bundle). Any integrity or network failure
    // must abort the build so the app cannot fall back to a runtime CDN load.
    console.error('[bundle-trezor-connect] Fatal:', err.message);
    process.exit(1);
  });
}
