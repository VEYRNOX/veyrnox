// functions/api/data/llm.js
//
// OpenRouter LLM proxy. The client sends { prompt, model, response_json_schema }
// and the edge injects the API key server-side. The key never ships in the bundle.

function err(status, message) {
  const e = new Error(message);
  e.status = status;
  e.expose = true;
  throw e;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) err(503, 'LLM not configured');

  let body;
  try {
    body = await request.json();
  } catch {
    err(400, 'Invalid JSON');
  }

  const { prompt, model, response_json_schema } = body;
  if (!prompt || typeof prompt !== 'string') err(400, 'prompt is required');
  if (prompt.length > 8000) err(400, 'Prompt too long');

  const messages = [{ role: 'user', content: prompt }];
  const reqBody = {
    model: model || 'openai/gpt-4o-mini',
    messages,
    max_tokens: 2000,
  };

  if (response_json_schema) {
    reqBody.response_format = { type: 'json_object' };
    messages[0].content += `\n\nRespond with valid JSON matching this schema: ${JSON.stringify(response_json_schema)}`;
  }

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://veyrnox.com',
      'X-Title': 'Veyrnox Wallet',
    },
    body: JSON.stringify(reqBody),
  });

  const responseBody = await res.text();

  return new Response(responseBody, {
    status: res.status,
    headers: { 'Content-Type': 'application/json' },
  });
}
