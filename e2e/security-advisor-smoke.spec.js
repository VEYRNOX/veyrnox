import { test, expect } from '@playwright/test';

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const VAULT_PIN = '48273951';
const SEEDED_BLOCKED_ADDRESS = '0x8589427373D6D84E98730D7795D8f6f8731FDA16';

async function freshLocalBuild(page) {
  await page.goto(`${BASE}/?demo=0`);
  await page.evaluate(async () => {
    try {
      localStorage.clear();
      localStorage.setItem('veyrnox-telemetry-consent', 'granted');
    } catch {}
    try {
      for (const db of await indexedDB.databases?.() || []) {
        if (db?.name) indexedDB.deleteDatabase(db.name);
      }
    } catch {}
  });
  await page.goto(`${BASE}/?demo=0`);
}

async function enterPin(page, pin) {
  const pad = page.getByRole('group', { name: /PIN entry/i });
  for (const digit of pin) {
    await pad.getByRole('button', { name: digit, exact: true }).click();
  }
  await pad.getByRole('button', { name: 'Submit PIN' }).click();
}

async function createWallet(page) {
  await page.getByRole('button', { name: /new wallet/i }).click();
  await expect(page.getByText('Choose an 8-digit PIN')).toBeVisible();
  await enterPin(page, VAULT_PIN);
  await expect(page.getByText('Confirm your PIN')).toBeVisible();
  await enterPin(page, VAULT_PIN);

  const consentDeny = page.getByRole('button', { name: 'No thanks' });
  const dismissCreatedFlash = page.getByRole('button', {
    name: 'Skip for now — take me to my wallet',
  });
  const dismissReceiveCard = page.getByRole('button', { name: "You're set" });
  const sendLink = page.getByRole('link', { name: 'Send', exact: true });

  await expect(
    consentDeny.or(dismissCreatedFlash).or(dismissReceiveCard).or(sendLink).first(),
  ).toBeVisible({ timeout: 30000 });

  if (await consentDeny.isVisible()) {
    await consentDeny.click();
    await expect(
      dismissCreatedFlash.or(dismissReceiveCard).or(sendLink).first(),
    ).toBeVisible({ timeout: 30000 });
  }

  if (await dismissCreatedFlash.isVisible()) {
    await dismissCreatedFlash.click();
  } else if (await dismissReceiveCard.isVisible()) {
    await dismissReceiveCard.click();
  }

  await expect(sendLink).toBeVisible({ timeout: 30000 });
}

async function openAdvisor(page) {
  await page.getByLabel(/open vigil/i).click();
  await expect(page.getByPlaceholder('Ask Vigil anything...')).toBeVisible();
}

async function denyAdvisorConsentIfPrompted(page) {
  const deny = page.getByTestId('advisor-consent-deny');
  if (await deny.isVisible().catch(() => false)) {
    await deny.click();
    await expect(page.getByTestId('advisor-remote-consent')).toHaveCount(0);
  }
}

async function askAdvisor(page, text) {
  const box = page.getByPlaceholder('Ask Vigil anything...');
  await box.fill(text);
  await page.getByLabel('Send message').click();
}

test.describe('AI Security Advisor smoke', () => {
  test('local answer and seeded blocked address work without human interaction', async ({ page }) => {
    await freshLocalBuild(page);
    await createWallet(page);
    await openAdvisor(page);
    await denyAdvisorConsentIfPrompted(page);

    await askAdvisor(page, 'what is deniability mode?');
    await expect(page.getByText(/coercion/i)).toBeVisible({ timeout: 15000 });

    await askAdvisor(page, `Is ${SEEDED_BLOCKED_ADDRESS} safe?`);
    const verdict = page.getByTestId('tip-screening-verdict');
    await expect(verdict).toBeVisible({ timeout: 15000 });
    await expect(verdict).toContainText('BLOCKED');
    await expect(verdict).toContainText('Sanctions match detected');
  });

  test('composer stays visible while scrolling older Vigil messages on a small mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await freshLocalBuild(page);
    await createWallet(page);
    await openAdvisor(page);
    await denyAdvisorConsentIfPrompted(page);

    for (let i = 0; i < 6; i += 1) {
      await askAdvisor(page, 'what is deniability mode?');
      await expect(page.getByText(/coercion/i).last()).toBeVisible({ timeout: 15000 });
    }

    const messages = page.locator('[data-vaul-drawer-direction="bottom"] .overflow-y-auto').first();
    const composer = page.getByPlaceholder('Ask Vigil anything...');

    await messages.evaluate((node) => {
      node.scrollTop = 0;
    });

    await expect(composer).toBeVisible();
  });
});
