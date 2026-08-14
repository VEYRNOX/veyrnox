import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const PAGES = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dashboard = readFileSync(resolve(PAGES, 'Dashboard.jsx'), 'utf8');
const settings = readFileSync(resolve(PAGES, 'Settings.jsx'), 'utf8');
const rehearsalRow = readFileSync(resolve(PAGES, '..', 'rehearsal', 'RehearsalSettingsRow.jsx'), 'utf8');

describe('critical route first paint', () => {
  it('shows the first resolved dashboard total immediately, then retains later animations', () => {
    const balanceEffect = dashboard.slice(
      dashboard.indexOf('cancelAnimationFrame(animRef.current);'),
      dashboard.indexOf('const change24h'),
    );

    expect(dashboard).toContain('useState(null)');
    expect(balanceEffect.indexOf('if (isLoading) return;')).toBeLessThan(
      balanceEffect.indexOf('if (displayValue === null)'),
    );
    expect(balanceEffect).toContain('const duration = 600');
    expect(dashboard).toContain('formatFiat(displayValue ?? totalUSD, fiatCurrency, locale)');
    expect(dashboard).not.toContain('<AnimatedFiat');
  });

  it('renders settings chrome before wallet-passkey data resolves', () => {
    expect(settings).not.toContain('return <Spinner className="h-64" label="Loading settings…" />');
    expect(settings).toContain('label="Loading wallet passkeys…"');
    expect(settings).toMatch(/isLoading\s*\?\s*\(\s*<Spinner[^>]+Loading wallet passkeys/);
  });

  it('loads the portfolio-backed rehearsal only after the Settings row opens', () => {
    expect(rehearsalRow).toContain("lazy(() => import('./RehearsalView.jsx'))");
    expect(rehearsalRow).not.toMatch(/^import RehearsalView/m);
    expect(rehearsalRow).toMatch(/open\s*&&\s*\([\s\S]*<Suspense[\s\S]*<RehearsalView/);
  });
});
