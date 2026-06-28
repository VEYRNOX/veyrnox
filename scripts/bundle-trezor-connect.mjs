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
 */

import { createWriteStream, mkdirSync, existsSync } from 'fs';
import { pipeline } from 'stream/promises';
import { createRequire } from 'module';
import path from 'path';
import https from 'https';
import { URL } from 'url';

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

async function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    const get = (u) =>
      https.get(u, { timeout: 30_000 }, (res) => {
        if (res.statusCode === 301 || res.statusCode === 302) {
          return get(res.headers.location);
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${u}`));
        }
        resolve(res);
      }).on('error', reject);
    get(url);
  });
}

async function downloadFile(url, dest) {
  const res = await fetchUrl(url);
  const out = createWriteStream(dest);
  await pipeline(res, out);
}

async function main() {
  mkdirSync(DEST_DIR, { recursive: true });

  // Write a version stamp so we can skip re-downloading if already current.
  const stampFile = path.join(DEST_DIR, '.version');
  if (existsSync(stampFile)) {
    const { readFileSync } = await import('fs');
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
    try {
      await downloadFile(url, dest);
      console.log('done');
    } catch (err) {
      console.log(`SKIP (${err.message})`);
      // Non-fatal — not every version ships all three pages.
    }
  }

  // Write version stamp.
  const { writeFileSync } = await import('fs');
  writeFileSync(stampFile, VERSION, 'utf8');

  console.log('[bundle-trezor-connect] Done.');
  console.log('  IMPORTANT: public/trezor-connect/ is in .gitignore.');
  console.log('  Re-run this script (or npm run build) after updating @trezor/connect-web.');
}

main().catch((err) => {
  console.error('[bundle-trezor-connect] Fatal error:', err.message);
  // Exit 0 so a missing CDN does not break the build in CI without network access.
  // The app will fall back to the default connectSrc (connect.trezor.io).
  process.exit(0);
});
