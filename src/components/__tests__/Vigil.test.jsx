// src/components/__tests__/Vigil.test.jsx
//
// Vigil is a branded character. Its presence on screen asserts that a real
// Veyrnox wallet lives on this device, which is exactly the fact a decoy
// session exists to deny (I3). The gate lives in ONE place — inside the
// component — so every call site inherits it and nobody has to remember.
// These pins guard that arrangement, plus the two properties that keep the
// mascot out of the panic-wipe residue list and off the battery.
//
// Mutation-checked 2026-09-16: each `it` below was confirmed red by
// reintroducing the specific defect it names, then restored.

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const isDeniabilityOrDemoActive = vi.fn(() => false);
vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: () => isDeniabilityOrDemoActive(),
}));

const { default: Vigil } = await import('@/components/Vigil');

const STATES = ['clean', 'alert', 'block', 'asleep'];

beforeEach(() => {
  isDeniabilityOrDemoActive.mockReturnValue(false);
  vi.clearAllMocks();
});

describe('Vigil — deniability (I3)', () => {
  it('renders nothing in a decoy/demo session, in every state', () => {
    isDeniabilityOrDemoActive.mockReturnValue(true);
    for (const state of STATES) {
      const { container, unmount } = render(<Vigil state={state} />);
      expect(container.querySelector('svg')).toBeNull();
      expect(container.textContent).toBe('');
      unmount();
    }
  });

  it('renders in a primary session', () => {
    const { container } = render(<Vigil state="asleep" />);
    expect(container.querySelector('svg')).not.toBeNull();
  });

  it('renders null after a mid-session flip from primary to decoy', () => {
    const { container, rerender } = render(<Vigil state="clean" />);
    expect(container.querySelector('svg')).not.toBeNull();

    isDeniabilityOrDemoActive.mockReturnValue(true);
    rerender(<Vigil state="clean" size={97} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  // The I3 gate is a conditional early return, so every hook must sit ABOVE
  // it or the hook count changes between a primary and a decoy render.
  //
  // This is pinned structurally because it cannot be pinned behaviourally:
  // mutation-checked 2026-09-16 on React 19.3 by moving `useId` below the
  // return, and the component neither threw nor logged — the flip test above
  // and a console.error spy both stayed green. React did not report it at
  // all. The source order is the only signal available.
  //
  // Scoped to the two exact code spellings, not to the words: the comments in
  // Vigil.jsx name both `useId` and the gate, and an unscoped search would
  // match the prose that documents this rule and pass for the wrong reason.
  it('declares every hook above the deniability gate', async () => {
    // import.meta.url is not a file: URL in this environment; resolve from
    // the repo root, which is vitest's cwd.
    const src = await readFile(resolve(process.cwd(), 'src/components/Vigil.jsx'), 'utf8');
    const gate = src.indexOf('if (isDeniabilityOrDemoActive()) return null;');
    const hook = src.indexOf("useId().replace");

    expect(gate).toBeGreaterThan(-1);
    expect(hook).toBeGreaterThan(-1);
    expect(hook).toBeLessThan(gate);

    // and no OTHER hook sneaks in below the gate
    const below = src.slice(gate);
    expect(below).not.toMatch(/\buse[A-Z]\w*\(/);
  });
});

describe('Vigil — residue and motion', () => {
  it('writes no localStorage key', () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const removeItem = vi.spyOn(Storage.prototype, 'removeItem');
    for (const state of STATES) render(<Vigil state={state} />);
    expect(setItem).not.toHaveBeenCalled();
    expect(removeItem).not.toHaveBeenCalled();
    setItem.mockRestore();
    removeItem.mockRestore();
  });

  // No idle loop: an infinite decorative animation burns battery and trains
  // people to ignore the mascot. Motion belongs at the call site, on a state
  // change the user caused.
  it('declares no animation of its own', () => {
    const { container } = render(<Vigil state="clean" />);
    const svg = container.querySelector('svg');
    expect(svg.querySelector('animate')).toBeNull();
    expect(svg.querySelector('animateTransform')).toBeNull();
    expect(svg.outerHTML).not.toMatch(/\banimation\s*:/);
  });
});

describe('Vigil — accessibility', () => {
  it('is aria-hidden: the sentence beside it is the accessible signal', () => {
    const { container } = render(<Vigil state="block" />);
    const svg = container.querySelector('svg');
    expect(svg.getAttribute('aria-hidden')).toBe('true');
    expect(svg.getAttribute('focusable')).toBe('false');
  });

  // color-not-only: strip the hue and each state must still be distinguishable
  // by SHAPE. clean/alert are the pair that collapsed on the first attempt —
  // both were wide-open teal eyes and read identically at a glance.
  //
  // An earlier version of this pin compared whole de-coloured markup strings
  // and passed on a half-pixel pupil difference, i.e. on a difference no eye
  // could see. Mutation-checked: setting alert's tuft angle to clean's left it
  // green. Name the distinguishing features instead.
  const geometryOf = (state) => {
    const { container } = render(<Vigil state={state} />);
    const svg = container.querySelector('svg');
    const paths = [...svg.querySelectorAll('path')].map((n) => n.getAttribute('d'));
    const eyeCircle = [...svg.querySelectorAll('circle')]
      .map((n) => Number(n.getAttribute('r')))
      .sort((a, b) => b - a)[0];
    return {
      // ear-tuft angle: the silhouette cue, the last thing to survive scaling
      tuftAngle: svg.querySelector('path[transform*="rotate"]')?.getAttribute('transform') ?? '',
      // brows: present for alert and block, and pointing opposite ways
      brows: paths.filter((d) => d && /^M(44|156|46|154) /.test(d)).length,
      // shut eyes are a stroked arc; open eyes are filled circles
      eyesShut: paths.some((d) => d && /^M48 83Q71 102/.test(d)),
      // largest circle = eye white; alert grows it while shrinking the pupil
      widestCircle: eyeCircle,
    };
  };

  it('distinguishes every state by geometry, not colour', () => {
    const g = Object.fromEntries(STATES.map((s2) => [s2, geometryOf(s2)]));

    // all four differ as a set
    expect(new Set(STATES.map((s2) => JSON.stringify(g[s2]))).size).toBe(STATES.length);

    // and the specific pair that failed the eye test differs on TWO cues,
    // either of which alone survives a scale down to toast size
    expect(g.alert.tuftAngle).not.toBe(g.clean.tuftAngle);
    expect(g.alert.brows).toBeGreaterThan(g.clean.brows);

    expect(g.block.brows).toBeGreaterThan(0);
    expect(g.asleep.eyesShut).toBe(true);
    expect(g.clean.eyesShut).toBe(false);
  });
});

describe('Vigil — instance isolation', () => {
  // Two Vigils on one screen (a toast over the paywall) must not share
  // gradient ids, or the second mounted overwrites the first's fills.
  it('gives each instance unique gradient ids', () => {
    const { container } = render(
      <>
        <Vigil state="clean" />
        <Vigil state="asleep" />
      </>,
    );
    const ids = [...container.querySelectorAll('[id^="vg-"]')].map((n) => n.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
