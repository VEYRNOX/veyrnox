// functions/api/moonpay-sign.js
//
// Cloudflare Pages Function — signs a MoonPay widget query string with
// HMAC-SHA256. Runs at the CF edge; MOONPAY_SECRET_KEY is a CF Pages
// environment variable and never reaches the client bundle.
//
// POST { queryString: '?apiKey=...&...' }
// → { signature: '<base64-encoded-hmac>' }
//
// Caller: src/api/moonpaySign.js (relative URL /api/moonpay-sign)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'content-type',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS });
}

export async function onRequestPost(context) {
  const secret = context.env.MOONPAY_SECRET_KEY ?? '';
  if (!secret) {
    return new Response(JSON.stringify({ error: 'SIGNING_UNAVAILABLE' }), {
      status: 503,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  let queryString;
  try {
    ({ queryString } = await context.request.json());
  } catch {
    return new Response(JSON.stringify({ error: 'INVALID_BODY' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  if (typeof queryString !== 'string' || !queryString.startsWith('?')) {
    return new Response(JSON.stringify({ error: 'INVALID_QUERY_STRING' }), {
      status: 400,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(queryString));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  return new Response(JSON.stringify({ signature }), {
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
