// Guards that must not regress:
//   1. Missing DSN => no init (fail-closed on unconfigured envs).
//   2. Consent denied => no init even with DSN set.
//   3. Deniability/demo session => no init even with DSN + consent.
//   4. reportError is a no-op until init has run.
//   5. Scrubber drops events whose exception message looks like a secret.
//   6. Deniability is re-checked at send time, not only at init time.
//   7. ErrorBoundary reporting is denied during deniability sessions.
//   8. event.extra is stripped so component stacks do not egress.
//
// We do not exercise Sentry.init's network behaviour — the point is that
// initSentry() must not CALL Sentry.init at all when a guard is missing.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('@sentry/react', () => ({
  init: vi.fn(),
  captureException: vi.fn(),
  globalHandlersIntegration: () => ({ name: 'GlobalHandlers' }),
  dedupeIntegration: () => ({ name: 'Dedupe' }),
  functionToStringIntegration: () => ({ name: 'FunctionToString' }),
}));

vi.mock('@/wallet-core/deniabilitySession', () => ({
  isDeniabilityOrDemoActive: vi.fn(() => false),
}));

vi.mock('@/api/demoClient', () => ({ DEMO: false }));

vi.mock('@/lib/consent', () => ({
  hasConsent: vi.fn(() => true),
}));

async function loadFresh() {
  vi.resetModules();
  return await import('../sentry.js');
}

async function withEnv(env, fn) {
  const original = { ...import.meta.env };
  Object.assign(import.meta.env, env);
  try { await fn(); }
  finally {
    for (const k of Object.keys(env)) delete import.meta.env[k];
    Object.assign(import.meta.env, original);
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('localStorage', {
    getItem: vi.fn(() => null),
  });
  return Promise.all([
    import('@/wallet-core/deniabilitySession').then((m) => {
      m.isDeniabilityOrDemoActive.mockReturnValue(false);
    }),
    import('@/lib/consent').then((m) => {
      m.hasConsent.mockReturnValue(true);
    }),
  ]);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('initSentry guards', () => {
  it('does nothing without a DSN', async () => {
    const Sentry = await import('@sentry/react');
    await withEnv({ VITE_SENTRY_DSN: '' }, async () => {
      const { initSentry } = await loadFresh();
      initSentry();
      expect(Sentry.init).not.toHaveBeenCalled();
    });
  });

  it('does nothing when consent is not granted', async () => {
    const Sentry = await import('@sentry/react');
    const consent = await import('@/lib/consent');
    consent.hasConsent.mockReturnValueOnce(false);
    await withEnv({ VITE_SENTRY_DSN: 'https://x@y/1' }, async () => {
      const { initSentry } = await loadFresh();
      initSentry();
      expect(Sentry.init).not.toHaveBeenCalled();
    });
  });

  it('does nothing in a deniability/demo session', async () => {
    const Sentry = await import('@sentry/react');
    const dsession = await import('@/wallet-core/deniabilitySession');
    dsession.isDeniabilityOrDemoActive.mockReturnValueOnce(true);
    await withEnv({ VITE_SENTRY_DSN: 'https://x@y/1' }, async () => {
      const { initSentry } = await loadFresh();
      initSentry();
      expect(Sentry.init).not.toHaveBeenCalled();
    });
  });

  it('initialises exactly once when all guards pass', async () => {
    const Sentry = await import('@sentry/react');
    await withEnv({ VITE_SENTRY_DSN: 'https://x@y/1' }, async () => {
      const { initSentry } = await loadFresh();
      initSentry();
      initSentry();
      expect(Sentry.init).toHaveBeenCalledTimes(1);
    });
  });

  it('reportError is a no-op until init has run', async () => {
    const Sentry = await import('@sentry/react');
    const { reportError } = await loadFresh();
    reportError(new Error('boom'), { componentStack: 'x' });
    expect(Sentry.captureException).not.toHaveBeenCalled();
  });

  it('reportError refuses to capture during a deniability session after init', async () => {
    const Sentry = await import('@sentry/react');
    const dsession = await import('@/wallet-core/deniabilitySession');
    await withEnv({ VITE_SENTRY_DSN: 'https://x@y/1' }, async () => {
      const { initSentry, reportError } = await loadFresh();
      initSentry();
      dsession.isDeniabilityOrDemoActive.mockReturnValue(true);
      reportError(new Error('boom'), { componentStack: 'StealthWallets > HiddenSlotRow' });
      expect(Sentry.captureException).not.toHaveBeenCalled();
    });
  });
});

describe('scrubber', () => {
  async function getBeforeSend() {
    const { __TEST_ONLY__ } = await loadFresh();
    return __TEST_ONLY__.scrub;
  }

  it('drops events whose exception looks like a secret', async () => {
    const beforeSend = await getBeforeSend();
    const seedHex = 'a'.repeat(64);
    const event = { exception: { values: [{ value: `Bad key: ${seedHex}` }] } };
    expect(beforeSend(event)).toBeNull();
  });

  it('drops events whose exception looks like a 12-word mnemonic', async () => {
    const beforeSend = await getBeforeSend();
    const mnemonic = 'abandon '.repeat(11) + 'about';
    const event = { exception: { values: [{ value: `panic: ${mnemonic}` }] } };
    expect(beforeSend(event)).toBeNull();
  });

  it('strips request, user, breadcrumbs, and stack frame locals', async () => {
    const beforeSend = await getBeforeSend();
    const event = {
      request: { url: 'https://app/secrets?pin=1234', cookies: 'x' },
      user: { id: '42', ip_address: '1.2.3.4' },
      extra: { componentStack: 'StealthWallets > HiddenSlotRow' },
      breadcrumbs: [{ category: 'ui.input', message: 'typed something' }],
      contexts: { device: { name: 'iPhone' }, culture: { locale: 'en' } },
      exception: {
        values: [
          {
            value: 'plain crash',
            stacktrace: {
              frames: [
                { filename: 'app.js', lineno: 1, vars: { seed: 'abc' }, context_line: 'x' },
              ],
            },
          },
        ],
      },
    };
    const out = beforeSend(event);
    expect(out).not.toBeNull();
    expect(out.request).toBeUndefined();
    expect(out.user).toBeUndefined();
    expect(out.extra).toBeUndefined();
    expect(out.breadcrumbs).toEqual([]);
    expect(out.contexts.device).toBeUndefined();
    const frame = out.exception.values[0].stacktrace.frames[0];
    expect(frame.vars).toBeUndefined();
    expect(frame.context_line).toBeUndefined();
    expect(frame.filename).toBe('app.js');
  });

  it('drops events when deniability becomes active after init', async () => {
    const beforeSend = await getBeforeSend();
    const dsession = await import('@/wallet-core/deniabilitySession');
    dsession.isDeniabilityOrDemoActive.mockReturnValue(true);
    const event = { exception: { values: [{ value: 'plain crash' }] } };
    expect(beforeSend(event)).toBeNull();
  });

  it('truncates long exception messages', async () => {
    const beforeSend = await getBeforeSend();
    // Avoid patterns the secret detector matches: use a spaced sentence.
    const msg = ('boom happened here. ').repeat(200);
    const event = { exception: { values: [{ value: msg }] } };
    const out = beforeSend(event);
    expect(out.exception.values[0].value.length).toBe(500);
  });
});
