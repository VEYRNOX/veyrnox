// @ts-nocheck
// dev/prfSpike.js
//
// ┌──────────────────────────────────────────────────────────────────────────┐
// │ THROWAWAY SPIKE — NOT A FEATURE, NOT SECURITY. Produces an ANSWER, not a   │
// │ shipped control. Gates the KEK build (docs/kek-architecture-spec.md §8;    │
// │ docs/prf-webview-spike-brief.md).                                          │
// └──────────────────────────────────────────────────────────────────────────┘
//
// THE ONE QUESTION (brief §2): inside the target WebView, can we
//   (a) create a passkey carrying the WebAuthn `prf` extension, and
//   (b) on a subsequent get(), receive STABLE `prf` output bytes for a FIXED
//       salt — same salt in → same bytes out, across calls AND across app
//       restarts?
// Stability is the property the KEK depends on: the hardware factor H must be
// reproducible or the seed never decrypts twice (spec §3). A per-call-varying
// prf value is useless here.
//
// HONESTY / SCOPE GUARANTEES:
//  • This module is NEVER imported by the unlock or vault path. It is reachable
//    only from the DEV-gated /dev/prf-spike route, which `import.meta.env.DEV`
//    dead-code-eliminates from any production build (same lock as the dev
//    send-ungate). It must not ship.
//  • It makes NO security claim and derives NO wrapping key for real use. It only
//    measures whether prf is reachable + stable. (Using prf to actually wrap the
//    vault is the KEK build — explicitly out of scope here; see passkey.js:16-18
//    for why the production code deliberately does not touch prf yet.)
//  • Do not let this grow into the KEK build. It answers the gate and stops.
//
// The pure helpers (bytesToHex / hexEqual / classifyOutcome) are unit-tested. The
// WebAuthn calls cannot be unit-tested without a real authenticator — they are
// exercised by hand on the AVD emulator + a physical Android device (brief §3),
// and the screen records the A/B/C verdict that updates spec §8.

// dev-only persistence: the credential id + first prf output, so a LATER run
// (after an app restart) re-evaluates the SAME credential and can compare. A new
// credential would derive a different H, so cross-restart stability MUST reuse it.
export const SPIKE_STORE_KEY = 'veyrnox-prf-spike-devonly';

// A FIXED salt. The KEK derives H from a fixed salt (spec §3: "same fixed salt
// into prf, same H out"), so the spike must too — the whole point is determinism.
// 32 constant bytes (a domain-separated label, NOT random).
export const FIXED_SALT = new Uint8Array([
  0x56, 0x65, 0x79, 0x72, 0x6e, 0x6f, 0x78, 0x2d, // "Veyrnox-"
  0x70, 0x72, 0x66, 0x2d, 0x73, 0x70, 0x69, 0x6b, // "prf-spik"
  0x65, 0x2d, 0x76, 0x31, 0x2d, 0x66, 0x69, 0x78, // "e-v1-fix"
  0x65, 0x64, 0x2d, 0x73, 0x61, 0x6c, 0x74, 0x21, // "ed-salt!"
]);

// ── pure helpers (unit-tested) ───────────────────────────────────────────────

/** Hex-encode an ArrayBuffer / TypedArray. Lowercase, no prefix. */
export function bytesToHex(buf) {
  if (buf == null) return '';
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

/** Stable, non-empty hex equality (two empty/absent values are NOT "equal"). */
export function hexEqual(a, b) {
  return typeof a === 'string' && typeof b === 'string' && a.length > 0 && a === b;
}

/**
 * @typedef {object} ProbeFacts
 * @property {boolean} webauthn     WebAuthn API present in this context?
 * @property {boolean} prfEnabled   create() reported `prf.enabled`?
 * @property {boolean} evalOk       get() returned prf output bytes?
 * @property {boolean|null} intraStable  two get()s with the same salt matched? (null = not run)
 * @property {'match'|'mismatch'|'none'} crossRestart  vs the value stored on a prior run.
 */

/**
 * Map measured probe facts to the spec's outcome (brief §4). PURE.
 *   A             — WebView prf works AND is stable (intra + cross-restart). Proceed to KEK.
 *   A_PENDING     — stable this session, but no prior-run value yet. Re-run after a full
 *                   app restart to confirm cross-restart stability before declaring A.
 *   WEBVIEW_FAIL  — prf unreachable/unsupported in the WebView. NOT yet C: run the
 *                   native-bridge probe (brief §3 step 4) to decide B vs C.
 *   C             — prf reachable but UNSTABLE (per-call or per-restart). The approach
 *                   is not viable on target; redesign the hardware factor (spec §3 changes).
 *   INCONCLUSIVE  — facts don't compose; see the logs.
 * @param {ProbeFacts} facts
 * @returns {{code:'A'|'A_PENDING'|'WEBVIEW_FAIL'|'C'|'INCONCLUSIVE', title:string, detail:string, next:string}}
 */
export function classifyOutcome(facts) {
  const { webauthn, prfEnabled, evalOk, intraStable, crossRestart } = facts || {};

  if (!webauthn) {
    return {
      code: 'WEBVIEW_FAIL',
      title: 'No WebAuthn in this WebView',
      detail: 'navigator.credentials is not exposed here, so prf cannot be reached via the WebView at all.',
      next: 'Run the native-bridge probe (a Capacitor plugin performing the FIDO2 call) to decide outcome B vs C.',
    };
  }

  if (!evalOk) {
    return {
      code: 'WEBVIEW_FAIL',
      title: prfEnabled ? 'prf advertised but returned no bytes' : 'prf not supported by this authenticator/WebView',
      detail: prfEnabled
        ? 'create() reported prf.enabled but get() yielded no prf.results.first — the eval path did not produce output here.'
        : 'The authenticator/WebView did not enable the prf extension, so no hardware-bound bytes are available via WebAuthn here.',
      next: 'Run the native-bridge probe (FIDO2 / CTAP2 hmac-secret across the JS boundary) to decide outcome B vs C.',
    };
  }

  if (intraStable === false) {
    return {
      code: 'C',
      title: 'prf output changes per call',
      detail: 'Two get() calls with the same fixed salt returned DIFFERENT bytes — not reproducible, so it cannot key the seed.',
      next: 'Stop. Redesign the hardware factor (e.g. a StrongBox/Keystore-wrapped key) — spec §3 changes materially.',
    };
  }

  if (intraStable === true && crossRestart === 'mismatch') {
    return {
      code: 'C',
      title: 'prf output NOT stable across restart',
      detail: 'Stable within a session, but a different value after relaunch — the seed would decrypt once and never again.',
      next: 'Stop. Redesign the hardware factor — spec §3 changes materially.',
    };
  }

  if (intraStable === true && crossRestart === 'match') {
    return {
      code: 'A',
      title: 'WebView prf works and is stable',
      detail: 'Same fixed salt → same bytes across calls AND across an app restart. This is the property the KEK needs.',
      next: 'Proceed to the KEK build (spec §3 stands as written, crypto stays in audited JS). Record "§8: resolved — outcome A".',
    };
  }

  if (intraStable === true && crossRestart === 'none') {
    return {
      code: 'A_PENDING',
      title: 'Stable this session — restart to confirm',
      detail: 'prf returned matching bytes across two calls and the value was just stored. Cross-restart stability is unproven until you relaunch.',
      next: 'Fully kill and relaunch the app, then run the probe again. A matching value → outcome A; a different value → outcome C.',
    };
  }

  return {
    code: 'INCONCLUSIVE',
    title: 'Probe inconclusive',
    detail: 'The measured facts did not compose into a clear outcome.',
    next: 'Inspect the step log and re-run; if it persists, capture the raw extension results for the spec write-up.',
  };
}

// ── WebAuthn probe (NOT unit-tested — needs a real authenticator) ─────────────

function webAuthnPresent() {
  return typeof window !== 'undefined'
    && !!window.PublicKeyCredential
    && !!(navigator.credentials && navigator.credentials.create);
}

function randomBytes(n) {
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  return a;
}

function bufferToB64u(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64uToBuffer(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
  const str = atob(b64 + pad);
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i);
  return out;
}

function store() {
  try { if (typeof window !== 'undefined' && window.localStorage) return window.localStorage; } catch { /* noop */ }
  return null;
}

/** Read the prior-run record { credId, firstHex } (for cross-restart compare). */
export function readSpikeRecord() {
  try {
    const raw = store()?.getItem(SPIKE_STORE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    return obj && typeof obj.credId === 'string' ? obj : null;
  } catch { return null; }
}

/** Persist { credId, firstHex } for the next (post-restart) run. */
export function writeSpikeRecord(rec) {
  try { store()?.setItem(SPIKE_STORE_KEY, JSON.stringify(rec)); } catch { /* best-effort */ }
}

/** Forget the spike credential + stored value (start fresh). */
export function resetSpike() {
  try { store()?.removeItem(SPIKE_STORE_KEY); } catch { /* noop */ }
}

/**
 * Create a fresh platform credential carrying the prf extension (eval against the
 * fixed salt). Returns the base64url credential id + whether prf was enabled.
 * @returns {Promise<{credId:string, prfEnabled:boolean, atCreateHex:(string|null)}>}
 */
export async function createCredentialWithPrf() {
  if (!webAuthnPresent()) throw new Error('WebAuthn API not present');
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge: randomBytes(32),
      rp: { name: 'Veyrnox PRF spike (dev)', id: window.location.hostname },
      user: { id: randomBytes(16), name: 'prf-spike', displayName: 'PRF spike (dev)' },
      pubKeyCredParams: [{ alg: -7, type: 'public-key' }, { alg: -257, type: 'public-key' }],
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        userVerification: 'required',
      },
      timeout: 60000,
      // Request prf, asking for an eval against the fixed salt at create time too
      // (some platforms only return prf on get(); we read both and rely on get()).
      extensions: { prf: { eval: { first: FIXED_SALT } } },
    },
  });
  if (!cred) throw new Error('create() returned no credential');
  const ext = (/** @type {any} */ (cred)).getClientExtensionResults?.() || {};
  const prfEnabled = !!(ext.prf && ext.prf.enabled);
  const first = ext.prf && ext.prf.results && ext.prf.results.first;
  return {
    credId: bufferToB64u((/** @type {any} */ (cred)).rawId),
    prfEnabled,
    atCreateHex: first ? bytesToHex(first) : null,
  };
}

/**
 * Evaluate prf for an existing credential: get() with eval against the fixed salt.
 * @param {string} credId base64url credential id from createCredentialWithPrf()
 * @returns {Promise<{ok:boolean, hex:(string|null)}>}
 */
export async function evaluatePrf(credId) {
  if (!webAuthnPresent()) throw new Error('WebAuthn API not present');
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: randomBytes(32),
      timeout: 60000,
      userVerification: 'required',
      rpId: window.location.hostname,
      allowCredentials: credId ? [{ id: b64uToBuffer(credId), type: 'public-key' }] : undefined,
      extensions: { prf: { eval: { first: FIXED_SALT } } },
    },
  });
  const ext = (/** @type {any} */ (assertion)).getClientExtensionResults?.() || {};
  const first = ext.prf && ext.prf.results && ext.prf.results.first;
  return { ok: !!first, hex: first ? bytesToHex(first) : null };
}

/**
 * Run the full probe and return a structured result + a human-readable step log
 * and the spec outcome. Reuses a stored credential when present so cross-restart
 * stability is measured against the SAME credential.
 *
 * @returns {Promise<{facts:ProbeFacts, outcome:ReturnType<typeof classifyOutcome>,
 *   credId:(string|null), hexA:(string|null), hexB:(string|null), priorHex:(string|null),
 *   log:string[]}>}
 */
export async function runPrfProbe() {
  const log = [];
  const push = (m) => log.push(m);

  const webauthn = webAuthnPresent();
  push(webauthn ? '✓ WebAuthn API present' : '✗ WebAuthn API NOT present in this WebView');

  let prfEnabled = false;
  let evalOk = false;
  /** @type {boolean|null} */ let intraStable = null;
  /** @type {'match'|'mismatch'|'none'} */ let crossRestart = 'none';
  let credId = null;
  let hexA = null;
  let hexB = null;

  const prior = readSpikeRecord();
  const priorHex = prior?.firstHex || null;

  if (!webauthn) {
    const facts = { webauthn, prfEnabled, evalOk, intraStable, crossRestart };
    return { facts, outcome: classifyOutcome(facts), credId, hexA, hexB, priorHex, log };
  }

  try {
    if (prior?.credId) {
      credId = prior.credId;
      push(`• Reusing stored credential ${credId.slice(0, 10)}… (cross-restart test)`);
    } else {
      push('• No stored credential — creating one with the prf extension…');
      const c = await createCredentialWithPrf();
      credId = c.credId;
      prfEnabled = c.prfEnabled;
      push(prfEnabled ? '✓ create() reported prf.enabled' : '✗ create() did NOT report prf.enabled');
      if (c.atCreateHex) push(`• prf value returned at create: ${c.atCreateHex.slice(0, 16)}…`);
    }

    push('• get() #1 — evaluating prf against the fixed salt…');
    const a = await evaluatePrf(credId);
    hexA = a.hex;
    evalOk = a.ok;
    push(a.ok ? `✓ get() #1 prf output: ${a.hex.slice(0, 16)}…` : '✗ get() #1 returned NO prf output');

    if (evalOk) {
      // create() may not advertise prf.enabled on every platform even when get()
      // works, so treat a successful eval as authoritative for "prf reachable".
      prfEnabled = prfEnabled || true;
      push('• get() #2 — same salt, to test intra-session stability…');
      const b = await evaluatePrf(credId);
      hexB = b.hex;
      intraStable = b.ok && hexEqual(a.hex, b.hex);
      push(intraStable ? '✓ get() #2 matched get() #1 (stable within session)' : '✗ get() #2 DID NOT match (unstable per call)');

      if (intraStable) {
        if (priorHex) {
          crossRestart = hexEqual(a.hex, priorHex) ? 'match' : 'mismatch';
          push(crossRestart === 'match'
            ? '✓ Matches the value stored on a PRIOR run (stable across restart)'
            : '✗ Differs from the prior-run value (UNSTABLE across restart)');
        } else {
          crossRestart = 'none';
          push('• No prior-run value yet — storing this one. Re-run after a full app restart to confirm.');
        }
        writeSpikeRecord({ credId, firstHex: a.hex });
      }
    }
  } catch (e) {
    push(`✗ Probe threw: ${e?.name || 'Error'} — ${e?.message || String(e)}`);
  }

  const facts = { webauthn, prfEnabled, evalOk, intraStable, crossRestart };
  return { facts, outcome: classifyOutcome(facts), credId, hexA, hexB, priorHex, log };
}
