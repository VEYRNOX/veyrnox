// Grep-guard: hand-built empty states in src/pages may not multiply (#2608).
//
// Four shared primitives exist — EmptyState, PageState, Spinner,
// EmptyWalletState — and were adopted by one or two pages each while 78 pages
// hand-rolled their own. Spinner.jsx's own header says it was built for exactly
// this reason. The primitive shipped; the migration did not.
//
// The cost is not only visual. A hand-rolled `<p>No alerts</p>` announces
// nothing to a screen reader, while EmptyState and PageState carry the
// accessibility contract (and PageState's error branch carries role="alert").
//
// This guard deliberately does NOT try to force a sweep. #2608 argues against a
// codemod, and it is right: an empty state's whole value is its specific
// sentence, and a generated "No data." on 70 pages is worse than what is there.
// So the rule is a ratchet — the number may fall, never rise — plus a hard zero
// on the pages migrated in #2608.
//
// Scoping matters more than the pattern here. An earlier cut of this matched
// "No ..." anywhere in a page and flagged TermsLegal's "No private keys or seed
// phrases", PanicWipe's "no confirmation" and WalletAccessReset's "No password
// reset here" — legal and safety PROSE, which would have made every edit to
// those pages fail a test about empty states. Requiring `text-center` in the
// preceding markup is what separates an empty-state block from a sentence.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = join(process.cwd(), 'src/pages');

// Migrated in #2608. These must keep using the primitive.
const MIGRATED = [
  'WatchWallets.jsx',
  'NFTPortfolio.jsx',
  'BudgetLimits.jsx',
  'RecurringPayments.jsx',
  'SavingsGoals.jsx',
];

// An empty-state sentence: "No <something>" / "Nothing <something>" as the
// entire text of an element.
const EMPTY_COPY = /> *(No [a-z][a-z ]{2,40}|Nothing [a-z ]{2,30})[.…!]? *</gi;

// Hand-built count at the end of #2608's first pass. Lower it when you migrate
// a page; never raise it. Exact, not "at most": slack lets the number drift
// down and back up unnoticed, which is how a ratchet stops ratcheting.
const HAND_BUILT_BUDGET = 9;

function handBuilt() {
  const out = [];
  for (const name of readdirSync(PAGES).filter((f) => f.endsWith('.jsx'))) {
    const src = readFileSync(join(PAGES, name), 'utf8');
    if (src.includes('EmptyState') || src.includes('PageState')) continue;
    const hits = [...src.matchAll(EMPTY_COPY)]
      // Only inside a centred block — see the scoping note above.
      .filter((m) => src.slice(Math.max(0, m.index - 400), m.index).includes('text-center'));
    if (hits.length) out.push([name, hits.length]);
  }
  return out;
}

describe('Empty states — shared primitives (#2608)', () => {
  it('the pages migrated in #2608 still use EmptyState', () => {
    const regressed = MIGRATED.filter(
      (name) => !readFileSync(join(PAGES, name), 'utf8').includes('EmptyState'),
    );
    expect(
      regressed,
      'a page migrated to EmptyState in #2608 has gone back to a hand-built '
      + 'empty block. The primitive carries the accessibility contract and the '
      + 'visual language; a bare <p> announces nothing to a screen reader.',
    ).toEqual([]);
  });

  it(`hand-built empty states stay at exactly ${HAND_BUILT_BUDGET} and do not grow`, () => {
    const found = handBuilt();
    const total = found.reduce((n, [, hits]) => n + hits, 0);
    expect(
      total,
      total > HAND_BUILT_BUDGET
        ? `a new hand-built empty state appeared (${found.map(([f, n]) => `${f}:${n}`).join(', ')}). `
          + 'New pages use EmptyState or PageState, with copy specific to that page.'
        : `hand-built empty states fell to ${total} — good. Lower HAND_BUILT_BUDGET `
          + 'in this file to match, in the same commit that migrated them.',
    ).toBe(HAND_BUILT_BUDGET);
  });
});
