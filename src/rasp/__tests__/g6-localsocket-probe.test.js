// src/rasp/__tests__/g6-localsocket-probe.test.js
//
// Structural pin tests for RaspIntegrityPlugin.kt checkLocalSocketConnect().
//
// WHY LocalSocket instead of /proc/net/unix?
//   checkProcNetUnix() is inert on Android 10+ — SELinux denies
//   proc_net reads for untrusted_app (device-verified 2026-07-14, SM-N981B,
//   Android 12: avc denied {read} proc_net). LocalSocket.connect() to a
//   known abstract socket does NOT require proc_net access — it is a
//   behavioral probe: if the Zygisk companion / LSPosed / APatch daemon
//   socket is listening, the connect succeeds; on stock Android it is
//   ECONNREFUSED (socket absent).
//
// Target sockets (fixed names, not randomised):
//   "zygisk_server"  — Zygisk companion IPC server (SOCKET_NAME in
//                      Magisk source zygisk/daemon.cpp, Magisk v24+)
//   "lspd_0"         — LSPosed daemon (format: lspd_<uid>; UID 0 = root)
//   "apd"            — APatch companion daemon
//   "ksud"           — KernelSU daemon
//
// SELinux caveat (honest):
//   connect() FROM untrusted_app TO an abstract socket requires an
//   SELinux allow rule. This may be denied on hardened Android 12+ builds.
//   runCatching{}.getOrDefault(false) means a denied connect returns false
//   (fail-open for this check, not fail-closed). checkDangerousProps is the
//   primary operative Magisk signal; this is belt-and-suspenders.
//
// These are CODE PINS only. Device-verification still required.
// BUILT · structural pins · NOT device-verified · INTERNAL.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const KT_PATH = resolve(
  __dirname,
  '../../../android/app/src/main/java/com/veyrnox/app/RaspIntegrityPlugin.kt',
);
const ktSource = readFileSync(KT_PATH, 'utf8');

describe('G6 checkLocalSocketConnect — implementation pins', () => {
  it('imports android.net.LocalSocket', () => {
    expect(ktSource).toContain('import android.net.LocalSocket');
  });

  it('imports android.net.LocalSocketAddress', () => {
    expect(ktSource).toContain('import android.net.LocalSocketAddress');
  });

  it('defines checkLocalSocketConnect() private fun', () => {
    expect(ktSource).toMatch(/private fun checkLocalSocketConnect\(\)/);
  });

  it('is called from detectRoot() or checkIntegrity()', () => {
    expect(ktSource).toMatch(/checkLocalSocketConnect\(\)/);
  });

  it('uses LocalSocketAddress.Namespace.ABSTRACT for abstract sockets', () => {
    expect(ktSource).toContain('LocalSocketAddress.Namespace.ABSTRACT');
  });

  it('probes "zygisk_server" (Zygisk companion IPC — Magisk v24+, fixed name)', () => {
    expect(ktSource).toContain('"zygisk_server"');
  });

  it('probes "lspd_0" (LSPosed daemon socket at UID 0)', () => {
    expect(ktSource).toContain('"lspd_0"');
  });

  it('probes "apd" (APatch companion daemon)', () => {
    expect(ktSource).toContain('"apd"');
  });

  it('probes "ksud" (KernelSU daemon)', () => {
    expect(ktSource).toContain('"ksud"');
  });

  it('uses runCatching inside checkLocalSocketConnect (fail-open on SecurityException)', () => {
    const fnMatch = ktSource.match(/private fun checkLocalSocketConnect\(\)[\s\S]*?(?=\n    \/\/|\n    private fun)/);
    expect(fnMatch, 'checkLocalSocketConnect function body not found').toBeTruthy();
    expect(fnMatch[0]).toContain('runCatching');
  });

  it('closes the socket in a finally block or try-with-resources pattern', () => {
    expect(ktSource).toMatch(/\.close\(\)|use\s*\{/);
  });

  it('has an honest SELinux caveat comment', () => {
    expect(ktSource).toMatch(/SELinux|untrusted_app|ECONNREFUSED/);
  });
});
