// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { webcrypto } from 'node:crypto';
import { Connection, PublicKey, SolanaJSONRPCError } from '@solana/web3.js';

const require = createRequire(import.meta.url);
const solanaRequire = createRequire(require.resolve('@solana/web3.js'));
const RpcClient = solanaRequire('jayson/lib/client/browser');
const { WebSocketServer } = require('ws');
const address = new PublicKey(new Uint8Array(32));

describe('Solana RPC with the scoped Jayson dependency', () => {
  let server;
  let websocket;
  let endpoint;
  let connection;
  let requests;
  let mode;

  beforeEach(async () => {
    requests = [];
    mode = 'ok';
    server = createServer(async (req, res) => {
      let body = '';
      for await (const chunk of req) body += chunk;
      const request = JSON.parse(body);
      requests.push(request);
      if (mode === 'malformed') return res.end('{');
      if (mode === 'http-error') {
        res.writeHead(503);
        return res.end('local fixture unavailable');
      }
      if (!Array.isArray(request) && request.id === undefined) {
        res.writeHead(204);
        return res.end();
      }
      const reply = (item) => {
        if (mode === 'rpc-error') return {
          jsonrpc: '2.0', id: item.id,
          error: { code: -32000, message: 'local fixture error', data: { retry: false } },
        };
        const result = item.method === 'getBalance'
          ? { context: { slot: 7 }, value: 123 }
          : item.method === 'getTransaction' ? null : 7;
        return { jsonrpc: '2.0', id: item.id, result };
      };
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify(Array.isArray(request) ? request.map(reply) : reply(request)));
    });
    websocket = new WebSocketServer({ server });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    endpoint = `http://127.0.0.1:${server.address().port}`;
    connection = new Connection(endpoint, {
      commitment: 'confirmed',
      wsEndpoint: endpoint.replace('http:', 'ws:'),
      disableRetryOnRateLimit: true,
    });
  });

  afterEach(async () => {
    vi.unstubAllGlobals();
    connection._rpcWebSocket.close();
    for (const client of websocket.clients) client.terminate();
    await new Promise((resolve) => websocket.close(resolve));
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  });

  it('resolves Jayson 5 from Solana and removes the vulnerable dependency', () => {
    const manifest = solanaRequire('jayson/package.json');
    expect(manifest.version).toBe('5.0.0');
    expect(manifest.dependencies).not.toHaveProperty('stream-json');
    expect(() => solanaRequire.resolve('stream-json')).toThrow();
    expect(() => solanaRequire('jayson')).not.toThrow();
  });

  it('performs real Connection single requests with unique generated IDs', async () => {
    expect(await connection.getBalance(address)).toBe(123);
    expect(await connection.getSlot()).toBe(7);
    expect(requests[0]).toMatchObject({
      jsonrpc: '2.0', method: 'getBalance',
      params: [address.toBase58(), { commitment: 'confirmed' }],
    });
    expect(requests[0].id).toMatch(/^[\da-f-]{36}$/i);
    expect(requests[1].id).not.toBe(requests[0].id);
  });

  it('uses the browser entry crypto fallback when randomUUID is absent', () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const transport = vi.fn();
    const client = new RpcClient(transport);
    const first = client.request('getSlot', []);
    const second = client.request('getSlot', []);
    expect(first.id).toMatch(/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i);
    expect(second.id).not.toBe(first.id);
    expect(transport).not.toHaveBeenCalled();
  });

  it('fails honestly before transport when browser crypto is missing', () => {
    vi.stubGlobal('crypto', undefined);
    const transport = vi.fn();
    const client = new RpcClient(transport);
    expect(() => client.request('getSlot', [])).toThrow(/crypto.*unavailable/);
    const callback = vi.fn();
    client.request('getSlot', [], callback);
    expect(callback).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringMatching(/crypto.*unavailable/),
    }));
    expect(transport).not.toHaveBeenCalled();
  });

  it('performs a real Connection batch request', async () => {
    expect(await connection.getParsedTransactions(['fixture-one', 'fixture-two'])).toEqual([null, null]);
    expect(requests).toHaveLength(1);
    expect(requests[0].map((r) => r.method)).toEqual(['getTransaction', 'getTransaction']);
    expect(requests[0].map((r) => r.params[0])).toEqual(['fixture-one', 'fixture-two']);
    expect(new Set(requests[0].map((r) => r.id)).size).toBe(2);
  });

  it('preserves browser-client notifications and empty HTTP responses', async () => {
    // Connection exposes no HTTP notification API; exercise its exact Jayson entry point.
    const client = new RpcClient((body, callback) => {
      fetch(endpoint, { method: 'POST', body })
        .then((res) => res.text()).then((text) => callback(null, text), callback);
    });
    const response = await new Promise((resolve, reject) => {
      client.request('fixtureNotification', [], null, (error, response) => {
        if (error) return reject(error);
        resolve(response);
      });
    });
    expect(response).toBeUndefined();
    expect(requests[0]).not.toHaveProperty('id');
  });

  it('preserves structured JSON-RPC error parsing through Connection', async () => {
    mode = 'rpc-error';
    const error = await connection.getBlockTime(7).catch((e) => e);
    expect(error).toBeInstanceOf(SolanaJSONRPCError);
    expect(error).toMatchObject({ code: -32000, data: { retry: false } });
    expect(error.message).toContain('local fixture error');
  });

  it('rejects malformed JSON and HTTP errors through Connection', async () => {
    mode = 'malformed';
    await expect(connection.getSlot()).rejects.toThrow();
    mode = 'http-error';
    await expect(connection.getSlot()).rejects.toThrow(/503.*local fixture unavailable/);
  });

  it('retains websocket subscription notifications and unsubscribe', async () => {
    let peer;
    const methods = [];
    websocket.on('connection', (socket) => {
      peer = socket;
      socket.on('message', (bytes) => {
        const request = JSON.parse(bytes.toString());
        methods.push(request.method);
        socket.send(JSON.stringify({
          jsonrpc: '2.0', id: request.id,
          result: request.method === 'slotSubscribe' ? 42 : true,
        }));
      });
    });
    const updates = [];
    const id = connection.onSlotChange((update) => updates.push(update));
    try {
      await vi.waitFor(() => expect(methods).toContain('slotSubscribe'));
      await vi.waitFor(() => {
        peer.send(JSON.stringify({
          jsonrpc: '2.0', method: 'slotNotification',
          params: { subscription: 42, result: { parent: 6, slot: 7, root: 5 } },
        }));
        expect(updates.length).toBeGreaterThan(0);
      });
      expect(updates[0]).toEqual({ parent: 6, slot: 7, root: 5 });
    } finally {
      await connection.removeSlotChangeListener(id);
    }
    expect(methods).toContain('slotUnsubscribe');
  });
});
