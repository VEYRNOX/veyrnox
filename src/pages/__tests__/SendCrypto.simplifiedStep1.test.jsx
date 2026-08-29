// Structural pin for wizard step 1 (WHO + HOW MUCH) after the
// progressive-disclosure refactor (2026-08-28). Reads the source rather
// than mounting the whole send stack — matches the pattern used by
// SendCrypto.digitalShield.test.js and the deniability/confirmation pins.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../SendCrypto.jsx'), 'utf8');

describe('SendCrypto — step 1 simplified', () => {
  it('collapses wallet + asset selection into a single WalletAssetPickerSheet chip', () => {
    expect(src).toContain('WalletAssetPickerSheet');
    expect(src).toMatch(/data-testid="wallet-asset-chip"/);
    // The pre-wizard stacked Select dropdowns must not come back.
    expect(src).not.toMatch(/aria-labelledby="send-wallet-label"/);
    expect(src).not.toMatch(/aria-labelledby="send-asset-label"/);
  });

  it('routes the optional note through a chip + NoteEditorSheet instead of an inline Input', () => {
    expect(src).toContain('NoteEditorSheet');
    expect(src).toMatch(/data-testid="note-chip"/);
    expect(src).not.toMatch(/<Input\s+id="send-note"/);
  });

  it('removes the online-screening checkbox and its "no provider" banner from step 1', () => {
    expect(src).not.toMatch(/toggleRemoteScreen\(e\.target\.checked\)/);
    expect(src).not.toContain('send.screening.remote_opt_in');
    expect(src).not.toContain('send.screening.remote_unavailable');
    // remoteScreen state still exists (RPC-enabled gates depend on it).
    expect(src).toMatch(/const \[remoteScreen, setRemoteScreen\]/);
  });

  it('deletes the simulation toggle from step 1 while keeping simEnabled state truthy by default', () => {
    expect(src).not.toMatch(/id="sim-toggle"/);
    expect(src).not.toContain('send.simulation.toggle_aria');
    // The "taking too long" hint on step 2 stays as the only opt-out surface.
    expect(src).toContain('send.simulation.taking_too_long');
  });

  it('surfaces the local-screening disclosure via a shield-icon tooltip, not a full card', () => {
    expect(src).toMatch(/title=\{tw\("send\.screening\.local_disclosure"\)\}/);
    expect(src).toContain('Checked on your device');
  });

  it('does not render the Digital Shield checkbox on step 1', () => {
    // Digital Shield moves to step 3 as a full-width row card above the CTA.
    expect(src).not.toContain('Use Digital Shield air-gap signing');
    expect(src).toMatch(/data-testid="digital-shield-row"/);
  });
});
