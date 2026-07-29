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

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { resolveLocale, LOCALE_CHANGED_EVENT } from '@/lib/locale';

// Static imports — bundled at build time. Small enough (~a few KB each) that
// code-splitting per-locale isn't worth the runtime fetch penalty for a
// wallet app that already ships offline-first. If catalogs grow past ~50 KB
// each, revisit with i18next-http-backend + Vite's dynamic-import chunking.
import enCommon from './locales/en/common.json';
import enSecurity from './locales/en/security.json';
import enWallet from './locales/en/wallet.json';
import esCommon from './locales/es/common.json';
import esSecurity from './locales/es/security.json';
import esWallet from './locales/es/wallet.json';
import deCommon from './locales/de/common.json';
import deSecurity from './locales/de/security.json';
import deWallet from './locales/de/wallet.json';
import zhCommon from './locales/zh-CN/common.json';
import zhSecurity from './locales/zh-CN/security.json';
import zhWallet from './locales/zh-CN/wallet.json';
import ptBRCommon from './locales/pt-BR/common.json';
import ptBRSecurity from './locales/pt-BR/security.json';
import ptBRWallet from './locales/pt-BR/wallet.json';
import frCommon from './locales/fr/common.json';
import frSecurity from './locales/fr/security.json';
import frWallet from './locales/fr/wallet.json';
import nlCommon from './locales/nl/common.json';
import nlSecurity from './locales/nl/security.json';
import nlWallet from './locales/nl/wallet.json';
import trCommon from './locales/tr/common.json';
import trSecurity from './locales/tr/security.json';
import trWallet from './locales/tr/wallet.json';
import ruCommon from './locales/ru/common.json';
import ruSecurity from './locales/ru/security.json';
import ruWallet from './locales/ru/wallet.json';
import viCommon from './locales/vi/common.json';
import viSecurity from './locales/vi/security.json';
import viWallet from './locales/vi/wallet.json';
import idCommon from './locales/id/common.json';
import idSecurity from './locales/id/security.json';
import idWallet from './locales/id/wallet.json';
import jaCommon from './locales/ja/common.json';
import jaSecurity from './locales/ja/security.json';
import jaWallet from './locales/ja/wallet.json';
import koCommon from './locales/ko/common.json';
import koSecurity from './locales/ko/security.json';
import koWallet from './locales/ko/wallet.json';
import arCommon from './locales/ar/common.json';
import arSecurity from './locales/ar/security.json';
import arWallet from './locales/ar/wallet.json';
import itCommon from './locales/it/common.json';
import itSecurity from './locales/it/security.json';
import itWallet from './locales/it/wallet.json';
import plCommon from './locales/pl/common.json';
import plSecurity from './locales/pl/security.json';
import plWallet from './locales/pl/wallet.json';
import ukCommon from './locales/uk/common.json';
import ukSecurity from './locales/uk/security.json';
import ukWallet from './locales/uk/wallet.json';
import csCommon from './locales/cs/common.json';
import csSecurity from './locales/cs/security.json';
import csWallet from './locales/cs/wallet.json';
import roCommon from './locales/ro/common.json';
import roSecurity from './locales/ro/security.json';
import roWallet from './locales/ro/wallet.json';
import elCommon from './locales/el/common.json';
import elSecurity from './locales/el/security.json';
import elWallet from './locales/el/wallet.json';
import svCommon from './locales/sv/common.json';
import svSecurity from './locales/sv/security.json';
import svWallet from './locales/sv/wallet.json';
import daCommon from './locales/da/common.json';
import daSecurity from './locales/da/security.json';
import daWallet from './locales/da/wallet.json';
import noCommon from './locales/no/common.json';
import noSecurity from './locales/no/security.json';
import noWallet from './locales/no/wallet.json';
import fiCommon from './locales/fi/common.json';
import fiSecurity from './locales/fi/security.json';
import fiWallet from './locales/fi/wallet.json';

// Which locales are available AT ALL. Every catalog listed here is
// machine-translated at ship time (except `en`) and gated behind the MT-pending
// banner in <LanguageSwitcher> until a native reviewer signs off on
// `security.json` — do NOT soften that banner without signoff.
//
// `ar` is bundled but INTENTIONALLY absent from LANGUAGE_SWITCHER_AVAILABLE
// below: RTL layout support (dir="rtl", CSS logical properties, mirrored
// icons) is a follow-up PR. Ungate `ar` there.
export const SUPPORTED_LANGUAGES = [
  'en', 'es', 'de', 'zh-CN',
  'pt-BR', 'fr', 'nl', 'tr', 'ru', 'vi', 'id', 'ja', 'ko', 'ar',
  'it', 'pl', 'uk', 'cs', 'ro', 'el', 'sv', 'da', 'no', 'fi',
];

// The default user-facing set. `ar` gated pending RTL layout support.
export const LANGUAGE_SWITCHER_AVAILABLE = /** @type {readonly string[]} */ ([
  'en', 'es', 'de', 'zh-CN',
  'pt-BR', 'fr', 'nl', 'tr', 'ru', 'vi', 'id', 'ja', 'ko',
  'it', 'pl', 'uk', 'cs', 'ro', 'el', 'sv', 'da', 'no', 'fi',
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
});

// Normalize whatever resolveLocale returns (which follows navigator.language:
// "fr-CH", "en-GB", "zh-Hans-CN", …) to one of our SUPPORTED_LANGUAGES.
// Unknown → 'en' (fail-honest — do not silently mistranslate).
export function pickSupported(raw) {
  if (!raw) return 'en';
  if (SUPPORTED_LANGUAGES.includes(raw)) return raw;
  // Match by language subtag: "de-AT" → "de", "zh-Hans-CN" → "zh-CN" if we
  // ship zh-CN. Latin scripts collapse to the base tag; zh/pt need region care.
  const [base] = raw.split('-');
  if (base === 'zh') return SUPPORTED_LANGUAGES.includes('zh-CN') ? 'zh-CN' : 'en';
  // Portuguese: only pt-BR is shipped. Any "pt", "pt-PT", "pt-AO" etc. maps to
  // pt-BR — the alternative is fail-honest to English, which is worse UX for a
  // Portuguese speaker who reads pt-BR fine even if pt-PT was their preference.
  if (base === 'pt') return SUPPORTED_LANGUAGES.includes('pt-BR') ? 'pt-BR' : 'en';
  if (SUPPORTED_LANGUAGES.includes(base)) return base;
  return 'en';
}

i18n
  .use(initReactI18next)
  .init({
    lng: pickSupported(resolveLocale()),
    fallbackLng: 'en',
    supportedLngs: SUPPORTED_LANGUAGES,
    // Namespace-per-domain so the security bundle (which MUST render in every
    // locale without a fallback flash) is loaded up-front. `wallet` was added
    // in Phase 2 slice 3 for the core non-security surfaces (nav, Dashboard,
    // Send, Receive, Tx history / receipt, Settings labels). Loading it
    // eagerly matches the offline-first bundle posture — no runtime fetch.
    ns: ['common', 'security', 'wallet'],
    defaultNS: 'common',
    resources: {
      en: { common: enCommon, security: enSecurity, wallet: enWallet },
      es: { common: esCommon, security: esSecurity, wallet: esWallet },
      de: { common: deCommon, security: deSecurity, wallet: deWallet },
      'zh-CN': { common: zhCommon, security: zhSecurity, wallet: zhWallet },
      'pt-BR': { common: ptBRCommon, security: ptBRSecurity, wallet: ptBRWallet },
      fr: { common: frCommon, security: frSecurity, wallet: frWallet },
      nl: { common: nlCommon, security: nlSecurity, wallet: nlWallet },
      tr: { common: trCommon, security: trSecurity, wallet: trWallet },
      ru: { common: ruCommon, security: ruSecurity, wallet: ruWallet },
      vi: { common: viCommon, security: viSecurity, wallet: viWallet },
      id: { common: idCommon, security: idSecurity, wallet: idWallet },
      ja: { common: jaCommon, security: jaSecurity, wallet: jaWallet },
      ko: { common: koCommon, security: koSecurity, wallet: koWallet },
      ar: { common: arCommon, security: arSecurity, wallet: arWallet },
      it: { common: itCommon, security: itSecurity, wallet: itWallet },
      pl: { common: plCommon, security: plSecurity, wallet: plWallet },
      uk: { common: ukCommon, security: ukSecurity, wallet: ukWallet },
      cs: { common: csCommon, security: csSecurity, wallet: csWallet },
      ro: { common: roCommon, security: roSecurity, wallet: roWallet },
      el: { common: elCommon, security: elSecurity, wallet: elWallet },
      sv: { common: svCommon, security: svSecurity, wallet: svWallet },
      da: { common: daCommon, security: daSecurity, wallet: daWallet },
      no: { common: noCommon, security: noSecurity, wallet: noWallet },
      fi: { common: fiCommon, security: fiSecurity, wallet: fiWallet },
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
      // Suspense off — the security bundle is static so nothing loads async,
      // and Suspense boundaries around every t() call would hurt LCP.
      useSuspense: false,
    },
  });

// Keep i18next.language in sync with lib/locale.js. When Settings' language
// switcher fires setLocale(), lib/locale.js emits LOCALE_CHANGED_EVENT and
// i18next flips too — so no component needs to know about both APIs.
if (typeof window !== 'undefined') {
  window.addEventListener(LOCALE_CHANGED_EVENT, () => {
    const next = pickSupported(resolveLocale());
    if (i18n.language !== next) i18n.changeLanguage(next);
  });
}

export default i18n;
