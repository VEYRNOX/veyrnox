// Back-button chip refactor (Slice G+H plan §4).
//
// WalletEntry has 5 back buttons using `text-xs text-muted-foreground` +
// inline ArrowLeft. Plan extracts a <BackButton> local component, tags each
// call site with data-testid="back-button", and swaps to the chip class:
//   inline-flex items-center gap-1.5 rounded-full border border-white/10 ...
//   px-3 py-1.5 text-sm font-medium ... (no `text-xs`).
//
// Source-level assertion — mounting all 5 views takes the full vault/KEK/
// router tree.
//
// RED phase: the current back buttons carry NO testid and still use
// `text-xs text-muted-foreground`.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = readFileSync(join(process.cwd(), 'src/components/WalletEntry.jsx'), 'utf8');

describe('WalletEntry — back buttons are chip-styled BackButton instances', () => {
  it('has exactly 5 back-button testids', () => {
    const hits = SRC.match(/data-testid=["']back-button["']/g) ?? [];
    expect(hits.length).toBe(5);
  });

  it('each back-button chip carries `rounded-full` and `border`, and NOT `text-xs`', () => {
    // Locate each data-testid="back-button" and pull ~300 chars of surrounding
    // JSX to inspect className.
    const re = /data-testid=["']back-button["']/g;
    let m;
    let sites = 0;
    while ((m = re.exec(SRC)) !== null) {
      sites += 1;
      const start = Math.max(0, m.index - 300);
      const end = Math.min(SRC.length, m.index + 300);
      const jsx = SRC.slice(start, end);
      expect(jsx).toMatch(/rounded-full/);
      expect(jsx).toMatch(/border/);
      expect(jsx).not.toMatch(/text-xs\b/);
    }
    expect(sites).toBe(5);
  });
});
