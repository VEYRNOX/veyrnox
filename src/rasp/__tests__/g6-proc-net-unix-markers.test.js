// src/rasp/__tests__/g6-proc-net-unix-markers.test.js
//
// Structural pin tests for RaspIntegrityPlugin.kt checkProcNetUnix().
// These tests verify that the socket marker list in the Kotlin source covers
// the known Magisk v30.x / Zygisk / KSU / LSPosed / APatch socket name patterns.
//
// WHY pin tests?
//   Device-verified 2026-07-14 on SM-N981B (Magisk v30.7): the original marker
//   list (@magisk_, magiskd, zygisk, zygote_overlay, @ksu_, @ksud, @lspd, apatchd)
//   did NOT fire. Root cause: Magisk v26+ randomises the daemon socket name;
//   Zygisk companion sockets use "zygisk_server"/"zygisk_ldr" rather than the
//   plain "zygisk" substring we expected (path-based sockets at /dev/.magisk/zygisk
//   also appear as a distinct pattern). Fixed by:
//     - "magisk" broad catch-all (matches @magisk_XXXX, magiskd, .magisk.*, etc.)
//     - "zygisk_server", "zygisk_ldr", ".magisk.zygisk" explicit Zygisk patterns
//     - "ksu_overlayfs", "lspd_", "apd_" for KSU/LSPosed/APatch companions
//
// These are CODE PINS, not live-device tests. They confirm the markers are
// present in the Kotlin source; they do NOT prove the markers fire on any device.
// A hostile-device run is still required (tracked as G6 open item).

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const KT_PATH = resolve(
  __dirname,
  '../../../android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt'
);
const ktSource = readFileSync(KT_PATH, 'utf8');

// Extract the socketMarkers list from the Kotlin source for assertion.
// We parse the literal strings rather than inspecting a runtime value.
function extractSocketMarkers(src) {
  // Match from `val socketMarkers = listOf(` to the closing `)` on its own line.
  const match = src.match(/val socketMarkers = listOf\(([\s\S]*?)\n\s*\)/);
  if (!match) throw new Error('Could not find socketMarkers listOf(...) in RaspIntegrityPlugin.kt');
  const block = match[1];
  return [...block.matchAll(/"([^"]+)"/g)].map(m => m[1]);
}

const markers = extractSocketMarkers(ktSource);

describe('checkProcNetUnix — socket marker coverage (structural pins)', () => {
  it('has a broad "magisk" catch-all covering v26+ randomised daemon socket names', () => {
    // Magisk v26+ uses a per-install random string so prefix-only matches miss it;
    // a plain "magisk" substring catches @magisk_XXXX, magiskd, .magisk.*, etc.
    expect(markers).toContain('magisk');
  });

  it('has "zygisk_server" (Zygisk IPC server, SOCKET_NAME in zygisk/daemon.cpp)', () => {
    expect(markers).toContain('zygisk_server');
  });

  it('has "zygisk_ldr" (Zygisk loader thread socket)', () => {
    expect(markers).toContain('zygisk_ldr');
  });

  it('has ".magisk.zygisk" (path-based Zygisk sockets under MAGISKTMP)', () => {
    expect(markers).toContain('.magisk.zygisk');
  });

  it('has "@ksu_" for KernelSU abstract daemon socket', () => {
    expect(markers).toContain('@ksu_');
  });

  it('has "ksu_overlayfs" for KernelSU v0.9+ overlayfs socket', () => {
    expect(markers).toContain('ksu_overlayfs');
  });

  it('has "@lspd" for LSPosed daemon socket', () => {
    expect(markers).toContain('@lspd');
  });

  it('has "lspd_" for LSPosed companion variant', () => {
    expect(markers).toContain('lspd_');
  });

  it('has "apatchd" for APatch daemon', () => {
    expect(markers).toContain('apatchd');
  });

  it('has "apd_" for APatch companion', () => {
    expect(markers).toContain('apd_');
  });

  it('has at least 10 markers total (belt-and-suspenders coverage)', () => {
    expect(markers.length).toBeGreaterThanOrEqual(10);
  });

  it('broad "magisk" marker would match socket names seen in Magisk v30.x variants', () => {
    // Simulate the contains() check the Kotlin code runs.
    const testCases = [
      { socket: '@magisk_a1b2c3d4', desc: 'v20-25 daemon (hex suffix)' },
      { socket: 'magiskd',          desc: 'legacy daemon name' },
      { socket: 'magisk_daemon',    desc: 'alternative daemon name' },
      { socket: '@.magisk.module',  desc: 'v26+ dot-prefix variant' },
      { socket: 'magisk_client',    desc: 'client companion socket' },
    ];
    for (const { socket, desc } of testCases) {
      const lower = socket.toLowerCase();
      const hit = markers.some(m => lower.includes(m));
      expect(hit, `expected "magisk" marker to match "${socket}" (${desc})`).toBe(true);
    }
  });

  it('"zygisk_server" marker matches the Zygisk companion socket', () => {
    const testCases = [
      '@zygisk_server',
      'zygisk_server',
      '/dev/.magisk/zygisk_server',
    ];
    for (const s of testCases) {
      const lower = s.toLowerCase();
      expect(markers.some(m => lower.includes(m)), `should match "${s}"`).toBe(true);
    }
  });
});
