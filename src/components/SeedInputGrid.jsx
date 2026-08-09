// SeedInputGrid — per-word seed entry grid.
//
// Security-critical invariant (I4, fail honest): NO ORACLE. This component must NOT
// reveal which word(s) are wrong on a failed import. Errors surface only as the
// verbatim string returned by the caller's onSubmit rejection — never as per-word
// highlighting, aria-invalid flags, "checksum" language, or "word N" pointers.
//
// Plan: docs/superpowers/plans/2026-08-09-seed-input-grid-component.md
//
// Isolation: presentation only. No wallet-core imports, no localStorage.

import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';

const WORD_COUNTS = [12, 15, 18, 21, 24];

export default function SeedInputGrid({
  onSubmit,
  wordCount = 12,
  disabled = false,
  submitLabel = 'Import wallet',
}) {
  const [count, setCount] = useState(wordCount);
  const [words, setWords] = useState(() => Array(wordCount).fill(''));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Keep the box count in sync with the wordCount prop / selector, preserving
  // already-entered words up to the new length.
  useEffect(() => {
    setCount(wordCount);
    setWords((prev) => {
      const next = Array(wordCount).fill('');
      for (let i = 0; i < Math.min(prev.length, wordCount); i++) next[i] = prev[i];
      return next;
    });
  }, [wordCount]);

  const allFilled = words.every((w) => w.trim().length > 0);
  const canSubmit = allFilled && !disabled && !submitting;

  const handleWordChange = (index, value) => {
    setWords((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  };

  const handleCountChange = (n) => {
    setCount(n);
    setWords((prev) => {
      const next = Array(n).fill('');
      for (let i = 0; i < Math.min(prev.length, n); i++) next[i] = prev[i];
      return next;
    });
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setError('');
    setSubmitting(true);
    try {
      const mnemonic = words.map((w) => w.trim()).join(' ');
      await onSubmit(mnemonic);
    } catch (err) {
      setError(err?.message || 'Import failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="p-4 rounded-2xl border border-border bg-card space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Recovery Phrase
        </p>
        <div className="flex gap-1">
          {WORD_COUNTS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => handleCountChange(n)}
              aria-pressed={count === n}
              disabled={disabled}
              className={`min-h-[32px] px-2 rounded-md text-xs font-medium transition-colors ${
                count === n
                  ? 'bg-primary/15 text-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-secondary/40 ps-1.5 pe-1"
          >
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-primary/15 text-[10px] font-semibold text-primary mono-value">
              {i + 1}
            </span>
            <Input
              id={`seed-word-${i}`}
              data-word-index={i}
              aria-label={`Recovery phrase entry ${i + 1}`}
              value={words[i] || ''}
              onChange={(e) => handleWordChange(i, e.target.value)}
              disabled={disabled}
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="mono-value h-7 border-0 bg-transparent px-1 py-0 shadow-none text-xs focus-visible:ring-0"
            />
          </div>
        ))}
      </div>

      {error ? (
        <Alert variant="destructive" role="alert">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <Button type="button" onClick={handleSubmit} disabled={!canSubmit} className="w-full">
        {submitting ? 'Importing…' : submitLabel}
      </Button>
    </div>
  );
}
