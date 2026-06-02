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

// SERVER-DEPENDENT CAPABILITIES (base44 removal, Phase 3).
//
// Some features genuinely cannot run purely on-device — they need a server we
// no longer ship: an LLM endpoint (AI pages) and an email sender (email-OTP
// delivery). In the default LOCAL build those have no backend, so rather than
// FAKE a result (the old no-op stubs returned canned text / silent success,
// dishonestly implying the feature worked) the UI shows an explicit
// "not available in this local build" state.
//
//   - demo   : kept working (canned LLM reply / mock OTP) — demo is an explicit
//              fake-data tour and these affordances are part of the walkthrough.
//   - hosted : real backend present, so the real calls run.
//   - local  : NO backend → honest disabled state (this is the safe default).
//
// Category A/B features (RPC balances, price-alert checks, PDF export) are NOT
// gated here: they were moved to direct client-side / wallet-core paths and
// work in the local build with no backend.
export const LLM_AVAILABLE = BACKEND !== 'local';
export const EMAIL_AVAILABLE = BACKEND !== 'local';

// Every data-layer consumer (~89 modules) imports `{ base44 }` from here. The
// implementation behind this single export is swapped by mode — the call sites
// never change.
export const base44 =
  BACKEND === 'demo'   ? demoBase44 :
  BACKEND === 'hosted' ? realClient() :
                         localBase44;
