// BLOCK-tier remediation copy (#2593, Copilot review of #2589).
//
// Each BLOCK sentence names a cause AND a next step. Two properties matter and
// neither is obvious from reading the strings once:
//
//   INTEGRITY_FAIL must NOT tell the user to reinstall. It is an attestation /
//   device-state verdict — root, an unlocked bootloader, an unsupported OS image
//   — none of which reinstalling repairs, and on mobile a reinstall deletes app
//   data, i.e. the local vault. Advising it is actively harmful.
//
//   TAMPERED may say reinstall, because that one IS about the app binary — but
//   only alongside the recovery-phrase warning, for the same data-loss reason.
//
// Sentences are read from the artifact, not from the source text, so a comment
// describing the old copy cannot satisfy these.
import { describe, it, expect } from 'vitest';
import { degrade } from '../degrade.js';
import { CONDITION, TIER } from '../conditions.js';

const sentenceFor = (condition) => degrade(condition).sentence;

describe('RASP BLOCK guidance', () => {
  it('INTEGRITY_FAIL never prescribes reinstalling', () => {
    const s = sentenceFor(CONDITION.INTEGRITY_FAIL);
    expect(degrade(CONDITION.INTEGRITY_FAIL).tier).toBe(TIER.BLOCK);
    expect(s.toLowerCase()).not.toMatch(/reinstall/);
    // Still has to say what to do instead.
    expect(s.toLowerCase()).toMatch(/untampered|supported device|official/);
  });

  it('TAMPERED may say reinstall, but only with the data-loss warning', () => {
    const s = sentenceFor(CONDITION.TAMPERED);
    expect(degrade(CONDITION.TAMPERED).tier).toBe(TIER.BLOCK);
    if (/reinstall/i.test(s)) {
      expect(s.toLowerCase()).toMatch(/recovery phrase/);
      expect(s.toLowerCase()).toMatch(/clears on-device data|deletes on-device data/);
    }
  });

  it('every BLOCK sentence offers a next step, not just a cause', () => {
    for (const c of [CONDITION.EMULATOR, CONDITION.INTEGRITY_FAIL, CONDITION.HOOKED, CONDITION.TAMPERED]) {
      const s = sentenceFor(c);
      expect(s, c).toBeTruthy();
      // Two sentences minimum: the verdict, then what to do about it.
      expect(s.trim().split(/(?<=\.)\s+/).length, `${c}: ${s}`).toBeGreaterThan(1);
    }
  });
});
