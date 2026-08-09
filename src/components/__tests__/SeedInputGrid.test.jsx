// SeedInputGrid — per-word seed entry grid.
//
// Security-critical invariant (I4, fail honest): NO ORACLE. The component must NOT
// reveal which word(s) are wrong on a failed import. Errors surface only as the
// verbatim string returned by the caller's onSubmit rejection — never as per-word
// highlighting, aria-invalid flags, "checksum" language, or "word N" pointers.
// A coercer with camera access must learn nothing from the UI beyond "phrase invalid".
//
// Plan: docs/superpowers/plans/2026-08-09-seed-input-grid-component.md

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react';
import SeedInputGrid from '@/components/SeedInputGrid';

function getWordInputs(container) {
  return Array.from(container.querySelectorAll('input[data-word-index]'));
}

function fillWords(container, words) {
  const inputs = getWordInputs(container);
  words.forEach((w, i) => {
    fireEvent.change(inputs[i], { target: { value: w } });
  });
  return inputs;
}

describe('SeedInputGrid', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders 12 inputs by default, switches to 24 via word-count selector', () => {
    const onSubmit = vi.fn();
    const { container, rerender } = render(<SeedInputGrid onSubmit={onSubmit} />);
    expect(getWordInputs(container).length).toBe(12);

    // Explicit prop = 12
    rerender(<SeedInputGrid onSubmit={onSubmit} wordCount={12} />);
    expect(getWordInputs(container).length).toBe(12);

    // Switch to 24
    rerender(<SeedInputGrid onSubmit={onSubmit} wordCount={24} />);
    expect(getWordInputs(container).length).toBe(24);
  });

  it('submit concatenates words with single space, no leading/trailing', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<SeedInputGrid onSubmit={onSubmit} wordCount={12} />);
    const words = Array.from({ length: 12 }, (_, i) => `word${i + 1}`);
    fillWords(container, words);

    const btn = screen.getByRole('button', { name: /import wallet/i });
    fireEvent.click(btn);

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith(words.join(' '));
  });

  it('submit is disabled when any box is empty', () => {
    const onSubmit = vi.fn();
    const { container } = render(<SeedInputGrid onSubmit={onSubmit} wordCount={12} />);
    const btn = screen.getByRole('button', { name: /import wallet/i });
    expect(btn).toBeDisabled();

    // Fill 11 of 12
    const inputs = getWordInputs(container);
    for (let i = 0; i < 11; i++) {
      fireEvent.change(inputs[i], { target: { value: `w${i}` } });
    }
    expect(btn).toBeDisabled();

    // Fill last one
    fireEvent.change(inputs[11], { target: { value: 'w11' } });
    expect(btn).not.toBeDisabled();

    // Blank one back out
    fireEvent.change(inputs[3], { target: { value: '' } });
    expect(btn).toBeDisabled();
  });

  it('no-oracle: error text shows verbatim, no per-word/position/checksum hints', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Invalid recovery phrase'));
    const { container } = render(<SeedInputGrid onSubmit={onSubmit} wordCount={12} />);
    const words = Array.from({ length: 12 }, (_, i) => `word${i + 1}`);
    const inputs = fillWords(container, words);

    fireEvent.click(screen.getByRole('button', { name: /import wallet/i }));

    await screen.findByText('Invalid recovery phrase');

    // No per-word error indicators.
    for (const inp of inputs) {
      expect(inp.getAttribute('aria-invalid')).not.toBe('true');
      expect(inp.hasAttribute('data-invalid')).toBe(false);
      const cls = (inp.getAttribute('class') || '').toLowerCase();
      expect(cls).not.toMatch(/error|invalid|red/);
    }

    // No language that would point at which word / that a checksum was checked.
    const text = container.textContent || '';
    expect(text).not.toMatch(/word \d/i);
    expect(text).not.toMatch(/position/i);
    expect(text).not.toMatch(/checksum/i);
  });

  it('trims whitespace per word before concatenation', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const { container } = render(<SeedInputGrid onSubmit={onSubmit} wordCount={12} />);
    const inputs = getWordInputs(container);
    fireEvent.change(inputs[0], { target: { value: ' abandon ' } });
    for (let i = 1; i < 12; i++) {
      fireEvent.change(inputs[i], { target: { value: `w${i}` } });
    }

    fireEvent.click(screen.getByRole('button', { name: /import wallet/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));

    const submitted = onSubmit.mock.calls[0][0];
    expect(submitted.startsWith('abandon ')).toBe(true);
    expect(submitted).not.toMatch(/ {2}/);
    expect(submitted).not.toMatch(/^\s|\s$/);
    // Explicit: the trimmed word appears with no surrounding spaces.
    expect(submitted.split(' ')[0]).toBe('abandon');
  });

  it('never writes to localStorage across full interaction (fill/switch/submit/error)', async () => {
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    const onSubmit = vi.fn().mockRejectedValue(new Error('Invalid recovery phrase'));
    const { container, rerender } = render(<SeedInputGrid onSubmit={onSubmit} wordCount={12} />);

    // Fill 12
    fillWords(container, Array.from({ length: 12 }, (_, i) => `word${i + 1}`));

    // Switch word count (drives re-render / any internal state churn)
    rerender(<SeedInputGrid onSubmit={onSubmit} wordCount={24} />);

    // Fill remaining 12 on the 24-grid
    const inputs24 = getWordInputs(container);
    for (let i = 0; i < 24; i++) {
      fireEvent.change(inputs24[i], { target: { value: `w${i}` } });
    }

    // Submit -> triggers error path
    fireEvent.click(screen.getByRole('button', { name: /import wallet/i }));
    await screen.findByText('Invalid recovery phrase');

    expect(setItemSpy).not.toHaveBeenCalled();
  });
});
