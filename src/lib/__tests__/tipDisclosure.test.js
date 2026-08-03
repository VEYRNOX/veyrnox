// src/lib/__tests__/tipDisclosure.test.js
//
// Audit 2026-08-03 H-5 and M-6 — two honesty defects on the TIP surface.
//
// H-5: the opt-in disclosure said the feature "sends this address to a third
// party". The payload actually carries the recipient address, the user's OWN
// sending address, the amount, contract address and calldata for token
// transfers, and — the part nobody was told about — up to 20 addresses from the
// user's transaction history, address book and whitelist, attached on every
// request. A user who read the consent text and concluded one address left the
// device was in fact disclosing a slice of their counterparty graph.
//
// M-6: the advisor knowledge base sold "enhanced threat intelligence screening"
// as a Safety Plus feature. The remote-screening toggle has no entitlement check
// anywhere — it is free on every tier. An I4 mismatch in the SAFE direction
// (underselling a protection rather than overselling one), but it could still
// cause a free-tier user to skip real protection they believed was paid.
//
// These are copy assertions, which normally rot. They are worth pinning because
// the failure mode is silent: nothing breaks when the payload grows a field and
// the disclosure does not.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import wallet from '@/i18n/locales/en/wallet.json';
import { KNOWLEDGE_BASE } from '@/lib/advisorKnowledge.js';

const here = dirname(fileURLToPath(import.meta.url));
const sendSrc = readFileSync(join(here, '../../pages/SendCrypto.jsx'), 'utf8');

const screening = wallet.send.screening;

describe('H-5 — the TIP opt-in discloses what actually leaves the device', () => {
  it('names the user\'s own address, not just the recipient', () => {
    expect(screening.remote_enabled).toMatch(/your own sending address/i);
  });

  it('names the amount', () => {
    expect(screening.remote_enabled).toMatch(/amount/i);
  });

  it('names contract address and call data for token transfers', () => {
    expect(screening.remote_enabled).toMatch(/contract address/i);
    expect(screening.remote_enabled).toMatch(/call data/i);
  });

  it('no longer claims only the recipient address is sent', () => {
    // The exact defective sentence.
    expect(screening.remote_enabled)
      .not.toMatch(/^Online threat intelligence screening is active\. The recipient address will be sent to the TIP service at the verify step\.$/);
  });

  // ---- transaction history is no longer sent at all (owner decision) ----
  //
  // These assertions were INVERTED. They used to require the counterparties
  // disclosure to exist and be rendered, which was correct while the field was
  // in the payload. The owner chose to drop the field rather than only disclose
  // it, so the same tests now guard the opposite property: the data must not be
  // sent, and the copy must not claim it is.
  //
  // Both halves matter. A stale note promising we send history would be the same
  // honesty defect as H-5 pointing the other way — overstating egress is no more
  // acceptable than understating it.

  it('sends NO transaction history: recentCounterparties is gone from the payload', () => {
    const call = sendSrc.slice(
      sendSrc.indexOf('queryFn: () => screenTransaction({'),
      sendSrc.indexOf('enabled: tipScreenApplies'),
    );
    expect(call).not.toMatch(/recentCounterparties\s*:/);
    expect(call).not.toMatch(/knownAddresses\.slice/);
  });

  it('the counterparties disclosure is gone from the copy and the UI', () => {
    expect(screening.remote_counterparties_note).toBeUndefined();
    expect(sendSrc).not.toMatch(/remote_counterparties_note/);
    expect(sendSrc).not.toMatch(/tip-counterparties-note/);
  });

  it('the copy states positively that history is NOT sent', () => {
    // Silence would be honest but weak: a user weighing the opt-in benefits from
    // knowing the counterparty graph specifically stays on device.
    expect(screening.remote_enabled).toMatch(/nothing from your transaction history is sent/i);
  });

  it('the proxy cannot carry the field back even if a caller supplies it', () => {
    // The Edge Function rebuilds the upstream body from an allowlist, so the
    // privacy decision is enforced server-side rather than trusted to the client.
    const fnSrc = readFileSync(
      join(here, '../../../supabase/functions/tip-screen/index.ts'), 'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(fnSrc).not.toMatch(/recent_counterparties/);
  });

  it('every field the request actually sends is covered by the disclosure', () => {
    // Guard against the payload growing a field while the copy stands still.
    // If you add a field to the screenTransaction call, either disclose it here
    // or justify why it needs no disclosure.
    const call = sendSrc.slice(
      sendSrc.indexOf('queryFn: () => screenTransaction({'),
      sendSrc.indexOf('enabled: tipScreenApplies'),
    );
    const sentFields = ['from:', 'to:', 'contractAddress', 'calldata', 'valueWei'];
    for (const f of sentFields) {
      expect(call, `${f} should still be part of the screened payload this test reasons about`).toContain(f);
    }
    // chain/actionType are not user data; everything else above is disclosed by
    // remote_enabled.
    const disclosure = screening.remote_enabled.toLowerCase();
    expect(disclosure).toMatch(/recipient address/);
    expect(disclosure).toMatch(/own sending address/);
    expect(disclosure).toMatch(/amount/);
    expect(disclosure).toMatch(/contract address/);
    expect(disclosure).toMatch(/call data/);
  });
});

describe('M-6 — the advisor does not sell free screening as a paid feature', () => {
  const safetyPlus = KNOWLEDGE_BASE.subscription;

  it('the Safety Plus section exists', () => {
    expect(safetyPlus).toBeTruthy();
  });

  it('does not claim Safety Plus adds threat screening', () => {
    const all = safetyPlus.entries.map((e) => e.a).join(' ');
    expect(all).not.toMatch(/Safety Plus adds enhanced threat screening/i);
    expect(all).not.toMatch(/premium tier that provides enhanced threat intelligence screening/i);
  });

  it('states plainly that screening is available without paying', () => {
    const all = safetyPlus.entries.map((e) => e.a).join(' ');
    expect(all).toMatch(/free and opt-in for everyone|not behind the paywall|NOT behind it/i);
  });

  it('the send flow still has no entitlement gate on remote screening', () => {
    // The copy is now true because the code has no tier check. If someone adds
    // one, this test fails and the copy must change back — the two must agree.
    const toggle = sendSrc.slice(
      sendSrc.indexOf('const toggleRemoteScreen'),
      sendSrc.indexOf('const toggleRemoteScreen') + 300,
    );
    expect(toggle).not.toMatch(/safety_plus|currentTier|entitlement|isSubscribed/i);
  });
});
