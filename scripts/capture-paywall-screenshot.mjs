// One-off helper: capture the /plans Safety Plus paywall as a PNG for the
// App Store Connect subscription "Review Information" screenshot.
// Requires the dev server running (npm run dev / preview on :5199).
//
// The window/document/PopStateEvent references below live inside Playwright
// page.evaluate() callbacks, which execute in the browser context — declare
// them as globals so the Node-env ESLint pass does not flag no-undef.
/* global window, document, PopStateEvent */
import { chromium } from 'playwright';

const URL = process.env.CAP_URL || 'http://localhost:5199';
const OUT = process.env.CAP_OUT || 'safety-plus-paywall.png';

const W = Number(process.env.CAP_W || 820);
const H = Number(process.env.CAP_H || 1180);
const DSF = Number(process.env.CAP_DSF || 2);

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: DSF });

// Boot with demo so a wallet exists, then SPA-navigate to /plans (a hard load
// cold-boots WalletGate back to "/").
await page.goto(`${URL}/?demo=1`, { waitUntil: 'networkidle' });
await page.evaluate(() => localStorage.setItem('veyrnox-demo', '1'));
await page.goto(`${URL}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.evaluate(() => {
  window.history.pushState({}, '', '/plans');
  window.dispatchEvent(new PopStateEvent('popstate'));
});
await page.waitForFunction(() => /\$5\.99\/mo/.test(document.body.innerText), { timeout: 8000 });

// Remove the demo banner for a cleaner review image.
await page.evaluate(() => {
  const node = [...document.querySelectorAll('*')].find(
    (e) => e.children.length === 0 && /Demo — simulated balances/.test(e.textContent || '')
  );
  node?.closest('div')?.remove();
});
await page.waitForTimeout(300);

// Scroll the Safety Plus heading near the top so the offering + price + lead
// features fill one clean viewport (better than a 4500px full-page capture).
await page.evaluate(() => {
  const h = [...document.querySelectorAll('h1,h2,h3,p,span,div')].find(
    (e) => e.offsetParent && /^Safety Plus/.test((e.textContent || '').trim()) && e.textContent.length < 40
  );
  if (h) { h.scrollIntoView({ block: 'start' }); window.scrollBy(0, -24); }
});
await page.waitForTimeout(300);

// Non-fullPage → the image is exactly the viewport size (W x H at DSF=1).
await page.screenshot({ path: OUT, fullPage: false });
await browser.close();
console.log(`saved ${OUT} (${W}x${H} @${DSF}x)`);
