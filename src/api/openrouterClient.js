// @ts-nocheck
// OpenRouter LLM client — bridges the app's InvokeLLM interface to
// openrouter.ai/api/v1/chat/completions.
//
// Requires VITE_OPENROUTER_API_KEY in .env.local (git-ignored).
//
// I3 CHOKEPOINT: invokeLLM is a POST to a third-party host (openrouter.ai).
// It MUST fail closed at the primitive layer during a deniability/demo
// session — a decoy/hidden session has no reason to make ANY backend call,
// let alone one carrying a user-authored prompt. UI-layer hides are
// suspenders; this guard is the belt. See PR #783 / #858 / #921 for the
// same chokepoint pattern on other egress primitives.

import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession.js';

const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';
const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

export const OPENROUTER_AVAILABLE = !!API_KEY;

export async function invokeLLM({ prompt, response_json_schema, model } = {}) {
  // I3 fail-closed: no backend calls in a deniability/demo session.
  if (isDeniabilityOrDemoActive()) {
    const err = new Error('I3_DENIABILITY_ACTIVE');
    err.code = 'I3_DENIABILITY_ACTIVE';
    throw err;
  }
  if (!API_KEY) throw new Error('OpenRouter API key not configured');

  const messages = [{ role: 'user', content: prompt }];

  const body = {
    model: model || DEFAULT_MODEL,
    messages,
    max_tokens: 2000,
  };

  if (response_json_schema) {
    body.response_format = { type: 'json_object' };
    messages[0].content += `\n\nRespond with valid JSON matching this schema: ${JSON.stringify(response_json_schema)}`;
  }

  const res = await fetch(BASE_URL, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://veyrnox.com',
      'X-Title': 'Veyrnox Wallet',
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`OpenRouter ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '';

  if (response_json_schema) {
    try {
      return JSON.parse(content);
    } catch {
      throw new Error('OpenRouter returned invalid JSON');
    }
  }

  return { response: content };
}
