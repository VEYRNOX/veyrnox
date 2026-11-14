import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent } from '@testing-library/react';
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

  it('draws two wings of six feathers behind the owl', () => {
    const { container } = render(<VigilMotion state="asleep" />);
    expect(container.querySelectorAll('.vw-feather')).toHaveLength(12);
  });

  it('opens its wings on mount and flaps when tapped', () => {
    const { container } = render(<VigilMotion state="asleep" />);
    const root = () => container.querySelector('[data-vigil-motion]');
    expect(root().getAttribute('data-play')).toBe('open');
    fireEvent.pointerDown(root());
    expect(root().getAttribute('data-play')).toBe('flap');
  });

  // One-shot only: an infinite loop is the idle loop Vigil.jsx forbids.
  it.each(['VigilMotion.jsx', 'vigil-wings.css'])('%s never loops forever', async (file) => {
    const text = await readFile(resolve(process.cwd(), 'src/components', file), 'utf8');
    expect(text).not.toMatch(/infinite|Infinity/i);
  });
});
