// wallet-core/__tests__/netUrl.test.js
//
// assertSafeRpcUrl gates user/operator-supplied RPC/indexer override URLs before
// they become the egress target (I2: no silent egress). https to any host;
// http only to loopback (local node); no embedded credentials; no other schemes.

import { describe, it, expect, afterEach } from 'vitest';
import { assertSafeRpcUrl, safeExternalUrl } from '../netUrl.js';

afterEach(() => {
  // Reset the runtime opt-in between tests so they don't leak state.
  try { delete globalThis.__veyrnoxAllowCustomRpc; } catch { /* noop */ }
});

describe('assertSafeRpcUrl', () => {
  it('accepts https to a well-known RPC provider and returns the trimmed url', () => {
    expect(assertSafeRpcUrl('  https://mainnet.infura.io/v3/abc  ')).toBe('https://mainnet.infura.io/v3/abc');
    expect(assertSafeRpcUrl('https://api.mainnet-beta.solana.com')).toBe('https://api.mainnet-beta.solana.com');
    expect(assertSafeRpcUrl('https://blockstream.info/api')).toBe('https://blockstream.info/api');
  });

  it('rejects https to an unknown host by default (I2 fail-closed, Codex P2 2026-08-15)', () => {
    expect(() => assertSafeRpcUrl('https://rpc.example.com/v1')).toThrow(/not in the well-known/);
  });

  it('accepts https to an unknown host when the runtime opt-in flag is set', () => {
    globalThis.__veyrnoxAllowCustomRpc = true;
    expect(assertSafeRpcUrl('https://rpc.example.com/v1')).toBe('https://rpc.example.com/v1');
  });

  it('rejects a suffix collision that spoofs a well-known provider (evilinfura.io ≠ infura.io)', () => {
    // Suffix matches require a leading '.' — no bare-substring bypasses.
    expect(() => assertSafeRpcUrl('https://evilinfura.io')).toThrow(/not in the well-known/);
  });

  it('accepts http only for loopback (local operator node)', () => {
    expect(assertSafeRpcUrl('http://localhost:8545')).toBe('http://localhost:8545');
    expect(assertSafeRpcUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    expect(assertSafeRpcUrl('http://[::1]:8899')).toBe('http://[::1]:8899');
  });

  it('rejects http to a remote host (plaintext downgrade / address leak)', () => {
    expect(() => assertSafeRpcUrl('http://mainnet.infura.io')).toThrow();
  });

  it('rejects non-http(s) schemes', () => {
    for (const u of ['ftp://h/x', 'file:///etc/passwd', 'ws://h', 'javascript:alert(1)', 'data:text/html,x']) {
      expect(() => assertSafeRpcUrl(u)).toThrow();
    }
  });

  it('rejects embedded credentials (even on a well-known host)', () => {
    expect(() => assertSafeRpcUrl('https://user:pass@mainnet.infura.io')).toThrow(/credentials/);
  });

  it('rejects empty / non-string / unparseable input', () => {
    expect(() => assertSafeRpcUrl('')).toThrow();
    expect(() => assertSafeRpcUrl('   ')).toThrow();
    expect(() => assertSafeRpcUrl(null)).toThrow();
    expect(() => assertSafeRpcUrl(undefined)).toThrow();
    expect(() => assertSafeRpcUrl('not a url')).toThrow();
  });
});

describe('safeExternalUrl (non-throwing render guard, e.g. explorer_url)', () => {
  it('returns the trimmed url for a well-known https host', () => {
    // safeExternalUrl composes assertSafeRpcUrl, so the same allowlist applies.
    // If a future caller renders an arbitrary explorer URL, gate at that render
    // site — do NOT weaken the shared validator to make it pass silently.
    expect(safeExternalUrl('  https://mainnet.infura.io  ')).toBe('https://mainnet.infura.io');
    expect(safeExternalUrl('http://localhost:4000')).toBe('http://localhost:4000');
  });

  it('returns null for unsafe schemes (no href reaches the DOM)', () => {
    for (const u of ['javascript:alert(document.cookie)', 'data:text/html,<script>1</script>', 'file:///etc/passwd', 'http://evil.example.com', 'vbscript:msgbox(1)']) {
      expect(safeExternalUrl(u)).toBeNull();
    }
  });

  it('returns null for empty / non-string input', () => {
    expect(safeExternalUrl('')).toBeNull();
    expect(safeExternalUrl(undefined)).toBeNull();
    expect(safeExternalUrl(null)).toBeNull();
  });
});
