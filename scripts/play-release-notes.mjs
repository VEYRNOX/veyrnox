#!/usr/bin/env node
// scripts/play-release-notes.mjs
//
// Emits store-metadata/<locale>.json -> play.releaseNotes as the "whatsnew
// directory" format that r0adkll/upload-google-play consumes:
//
//   <outDir>/whatsnew-<play-language-code>
//
// Why this exists as its own script rather than living in
// upload-store-listings.mjs: Play attaches release notes to a track RELEASE
// (edits.tracks -> releases[].releaseNotes), not to a listing. Writing them
// needs a target track and versionCode, and on this repo the CI job in
// ci.yml already owns the release. So this script only produces files; the
// upload stays with whatever already creates the release.
//
// Usage:
//   node scripts/play-release-notes.mjs [--out=<dir>] [--check]
//
//   --out=<dir>  where to write (default: dist-whatsnew/)
//   --check      write nothing; verify every locale is present and within
//                Play's 500-character cap, exit 1 if not.
//
// WIRING IS DELIBERATELY NOT DONE. ci.yml's Play upload step carries an
// explicit comment that it sends no release notes because closed testers see
// the versionCode. Turning that on changes what testers and (later) users are
// shown on every release, which is an owner decision, not a build detail. To
// wire it: run this script before the upload step and pass
// `whatsNewDirectory: dist-whatsnew` to r0adkll/upload-google-play.

import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const METADATA_DIR = join(ROOT, 'store-metadata');

// Play's cap. Apple's whatsNew cap is 4000 — they are different fields for a
// reason, and play.releaseNotes must never be set from apple.whatsNew.
const PLAY_LIMIT = 500;

// Keep in sync with PLAY_LOCALE_MAP in upload-store-listings.mjs. Duplicated
// rather than imported because that module runs API calls at import time in
// some paths; if it gains a clean export, import it instead of copying.
const PLAY_LOCALE_MAP = {
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  'es-419': 'es-419',
  en: 'en-US',
  'pt-BR': 'pt-BR',
  no: 'no-NO',
  tl: 'fil',
};
const playLocale = (loc) => PLAY_LOCALE_MAP[loc] || loc;

const args = new Set(process.argv.slice(2));
const check = args.has('--check');
const outArg = process.argv.slice(2).find((a) => a.startsWith('--out='));
// resolve, not join: join(ROOT, '/abs/path') silently produces ROOT + '/abs/path'
// and writes somewhere nobody asked for. resolve honours an absolute --out.
const outDir = resolve(ROOT, outArg ? outArg.slice('--out='.length) : 'dist-whatsnew');

const files = readdirSync(METADATA_DIR)
  .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
  .sort();

const errors = [];
const emitted = [];

for (const f of files) {
  const entry = JSON.parse(readFileSync(join(METADATA_DIR, f), 'utf8'));
  const field = entry.play?.releaseNotes;
  if (!field || typeof field.value !== 'string' || !field.value.trim()) {
    errors.push(`${entry.locale}: play.releaseNotes missing or empty`);
    continue;
  }
  if (field.value.length > PLAY_LIMIT) {
    errors.push(`${entry.locale}: play.releaseNotes is ${field.value.length}/${PLAY_LIMIT} chars`);
    continue;
  }
  emitted.push({ lang: playLocale(entry.locale), text: field.value, locale: entry.locale });
}

// Two internal locales mapping to one Play code would silently drop one file.
const byLang = new Map();
for (const e of emitted) {
  if (byLang.has(e.lang)) {
    errors.push(`${e.lang}: both ${byLang.get(e.lang).locale} and ${e.locale} map to it`);
  }
  byLang.set(e.lang, e);
}

if (errors.length) {
  console.error(`play-release-notes: ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}

if (check) {
  console.log(`play-release-notes --check: ${emitted.length} locales OK, all within ${PLAY_LIMIT} chars.`);
  process.exit(0);
}

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
for (const e of emitted) {
  writeFileSync(join(outDir, `whatsnew-${e.lang}`), e.text, 'utf8');
}
console.log(`play-release-notes: wrote ${emitted.length} files to ${outDir}`);
