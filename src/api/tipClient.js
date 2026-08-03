// @ts-nocheck
// TIP Client SDK — HMAC-SHA256 request signing (F1: per-key derived secret).
// Web Crypto only — works in browser, Capacitor, and Workers.

const enc = new TextEncoder();

async function sha256Hex(input) {
  const hash = await crypto.subtle.digest('SHA-256', enc.encode(input));
  return bufToHex(new Uint8Array(hash));
}

async function hmacHex(message, secret) {
  const key = await crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return bufToHex(new Uint8Array(sig));
}

function bufToHex(buf) {
  return Array.from(buf).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function createTipClient({ apiKey, signingSecret, baseUrl, timeout = 10_000 }) {
  if (!apiKey || !signingSecret || !baseUrl) {
    throw new Error('tipClient: apiKey, signingSecret, and baseUrl are required');
  }

  const url = baseUrl.replace(/\/$/, '');
  let _keySecret = null;

  async function getKeySecret() {
    if (_keySecret) return _keySecret;
    const keyHash = await sha256Hex(apiKey);
    _keySecret = await hmacHex(keyHash, signingSecret);
    return _keySecret;
  }

  async function signedFetch(path, body) {
    const keySecret = await getKeySecret();
    const bodyStr = JSON.stringify(body);
    const ts = Math.floor(Date.now() / 1000).toString();
    const sig = await hmacHex(`${ts}.${bodyStr}`, keySecret);

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    try {
      const resp = await fetch(`${url}${path}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Api-Key': apiKey,
          'X-Timestamp': ts,
          'X-Signature': sig,
        },
        body: bodyStr,
        signal: controller.signal,
      });
      return resp;
    } finally {
      clearTimeout(timer);
    }
  }

  async function screen(params) {
    const body = {
      request_id: params.request_id || `tip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      chain: params.chain,
      action_type: params.action_type,
      from_address: params.from_address,
      to_address: params.to_address,
      ...(params.value_wei && { value_wei: params.value_wei }),
      ...(params.contract_address && { contract_address: params.contract_address }),
      ...(params.token_address && { token_address: params.token_address }),
      ...(params.calldata && { calldata: params.calldata }),
      ...(params.metadata && { metadata: params.metadata }),
      ...(params.recent_counterparties && { recent_counterparties: params.recent_counterparties }),
    };

    const resp = await signedFetch('/api/v1/screen', body);

    if (!resp.ok) {
      const errBody = await resp.json().catch(() => ({ error: resp.statusText }));
      const err = new Error(errBody.error || `TIP screen failed: ${resp.status}`);
      err.status = resp.status;
      err.body = errBody;
      throw err;
    }

    return resp.json();
  }

  async function chat(messages, context) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 30_000);

    try {
      const resp = await fetch(`${url}/api/v1/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages, context }),
        signal: controller.signal,
      });

      if (!resp.ok) {
        const errBody = await resp.json().catch(() => ({ error: resp.statusText }));
        throw new Error(errBody.error || `TIP chat failed: ${resp.status}`);
      }

      return parseSseStream(resp.body);
    } finally {
      clearTimeout(timer);
    }
  }

  async function health() {
    const resp = await fetch(`${url}/health`);
    return resp.json();
  }

  return { screen, chat, health };
}

async function* parseSseStream(body) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') {
          yield { token: '', done: true };
          return;
        }
        try {
          const parsed = JSON.parse(data);
          yield { token: parsed.response || '', done: false };
        } catch {
          yield { token: data, done: false };
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

export function verdictToRiskLevel(verdict) {
  switch (verdict) {
    case 'block': return 'high';
    case 'warn': return 'medium';
    case 'allow': return 'info';
    // M-4 — an unrecognised verdict is NOT informational. This defaulted to
    // 'info', so a renamed/absent/unknown verdict rendered as benign in the UI
    // while s9 separately scored it OK. Both defaults are now cautionary.
    default: return 'medium';
  }
}

export function signalsToRiskRows(signals) {
  if (!signals || signals.length === 0) return [];
  return signals.map(s => ({
    level: s.risk_level === 'critical' ? 'high' : s.risk_level,
    title: s.signal_type.replace(/_/g, ' '),
    detail: `Source: ${s.source} · Confidence: ${Math.round(s.confidence * 100)}%`,
    value: s.value,
  }));
}

export function requiresAcknowledgment(verdict) {
  return verdict === 'block' || verdict === 'warn';
}
