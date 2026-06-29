// src/components/walletconnect/__tests__/RequestApprovalModal.phishing.test.jsx
//
// C4: the phishing check originally read request.params.proposer.metadata, which is
// undefined on session_request events (proposer only exists on session_proposal). The
// phishing banner was therefore permanently suppressed. The correct dApp identity for a
// signing request lives on the ACTIVE WC session, resolved by the request's topic — in
// this codebase via the WalletConnect context `sessions` array (deniability-safe,
// reactive), found by `topic`, at session.peer.metadata.
//
// This is a structural (source-scan) pin: rendering the full modal needs the whole risk
// + WC + ethers harness. We assert the contract — metadata comes from the topic-keyed
// session, never from proposer — plus the fail-closed behaviour (an unresolved session
// shows the phishing banner rather than silently suppressing it, I4).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../RequestApprovalModal.jsx'), 'utf8');

describe('C4 — phishing check reads active-session metadata, not proposer', () => {
  it('does not read dApp metadata from request.params.proposer.metadata', () => {
    expect(src).not.toMatch(/proposer\s*\??\.?\s*\.?\s*metadata/);
  });

  it('resolves the dApp session by the request topic', () => {
    // The live session is found by matching s.topic === topic (the active-session
    // lookup C4 requires), regardless of whether the source is getActiveSessions()
    // or the reactive `sessions` context array.
    expect(src).toMatch(/\.find\(\s*\(?\s*s\s*\)?\s*=>\s*s\s*\??\.?\s*\.?topic\s*===\s*topic\s*\)/);
  });

  it('reads metadata from the resolved session at .peer.metadata', () => {
    expect(src).toMatch(/peer\s*\??\.?\s*metadata/);
  });

  it('fails closed: an unresolved session flags the request (banner shown, not suppressed)', () => {
    // When the session cannot be resolved we must not silently treat it as safe; the
    // request is flagged so the phishing banner renders (I4 fail closed).
    expect(src).toMatch(/flagged:\s*true/);
  });

  it('renders a known-bad warning banner gated on dapp.flagged', () => {
    // The per-signing phishing warning is shown when the resolved dApp is flagged.
    expect(src).toMatch(/dapp\.flagged\s*&&/);
  });

  it('warns but does NOT re-block signing on a flagged dApp (dapp.flagged absent from approveBlocked)', () => {
    // The user already acknowledged the phishing risk at connection time (the
    // approveSession UI + handler gate). Re-blocking every signing request would be
    // UX-hostile, so the per-sign treatment is a warning only. Pin that dapp.flagged
    // is NOT folded into the approveBlocked predicate.
    const m = src.match(/const approveBlocked\s*=([\s\S]*?);/);
    expect(m).not.toBeNull();
    expect(m[1]).not.toMatch(/dapp\.flagged/);
  });
});
