// ErrorBoundary must not render raw error detail in a PRODUCTION build.
//
// WHY THIS TEST EXISTS
// The `import.meta.env.DEV` guard around `this.state.error.toString()` has been
// removed twice. PR #1428's own commit message says it "was reverted by a
// linter" and had to be re-applied alongside unrelated API fixes. Nothing
// asserted it, so both removals were silent — a green pipeline was consistent
// with the boundary printing raw error text to production users.
//
// That is the fifth control in this repo removed by a mechanical process; the
// Android release-cert guard regressed four times the same way and was only
// stopped by giving it a standing test that runs on PRs. This is that test.
//
// WHAT IT PROTECTS
// `error.toString()` is attacker-useful and user-hostile in production: it
// carries internal messages, and for bundled code frequently module paths and
// minified identifiers. The project's own error-handling rule is explicit —
// "Never expose stack traces, internal paths, or Supabase error details to the
// user. Show a generic error message" (CLAUDE.md, A10) — and this component is
// the last thing a user sees when something has already gone wrong.
//
// SHAPE
// Bidirectional on purpose. Asserting only that the detail is absent under
// PROD would also pass if the boundary failed to render at all, or if the
// fallback markup were deleted outright — so each case also asserts the
// generic copy IS present. The DEV case is not decoration either: it proves
// the test can actually observe the branch, so a PROD pass means "suppressed",
// not "unobservable".

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// A string distinctive enough that finding it on screen cannot be a
// coincidence with the boundary's own copy.
const SECRET = 'INTERNAL-LEAK-CANARY-a1b2c3 at /src/wallet-core/vault.js:512';

function Boom() {
  throw new Error(SECRET);
}

// React logs the caught error, and componentDidCatch console.errors it too.
// Silence both so the suite output stays readable — but only console.error,
// so an unexpected throw elsewhere still surfaces.
let errSpy;
beforeEach(() => {
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  errSpy?.mockRestore();
  vi.unstubAllEnvs();
  cleanup();
});

describe('ErrorBoundary — raw error detail must not reach production users', () => {
  it('does NOT render error.toString() when DEV is false', () => {
    vi.stubEnv('DEV', false);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    // The fallback rendered at all...
    expect(screen.getByText(/Something went wrong/i)).toBeTruthy();
    expect(screen.getByText(/An unexpected error occurred/i)).toBeTruthy();

    // ...and the raw detail is nowhere in it. queryByText matches on text
    // nodes; also scan the whole container so a differently-nested render
    // cannot hide the string from the matcher.
    expect(screen.queryByText(new RegExp(SECRET.slice(0, 24)))).toBeNull();
    expect(document.body.textContent).not.toContain('INTERNAL-LEAK-CANARY');
  });

  it('DOES render error.toString() when DEV is true', () => {
    // Not decoration: this proves the assertion above can observe the branch.
    // Without it, the PROD case would also pass if the detail block were
    // unreachable for some unrelated reason.
    vi.stubEnv('DEV', true);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByText(/Something went wrong/i)).toBeTruthy();
    expect(document.body.textContent).toContain('INTERNAL-LEAK-CANARY');
  });

  it('still offers recovery in production — suppressing detail must not remove the actions', () => {
    // The guard sits inside the fallback's CardContent. A careless "fix" that
    // drops the whole block rather than gating it would pass the PROD case
    // above while leaving the user stranded with no way out.
    vi.stubEnv('DEV', false);

    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    expect(screen.getByRole('button', { name: /try again/i })).toBeTruthy();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeTruthy();
  });
});
