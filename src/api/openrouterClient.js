// @ts-nocheck
// OpenRouter LLM client — bridges the app's InvokeLLM interface to
// openrouter.ai/api/v1/chat/completions.
//
// Requires VITE_OPENROUTER_API_KEY in .env.local (git-ignored).

const API_KEY = import.meta.env.VITE_OPENROUTER_API_KEY || '';
const BASE_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-4o-mini';

export const OPENROUTER_AVAILABLE = !!API_KEY;

export async function invokeLLM({ prompt, response_json_schema, model } = {}) {
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
