// Slice I — halo visibility bump.
//
// Current EntryTiles renders the lamp cone at opacity 0.85, blur 32px, gradient
// stop 0% at rgba(74,218,194,0.55) — reads near-invisible on the near-black
// background. Plan bumps these to opacity ≥ 0.95, blur ≤ 28px, gradient stop
// 0% ≥ rgba(74,218,194,0.9), and adds a radial logo halo behind the hex logo.
//
// RED for the right reason on current code: 0.85 < 0.95, 32 > 28, 0.55 gradient
// stop absent, no logo-halo element.
//
// Selector contract for the implementer:
//   • Keep the `.vx-lamp-beam` class on the outer beam element.
//   • Add `data-testid="logo-halo"` to the new radial glow element sitting behind
//     the logo hex (pointer-events:none, non-interactive).

import { describe, it, expect, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import EntryTiles from '@/components/EntryTiles';
import VeyrnoxAmbient from '@/components/VeyrnoxAmbient';

// Slice M (2026-08-11): lamp/aurora extracted from VeyrnoxHero → VeyrnoxAmbient
// so it mounts at viewport scale on EntryShell (spans the whole screen instead
// of getting clipped by max-w-sm). The lamp assertions now target VeyrnoxAmbient
// directly since EntryTiles no longer renders the beam itself.

afterEach(() => cleanup());

describe('EntryTiles — halo visibility (Slice I bump)', () => {
  it('.vx-lamp-beam is no longer at the pre-Slice-I opacity 0.85 (bumped to >= 0.95)', () => {
    // jsdom does not resolve tailwind arbitrary-value classes into computed
    // style, so read the className the class actually applies. Current code
    // uses `opacity-[0.85]`; the Slice-I bump swaps to `opacity-100` (or an
    // equivalent >= 0.95 arbitrary-value class). Fail on either side of the
    // contract: presence of the pre-Slice-I value, or absence of the bumped one.
    const { container } = render(<VeyrnoxAmbient />);
    const beam = container.querySelector('.vx-lamp-beam');
    expect(beam).toBeTruthy();
    const cls = beam.className || '';
    expect(cls).not.toMatch(/opacity-\[0\.85\]/);
    // Accept either `opacity-100` or an arbitrary opacity >= 0.95.
    const arb = cls.match(/opacity-\[(0?\.\d+)\]/);
    const arbVal = arb ? parseFloat(arb[1]) : null;
    const ok = /\bopacity-100\b/.test(cls) || (arbVal !== null && arbVal >= 0.95);
    expect(ok).toBe(true);
  });

  it('.vx-lamp-beam blur class is <= 28px (Slice-I bump from 32px)', () => {
    const { container } = render(<VeyrnoxAmbient />);
    const beam = container.querySelector('.vx-lamp-beam');
    const cls = beam.className || '';
    const m = cls.match(/blur-\[(\d+)px\]/);
    expect(m).toBeTruthy();
    expect(parseInt(m[1], 10)).toBeLessThanOrEqual(28);
  });

  it('.vx-lamp-beam background gradient contains the stronger 0% stop rgba(74, 218, 194, 0.9)', () => {
    const { container } = render(<VeyrnoxAmbient />);
    const beam = container.querySelector('.vx-lamp-beam');
    const bg = beam.style.background || getComputedStyle(beam).background || '';
    // Tolerate whitespace variance (`rgba(74,218,194,0.9)` vs `rgba(74, 218, 194, 0.9)`).
    expect(bg.replace(/\s+/g, '')).toContain('rgba(74,218,194,0.9)');
  });

  it('a logo halo element is present and non-interactive (pointer-events: none)', () => {
    const { container } = render(<EntryTiles onSelect={() => {}} />);
    // Preferred selector: data-testid="logo-halo". Fallback: any element inside
    // the logo group with a `logo-halo` class marker.
    const halo =
      container.querySelector('[data-testid="logo-halo"]') ||
      container.querySelector('.vx-logo-halo');
    expect(halo).toBeTruthy();

    const cs = getComputedStyle(halo);
    const pe = cs.pointerEvents || halo.style.pointerEvents || '';
    // Tailwind `pointer-events-none` may not resolve in jsdom; accept the class
    // marker as evidence.
    if (pe) {
      expect(pe).toBe('none');
    } else {
      expect((halo.className || '').includes('pointer-events-none')).toBe(true);
    }
  });
});
