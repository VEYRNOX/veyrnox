// P2-5 — honesty pins for the iOS App Attest "subsequent runs" path.
//
// The finding: a successful `generateAssertion` call in AppAttestPlugin.m's
// subsequent-runs branch was previously treated (in comments) as an integrity
// verdict. That overstates what a LOCAL assertion proves. SE-key operations
// answer whether the surrounding OS/userland is jailbroken or not — real App
// Attest integrity requires SERVER-SIDE verification of the assertion (nonce +
// counter/receipt against Apple's servers), which conflicts with Veyrnox's I5
// backend-untrusted design. Under the on-device-decision Option A (see
// docs/rasp-attestation-egress-decision.md), this is the accepted trade-off,
// but the code and its JS boundary must say so honestly.
//
// These are string pins on the doc-comments, not runtime behaviour tests: the
// entitlement isn't wired yet, so the leg is effectively no-op today. The pin
// keeps a future maintainer from trusting the leg more than they should when
// the entitlement is added.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(__dirname, '../../..');
const appAttestSrc = readFileSync(
  resolve(repoRoot, 'ios/App/App/AppAttestPlugin.m'),
  'utf8',
);
const attestationJsSrc = readFileSync(
  resolve(repoRoot, 'src/rasp/attestation.js'),
  'utf8',
);

describe('P2-5 — AppAttestPlugin.m file-header honesty', () => {
  it('states that a local generateAssertion proves SE key intact, NOT device integrity/jailbreak', () => {
    // Header must explicitly disclaim "device integrity" / "jailbreak" for the
    // subsequent-runs path. A local assertion is answered by the SE regardless
    // of userland compromise.
    expect(appAttestSrc).toMatch(/SE[- ]enrolled key|SE key intact|Secure Enclave key|holds its .*SE/i);
    expect(appAttestSrc).toMatch(/NOT[\s\S]{0,80}(device integrity|jailbreak|"?this device is not jailbroken"?)/i);
  });

  it('states that real App Attest security requires SERVER-SIDE verification (nonce + counter)', () => {
    expect(appAttestSrc).toMatch(/server[- ]side/i);
    // The header must name what real verification requires so a future
    // maintainer can see what this leg does NOT do.
    expect(appAttestSrc).toMatch(/counter|receipt/i);
    expect(appAttestSrc).toMatch(/Apple/i);
  });

  it('names the I5 conflict + the Option A on-device-decision trade-off', () => {
    expect(appAttestSrc).toMatch(/I5/);
    expect(appAttestSrc).toMatch(/Option A/);
  });
});

describe('P2-5 — AppAttestPlugin.m subsequent-runs code comment', () => {
  it('the "(4) Subsequent runs" comment no longer claims "the key/device are intact"', () => {
    // Before this fix the comment read "signals the key/device are intact" —
    // that "device" claim is exactly the overstatement being retired here.
    expect(appAttestSrc).not.toMatch(/successful assertion signals the key\/device are intact/);
  });

  it('the "(4) Subsequent runs" comment states the honest scope explicitly', () => {
    // The section between the (4) marker and the resolve() must carry the
    // honest scoping so a maintainer reading only this branch sees it.
    const subsequentBlock = appAttestSrc.split('// (4)')[1] ?? '';
    expect(subsequentBlock).toMatch(/SE[- ]enrolled key|SE key intact|holds its (SE|Secure Enclave) key/i);
    expect(subsequentBlock).toMatch(/NOT[\s\S]{0,80}(device integrity|jailbreak)/i);
    // Must also reference the server-side gap for this branch specifically.
    expect(subsequentBlock).toMatch(/server[- ]side/i);
  });
});

describe('P2-5 — JS boundary annotation in src/rasp/attestation.js detectAttestation', () => {
  it('detectAttestation carries a P2-5 comment about the iOS-specific weaker meaning', () => {
    // The annotation must live at the receiving site (detectAttestation),
    // NOT invent a new field — downstream compose logic still consumes the
    // existing attestationFailed boolean.
    expect(attestationJsSrc).toMatch(/P2-5/);
    // The annotation must name iOS + the weaker meaning of a CLEAN result.
    const detectBlock = attestationJsSrc.split('export function detectAttestation')[0];
    // Look in the whole file — comment may be immediately above the function.
    expect(attestationJsSrc).toMatch(/iOS/);
    expect(attestationJsSrc).toMatch(/SE[- ]enrolled key|SE key intact|holds its (SE|Secure Enclave) key/i);
    // Cross-reference the Option A decision doc so the trade-off is greppable.
    expect(attestationJsSrc).toMatch(/Option A|rasp-attestation-egress-decision/);
  });
});
