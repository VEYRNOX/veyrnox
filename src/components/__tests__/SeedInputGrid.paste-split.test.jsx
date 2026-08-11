// Slice I — fail-closed paste-split on SeedInputGrid.
//
// Contract (from plan §3):
//   1. event.preventDefault() FIRST — kills the default one-box paste.
//   2. Tokenize on /\s+/, trim empties, lowercase.
//   3. If index === 0 AND count ∈ {12,15,18,21,24} → auto-resize grid to that
//      count, fill all boxes from 0, clear error.
//   4. Else if index + N <= count → fill from index forward.
//   5. Else FAIL CLOSED — no boxes modified, error set, grid stays at prior
//      count. No per-word feedback (preserves the no-oracle invariant).
//
// Grep-guard: the paste code path must not leak per-word "word N invalid" or
// "checksum" language (I4, no oracle).
//
// RED for the right reason: SeedInputGrid has no handlePaste today, so the
// paste event's default behaviour fills exactly one box.

import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import SeedInputGrid from '@/components/SeedInputGrid';

afterEach(() => cleanup());

function boxes(container) {
  return Array.from(container.querySelectorAll('input[id^="seed-word-"]'));
}

// Fire a paste event on the target input carrying `text` via a stubbed
// clipboardData; also record preventDefault calls.
function firePaste(input, text) {
  let prevented = false;
  const evt = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(evt, 'clipboardData', {
    value: { getData: (type) => (type === 'text/plain' || type === 'text' ? text : '') },
  });
  const originalPreventDefault = evt.preventDefault.bind(evt);
  evt.preventDefault = () => { prevented = true; originalPreventDefault(); };
  input.dispatchEvent(evt);
  return { prevented };
}

const TWELVE = Array.from({ length: 12 }, (_, i) => `word${i + 1}`).join(' ');
const TWENTYFOUR = Array.from({ length: 24 }, (_, i) => `word${i + 1}`).join(' ');
const EIGHT = Array.from({ length: 8 }, (_, i) => `w${i + 1}`).join(' ');
const THIRTEEN = Array.from({ length: 13 }, (_, i) => `t${i + 1}`).join(' ');

describe('SeedInputGrid — fail-closed paste-split (Slice I)', () => {
  it('(a) 12 words pasted into box 0 at count 12 → all 12 boxes filled, no error', () => {
    const { container } = render(<SeedInputGrid onSubmit={() => {}} wordCount={12} />);
    const inputs = boxes(container);
    expect(inputs.length).toBe(12);
    firePaste(inputs[0], TWELVE);
    const filled = boxes(container).map((el) => el.value);
    expect(filled).toEqual(Array.from({ length: 12 }, (_, i) => `word${i + 1}`));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('(b) 24 words pasted into box 0 at count 12 → grid auto-resizes to 24, all 24 filled', () => {
    const { container } = render(<SeedInputGrid onSubmit={() => {}} wordCount={12} />);
    firePaste(boxes(container)[0], TWENTYFOUR);
    const filled = boxes(container).map((el) => el.value);
    expect(filled.length).toBe(24);
    expect(filled).toEqual(Array.from({ length: 24 }, (_, i) => `word${i + 1}`));
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('(c) 24 words pasted into box 5 at count 12 → FAIL CLOSED: no boxes modified, error set, grid stays at 12', () => {
    const { container } = render(<SeedInputGrid onSubmit={() => {}} wordCount={12} />);
    const before = boxes(container).map((el) => el.value);
    firePaste(boxes(container)[5], TWENTYFOUR);
    const after = boxes(container);
    expect(after.length).toBe(12);
    expect(after.map((el) => el.value)).toEqual(before);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('(d) 8 words pasted into box 3 at count 12 → boxes 3..10 filled, 0-2 and 11 untouched, no error', () => {
    const { container } = render(<SeedInputGrid onSubmit={() => {}} wordCount={12} />);
    firePaste(boxes(container)[3], EIGHT);
    const filled = boxes(container).map((el) => el.value);
    expect(filled[0]).toBe('');
    expect(filled[1]).toBe('');
    expect(filled[2]).toBe('');
    for (let i = 0; i < 8; i++) expect(filled[3 + i]).toBe(`w${i + 1}`);
    expect(filled[11]).toBe('');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('(e) 13 tokens (unsupported length) pasted into box 0 → FAIL CLOSED, no fill, error set', () => {
    const { container } = render(<SeedInputGrid onSubmit={() => {}} wordCount={12} />);
    const before = boxes(container).map((el) => el.value);
    firePaste(boxes(container)[0], THIRTEEN);
    const after = boxes(container).map((el) => el.value);
    expect(after).toEqual(before);
    expect(screen.getByRole('alert')).toBeTruthy();
  });

  it('paste event has preventDefault called', () => {
    const { container } = render(<SeedInputGrid onSubmit={() => {}} wordCount={12} />);
    const { prevented } = firePaste(boxes(container)[0], TWELVE);
    expect(prevented).toBe(true);
  });

  it('grep-guard — SeedInputGrid source does NOT leak per-word / checksum vocabulary in the paste path (no oracle)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(resolve(here, '..', 'SeedInputGrid.jsx'), 'utf8');
    // Scoped to any error-message strings; the no-oracle invariant forbids
    // "word N invalid" or "checksum" language surfacing to the user.
    expect(src).not.toMatch(/word\s+\d+.*invalid|checksum/i);
  });
});
