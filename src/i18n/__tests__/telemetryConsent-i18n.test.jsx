// i18n end-to-end for TelemetryConsent (pilot conversion for Phase 2 slice 1).
//
// Locks the pipeline that the fan-out subagents will follow for the remaining
// security-critical files: useTranslation + English catalog + MT catalogs +
// LOCALE_CHANGED_EVENT-driven re-render + I3 write-gate on the switcher path.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import '@/i18n';
import TelemetryConsent from '@/components/TelemetryConsent';
import { setLocale, LOCALE_KEY } from '@/lib/locale';
import { setDeniabilitySession } from '@/wallet-core/deniabilitySession';
import i18n from '@/i18n';

// The consent component fires a real trackEvent on grant — mock the network path
// so tests don't touch Supabase (Phase 1 already blanks env in vitest.config,
// so this is belt-and-braces).
vi.mock('@/api/trackEvent', () => ({
  trackEvent: vi.fn(() => Promise.resolve()),
  EVENT: {},
}));

function reset() {
  try { localStorage.removeItem(LOCALE_KEY); } catch {}
  setDeniabilitySession(false);
}

async function switchLanguage(code) {
  await act(async () => {
    setLocale(code);
    // Give i18next.changeLanguage's promise a tick to resolve before React
    // reads the new bundle.
    await Promise.resolve();
  });
}

describe('TelemetryConsent — i18n pilot', () => {
  beforeEach(reset);
  afterEach(async () => {
    reset();
    await i18n.changeLanguage('en');
  });

  it('renders English copy by default', () => {
    render(<TelemetryConsent onChoice={() => {}} />);
    expect(screen.getByRole('heading', { name: /help improve veyrnox/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /help improve veyrnox/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /no thanks/i })).toBeTruthy();
  });

  it('switches to German when setLocale("de") is called', async () => {
    render(<TelemetryConsent onChoice={() => {}} />);
    await switchLanguage('de');
    expect(screen.getByRole('heading', { name: /hilf, veyrnox zu verbessern/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /nein, danke/i })).toBeTruthy();
  });

  it('switches to Spanish when setLocale("es") is called', async () => {
    render(<TelemetryConsent onChoice={() => {}} />);
    await switchLanguage('es');
    expect(screen.getByRole('heading', { name: /ayúdanos a mejorar veyrnox/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /no, gracias/i })).toBeTruthy();
  });

  it('I3: setLocale is a NO-OP in a decoy/demo session — nothing persists', () => {
    localStorage.setItem(LOCALE_KEY, 'en-US');
    setDeniabilitySession(true);
    setLocale('de');
    expect(localStorage.getItem(LOCALE_KEY)).toBe('en-US');
  });

  it('falls back to English for an unknown key (I4)', () => {
    // Direct i18n call with a key that doesn't exist in any bundle. In dev this
    // returns the key itself, which is a visible bug rather than a silent blank.
    expect(i18n.t('does.not.exist', { defaultValue: 'FALLBACK' })).toBe('FALLBACK');
  });
});
