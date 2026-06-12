// src/rasp/index.js
//
// RASP v1 — runtime risk detection & honest degradation.
//
// THE §8a BUILD SEAM. RASP is split by AUDIT EXPOSURE, and this module ships only
// the LOW-exposure, pre-audit-safe half:
//
//   LANDED here — BUILT · pre-audit-safe:
//     • conditions.js  — pure CONDITION/TIER vocabulary.
//     • degrade.js     — pure condition → response-tier mapping (the §5 I3 policy).
//     • the deniability test (__tests__/i3-deniability.test.js) — the standing I3
//       guard, proving the response is byte-identical real-vs-decoy.
//   These are pure: no egress, no device, no key access. Safe to land now;
//   landing the deniability test early is protective.
//
//   HELD off this landing — AUDIT-GATED (detect.js, parked):
//     • the Play Integrity verdict client (real egress + a backend dependency —
//       an I2 disclosure decision in its own right), and
//     • the self-attested probes (root/hook/debugger/emulator/tamper — only
//       meaningful against a real hostile runtime; an emulator green check is
//       false confidence).
//   Held until (a) the I2 egress-disclosure decision is written and (b) a
//   real-device verification run exists. degrade() already fail-closes on an
//   absent verdict (I4), so the safe default holds while detection is held.
//
// Two planes, one chokepoint, no shared inputs (brief §6): this module is a pure
// function of (environment) ONLY. RASP signals never enter the tx scorer
// (src/risk), and tx signals never enter the degradation policy here. It NEVER
// touches the seed or private key (I1).
//
// "Code-ready ≠ verified" (§9): a detector is verified only when exercised against
// a real hostile runtime — which is exactly why the detection leg is held, not
// shipped with a green check it cannot honestly earn off an emulator.

export { CONDITION, TIER } from './conditions.js';
export { degrade } from './degrade.js';
