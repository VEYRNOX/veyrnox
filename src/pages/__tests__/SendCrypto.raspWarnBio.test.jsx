// B5 — RASP WARN biometric re-confirm.
//
// `degrade()` has signalled `requiresBiometric: true` on WARN conditions (ROOTED,
// INTEGRITY_UNAVAILABLE) since the initial RASP implementation, but nothing consumed
// the field — the WARN path only required a checkbox acknowledge. B5 wires the field:
// on native, a WARN verdict now also demands a biometric verify before the send
// button becomes active. `sendTx.mutate()` re-asserts the same condition at the
// enforcement chokepoint (fail-closed, I4).
//
// Web caveat: `verifyBiometric2fa()` throws immediately on web (no native platform).
// INTEGRITY_UNAVAILABLE can occur on web (no native plugin), but ROOTED cannot.
// `raspNeedsBio` is therefore gated on `Capacitor.isNativePlatform()` — on web,
// WARN stays checkbox-only, which is the honest posture (no bio available).
//
// I3: `raspArtifact.requiresBiometric` is a pure environment signal with no
// wallet-set handle. `verifyBiometric2fa()` yields no secret. Safe to fire in any
// session type; the WARN condition and the bio gate are symmetric across real/decoy.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const dir = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(join(dir, '../SendCrypto.jsx'), 'utf8');

describe('SendCrypto.jsx — B5 RASP WARN biometric re-confirm', () => {
  it('tracks biometric confirmation state for RASP WARN (raspWarnBioOk)', () => {
    expect(src).toMatch(/raspWarnBioOk/);
  });

  it('derives raspNeedsBio from requiresBiometric AND isNativePlatform (no bio on web)', () => {
    // Must gate on both requiresBiometric AND isNativePlatform so web WARN stays
    // checkbox-only (verifyBiometric2fa() throws on web — no native platform).
    expect(src).toMatch(/raspNeedsBio/);
    expect(src).toMatch(/requiresBiometric/);
    // The raspNeedsBio derivation must include an isNativePlatform guard.
    const bioIdx = src.indexOf('raspNeedsBio');
    expect(bioIdx).toBeGreaterThan(-1);
    const bioRegion = src.slice(bioIdx, bioIdx + 300);
    expect(bioRegion).toMatch(/isNativePlatform/);
  });

  it('derives blockedByRaspBio from raspNeedsBio and !raspWarnBioOk', () => {
    expect(src).toMatch(/blockedByRaspBio/);
    const blockIdx = src.indexOf('blockedByRaspBio');
    const blockRegion = src.slice(blockIdx, blockIdx + 150);
    expect(blockRegion).toMatch(/raspNeedsBio/);
    expect(blockRegion).toMatch(/raspWarnBioOk/);
  });

  it('threads blockedByRaspBio into the Confirm & Send button disabled prop', () => {
    // The primary send button must be gated on the biometric block so it cannot be
    // clicked on a WARN-environment device before bio verify.
    const buttonIdx = src.indexOf('Confirm &amp; Send');
    expect(buttonIdx).toBeGreaterThan(-1);
    // The disabled prop is > 400 chars before the button text (long onClick handler in between).
    const buttonRegion = src.slice(Math.max(0, buttonIdx - 800), buttonIdx);
    expect(buttonRegion).toMatch(/blockedByRaspBio/);
  });

  it('calls verifyBiometric2fa() inside the WARN banner branch', () => {
    // The bio verify must be triggered from the WARN banner (inside the presign.owner
    // === "rasp" block), not from the main 2FA flow which is a separate path.
    const raspBannerIdx = src.indexOf("presign?.owner === 'rasp'");
    expect(raspBannerIdx).toBeGreaterThan(-1);
    // The bio button is ~25 JSX lines / ~1500 chars into the banner block.
    const raspBannerRegion = src.slice(raspBannerIdx, raspBannerIdx + 2000);
    expect(raspBannerRegion).toMatch(/verifyBiometric2fa/);
  });

  it('sets raspWarnBioOk(true) only on bio success (fail-closed: error/cancel stays false)', () => {
    // The biometric call must be in a try/catch; only `ok === true` sets the flag.
    // Search for `await verifyBiometric2fa()` so we skip any comments that
    // mention the function name without calling it.
    const bioCallIdx = src.indexOf('await verifyBiometric2fa()', src.indexOf("presign?.owner === 'rasp'"));
    expect(bioCallIdx).toBeGreaterThan(-1);
    // Use a wide window — the className prop and onClick preamble push `try {`
    // more than 100 chars before the actual call.
    const bioRegion = src.slice(Math.max(0, bioCallIdx - 300), bioCallIdx + 300);
    expect(bioRegion).toMatch(/try/);
    expect(bioRegion).toMatch(/catch/);
    expect(bioRegion).toMatch(/setRaspWarnBioOk\(\s*true\s*\)/);
  });

  it('has a mutationFn enforcement check for RASP_BIO_REQUIRED (fail-closed at sign time)', () => {
    // Defense-in-depth: the signer chokepoint must also assert the bio was cleared,
    // not rely on UI state alone. A hostile environment may try to bypass UI gates.
    expect(src).toMatch(/RASP_BIO_REQUIRED/);
  });

  it('resets raspWarnBioOk when send inputs change (stale ack must not carry)', () => {
    // If the user changes the send amount or recipient, the RASP WARN bio verify
    // must reset (parallel discipline to riskAck and limitAck resets).
    const resetIdx = src.indexOf('setRaspWarnBioOk(false)');
    expect(resetIdx).toBeGreaterThan(-1);
  });
});
