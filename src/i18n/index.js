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

// Which locales are available AT ALL. zh-CN is INTENTIONALLY absent from the
// user-facing switcher by default (see LANGUAGE_SWITCHER_AVAILABLE below) —
// mistranslating a Chinese scam warning in the wrong direction could get
// someone robbed. It ships as a runtime capability, not a user default.
export const SUPPORTED_LANGUAGES = ['en', 'es', 'de', 'zh-CN'];

// The default user-facing set. zh-CN gated behind a flag until human review.
export const LANGUAGE_SWITCHER_AVAILABLE = /** @type {readonly string[]} */ ([
  'en',
  'es',
  'de',
  ...(import.meta.env?.VITE_ENABLE_ZH_CN === '1' ? ['zh-CN'] : []),
]);

// Every non-English catalog is machine-translated at the time this ships.
// Read by <LanguageSwitcher> to render the MT-pending banner. Flip an entry
// to `false` when a native reviewer signs off on that language's copy.
export const MACHINE_TRANSLATED = /** @type {Record<string, boolean>} */ ({
  en: false,
  es: true,
  de: true,
  'zh-CN': true,
});

// Normalize whatever resolveLocale returns (which follows navigator.language:
// "fr-CH", "en-GB", "zh-Hans-CN", …) to one of our SUPPORTED_LANGUAGES.
// Unknown → 'en' (fail-honest — do not silently mistranslate).
export function pickSupported(raw) {
  if (!raw) return 'en';
  if (SUPPORTED_LANGUAGES.includes(raw)) return raw;
  // Match by language subtag: "de-AT" → "de", "zh-Hans-CN" → "zh-CN" if we
  // ship zh-CN. Latin scripts collapse to the base tag; zh needs script care.
  const [base] = raw.split('-');
  if (base === 'zh') return SUPPORTED_LANGUAGES.includes('zh-CN') ? 'zh-CN' : 'en';
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
