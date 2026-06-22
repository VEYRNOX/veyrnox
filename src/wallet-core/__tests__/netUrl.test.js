// wallet-core/__tests__/netUrl.test.js
//
// assertSafeRpcUrl gates user/operator-supplied RPC/indexer override URLs before
// they become the egress target (I2: no silent egress). https to any host;
// http only to loopback (local node); no embedded credentials; no other schemes.

import { describe, it, expect } from 'vitest';
import { assertSafeRpcUrl } from '../netUrl.js';

describe('assertSafeRpcUrl', () => {
  it('accepts https to any host and returns the trimmed url', () => {
    expect(assertSafeRpcUrl('  https://rpc.example.com/v1  ')).toBe('https://rpc.example.com/v1');
  });

  it('accepts http only for loopback (local operator node)', () => {
    expect(assertSafeRpcUrl('http://localhost:8545')).toBe('http://localhost:8545');
    expect(assertSafeRpcUrl('http://127.0.0.1:3000')).toBe('http://127.0.0.1:3000');
    expect(assertSafeRpcUrl('http://[::1]:8899')).toBe('http://[::1]:8899');
  });

  it('rejects http to a remote host (plaintext downgrade / address leak)', () => {
    expect(() => assertSafeRpcUrl('http://rpc.example.com')).toThrow();
  });

  it('rejects non-http(s) schemes', () => {
    for (const u of ['ftp://h/x', 'file:///etc/passwd', 'ws://h', 'javascript:alert(1)', 'data:text/html,x']) {
      expect(() => assertSafeRpcUrl(u)).toThrow();
    }
  });

  it('rejects embedded credentials', () => {
    expect(() => assertSafeRpcUrl('https://user:pass@rpc.example.com')).toThrow();
  });

  it('rejects empty / non-string / unparseable input', () => {
    expect(() => assertSafeRpcUrl('')).toThrow();
    expect(() => assertSafeRpcUrl('   ')).toThrow();
    expect(() => assertSafeRpcUrl(null)).toThrow();
    expect(() => assertSafeRpcUrl(undefined)).toThrow();
    expect(() => assertSafeRpcUrl('not a url')).toThrow();
  });
});
