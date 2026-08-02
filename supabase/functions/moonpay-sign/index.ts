// supabase/functions/moonpay-sign/index.ts
//
// Signs a MoonPay widget query string with HMAC-SHA256 so the widget loads
// without "Signature check failed". The secret key never leaves this function.
//
// POST { queryString: '?apiKey=...&...' }
// → { signature: '<base64-encoded-hmac>' }
//
// Caller: src/api/moonpaySign.js (BuyCrypto.jsx handleOpen, after buildMoonpayUrl)
// Secret: supabase secrets set MOONPAY_SECRET_KEY=sk_test_...

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405, headers: CORS_HEADERS });
  }

  const secretKey = Deno.env.get('MOONPAY_SECRET_KEY') ?? '';
  if (!secretKey) {
    return new Response(JSON.stringify({ error: 'SIGNING_UNAVAILABLE' }), {
      status: 503,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  let queryString: string;
  try {
    ({ queryString } = await req.json());
  } catch {
    return new Response(JSON.stringify({ error: 'INVALID_BODY' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (typeof queryString !== 'string' || !queryString.startsWith('?')) {
    return new Response(JSON.stringify({ error: 'INVALID_QUERY_STRING' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sigBytes = await crypto.subtle.sign('HMAC', key, encoder.encode(queryString));
  const signature = btoa(String.fromCharCode(...new Uint8Array(sigBytes)));

  return new Response(JSON.stringify({ signature }), {
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
