// src/components/__tests__/Vigil.test.jsx
//
// Vigil's I3 property is that it renders IDENTICALLY in a decoy/hidden session
// and a primary one.
//
// This file previously pinned the opposite — that Vigil renders NOTHING in a
// decoy session — and those pins were wrong in a way worth recording, because
// they were green, mutation-checked, and enforcing a defect.
//
// deniabilitySession.js is an EGRESS marker; its docstring is entirely about
// making "ZERO backend/device calls" from a coerced session. Vigil makes no
// calls. Gating its render bought nothing against egress, and cost the thing
// that matters: a decoy session missing a mascot the primary session shows is
// DISTINGUISHABLE from the primary session. The pins enforced the tell.
//
// The lesson is not "the gate was in the wrong place" — it is that a test can
// be rigorous about the wrong invariant. Mutation-checking proves a pin has
// teeth; it says nothing about whether the property is the right one.
//
// Mutation-checked 2026-09-16: each `it` below confirmed red by reintroducing
// the specific defect it names, then restored.

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

// gradient ids are per-instance by design, so they have to come out before two
// renders can be compared
const shapeOf = (el) => el.innerHTML.replace(/vg-[a-z]+-[^"')]*/g, 'ID');

beforeEach(() => {
  isDeniabilityOrDemoActive.mockReturnValue(false);
  vi.clearAllMocks();
});

describe('Vigil — deniability (I3)', () => {
  it('renders byte-identically in a decoy session and a primary one', () => {
    for (const state of STATES) {
      isDeniabilityOrDemoActive.mockReturnValue(false);
      const primary = render(<Vigil state={state} />);
      const primaryShape = shapeOf(primary.container);
      primary.unmount();

      isDeniabilityOrDemoActive.mockReturnValue(true);
      const decoy = render(<Vigil state={state} />);
      expect(shapeOf(decoy.container)).toBe(primaryShape);
      expect(decoy.container.querySelector('svg')).not.toBeNull();
      decoy.unmount();
    }
  });

  it('does not read the deniability marker at all', () => {
    isDeniabilityOrDemoActive.mockClear();
    for (const state of STATES) render(<Vigil state={state} />);
    expect(isDeniabilityOrDemoActive).not.toHaveBeenCalled();
  });

  // A risk indicator that disappears under coercion is the worst possible
  // failure mode, so the absence of a render gate is pinned at source too.
  //
  // COMMENTS ARE STRIPPED FIRST, and that is not tidiness. The header of
  // Vigil.jsx explains this rule at length and necessarily NAMES the call it
  // forbids — so the first version of this pin matched its own documentation
  // and failed on correct code. A file that records a correction will always
  // contain the thing it corrected; assert against the code, not the prose.
  it('calls no deniability gate in its code', async () => {
    const src = await readFile(resolve(process.cwd(), 'src/components/Vigil.jsx'), 'utf8');
    const code = src
      .split('\n')
      .filter((line) => !line.trim().startsWith('//'))
      .join('\n');

    expect(code).not.toMatch(/deniabilitySession/);
    expect(code).not.toMatch(/isDeniabilityOrDemoActive/);
    // the stripping must not be what makes this pass
    expect(code).toMatch(/function VigilImpl/);
  });

  it('stays visible when a session flips from primary to decoy mid-render', () => {
    const { container, rerender } = render(<Vigil state="block" />);
    expect(container.querySelector('[data-vigil="block"]')).not.toBeNull();

    isDeniabilityOrDemoActive.mockReturnValue(true);
    rerender(<Vigil state="block" size={97} />);
    expect(container.querySelector('[data-vigil="block"]')).not.toBeNull();
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
