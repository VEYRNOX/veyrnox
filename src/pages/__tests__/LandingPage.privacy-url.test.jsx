// src/pages/__tests__/LandingPage.privacy-url.test.jsx
//
// Pins that the public /landing page's footer links to a REAL privacy policy URL
// (not the previous `href="#"` placeholder). The dead-link regression was the
// primary reason the Play store listing had no in-app privacy policy surface.
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';

// LandingPage transitively imports Capacitor + a bunch of animation modules.
// This test only cares about the Legal footer, so we mock the surface we need.
vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => false, getPlatform: () => 'web' } }));

const LandingPage = (await import('../LandingPage')).default;

function renderPage() {
  return render(
    <MemoryRouter>
      <LandingPage />
    </MemoryRouter>
  );
}

describe('LandingPage — Legal footer links wired', () => {
  it('Privacy Policy link points at https://veyrnox.com/privacy (not the "#" placeholder)', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /Privacy Policy/i });
    expect(link.getAttribute('href')).toBe('https://veyrnox.com/privacy');
    expect(link.getAttribute('href')).not.toBe('#');
  });

  it('Privacy Policy link opens externally with rel="noopener noreferrer"', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /Privacy Policy/i });
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toBe('noopener noreferrer');
  });

  it('Terms of Service link points at the in-app /terms route (not the "#" placeholder)', () => {
    renderPage();
    const link = screen.getByRole('link', { name: /Terms of Service/i });
    expect(link.getAttribute('href')).toBe('/terms');
    expect(link.getAttribute('href')).not.toBe('#');
  });
});
