// Guards WHERE the first-run tour renders.
//
// The tour used to render on the pre-creation "choose" screen (PIN set, no
// wallet yet). Every step describes something you do with a wallet you already
// have — set a duress PIN, hide a wallet, export a backup, bind the PIN to
// biometrics — so showing it first advertised features the user could not act
// on, in front of the create/import decision. It now renders on the unlocked
// wallet instead.
//
// A source-level assertion rather than a render test: WalletEntry pulls in the
// whole vault/KEK/routing stack, and the thing at risk is placement, not
// behaviour. Same approach as the SPM-manifest path guard.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';

const SRC = readFileSync(
  join(process.cwd(), 'src/components/WalletEntry.jsx'),
  'utf8'
);

describe('FirstRunTour placement — after wallet creation, not before', () => {
  it('renders in exactly one place', () => {
    const renders = SRC.match(/<FirstRunTour\s*\/>/g) ?? [];
    expect(renders).toHaveLength(1);
  });

  it('renders inside the unlocked-wallet branch', () => {
    const unlockedBranch = SRC.indexOf('if (isUnlocked && !generatedSeed && !kekGatePending)');
    const render = SRC.indexOf('<FirstRunTour />');
    expect(unlockedBranch).toBeGreaterThan(-1);
    expect(render).toBeGreaterThan(unlockedBranch);

    // and within that branch, not merely somewhere after it
    const branchBody = SRC.slice(unlockedBranch, unlockedBranch + 900);
    expect(branchBody).toContain('<FirstRunTour />');
    expect(branchBody).toContain('<Outlet />');
  });

  it('does NOT render on the pre-creation choose screen', () => {
    // The Phase-2 create/import choice, reached once a PIN exists but no wallet.
    const chooseBranch = SRC.indexOf('if (view === "choose")');
    expect(chooseBranch).toBeGreaterThan(-1);
    const chooseBody = SRC.slice(chooseBranch);
    expect(chooseBody).not.toContain('<FirstRunTour />');
  });

  it('is armed by wallet creation, not by the absence of a seen-marker', () => {
    // The trigger must be an explicit arm at creation. Falling back to
    // "never seen it" would fire the tour over the wallet of an existing user
    // who never created one on this device.
    expect(SRC).toContain('armTour()');
    const fresh = SRC.indexOf('createWalletFromPendingPin()');
    expect(fresh).toBeGreaterThan(-1);
    expect(SRC.slice(fresh, fresh + 120)).toContain('armTour()');
  });

  it('is NOT armed by the recovery paths — those restore an existing wallet', () => {
    // PIN recovery and seed import re-provision a wallet the user already had.
    for (const path of ['importWalletForPendingPin']) {
      let i = SRC.indexOf(path);
      while (i > -1) {
        expect(SRC.slice(i, i + 120)).not.toContain('armTour()');
        i = SRC.indexOf(path, i + 1);
      }
    }
  });

  it('does NOT render on the welcome hero', () => {
    const welcome = SRC.indexOf('if (view === "welcome")');
    expect(welcome).toBeGreaterThan(-1);
    const welcomeBody = SRC.slice(welcome, welcome + 700);
    expect(welcomeBody).not.toContain('<FirstRunTour />');
  });
});
