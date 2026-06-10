import { describe, it, expect } from 'vitest';
import { seedImportRoute } from '../seedImportRoute.js';

// #140 regression guard. The bug this pins: first-run "Import an existing seed"
// must enter the shared seed→PIN flow (PIN cohort), NEVER the legacy password
// import. Routing back to the password path reintroduces the §0/§5 tell — an
// imported-from-scratch device would be observably different from a created one.
describe('seedImportRoute — seed import always enters the PIN cohort, never the password path', () => {
  it('routes first-run import into the seed→PIN flow (pin-recover), NEVER the legacy password import', () => {
    const r = seedImportRoute({ recovering: false });
    expect(r.view).toBe('pin-recover');
    // 'import' is the legacy password import view (setAuthModel('password')) — the §0/§5 tell.
    expect(r.view).not.toBe('import');
  });

  it('marks first-run import as NOT forgot-PIN recovery (recovering=false)', () => {
    expect(seedImportRoute({ recovering: false }).recovering).toBe(false);
  });

  it('routes forgot-PIN recovery through the SAME PIN-cohort flow (recovering=true)', () => {
    const r = seedImportRoute({ recovering: true });
    expect(r.view).toBe('pin-recover');
    expect(r.recovering).toBe(true);
  });

  it('defaults to first-run import when called with no args (safe default, not recovery)', () => {
    const r = seedImportRoute();
    expect(r.view).toBe('pin-recover');
    expect(r.recovering).toBe(false);
  });

  it('always starts at seed entry', () => {
    expect(seedImportRoute({ recovering: false }).pinStep).toBe('seed');
    expect(seedImportRoute({ recovering: true }).pinStep).toBe('seed');
  });

  it('coerces a truthy/falsy recovering input to a strict boolean (no undefined leak into state)', () => {
    expect(seedImportRoute({ recovering: undefined }).recovering).toBe(false);
    expect(seedImportRoute({ recovering: 1 }).recovering).toBe(true);
  });
});
