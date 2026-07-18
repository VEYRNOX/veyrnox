export * from './definitions';
export * from './gate';

import { registerPlugin } from '@capacitor/core';
import type { RaspIntegrityPlugin } from './definitions';

/**
 * Native bridge — call checkIntegrity() to get a raw RaspVerdict.
 * Use getFreshRaspArtifact() from './gate' for the full presign-gate flow.
 */
export const RaspIntegrity = registerPlugin<RaspIntegrityPlugin>('RaspIntegrity', {
  web: () => import('./web').then(m => new m.RaspIntegrityWeb()),
});
