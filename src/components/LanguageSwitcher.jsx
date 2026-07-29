// @ts-nocheck
// src/components/LanguageSwitcher.jsx
//
// Settings-side language picker.
//
// Writes go through lib/locale.js setLocale — which is I3-GATED (no-op in
// decoy/duress/stealth/demo). So a coerced session tapping this selector
// cannot flip the real user's stored language, and cannot leave a "someone
// changed the language" tell behind. The picker still visually reflects the
// change for the coerced session's remaining lifetime (i18next reacts to
// LOCALE_CHANGED_EVENT), but nothing persists — same shape as the consent
// toggle after PR #1410.
//
// MT BANNER — I4 FAIL-HONEST. Every non-English catalog is machine-translated
// at this point (see i18n/index.js MACHINE_TRANSLATED). Presenting an
// unreviewed translation without a caveat would let a mistranslated scam
// warning read as reviewed copy — so we surface the banner whenever the
// active language is flagged. Removing the banner is a code change, not a
// runtime toggle.

import { useTranslation } from 'react-i18next';
import { LANGUAGE_SWITCHER_AVAILABLE, MACHINE_TRANSLATED, pickSupported } from '@/i18n';
import { useLocalePreferences } from '@/lib/useLocale';
import { setLocale } from '@/lib/locale';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export default function LanguageSwitcher() {
  const { t } = useTranslation('common');
  const { locale } = useLocalePreferences();
  const current = pickSupported(locale);
  const isMT = !!MACHINE_TRANSLATED[current];

  return (
    <div className="space-y-2">
      <label htmlFor="lang-switcher" className="text-xs uppercase tracking-widest text-muted-foreground">
        {t('language.switcher_label')}
      </label>
      <Select value={current} onValueChange={(next) => setLocale(next)}>
        <SelectTrigger id="lang-switcher" className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LANGUAGE_SWITCHER_AVAILABLE.map((code) => (
            <SelectItem key={code} value={code}>
              {t(`language.names.${code}`)}
              {MACHINE_TRANSLATED[code] && (
                <span className="ml-2 text-[10px] text-caution">· MT</span>
              )}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isMT && (
        <p role="note" className="text-xs text-caution">
          {t('language.mt_banner')}
        </p>
      )}
    </div>
  );
}
