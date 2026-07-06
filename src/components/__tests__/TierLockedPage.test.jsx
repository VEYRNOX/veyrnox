import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import TierLockedPage from '../TierLockedPage';

describe('TierLockedPage', () => {
  it('explains the feature requires Safety Plus and links to /plans', () => {
    render(
      <MemoryRouter>
        <TierLockedPage />
      </MemoryRouter>
    );
    expect(screen.getByText(/Safety Plus/)).toBeTruthy();
    const link = screen.getByRole('link', { name: /view plans/i });
    expect(link.getAttribute('href')).toBe('/plans');
  });
});
