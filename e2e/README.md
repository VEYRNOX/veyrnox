# Playwright E2E Tests

End-to-end tests for the Veyrnox wallet using Playwright.

## Setup

Playwright is already installed as a dev dependency. On first run, install browsers:

```bash
npx playwright install
```

## Running Tests

### Run all automated tests
```bash
npm run test:e2e
```

This runs the **automated** suite only. Two supervised harnesses are excluded by
`testIgnore` in `playwright.config.ts` because they cannot run unattended:

- `send-broadcast.harness-b.spec.js` — human-in-the-loop broadcast harness
  (blocks up to 20 min per human step; in CI it just burns the job timeout).
- `webauthn-prf-tier2-send.spec.js` — UAT harness needing `.env.local` with
  `VITE_DEV_UNGATE_SEND=1` and a funded testnet wallet.

To run them (headed, supervised — see each file's header for full instructions):

```bash
RUN_SUPERVISED_E2E=1 npx playwright test e2e/send-broadcast.harness-b.spec.js --headed --workers=1
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
