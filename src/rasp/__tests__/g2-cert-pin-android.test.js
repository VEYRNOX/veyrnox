// src/rasp/__tests__/g2-cert-pin-android.test.js
//
// G2 — Android root/leaf certificate pinning: structural regression pins for
// CertPinManager.kt, the native OkHttp CertificatePinner module.
//
// HONEST POSTURE: cert pinning is belt-and-suspenders on top of the existing
// SPKI_PINS host allowlist (src/wallet-core/rpc/pinning.js). The Kotlin module
// is BUILT-UNVALIDATED — it is not compiled or device-tested here. The
// production app-signing cert pin cannot be added until Play Console
// registration provides the leaf cert SHA-256 (see PLACEHOLDER_PRODUCTION_CERT).
//
// These tests read the Kotlin SOURCE and pin its structure. They start RED
// (file absent) and turn GREEN once CertPinManager.kt lands. Do NOT skip them.
//
// BUILT (structural pins only) · NOT device-verified.

import { existsSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { describe, it, expect } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../../../');
const ktPath = resolve(
  root,
  'android/app/src/main/java/com/veyrnox/app/CertPinManager.kt',
);

describe('G2 Android cert pinning — CertPinManager.kt structure', () => {
  it('CertPinManager.kt exists at the expected native path', () => {
    expect(existsSync(ktPath)).toBe(true);
  });

  it('imports okhttp3.CertificatePinner', () => {
    const kt = readFileSync(ktPath, 'utf8');
    expect(kt).toContain('okhttp3.CertificatePinner');
  });

  it('defines a buildPinnedClient function', () => {
    const kt = readFileSync(ktPath, 'utf8');
    expect(kt).toMatch(/fun\s+buildPinnedClient\s*\(/);
  });

  it('contains at least one sha256/ SPKI pin format string', () => {
    const kt = readFileSync(ktPath, 'utf8');
    expect(kt).toMatch(/"sha256\//);
  });

  it('has the PLACEHOLDER_PRODUCTION_CERT sentinel comment', () => {
    const kt = readFileSync(ktPath, 'utf8');
    expect(kt).toContain('PLACEHOLDER_PRODUCTION_CERT');
  });

  it('defines a PINNED_HOSTS map', () => {
    const kt = readFileSync(ktPath, 'utf8');
    expect(kt).toContain('PINNED_HOSTS');
  });

  it('does NOT override hostnameVerifier (a common cert-pin bypass mistake)', () => {
    const kt = readFileSync(ktPath, 'utf8');
    expect(kt).not.toMatch(/hostnameVerifier/i);
  });

  it('declares the BUILT-UNVALIDATED honesty banner in the header', () => {
    const kt = readFileSync(ktPath, 'utf8');
    expect(kt).toContain('BUILT-UNVALIDATED');
  });
});
