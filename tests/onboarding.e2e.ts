import { test } from '@e2e-dev/web';
import { expect } from 'e2e';

// Read-only, no model: nothing is clicked, and no PIN, seed, or signing is entered.
// /?demo=0 clears demo mode so the real screen renders.
// A fresh browser context has no stored wallet, so onboarding shows.
test('onboarding offers every way to get a wallet', async ({ app, screen }) => {
  await app.open('/?demo=0');
  await expect(screen.getByRole('button', 'New wallet')).toBeVisible();
  await expect(screen.getByRole('button', 'Have a wallet')).toBeVisible();
  await expect(screen.getByRole('button', 'File backup')).toBeVisible();
  await expect(screen.getByRole('button', 'Recovery Shares')).toBeVisible();
});
