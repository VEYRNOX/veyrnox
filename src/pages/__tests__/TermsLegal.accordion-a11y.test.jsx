// Behavioural regression test — TermsSection trigger<->panel association
// (2026-07-20 branch review). Mirrors the aria-controls decision made in
// HDWalletManager's asset disclosure (only point aria-controls at an id once
// that id actually exists in the DOM), plus gives the disclosed body a real
// id + role="region" + accessible name so it is reachable/identifiable once
// it appears — previously it had neither.

import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';
import { MemoryRouter } from 'react-router-dom';
import TermsLegal from '../TermsLegal';

function renderPage() {
  return render(
    <MemoryRouter>
      <TermsLegal />
    </MemoryRouter>
  );
}

describe('TermsLegal — accordion trigger<->panel association', () => {
  it('has NO aria-controls while collapsed (default state for all 15 sections)', () => {
    renderPage();
    const trigger = screen.getByRole('button', { name: /11\.\s*limitation of liability/i });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.hasAttribute('aria-controls')).toBe(false);
  });

  it('expanding §11 links the trigger to a REAL region containing the liability text', () => {
    renderPage();
    const trigger = screen.getByRole('button', { name: /11\.\s*limitation of liability/i });

    fireEvent.click(trigger);

    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    const controlsId = trigger.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();

    const panel = document.getElementById(controlsId);
    expect(panel, 'aria-controls points at an id that does not exist in the DOM').toBeTruthy();
    expect(panel.getAttribute('role')).toBe('region');

    // The programmatically-linked region is discoverable by its accessible
    // name via the standard role+name query — not just "some div appeared".
    const region = screen.getByRole('region', { name: /limitation of liability/i });
    expect(region).toBe(panel);
    // And it actually contains the liability text that just appeared.
    expect(region.textContent).toMatch(/in no event shall veyrnox/i);
  });

  it('drops aria-controls again on collapse (never left dangling)', () => {
    renderPage();
    const trigger = screen.getByRole('button', { name: /11\.\s*limitation of liability/i });

    fireEvent.click(trigger); // expand
    const controlsId = trigger.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();

    fireEvent.click(trigger); // collapse
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.hasAttribute('aria-controls')).toBe(false);
    expect(document.getElementById(controlsId)).toBeNull();
  });

  it('each of the 15 sections gets its own distinct panel id (no collisions)', () => {
    renderPage();
    const triggers = screen.getAllByRole('button').filter((b) => /^\d{1,2}\./.test(b.textContent));
    expect(triggers.length).toBe(15);
    const ids = new Set();
    for (const t of triggers) {
      fireEvent.click(t);
      const id = t.getAttribute('aria-controls');
      expect(id).toBeTruthy();
      expect(ids.has(id), `duplicate panel id: ${id}`).toBe(false);
      ids.add(id);
      fireEvent.click(t); // collapse again to keep the DOM small
    }
    expect(ids.size).toBe(15);
  });
});
