# Self-hosted brand fonts

These woff2 files are vendored so the app loads its type from the **local bundle**
instead of the Google-Fonts CDN. This (a) gates first-screen text LCP on a local
file rather than a network round-trip, and (b) removes a runtime CDN fetch — an
I2 (no silent egress) closure. They are declared via `@font-face` in
[`src/index.css`](../../index.css) and consumed through the `font-sans` /
`font-mono` families in [`tailwind.config.js`](../../../tailwind.config.js).

## Files

| File | Family | Weight | Subset |
|------|--------|--------|--------|
| `schibsted-grotesk-latin-wght-normal.woff2` | Schibsted Grotesk (variable) | 400–900 axis | latin |
| `schibsted-grotesk-latin-ext-wght-normal.woff2` | Schibsted Grotesk (variable) | 400–900 axis | latin-ext |
| `ibm-plex-mono-latin-{400,500,600}-normal.woff2` | IBM Plex Mono | 400 / 500 / 600 | latin |
| `ibm-plex-mono-latin-ext-{400,500,600}-normal.woff2` | IBM Plex Mono | 400 / 500 / 600 | latin-ext |

Weights match the set the old CDN `<link>` requested (Schibsted 400–700, Mono
400/500/600); the variable Schibsted axis additionally renders true 700/900 used
by `font-bold` / `font-black`. The `latin` + `latin-ext` subsets cover Latin-1,
all UI punctuation/currency (incl. €, £, ¥, ₿, ₮, ₳) and accented Latin in
dynamic content. Glyphs outside those ranges (emoji, CJK, geometric/box symbols,
Greek Ξ/σ) were never in these families and fall to the system stack — same as
under the CDN.

## Provenance & licence

Source: [Fontsource](https://fontsource.org) mirror of the Google Fonts builds
(themselves the upstream OFL releases) —
`@fontsource-variable/schibsted-grotesk` and `@fontsource/ibm-plex-mono@5`,
fetched from `cdn.jsdelivr.net`. Both families are licensed under the **SIL Open
Font License 1.1**; the full licence text (with copyright/Reserved-Font-Name
notices) is bundled alongside as `Schibsted-Grotesk-OFL.txt` and
`IBM-Plex-Mono-OFL.txt`.

To refresh, re-download the same `files/*.woff2` from the fontsource packages and
keep the `@font-face` `unicode-range` values in `src/index.css` in sync with the
upstream per-subset ranges.
