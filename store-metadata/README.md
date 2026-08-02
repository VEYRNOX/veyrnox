# Veyrnox store listings — 44 locales

Machine-translated App Store + Google Play listing metadata for every language
in `src/i18n/SUPPORTED_LANGUAGES`.

## What's here

- `_schema.json` — JSON Schema for one `<locale>.json` file.
- `_source-apple.md`, `_source-play.md` — the copies extracted from
  `docs/play-launch/app-store-submission-copy.md` +
  `docs/play-launch/store-listing.md` (archived here for provenance).
- `en.json` — **source of truth**. Any edit to store copy starts here.
- 43 sibling `<locale>.json` files — machine-translated from `en.json`.
- `../scripts/upload-store-listings.mjs` — uploads all of the above to
  Apple + Google via their publishing APIs.

## Reviewed vs unreviewed

| Reviewed (`reviewed: true`) | 5 |
| Unreviewed (`reviewed: false`) | 38 |

The 5 reviewed languages are `en`, `pt-BR`, `es-419`, `es`, `fr`, `it` — the
same set whose in-app `security.json` was native-reviewer-approved in PR #1507.
The reviewed flag doesn't change what gets uploaded, but the upload script
supports `--require-reviewed` if you want to gate strictly.

## Uploading

The script authenticates with two things:

- App Store Connect: an API key `.p8` file
- Google Play Publishing: a service-account JSON

Both live outside this repo. Set env vars and run:

```bash
export ASC_KEY_ID=XXXXXXXXXX
export ASC_ISSUER_ID=2d4c5bd7-1de3-4953-b203-a92e788c2d7c
export ASC_KEY_PATH=~/.appstoreconnect/private_keys/AuthKey_XXXXXXXXXX.p8
export ASC_APP_ID=<numeric-app-id-from-App-Store-Connect>
export PLAY_PACKAGE_NAME=<package-name-e.g.-io.veyrnox.wallet>
export GOOGLE_APPLICATION_CREDENTIALS=/path/to/play-publishing-sa.json

# Dry-run — prints what would happen, doesn't touch stores
node scripts/upload-store-listings.mjs

# Restrict to specific locales (comma-separated)
node scripts/upload-store-listings.mjs --only=pt-BR,es-419,fr

# Only upload reviewed languages
node scripts/upload-store-listings.mjs --require-reviewed

# For real (uploads)
node scripts/upload-store-listings.mjs --live

# Apple only / Play only
node scripts/upload-store-listings.mjs --live --apple-only
node scripts/upload-store-listings.mjs --live --play-only
```

The script fails LOUDLY on character-limit overflow before touching any API —
if a field is 1 char over its limit, the store would reject the whole
submission, so it's better to catch here.

## What DOESN'T upload

- **Screenshots.** Every locale needs its own set of screenshots (5 × iPhone,
  optionally 5 × iPad on Apple; 2–8 × phone, 2–8 × 7-inch tablet, 2–8 ×
  10-inch tablet on Play). Not automated here. Follow-up: screenshot capture
  workflow using Fastlane `snapshot` (iOS) + `screengrab` (Android), driving
  the app in a device farm per-locale.
- **In-App Purchase / Subscription copy.** Safety Plus subscription
  localisation is separate — App Store Connect → In-App Purchases → Safety
  Plus → Localizations, and Play Console → Monetize → Products → Subscriptions
  → each base plan. Follow-up if the current $5.99/month + $49.99/year
  Store-side copy needs per-language translation.
- **App Review Notes.** Currently English-only (see `_source-apple.md`
  section). Reviewers work in English on both stores, so this is fine.

## Native reviewer signoff pattern

When a native speaker approves a `<locale>.json` for shipping:

1. In `<locale>.json`, set `"reviewed": true`.
2. Log the reviewer + date in the file's `notes` field.
3. If they edited any values, the diff is the review.

No separate approval file — the JSON is self-documenting.

## Character-limit summary (all locales pass)

Apple's tight fields are `subtitle` (30), `keywords` (100). Play's tight
field is `shortDescription` (80). Every `<locale>.json` in this directory
has been checked against the schema-defined limits; the upload script re-checks
before every run.
