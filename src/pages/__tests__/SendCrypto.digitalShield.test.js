// Structural regression guard for the Digital Shield send branch in SendCrypto.
// Like the existing Trezor / confirmation / deniability pins, this reads the
// source rather than mounting the entire send flow with every signer, query, and
// step-up dependency mocked.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const src = readFileSync(resolve(here, '../SendCrypto.jsx'), 'utf8');

describe('SendCrypto — Digital Shield air-gap branch', () => {
  it('imports the Digital Shield context and wallet-core request/response helpers', () => {
    expect(src).toMatch(/useDigitalShield/);
    expect(src).toMatch(/buildDigitalShieldEvmRequest/);
    expect(src).toMatch(/buildDigitalShieldBtcPsbt/);
    expect(src).toMatch(/buildDigitalShieldSolRequest/);
    expect(src).toMatch(/finalizeDigitalShieldEvmResponse/);
    expect(src).toMatch(/finalizeDigitalShieldBtcResponse/);
    expect(src).toMatch(/finalizeDigitalShieldSolResponse/);
  });

  it('offers a dedicated Digital Shield toggle and routes confirm through startSendAttempt', () => {
    expect(src).toContain('Use Digital Shield air-gap signing');
    expect(src).toMatch(/useDigitalShieldMode/);
    expect(src).toMatch(/startSendAttempt/);
    expect(src).toMatch(/Prepare Digital Shield QR/);
  });

  it('gates BTC Digital Shield to mainnet in the UI and forwards the live networkKey to the BTC builder', () => {
    expect(src).toMatch(/digitalShieldBtcUnsupported\s*=\s*isBtc && networkKey !== 'mainnet'/);
    expect(src).toMatch(/disabled=\{digitalShieldBtcUnsupported\}/);
    expect(src).toMatch(/Digital Shield BTC signing is currently supported on Bitcoin mainnet only/);
    expect(src).toMatch(/Bitcoin testnet and signet are not supported for Digital Shield yet/);
    expect(src).toMatch(/buildDigitalShieldBtcPsbt\(\{[\s\S]*networkKey,[\s\S]*\}\)/);
  });

  it('fails closed for demo and deniability sessions before preparing a QR request', () => {
    expect(src).toMatch(/Digital Shield signing is disabled in demo and deniability sessions/);
    expect(src).toMatch(/isDeniabilityOrDemoActive\(\)/);
    expect(src).toMatch(/DEMO/);
  });

  it('finalizes the signed response locally before broadcast instead of trusting the device blindly', () => {
    expect(src).toMatch(/finalizeDigitalShieldEvmResponse/);
    expect(src).toMatch(/finalizeDigitalShieldBtcResponse/);
    expect(src).toMatch(/finalizeDigitalShieldSolResponse/);
    expect(src).toMatch(/broadcastTransaction\(result\.signedHex\)/);
    expect(src).toMatch(/broadcastBtcTx\(networkKey,\s*result\.finalizedTxHex\)/);
    expect(src).toMatch(/tx\.addSignature/);
  });
});
