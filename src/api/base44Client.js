import { DEMO, demoBase44 } from '@/api/demoClient';
import { localBase44 } from '@/api/localClient';

// base44 removal COMPLETE (Phase 4). The @base44/sdk dependency and the hosted
// backend opt-in (VITE_BASE44_BACKEND) are gone. The app is now exclusively
// served by the two on-device data layers below — no SDK, no network for
// entity data, no hosted account. The module name is kept only because ~89
// modules import `{ base44 }` from here; the implementation behind it is now
// purely local/demo.
//
// Which data layer is live:
//   'demo'  — ?demo=1 / VITE_DEMO_MODE=1 / native dev: in-memory seeded mock
//             (ephemeral; great for a tour).
//   'local' — DEFAULT for the app build: persistent, on-device, local-first
//             data layer. No backend, no network for entity data.
export const BACKEND = DEMO ? 'demo' : 'local';

// ON-DEVICE AUTH. True only in the default local build.
//
// There is no hosted account: the user's seed/vault IS their identity, so the
// SINGLE source of truth for access is the on-device vault unlock
// (WalletProvider). The routing gate (components/WalletGate.jsx) requires
// `isUnlocked` here; demo mode is an explicit pre-seeded tour with no gate.
//
//   - local : on-device unlock is the account (this flag true).
//   - demo  : explicit fake-data tour — no gate, pre-seeded session.
export const WALLET_AUTH = BACKEND === 'local';

// SERVER-DEPENDENT CAPABILITIES.
//
// Some features genuinely cannot run purely on-device — they need a server we
// no longer ship: an LLM endpoint (AI pages) and an email sender (email-OTP
// delivery). In the default LOCAL build those have no backend, so rather than
// FAKE a result the UI shows an explicit "not available in this local build"
// state.
//
//   - demo  : kept working (canned LLM reply / mock OTP) — part of the tour.
//   - local : NO backend → honest disabled state (this is the safe default).
//
// Category A/B features (RPC balances, price-alert checks, PDF export) are NOT
// gated here: they run on direct client-side / wallet-core paths in the local
// build with no backend.
export const LLM_AVAILABLE = BACKEND !== 'local';
export const EMAIL_AVAILABLE = BACKEND !== 'local';

// Every data-layer consumer imports `{ base44 }` from here. The implementation
// behind this single export is swapped by mode — the call sites never change.
export const base44 = BACKEND === 'demo' ? demoBase44 : localBase44;
