# Playwright E2E Tests

End-to-end tests for the Veyrnox wallet using Playwright.

## Setup

Playwright is already installed as a dev dependency. On first run, install browsers:

```bash
npx playwright install
```

## Running Tests

### Run all tests
```bash
npm run test:e2e
```

### Run with UI mode (interactive)
```bash
npm run test:e2e:ui
```

### Debug mode
```bash
npm run test:e2e:debug
```

### Run specific test file
```bash
npx playwright test e2e/example.spec.ts
```

## Configuration

- **Config file:** `playwright.config.ts` (project root)
- **Base URL:** `http://localhost:5173` (dev server)
- **Browser:** Chromium (can be extended to Firefox, Safari)
- **Screenshots:** Captured on failure
- **Traces:** Recorded on retry

## Writing Tests

Example test structure:
```typescript
import { test, expect } from '@playwright/test';

test('should load the wallet', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/Veyrnox/);
});
```

## Tips

1. **Dev server must be running** — Tests connect to `localhost:5173`
2. **No authentication mocking yet** — Add auth setup in `e2e/fixtures` if needed
3. **Slow tests** — Adjust timeouts in `playwright.config.ts` if needed
4. **Screenshots/videos** — Found in `playwright-report/` after running tests

## Resources

- [Playwright Docs](https://playwright.dev)
- [Best Practices](https://playwright.dev/docs/best-practices)
