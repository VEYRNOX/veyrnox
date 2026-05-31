import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { DEMO, demoBase44 } from '@/api/demoClient';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client with authentication required
const realClient = () => createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// In demo mode (?demo=1) every page runs against a fully client-side mock so
// the whole app can be browsed without a backend or login.
export const base44 = DEMO ? demoBase44 : realClient();
