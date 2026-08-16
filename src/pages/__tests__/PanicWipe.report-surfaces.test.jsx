// S-1 — the wipe report must RENDER every input to its own `clean` verdict.
//
// inspectKeyMaterial() computes `clean` from five things: vault keys,
// localStorage residue, sessionStorage residue + verified, and side-database
// residue + verified. KeyMaterialReport rendered the first two. So a wipe that
// left veyrnox-appdata behind, or ran on a browser that cannot enumerate
// databases, painted the "AFTER — no wallet data left" panel caution-coloured
// with every visible line reading "— empty —", a badge saying "0 VAULT BLOBS",
// and no stated reason. The verdict was honest; the explanation was missing.
//
// These pin the two cases that used to be invisible. Each fails if the
// corresponding row is dropped again.

import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';

import { KeyMaterialReport } from '@/pages/PanicWipe';

afterEach(cleanup);

const CLEAN = {
  clean: true,
  vaultBlobCount: 0,
  indexedDbKeys: [],
  localStorageResidue: [],
  sessionStorageResidue: [],
  sessionStorageVerified: true,
  sideDatabasesResidue: [],
  sideDatabasesVerified: true,
};

describe('KeyMaterialReport surfaces every input to `clean`', () => {
  it('a fully clean report says so, with no caution wording', () => {
    render(<KeyMaterialReport report={CLEAN} title="AFTER" />);
    expect(screen.getByText('NO KEY MATERIAL')).toBeTruthy();
    expect(screen.queryByText(/could not verify/i)).toBeNull();
  });

  it('names the surviving side database instead of claiming "0 VAULT BLOBS"', () => {
    render(
      <KeyMaterialReport
        report={{
          ...CLEAN,
          clean: false,
          sideDatabasesResidue: ['veyrnox-appdata'],
        }}
        title="AFTER"
      />,
    );
    // The name of what survived is on screen...
    expect(screen.getByText(/veyrnox-appdata/)).toBeTruthy();
    // ...and the badge no longer reports a blob count that is zero.
    expect(screen.queryByText(/VAULT BLOB/)).toBeNull();
    expect(screen.getByText('RESIDUE REMAINS')).toBeTruthy();
  });

  it('says "could not verify" rather than "— none —" when enumeration is unavailable', () => {
    render(
      <KeyMaterialReport
        report={{ ...CLEAN, clean: false, sideDatabasesVerified: false }}
        title="AFTER"
      />,
    );
    expect(screen.getByText(/could not verify on this browser/i)).toBeTruthy();
    expect(screen.getByText('NOT VERIFIED')).toBeTruthy();
  });

  it('the same holds for sessionStorage, which was equally unrendered', () => {
    render(
      <KeyMaterialReport
        report={{
          ...CLEAN,
          clean: false,
          sessionStorageResidue: ['veyrnox-stealth-session'],
        }}
        title="AFTER"
      />,
    );
    expect(screen.getByText(/veyrnox-stealth-session/)).toBeTruthy();
  });

  it('a report predating these fields still renders (flag absent !== unverified)', () => {
    const old = {
      clean: true, vaultBlobCount: 0, indexedDbKeys: [], localStorageResidue: [],
    };
    render(<KeyMaterialReport report={old} title="AFTER" />);
    expect(screen.queryByText(/could not verify/i)).toBeNull();
    expect(screen.getByText('NO KEY MATERIAL')).toBeTruthy();
  });
});
