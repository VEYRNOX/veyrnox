// src/api/moonpaySign.js
//
// Calls the moonpay-sign Edge Function to HMAC-sign a MoonPay widget URL.
// The secret key lives exclusively in the Edge Function environment —
// it never reaches the client bundle.
//
// Caller: BuyCrypto.jsx handleOpen (after buildMoonpayUrl, before Browser.open)

const SIGN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/moonpay-sign`;
const ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

/**
 * Sign a MoonPay widget URL via the Supabase Edge Function.
 * Throws on network error or signing failure.
 *
 * @param {string} unsignedUrl - URL returned by buildMoonpayUrl
 * @returns {Promise<string>} The same URL with `&signature=<hmac>` appended
 */
export async function signMoonpayUrl(unsignedUrl) {
  const url = new URL(unsignedUrl);
  const queryString = '?' + url.searchParams.toString();

  const resp = await fetch(SIGN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${ANON_KEY}`,
      'apikey': ANON_KEY,
    },
    body: JSON.stringify({ queryString }),
  });

  if (!resp.ok) {
    const body = await resp.json().catch(() => ({}));
    throw new Error(body.error ?? 'SIGN_FAILED');
  }

  const { signature } = await resp.json();
  url.searchParams.set('signature', signature);
  return url.toString();
}
