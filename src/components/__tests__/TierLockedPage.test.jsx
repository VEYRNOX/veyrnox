import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import TierLockedPage from '../TierLockedPage';

describe('TierLockedPage', () => {
  it('explains the feature requires Safety Plus and links to /plans', () => {
    render(
      <MemoryRouter>
        <TierLockedPage />
      </MemoryRouter>
    );
    expect(screen.getByText('Safety Plus feature')).toBeTruthy();
    expect(
      screen.getByText(/This feature is part of Safety Plus/)
    ).toBeTruthy();
    const link = screen.getByRole('link', { name: /view plans/i });
    expect(link.getAttribute('href')).toBe('/plans');
  });

  it('sends an AI-tier lockout to /plans, not to a sales contact', () => {
    render(
      <MemoryRouter>
        <TierLockedPage tier="ai_security_protection" />
      </MemoryRouter>
    );
    expect(screen.getByText('AI Security Protection feature')).toBeTruthy();
    expect(screen.getByText(/Upgrade to unlock it/)).toBeTruthy();
    // Asserted against the RENDERED output, never the source text: the reason
    // this line exists is recorded in a comment in the component, and a
    // source-level absence check would match that comment and pass for the
    // wrong reason. AI Security Protection is an in-app subscription
    // ($19.99/mo), so "Contact sales" both contradicted the /plans card it
    // links to and steered a digital unlock outside IAP (App Store 3.1.1).
    expect(screen.queryByText(/contact sales/i)).toBeNull();
    expect(
      screen.getByRole('link', { name: /view plans/i }).getAttribute('href')
    ).toBe('/plans');
  });
});
