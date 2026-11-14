// Shared async pre-sign boundary for signing surfaces that cannot safely
// continue under a WARN/BLOCK result. It takes a fresh RASP sample at action
// time and then delegates the decision to the same pure presignGate used by
// SendCrypto and WalletConnect.

import { getFreshRaspArtifact } from '../rasp/getFreshRaspArtifact.js';
import { TIER } from '../rasp/conditions.js';
import { LEVEL } from '../risk/levels.js';
import { presignGate } from './presign.js';

const BLOCKED = Object.freeze({
  proceedAllowed: false,
  rejectCode: 'PRESIGN_BLOCKED',
});

/**
 * Return an explicit allow only for a fresh, well-shaped ALLOW decision.
 * Missing values, probe errors, and unexpected gate shapes all block (I4).
 *
 * Replacement transactions currently have no separate risk-warning UX, so
 * acknowledged stays false: WARN/CONFIRM cannot be silently treated as consent.
 */
export async function presignGateOrReject({ txLevel = LEVEL.OK } = {}) {
  try {
    const artifact = await getFreshRaspArtifact();
    const tier = artifact?.tier ?? TIER.BLOCK;
    const gate = presignGate(tier, txLevel, false);
    if (gate?.proceedAllowed !== true) return BLOCKED;
    return { proceedAllowed: true, rejectCode: null };
  } catch {
    return BLOCKED;
  }
}

