// Slice I — tagline update naming the AI Security Advisor.
//
// Verbatim string is load-bearing (owner-approved copy; I4 honesty — the AI
// Security Advisor is a real shipping component per SecurityAdvisor.jsx). The
// grep-guard forbids any "shamir/shard/2-of-3" language leaking here — that
// belongs on the Personal Backup surface, not the tile hero.
//
// RED on current code: current tagline is
//   "Self-custody, coercion-resistant. Your keys stay on this device."

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import EntryTiles from '@/components/EntryTiles';

const EXPECTED =
  'Self-custody, Coercion-Resistant, AI Security Advisor. Your keys stay on this device.';

afterEach(() => cleanup());

describe('EntryTiles — tagline (Slice I)', () => {
  it('renders the verbatim Slice-I tagline', () => {
    render(<EntryTiles onSelect={() => {}} />);
    expect(screen.getByText(EXPECTED)).toBeTruthy();
  });

  it('does not leak Shamir/shard vocabulary onto the tile hero (grep-guard)', () => {
    const { container } = render(<EntryTiles onSelect={() => {}} />);
    expect(container.textContent || '').not.toMatch(/shamir|shard|2-of-3|three shards/i);
  });
});
