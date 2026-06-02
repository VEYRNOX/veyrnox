import { createClient } from '@base44/sdk';
import { appParams } from '@/lib/app-params';
import { DEMO, demoBase44 } from '@/api/demoClient';
import { localBase44 } from '@/api/localClient';

const { appId, token, functionsVersion, appBaseUrl } = appParams;

//Create a client that talks to the hosted base44 backend (legacy, opt-in only).
const realClient = () => createClient({
  appId,
  token,
  functionsVersion,
  serverUrl: '',
  requiresAuth: false,
  appBaseUrl
});

// Legacy hosted backend is now OPT-IN only (Phase 1 of the base44 removal).
// Set VITE_BASE44_BACKEND=1 to talk to the hosted backend for a transitional
// build; this opt-in is removed entirely in Phase 4.
const USE_HOSTED = import.meta.env.VITE_BASE44_BACKEND === '1';

// Which data layer is live:
//   'demo'   — ?demo=1 / VITE_DEMO_MODE=1 / native dev: in-memory seeded mock
//              (ephemeral; great for a tour). Unchanged.
//   'hosted' — VITE_BASE44_BACKEND=1: the legacy hosted base44 SDK (phones home).
//   'local'  — DEFAULT for the app build: persistent, on-device, local-first
//              data layer. No hosted backend, no network for entity data.
export const BACKEND = DEMO ? 'demo' : (USE_HOSTED ? 'hosted' : 'local');

// True only when the app is actually wired to the hosted base44 backend. Used
// by AuthContext to decide whether to run the hosted-auth network path at all.
export const HOSTED = BACKEND === 'hosted';

// Every data-layer consumer (~89 modules) imports `{ base44 }` from here. The
// implementation behind this single export is swapped by mode — the call sites
// never change.
export const base44 =
  BACKEND === 'demo'   ? demoBase44 :
  BACKEND === 'hosted' ? realClient() :
                         localBase44;
