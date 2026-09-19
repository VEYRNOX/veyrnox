// e2e/boot-watchdog.spec.js — the four cases #2628 step 7 asks for, plus one
// regression pin for the trap that nearly shipped inside the fix itself.
//
// Every case drives the REAL index.html served by the dev server, with its real
// <meta> CSP and the real public/boot-watchdog.js. Only the app entry module is
// substituted, via route interception — so the thing under test is the shipped
// watchdog, not a copy of it.
//
// Do NOT rewrite these around fixed wall-clock sleeps. The watchdog is driven by
// setTimeout, and a browser tab that is hidden or backgrounded throttles timers
// heavily — during development of this fix a hidden pane made the 5s deadline
// land past 8s of wall clock and produced two confident, entirely wrong readings
// (a pass reported as a failure, and a failure reported as a pass). Playwright's
// web-first assertions poll, which is what makes them immune to that; a
// waitForTimeout is not.
import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const ENTRY = '**/src/main.jsx';

// The watchdog's own deadline is 5s. Give assertions generous headroom: these
// numbers exist to absorb CI scheduling, not to pin the watchdog's timing.
const APPEARS = 20_000;
const CLEARS = 20_000;

const fallback = (page) => page.locator('#veyrnox-boot-fallback');

// index.html ships a static #boot-shell inside #root (#2628) that paints before
// any JavaScript. It means #root is NEVER empty at boot, so assertions about
// what the APP rendered must exclude it — "#root has children" would otherwise
// be true from the first frame and prove nothing. appContent() is that scoping;
// reach for it instead of #root's own children in any new case.
const appContent = (page) => page.locator('#root > *:not(#boot-shell)');

/** Replace the app entry with a plain classic script body. */
async function serveEntry(page, body) {
  await page.route(ENTRY, (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body }),
  );
}

test.describe('boot watchdog', () => {
  test('case 1 — main bundle never loads: fallback appears', async ({ page }) => {
    await page.route(ENTRY, (route) => route.abort());
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    await expect(fallback(page)).toBeVisible({ timeout: APPEARS });
    await expect(page.getByRole('button', { name: /reload veyrnox/i })).toBeVisible();
  });

  test('case 2 — React mounts an empty tree: fallback appears', async ({ page }) => {
    // One bare <div>: a real firstChild occupying zero pixels. This is the
    // defect — the previous `root.firstChild` condition was satisfied by it
    // forever, so the fallback never appeared and the user sat on a blank page.
    await serveEntry(page, `
      document.getElementById('root').appendChild(document.createElement('div'));
    `);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    await expect(fallback(page)).toBeVisible({ timeout: APPEARS });

    // The mounted tree must survive. The fallback is an overlay on <body>
    // precisely so it cannot clobber a live React root — writing
    // root.innerHTML here would brick an app that was merely slow.
    // Scoped past #boot-shell: this counts what the entry mounted, not the
    // static shell that was already there.
    await expect(appContent(page)).toHaveCount(1);
  });

  test('case 3 — the real first screen paints: no card is left on screen', async ({ page }) => {
    // No interception: the actual app boots.
    //
    // #2628 step 7 words this case as "fallback never appears". This asserts the
    // END STATE — painted, and no card present — deliberately, and the weakening
    // is the point of this comment rather than an accident. A cold Vite dev
    // server on a loaded machine can legitimately take longer than the 5s
    // deadline to paint, at which point the card appears and then clears itself.
    // That is correct behaviour, not a regression, so a literal "never appears"
    // assertion here would fail on exactly the slow boot the self-heal exists to
    // protect. Case 4 carries the appear-then-clear proof; this case carries
    // "a healthy app does not end up looking broken".
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    // Was `expect('#root').not.toBeEmpty()`. The static shell satisfies that
    // from the first frame, so it would now pass without the app ever booting.
    // The shell's REMOVAL is the stronger signal and the one worth asserting:
    // react-dom clears #root on its first commit, so #boot-shell disappearing
    // means React actually committed.
    await expect(page.locator('#boot-shell')).toHaveCount(0, { timeout: 60_000 });
    await expect(appContent(page)).not.toHaveCount(0);
    await expect(fallback(page)).toHaveCount(0, { timeout: CLEARS });
  });

  test('case 4 — slow but valid startup: the card clears itself', async ({ page }) => {
    // Mounts immediately, paints only after the deadline has passed. The card
    // is allowed to appear; what must NOT happen is a legitimate slow boot
    // being permanently replaced by an error screen (#2628 step 5).
    await serveEntry(page, `
      var el = document.createElement('div');
      document.getElementById('root').appendChild(el);
      setTimeout(function () {
        el.style.cssText = 'width:100%;height:200px;background:#050608;color:#fff;';
        el.textContent = 'Veyrnox';
      }, 8000);
    `);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    await expect(fallback(page)).toBeVisible({ timeout: APPEARS });
    await expect(fallback(page)).toHaveCount(0, { timeout: CLEARS });
    await expect(page.locator('#root')).toContainText('Veyrnox');
  });

  test('case 5 — an empty #root that already has viewport height still trips', async ({ page }) => {
    // Regression pin for a trap inside the fix. src/index.css:277 sets
    // `#root { height: 100% }` below 767.98px, and in a production build that
    // CSS is a separate <link> applied before any JS runs — so on mobile an
    // EMPTY #root measures full viewport height. A paint check written against
    // #root's own box would report "painted" on a blank production phone
    // screen. The check must look at DESCENDANTS, never at #root itself.
    await page.setViewportSize({ width: 390, height: 844 });
    await serveEntry(page, `
      var s = document.createElement('style');
      s.textContent = 'html,body,#root{height:100%;margin:0}';
      document.head.appendChild(s);   // #root now measures full height, with no content
    `);
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const height = await page.locator('#root').evaluate((el) => el.getBoundingClientRect().height);
    expect(height, 'precondition: #root must measure non-zero with no content').toBeGreaterThan(0);
    // "No content" now means no APP content — the static shell is always there.
    await expect(appContent(page)).toHaveCount(0);

    await expect(fallback(page)).toBeVisible({ timeout: APPEARS });
  });

  test('case 6 — the boot shell alone is not paint', async ({ page }) => {
    // The shell is a position:fixed, inset:0 box INSIDE #root, so it satisfies
    // hasVisibleContent()'s width/height test on the very first tick. If it is
    // not skipped, the watchdog reports healthy before React has done anything
    // and never fires again — silently, with every other case here still green,
    // which is exactly the shape of #2595. This pin is the only thing standing
    // between the shell and that regression.
    await page.route(ENTRY, (route) => route.abort());
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });

    const shellH = await page
      .locator('#boot-shell')
      .evaluate((el) => el.getBoundingClientRect().height);
    expect(shellH, 'precondition: the shell must occupy real pixels').toBeGreaterThan(0);
    await expect(appContent(page)).toHaveCount(0);

    await expect(fallback(page)).toBeVisible({ timeout: APPEARS });
  });
});
