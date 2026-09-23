// Sidebar header overflow — the desktop/iPad aside.
//
// Found on an iPad Air 11-inch during 1.0.2 QA: the Veyrnox wordmark had a
// notification bell drawn on top of it, and with the sidebar collapsed the "?"
// and expand chevron escaped the aside altogether and floated over the page,
// covering the "Back" control.
//
// Cause: #2702 correctly raised the three header controls to 44x44 CSS px for
// RSP-03 tap targets, but they stayed on ONE row with the logo and wordmark:
//
//   md:w-60  = 240px, minus px-4 either side       => 208px usable
//   34 (logo) + 3 x 44 (buttons) + 4 x 12 (gap-3)  => 214px fixed
//
// The wordmark block is `flex-1 min-w-0`, so it absorbed the deficit by
// collapsing to zero width and the buttons painted over it. Collapsed
// (md:w-16 = 64px, 32px usable) a single 44px button already overflows.
//
// jsdom has no layout engine, so it cannot measure the overlap. These are
// structural pins on the arrangement that makes the overflow impossible:
// the controls must live in their own row, and the 44px targets must survive.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../../..');
const layout = readFileSync(resolve(root, 'src/components/Layout.jsx'), 'utf8');

// Scope every assertion to the desktop aside's header, so a match in the mobile
// header (~line 605+) can never satisfy a pin meant for the sidebar.
function sidebarHeader() {
  const asideIdx = layout.indexOf('md:w-16');
  expect(asideIdx).toBeGreaterThan(-1);
  const searchIdx = layout.indexOf('nav.sidebar_collapse', asideIdx);
  expect(searchIdx).toBeGreaterThan(asideIdx);
  return layout.slice(asideIdx, searchIdx);
}

describe('sidebar header — brand and controls cannot share a row', () => {
  it('header is a column, not a single flex row', () => {
    const header = sidebarHeader();
    expect(header).toContain('flex flex-col gap-2 py-4');
  });

  it('the brand row contains the wordmark but NOT the header controls', () => {
    const header = sidebarHeader();
    const brandIdx = header.indexOf('VeyrnoxWordmark');
    const bellIdx = header.indexOf('NotificationBell');
    expect(brandIdx).toBeGreaterThan(-1);
    expect(bellIdx).toBeGreaterThan(-1);
    // The wordmark's own row must be closed before the controls row opens.
    const between = header.slice(brandIdx, bellIdx);
    expect(between).toContain('</div>');
    // And the controls row must be its own flex container.
    expect(between).toMatch(/flex items-center gap-1/);
  });

  it('collapsed sidebar drops to px-2 so a 44px control fits inside 64px', () => {
    // md:w-16 is 64px. px-4 either side leaves 32px, which is narrower than the
    // 44px target itself — that is how the controls escaped the aside.
    const header = sidebarHeader();
    expect(header).toMatch(/collapsed \? 'px-2' : 'px-4'/);
  });

  it('keeps the RSP-03 44px tap targets (the a11y fix is not traded away)', () => {
    const header = sidebarHeader();
    const targets = header.match(/min-h-\[44px\] min-w-\[44px\]/g) || [];
    expect(targets.length).toBeGreaterThanOrEqual(3);
  });
});
