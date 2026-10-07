import type { E2EConfig } from 'e2e';
import { web } from '@e2e-dev/web';

// No model configured: tests use locators only, no agent.act / agent.assert.
// To add agent steps later, install a provider and set agents.default.model.
export default {
  targets: [{
    engine: web(),
    app: {
      url: process.env.APP_URL ?? 'http://localhost:3000',
      // Or let the runner start the dev server:
      // command: { executable: 'npm', args: ['run', 'dev'] },
    },
  }],
} satisfies E2EConfig;
