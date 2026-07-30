#!/usr/bin/env node
// scripts/upload-store-listings.mjs
//
// Uploads per-locale store metadata from store-metadata/<locale>.json to:
//   - Apple App Store Connect via v1 API (appInfoLocalizations +
//     appStoreVersionLocalizations)
//   - Google Play Publishing via v3 API (edits.listings)
//
// Env needed:
//   ASC_KEY_ID       — App Store Connect API key ID
//   ASC_ISSUER_ID    — App Store Connect issuer UUID (2d4c5bd7-1de3-…)
//   ASC_KEY_PATH     — Path to the .p8 file (e.g. ~/.appstoreconnect/private_keys/AuthKey_XXX.p8)
//   ASC_APP_ID       — App Store Connect internal app id (numeric)
//   PLAY_PACKAGE_NAME — Play Console package name (io.veyrnox.wallet or whatever we ship)
//   GOOGLE_APPLICATION_CREDENTIALS — Path to Play publishing service-account JSON
//
// Flags:
//   --dry-run        (default) print what would happen, no writes
//   --live           actually POST/PATCH to the stores
//   --require-reviewed  refuse to upload any locale where reviewed !== true
//   --only=<locale>  restrict to one locale (comma-separated list allowed)
//   --apple-only     skip Play
//   --play-only      skip Apple
//
// Design goals:
//   - Idempotent — safe to re-run; existing localizations are updated, not duplicated.
//   - Reads locale files; the source of truth is git-tracked JSON, not the store UI.
//   - Fails LOUDLY on character-limit overflow (better to catch here than after
//     the store rejects our submission).
//   - I2 egress note: this script reaches Apple + Google APIs directly with the
//     user's own credentials. It is NOT part of the shipping app bundle.

import { readdirSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSign, createPrivateKey } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');
const METADATA_DIR = join(ROOT, 'store-metadata');

// ── argv ─────────────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
const dryRun = !args.has('--live');
const requireReviewed = args.has('--require-reviewed');
const appleOnly = args.has('--apple-only');
const playOnly = args.has('--play-only');
const onlyArg = process.argv.find((a) => a.startsWith('--only='));
const onlyLocales = onlyArg
  ? new Set(onlyArg.replace('--only=', '').split(',').map((s) => s.trim()))
  : null;

// ── locale ↔ store code mapping ──────────────────────────────────────────────
// Apple's supported locale identifiers:
//   https://developer.apple.com/documentation/appstoreconnectapi/appstore-connect-api-workflows/managing-metadata-in-your-app-through-the-app-store-connect-api
// Play's supported language codes:
//   https://support.google.com/googleplay/android-developer/table/4419860
//
// Where the mapping differs from our internal locale, we translate. Anything
// not listed here uses the locale key verbatim.
const APPLE_LOCALE_MAP = {
  'zh-CN': 'zh-Hans',
  'zh-TW': 'zh-Hant',
  'es-419': 'es-MX', // Apple uses es-MX for "Latin American Spanish"
  'en': 'en-US',     // Apple's canonical default
  'pt-BR': 'pt-BR',
  'no': 'no',        // Apple accepts "no"; some places want "nb"
};
const PLAY_LOCALE_MAP = {
  'zh-CN': 'zh-CN',
  'zh-TW': 'zh-TW',
  'es-419': 'es-419',
  'en': 'en-US',
  'pt-BR': 'pt-BR',
  'no': 'no-NO',
  // Play uses full BCP-47 with region for many entries. Add as we discover.
};
function appleLocale(loc) { return APPLE_LOCALE_MAP[loc] || loc; }
function playLocale(loc) { return PLAY_LOCALE_MAP[loc] || loc; }

// ── locale file loading + validation ─────────────────────────────────────────
function loadLocaleFiles() {
  return readdirSync(METADATA_DIR)
    .filter((f) => f.endsWith('.json') && !f.startsWith('_'))
    .map((f) => {
      const j = JSON.parse(readFileSync(join(METADATA_DIR, f), 'utf8'));
      j._sourceFile = f;
      return j;
    });
}

function validateLimits(entry) {
  const errors = [];
  const check = (path, field) => {
    if (!field || typeof field.value !== 'string' || typeof field.limit !== 'number') return;
    if (field.value.length > field.limit) {
      errors.push(`${entry.locale}: ${path} is ${field.value.length}/${field.limit} chars (over by ${field.value.length - field.limit})`);
    }
  };
  check('shared.appName vs Apple', entry.shared?.appName && { value: entry.shared.appName.value, limit: entry.shared.appName.limit_apple });
  check('shared.appName vs Play', entry.shared?.appName && { value: entry.shared.appName.value, limit: entry.shared.appName.limit_play });
  for (const k of ['subtitle', 'promotionalText', 'keywords', 'description', 'whatsNew']) {
    check(`apple.${k}`, entry.apple?.[k]);
  }
  for (const k of ['shortDescription', 'fullDescription']) {
    check(`play.${k}`, entry.play?.[k]);
  }
  return errors;
}

// ── App Store Connect JWT auth ───────────────────────────────────────────────
async function ascToken() {
  const { ASC_KEY_ID, ASC_ISSUER_ID, ASC_KEY_PATH } = process.env;
  if (!ASC_KEY_ID || !ASC_ISSUER_ID || !ASC_KEY_PATH) {
    throw new Error('Missing ASC_KEY_ID / ASC_ISSUER_ID / ASC_KEY_PATH — set them in env or --dry-run only.');
  }
  const pem = await readFile(ASC_KEY_PATH, 'utf8');
  const header = { alg: 'ES256', kid: ASC_KEY_ID, typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  // Apple: iat = now, exp <= 20 min, aud = appstoreconnect-v1.
  const payload = { iss: ASC_ISSUER_ID, iat: now, exp: now + 19 * 60, aud: 'appstoreconnect-v1' };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = `${b64(header)}.${b64(payload)}`;
  const key = createPrivateKey({ key: pem, format: 'pem' });
  const der = createSign('sha256').update(signingInput).sign({ key, dsaEncoding: 'ieee-p1363' });
  return `${signingInput}.${der.toString('base64url')}`;
}

async function ascFetch(path, opts = {}) {
  const token = await ascToken();
  const url = `https://api.appstoreconnect.apple.com${path}`;
  const r = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`ASC ${opts.method || 'GET'} ${path} → ${r.status}: ${body}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

async function appleAppInfoId() {
  const appId = process.env.ASC_APP_ID;
  if (!appId) throw new Error('ASC_APP_ID env var required (numeric App Store Connect app id).');
  // GET /v1/apps/{id}/appInfos returns the current editable AppInfo; pick the
  // one with attributes.appStoreState in ('PREPARE_FOR_SUBMISSION', 'READY_FOR_REVIEW',
  // 'READY_FOR_DISTRIBUTION', 'READY_FOR_SALE') that has state === 'READY_FOR_REVIEW'
  // preferably, else the newest.
  const r = await ascFetch(`/v1/apps/${appId}/appInfos`);
  const editable = r.data.find((a) => a.attributes.state === 'READY_FOR_REVIEW') || r.data[0];
  if (!editable) throw new Error('No editable appInfo found for this app.');
  return editable.id;
}

async function applyAppleAppInfoLocalization(appInfoId, entry) {
  const locale = appleLocale(entry.locale);
  // List existing localizations for this appInfo; find one matching locale.
  const existing = await ascFetch(`/v1/appInfos/${appInfoId}/appInfoLocalizations`);
  const match = existing.data.find((l) => l.attributes.locale === locale);
  const attributes = {
    name: entry.shared.appName.value,
    subtitle: entry.apple?.subtitle?.value,
    privacyPolicyUrl: entry.apple?.privacyPolicyUrl?.value,
    privacyPolicyText: undefined, // free-form privacy text; not used
  };
  if (match) {
    return ascFetch(`/v1/appInfoLocalizations/${match.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { id: match.id, type: 'appInfoLocalizations', attributes } }),
    });
  } else {
    return ascFetch('/v1/appInfoLocalizations', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'appInfoLocalizations',
          attributes: { ...attributes, locale },
          relationships: { appInfo: { data: { type: 'appInfos', id: appInfoId } } },
        },
      }),
    });
  }
}

async function appleCurrentVersionId() {
  const appId = process.env.ASC_APP_ID;
  const r = await ascFetch(`/v1/apps/${appId}/appStoreVersions?filter[appStoreState]=PREPARE_FOR_SUBMISSION,READY_FOR_REVIEW,READY_FOR_DISTRIBUTION,READY_FOR_SALE&limit=1`);
  if (!r.data.length) throw new Error('No editable appStoreVersion for this app.');
  return r.data[0].id;
}

async function applyAppleVersionLocalization(versionId, entry) {
  const locale = appleLocale(entry.locale);
  const existing = await ascFetch(`/v1/appStoreVersions/${versionId}/appStoreVersionLocalizations`);
  const match = existing.data.find((l) => l.attributes.locale === locale);
  const attributes = {
    description: entry.apple?.description?.value,
    keywords: entry.apple?.keywords?.value,
    promotionalText: entry.apple?.promotionalText?.value,
    whatsNew: entry.apple?.whatsNew?.value,
    supportUrl: entry.apple?.supportUrl?.value,
    marketingUrl: entry.apple?.marketingUrl?.value,
  };
  if (match) {
    return ascFetch(`/v1/appStoreVersionLocalizations/${match.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ data: { id: match.id, type: 'appStoreVersionLocalizations', attributes } }),
    });
  } else {
    return ascFetch('/v1/appStoreVersionLocalizations', {
      method: 'POST',
      body: JSON.stringify({
        data: {
          type: 'appStoreVersionLocalizations',
          attributes: { ...attributes, locale },
          relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: versionId } } },
        },
      }),
    });
  }
}

// ── Google Play Publishing API ───────────────────────────────────────────────
// Uses google-auth-library via env-var Application Default Credentials.
// The Play API works via "edits" transactions: create an edit → apply changes
// → commit. This script wraps one atomic edit per --live invocation.
async function playToken() {
  const cred = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!cred) throw new Error('GOOGLE_APPLICATION_CREDENTIALS env var required (path to Play publishing service-account JSON).');
  // Minimal JWT bearer flow — Play doesn't need the full google-auth-library.
  const sa = JSON.parse(await readFile(cred, 'utf8'));
  const header = { alg: 'RS256', typ: 'JWT' };
  const now = Math.floor(Date.now() / 1000);
  const claim = {
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600, iat: now,
  };
  const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const signingInput = `${b64(header)}.${b64(claim)}`;
  const key = createPrivateKey({ key: sa.private_key, format: 'pem' });
  const sig = createSign('RSA-SHA256').update(signingInput).sign(key).toString('base64url');
  const jwt = `${signingInput}.${sig}`;
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!r.ok) throw new Error(`Play token exchange failed: ${r.status} ${await r.text()}`);
  const j = await r.json();
  return j.access_token;
}

async function playFetch(pathSuffix, opts = {}, token = null) {
  token = token || await playToken();
  const packageName = process.env.PLAY_PACKAGE_NAME;
  if (!packageName) throw new Error('PLAY_PACKAGE_NAME env var required.');
  const url = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${packageName}${pathSuffix}`;
  const r = await fetch(url, {
    ...opts,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opts.headers || {}),
    },
  });
  if (!r.ok) {
    const body = await r.text().catch(() => '');
    throw new Error(`Play ${opts.method || 'GET'} ${pathSuffix} → ${r.status}: ${body}`);
  }
  if (r.status === 204) return null;
  return r.json();
}

async function playEditAndApply(entries, token) {
  // Create an edit
  const edit = await playFetch('/edits', { method: 'POST', body: '{}' }, token);
  const editId = edit.id;
  // For each locale, PATCH the listing
  for (const e of entries) {
    const lang = playLocale(e.locale);
    const body = {
      language: lang,
      title: e.shared.appName.value,
      shortDescription: e.play.shortDescription.value,
      fullDescription: e.play.fullDescription.value,
    };
    await playFetch(`/edits/${editId}/listings/${lang}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }, token);
  }
  // Commit the edit atomically
  return playFetch(`/edits/${editId}:commit`, { method: 'POST', body: '{}' }, token);
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const entries = loadLocaleFiles();
  console.log(`Loaded ${entries.length} locale files from ${METADATA_DIR}`);

  // Filter
  let selected = entries;
  if (onlyLocales) selected = selected.filter((e) => onlyLocales.has(e.locale));
  if (requireReviewed) {
    const unreviewed = selected.filter((e) => !e.reviewed);
    if (unreviewed.length) {
      console.error(`Blocked: --require-reviewed and these are still unreviewed:\n  ${unreviewed.map((e) => e.locale).join(', ')}`);
      process.exit(1);
    }
  }

  // Validate character limits — fail loud before touching any API
  const allErrors = selected.flatMap(validateLimits);
  if (allErrors.length) {
    console.error(`Character-limit violations — fix before uploading:`);
    for (const err of allErrors) console.error(`  ${err}`);
    process.exit(2);
  }

  console.log(`\nSelected ${selected.length} locales:\n  ${selected.map((e) => e.locale + (e.reviewed ? '' : '*')).join(', ')}`);
  if (!requireReviewed) console.log('  (* = not reviewed; use --require-reviewed to block)');

  if (dryRun) {
    console.log('\n[DRY-RUN] Not calling any store APIs. Re-run with --live to upload.');
    console.log('\nWhat WOULD happen per locale:');
    for (const e of selected) {
      const al = appleLocale(e.locale), pl = playLocale(e.locale);
      console.log(`  ${e.locale}: Apple(${al}) name="${e.shared.appName.value}" subtitle="${e.apple.subtitle.value}" | Play(${pl}) short="${e.play.shortDescription.value.slice(0, 40)}…"`);
    }
    return;
  }

  // ── Apple ──────────────────────────────────────────────────────────────
  if (!playOnly) {
    console.log('\n── Uploading to App Store Connect ──');
    const appInfoId = await appleAppInfoId();
    const versionId = await appleCurrentVersionId();
    console.log(`  appInfoId: ${appInfoId} | versionId: ${versionId}`);
    for (const e of selected) {
      try {
        await applyAppleAppInfoLocalization(appInfoId, e);
        await applyAppleVersionLocalization(versionId, e);
        console.log(`  ✓ ${e.locale} (Apple: ${appleLocale(e.locale)})`);
      } catch (err) {
        console.error(`  ✗ ${e.locale}: ${err.message}`);
      }
    }
  }

  // ── Play ───────────────────────────────────────────────────────────────
  if (!appleOnly) {
    console.log('\n── Uploading to Google Play ──');
    const token = await playToken();
    try {
      await playEditAndApply(selected, token);
      console.log(`  ✓ Committed edit with ${selected.length} listings`);
    } catch (err) {
      console.error(`  ✗ Play edit failed: ${err.message}`);
      throw err;
    }
  }

  console.log('\nDone.');
}

main().catch((err) => { console.error(err.stack || err.message); process.exit(1); });
