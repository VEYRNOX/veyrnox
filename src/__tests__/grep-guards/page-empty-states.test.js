// Grep-guard: no page under src/pages hand-builds an empty state (#2608).
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
// This started as a ratchet against an exact count while #2608 ran in two
// passes — five pages, then seven. It is a hard zero now, with exactly two
// named exemptions, each for a reason that is about MEANING rather than effort.
//
// Scoping matters more than the pattern here. An earlier cut matched "No ..."
// anywhere in a page and flagged TermsLegal's "No private keys or seed
// phrases", PanicWipe's "no confirmation" and WalletAccessReset's "No password
// reset here" — legal and safety PROSE, which would have made every edit to
// those pages fail a test about empty states. Requiring `text-center` in the
// preceding markup is what separates an empty-state block from a sentence.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const PAGES = join(process.cwd(), 'src/pages');

// Deliberately NOT migrated, owner-agreed 2026-09-19. Keyed by file with an
// EXACT expected count, not by filename alone: an exemption that says "this
// file is fine" would blanket-excuse the next hand-built state added to it.
// A second one in either file still fails.
const EXEMPT = {
  // A post-scan ALL-CLEAR, not an empty state: green CheckCircle, "Nothing
  // found", shown after a scan that ran and found nothing. EmptyState's muted
  // inbox styling would restyle a positive security result into "nothing here
  // yet", which is a different claim.
  'FraudDetection.jsx': 1,
  // A one-line placeholder inside the small "Asset Allocation" card.
  // EmptyState is an 80px illustration plus stacked copy — the wrong weight
  // inside a chart card.
  'Analytics.jsx': 1,
};

// An empty-state sentence: "No <something>" / "Nothing <something>" as the
// entire text of an element.
const EMPTY_COPY = /> *(No [a-z][a-z ]{2,40}|Nothing [a-z ]{2,30})[.…!]? *</gi;

// Note there is no "skip files that already import EmptyState" shortcut. The
// first version of this guard had one, and it meant a page became invisible to
// the check the moment it adopted the primitive anywhere — so a page could
// migrate one empty state and hand-build the next three unnoticed.
function handBuilt() {
  const out = {};
  for (const name of readdirSync(PAGES).filter((f) => f.endsWith('.jsx'))) {
    const src = readFileSync(join(PAGES, name), 'utf8');
    const hits = [...src.matchAll(EMPTY_COPY)]
      // Only inside a centred block — see the scoping note above.
      .filter((m) => src.slice(Math.max(0, m.index - 400), m.index).includes('text-center'));
    if (hits.length) out[name] = hits.length;
  }
  return out;
}

describe('Empty states — shared primitives (#2608)', () => {
  const found = handBuilt();

  it('no page hand-builds an empty state, except the two named exemptions', () => {
    const unexpected = Object.entries(found)
      .filter(([name, n]) => (EXEMPT[name] ?? 0) !== n)
      .map(([name, n]) => `${name}: ${n} (expected ${EXEMPT[name] ?? 0})`);
    expect(
      unexpected,
      'a hand-built empty state appeared, or an exempt file gained a second one. '
      + 'Use EmptyState or PageState with copy specific to that page — the '
      + 'primitive carries the accessibility contract, and a bare <p> announces '
      + 'nothing to a screen reader. If the block is genuinely not an empty '
      + 'state (a post-scan all-clear, a one-line placeholder inside a small '
      + 'card), add it to EXEMPT with the reason.',
    ).toEqual([]);
  });

  it('the exempt blocks still exist — a stale exemption is a hole', () => {
    // If one of these is migrated or deleted later, this fails and the entry
    // has to go. An exemption nobody revisits is how a guard rots.
    const missing = Object.keys(EXEMPT).filter((name) => !found[name]);
    expect(
      missing,
      'an exempt file no longer contains the hand-built block its exemption '
      + 'covers. Remove the EXEMPT entry.',
    ).toEqual([]);
  });
});
