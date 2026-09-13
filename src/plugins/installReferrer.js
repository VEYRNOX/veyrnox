// JS bridge for the Android Play Install Referrer plugin (#2541).
// Rejects on web, iOS and the non-Play Android flavours; callers treat that as
// "no referrer".

import { registerPlugin } from '@capacitor/core';

const InstallReferrer = registerPlugin('InstallReferrer', {
  web: () => Promise.reject(new Error('InstallReferrer is not available on this platform')),
});

export async function getInstallReferrer() {
  const { referrer } = await InstallReferrer.getReferrer();
  return referrer == null ? '' : String(referrer);
}
