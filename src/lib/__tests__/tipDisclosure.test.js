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

  it('does not disclose historical counterparties (send-leak dropped)', () => {
    // The recentCounterparties payload field was removed by the send-leak fix;
    // the disclosure must not promise a portion of transaction history is
    // being sent when the code no longer sends it (I4, both directions).
    expect(screening).not.toHaveProperty('remote_counterparties_note');
    expect(sendSrc).not.toMatch(/send\.screening\.remote_counterparties_note/);
    expect(sendSrc).not.toMatch(/data-testid="tip-counterparties-note"/);
  });

  it('no longer claims only the recipient address is sent', () => {
    // The exact defective sentence.
    expect(screening.remote_enabled)
      .not.toMatch(/^Online threat intelligence screening is active\. The recipient address will be sent to the TIP service at the verify step\.$/);
  });

  it('every field the request actually sends is covered by the disclosure', () => {
    // Guard against the payload growing a field while the copy stands still.
    // If you add a field to the screenTransaction call, either disclose it here
    // or justify why it needs no disclosure. `recentCounterparties` was
    // deliberately removed by the send-leak fix — do NOT add it back without
    // adding a matching disclosure sentence.
    const call = sendSrc.slice(
      sendSrc.indexOf('queryFn: () => screenTransaction({'),
      sendSrc.indexOf('enabled: tipScreenApplies'),
    );
    const sentFields = ['from:', 'to:', 'contractAddress', 'calldata', 'valueWei'];
    expect(call, 'recentCounterparties must NOT reappear in the payload without an equivalent disclosure').not.toContain('recentCounterparties');
    for (const f of sentFields) {
      expect(call, `${f} should still be part of the screened payload this test reasons about`).toContain(f);
    }
    // chain/actionType are not user data; everything else above is disclosed by
    // remote_enabled (remote_counterparties_note was deleted when the
    // recentCounterparties send was dropped — see the counterparties test
    // above).
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
