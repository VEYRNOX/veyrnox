// src/i18n/index.js — i18next bootstrap.
//
// I3 CHOKEPOINT WIRING. Language detection is DELEGATED to lib/locale.js
// (resolveLocale) — NOT i18next-browser-languagedetector — so:
//   1) the same resolver drives i18next AND direct callers (formatFiat,
//      Intl.DateTimeFormat, <html lang>). One source of truth.
//   2) the I3 write-gate in lib/locale.js applies: a decoy/duress/stealth/demo
//      session cannot persist a language change to shared localStorage, so
//      a coerced user's language pick cannot betray that a real user exists
//      here or force the real user to face an unexplained UI-language flip
//      on next unlock.
//
// The English catalog is the source of truth. Every non-English catalog is
// machine-translated (MT) at the time of writing and must display an
// "MT — pending human review" banner in the switcher (I4 fail-honest —
// never present unverified copy as if it were reviewed).
//
// FALLBACK: any missing key falls through to 'en'. Zero silent blanks in
// prod (a missing German string renders the English one, not nothing).
//
// LOAD STRATEGY — code-split per locale (Phase 5, 2026-07-29).
// Only EN is bundled synchronously. Every other catalog is a Vite lazy
// chunk pulled in via `import.meta.glob` and materialised on demand:
//   - at boot, if `pickSupported(navigator.language) !== 'en'`, load that
//     locale's 3 catalogs asynchronously, addResourceBundle, changeLanguage
//   - on LOCALE_CHANGED_EVENT (Settings switcher), load the newly-picked
//     locale if not already cached, then changeLanguage
// Non-en users see EN for ~1 render frame before their locale swaps in
// (i18next fallbackLng: 'en' covers the gap). All 33 non-en catalogs would
// otherwise sit in the main bundle at ~30 KB gzipped each — the eager
// baseline before Phase 5 was ~700 KB and regressed LCP through its budget.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resolveLocale, LOCALE_CHANGED_EVENT } from '@/lib/locale';

// EN is the baseline + fallback — MUST be synchronous, never lazy.
// Under Phase 5 code-split, all non-en catalogs load via import.meta.glob
// below — no static imports needed for them, and Phase 6's 10 new locales
// (th, hi, fa, he, ur, zh-TW, ms, tl, es-419, bn) get their chunks the
// same way ar/it/etc do.
import enCommon from './locales/en/common.json';
import enSecurity from './locales/en/security.json';
import enWallet from './locales/en/wallet.json';

// Vite generates a separate JS chunk per non-en JSON — matched by the glob,
// pulled in via dynamic import() at call time. `eager: false` is default;
// stated for clarity.
const catalogModules = /** @type {Record<string, () => Promise<{ default: object }>>} */ (
  import.meta.glob('./locales/*/*.json', { eager: false })
);

// Which locales are available AT ALL. Every catalog listed here is
// machine-translated at ship time (except `en`) and gated behind the MT-pending
// banner in <LanguageSwitcher> until a native reviewer signs off on
// `security.json` — do NOT soften that banner without signoff.
//
// RTL layout support (dir="rtl" flip, Tailwind logical-property sweep) is
// wired in App.jsx via isRtlLocale() — see src/lib/locale.js RTL_BASE_LANGUAGES.
export const SUPPORTED_LANGUAGES = [
  'en', 'es', 'de', 'zh-CN',
  'pt-BR', 'fr', 'nl', 'tr', 'ru', 'vi', 'id', 'ja', 'ko', 'ar',
  'it', 'pl', 'uk', 'cs', 'ro', 'el', 'sv', 'da', 'no', 'fi',
  'th', 'hi', 'fa', 'he', 'ur', 'zh-TW', 'ms', 'tl', 'es-419', 'bn',
];

// The default user-facing set. All bundled languages are exposed; MT status
// is disclosed via the switcher's inline banner.
export const LANGUAGE_SWITCHER_AVAILABLE = /** @type {readonly string[]} */ ([
  'en', 'es', 'de', 'zh-CN',
  'pt-BR', 'fr', 'nl', 'tr', 'ru', 'vi', 'id', 'ja', 'ko', 'ar',
  'it', 'pl', 'uk', 'cs', 'ro', 'el', 'sv', 'da', 'no', 'fi',
  'th', 'hi', 'fa', 'he', 'ur', 'zh-TW', 'ms', 'tl', 'es-419', 'bn',
]);

// Every non-English catalog is machine-translated at the time this ships.
// Read by <LanguageSwitcher> to render the MT-pending banner. Flip an entry
// to `false` when a native reviewer signs off on that language's copy.
export const MACHINE_TRANSLATED = /** @type {Record<string, boolean>} */ ({
  en: false,
  es: true,
  de: true,
  'zh-CN': true,
  'pt-BR': true,
  fr: true,
  nl: true,
  tr: true,
  ru: true,
  vi: true,
  id: true,
  ja: true,
  ko: true,
  ar: true,
  it: true,
  pl: true,
  uk: true,
  cs: true,
  ro: true,
  el: true,
  sv: true,
  da: true,
  no: true,
  fi: true,
  th: true,
  hi: true,
  fa: true,
  he: true,
  ur: true,
  'zh-TW': true,
  ms: true,
  tl: true,
  'es-419': true,
  bn: true,
});

// Normalize whatever resolveLocale returns (which follows navigator.language:
// "fr-CH", "en-GB", "zh-Hans-CN", …) to one of our SUPPORTED_LANGUAGES.
// Unknown → 'en' (fail-honest — do not silently mistranslate).
export function pickSupported(raw) {
  if (!raw) return 'en';
  if (SUPPORTED_LANGUAGES.includes(raw)) return raw;
  // Match by language subtag: "de-AT" → "de", "zh-Hans-CN" → "zh-CN",
  // "zh-Hant-TW" → "zh-TW". Latin scripts collapse to the base tag;
  // zh/pt/nb/nn need region-aware handling.
  const [base] = raw.split('-');
  // Chinese: script or region tag decides Simplified vs Traditional.
  // zh-HK/zh-MO/zh-TW/zh-Hant* → Traditional; everything else zh-* → Simplified.
  if (base === 'zh') {
    const lower = raw.toLowerCase();
    if (lower.includes('hant') || lower.includes('-tw') || lower.includes('-hk') || lower.includes('-mo')) {
      return SUPPORTED_LANGUAGES.includes('zh-TW') ? 'zh-TW' : 'en';
    }
    return SUPPORTED_LANGUAGES.includes('zh-CN') ? 'zh-CN' : 'en';
  }
  // Portuguese: only pt-BR is shipped. Any "pt", "pt-PT", "pt-AO" etc. maps to
  // pt-BR — the alternative is fail-honest to English, which is worse UX for a
  // Portuguese speaker who reads pt-BR fine even if pt-PT was their preference.
  if (base === 'pt') return SUPPORTED_LANGUAGES.includes('pt-BR') ? 'pt-BR' : 'en';
  // Spanish: Iberian `es` is historical default (bare "es" keeps it). Every
  // Latin American country code (es-MX, es-AR, es-CO, es-PE, es-VE, es-US, …)
  // resolves to the pan-LatAm `es-419` catalog. Only `es-ES` stays Iberian.
  if (base === 'es' && raw.toLowerCase() !== 'es-es') {
    return SUPPORTED_LANGUAGES.includes('es-419') ? 'es-419' : 'es';
  }
  // Norwegian: browsers send `nb-*` (Bokmål) or `nn-*` (Nynorsk). We ship one
  // umbrella `no` catalog in Bokmål — both map to it rather than fall through
  // to English. A Nynorsk speaker reading Bokmål is a much smaller UX cost
  // than an English fallback, and matches how Norwegian sites usually resolve.
  if (base === 'nb' || base === 'nn') return SUPPORTED_LANGUAGES.includes('no') ? 'no' : 'en';
  if (SUPPORTED_LANGUAGES.includes(base)) return base;
  return 'en';
}

// Lazily materialise a non-en locale's 3 catalogs and register them with
// i18next. No-op for 'en' (already static) and for locales already loaded.
// On failure (bad chunk, offline first-launch), rejects — caller falls
// back to 'en'. Never throws sync.
export async function loadLocale(loc) {
  if (loc === 'en') return;
  if (!SUPPORTED_LANGUAGES.includes(loc)) return;
  // hasResourceBundle('en') returns true from static init; for other locales
  // it's true only after a previous addResourceBundle succeeded.
  if (i18n.hasResourceBundle(loc, 'common')
      && i18n.hasResourceBundle(loc, 'security')
      && i18n.hasResourceBundle(loc, 'wallet')) {
    return;
  }
  const commonPath = `./locales/${loc}/common.json`;
  const securityPath = `./locales/${loc}/security.json`;
  const walletPath = `./locales/${loc}/wallet.json`;
  const loadOne = (p) => {
    const mod = catalogModules[p];
    if (!mod) throw new Error(`i18n: no chunk registered for ${p}`);
    return mod().then((m) => m.default);
  };
  const [common, security, wallet] = await Promise.all([
    loadOne(commonPath), loadOne(securityPath), loadOne(walletPath),
  ]);
  i18n.addResourceBundle(loc, 'common', common, true, true);
  i18n.addResourceBundle(loc, 'security', security, true, true);
  i18n.addResourceBundle(loc, 'wallet', wallet, true, true);
}

// Initial synchronous init with EN only. Non-en catalogs are added
// via loadLocale() below.
i18n
  .use(initReactI18next)
  .init({
    lng: 'en',
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    // Namespace-per-domain: `security` (coercion warnings, gates), `wallet`
    // (Dashboard, Send, Receive, Tx history/receipt, Settings labels), and
    // `common` (chrome, switcher, generic buttons). Kept as separate files
    // so each locale's chunks stay small (~10 KB each) rather than one big
    // ~30 KB blob. Under Phase 5's code-split, EN is inlined at init time;
    // non-en locales load asynchronously via loadLocale(). Any t() call that
    // fires BEFORE the picked locale lands renders in English via
    // fallbackLng — including security copy — for one to a few render
    // frames on first launch. Second launch is browser-cached.
    ns: ['common', 'security', 'wallet'],
    defaultNS: 'common',
    resources: {
      en: { common: enCommon, security: enSecurity, wallet: enWallet },
    },
    interpolation: {
      // React escapes for us — double-escaping would render literal "&amp;"
      // in copy that intentionally uses "&" (e.g. brand names, T&Cs).
      escapeValue: false,
    },
    // On a missing key/namespace, return the key itself (visible bug) rather
    // than an empty string (silent blank that ships past review). Only in
    // DEV — production `saveMissing: false` and the fallback chain handles it.
    saveMissing: false,
    returnEmptyString: false,
    react: {
      // Suspense off — we handle missing bundles via fallbackLng('en'), not
      // Suspense boundaries around every t() call (which would hurt LCP).
      useSuspense: false,
    },
  });

// Boot: kick off async load of the user's picked locale (if not en).
// The initial render uses EN via fallbackLng; when the catalogs land
// (~1 render frame later on a hot cache, longer on first load) we call
// changeLanguage and the app re-renders in-language.
const bootPicked = pickSupported(resolveLocale());
if (bootPicked !== 'en') {
  loadLocale(bootPicked)
    .then(() => i18n.changeLanguage(bootPicked))
    .catch((err) => {
      // Fail-honest: stay on EN rather than render broken/blank.
      if (import.meta.env?.DEV) {
        console.warn('[i18n] failed to load boot locale', bootPicked, err);
      }
    });
}

// Keep i18next.language in sync with lib/locale.js. When Settings' language
// switcher fires setLocale(), lib/locale.js emits LOCALE_CHANGED_EVENT; we
// dynamic-import the newly-picked catalogs if not yet cached, then flip
// i18next — so no component needs to know about both APIs.
if (typeof window !== 'undefined') {
  window.addEventListener(LOCALE_CHANGED_EVENT, async () => {
    const next = pickSupported(resolveLocale());
    if (i18n.language === next) return;
    try {
      await loadLocale(next);
    } catch (err) {
      if (import.meta.env?.DEV) {
        console.warn('[i18n] failed to load locale on switch', next, err);
      }
      return; // stay on current language rather than break
    }
    i18n.changeLanguage(next);
  });
}

export default i18n;
