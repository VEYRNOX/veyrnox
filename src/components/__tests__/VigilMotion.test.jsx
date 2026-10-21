import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const reduced = { value: false };
vi.mock('framer-motion', async (orig) => ({
  ...(await orig()),
  useReducedMotion: () => reduced.value,
}));

const { default: VigilMotion } = await import('@/components/VigilMotion');

beforeEach(() => {
  reduced.value = false;
});

describe('VigilMotion', () => {
  it('wraps Vigil in a motion container and keeps the requested state', () => {
    const { container } = render(<VigilMotion state="asleep" />);
    expect(container.querySelector('[data-vigil-motion]')).not.toBeNull();
    expect(container.querySelector('[data-vigil="asleep"]')).not.toBeNull();
  });

  it('renders the static owl with no motion wrapper under reduced motion', () => {
    reduced.value = true;
    const { container } = render(<VigilMotion state="asleep" />);
    expect(container.querySelector('[data-vigil-motion]')).toBeNull();
    expect(container.querySelector('[data-vigil="asleep"]')).not.toBeNull();
  });

  // Bounded loop: an infinite repeat is the idle loop Vigil.jsx forbids.
  it('never repeats forever', async () => {
    const text = await readFile(resolve(process.cwd(), 'src/components/VigilMotion.jsx'), 'utf8');
    expect(text).not.toMatch(/repeat:\s*Infinity/);
  });
});
