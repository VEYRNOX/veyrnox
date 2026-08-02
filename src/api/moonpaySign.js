// src/api/moonpaySign.js
//
// Calls the Cloudflare Pages Function at /api/moonpay-sign to HMAC-sign a
// MoonPay widget URL. The secret key lives exclusively in the CF Pages
// environment variable — it never reaches the client bundle.
//
// Caller: BuyCrypto.jsx handleOpen (after buildMoonpayUrl, before Browser.open)

/**
 * Sign a MoonPay widget URL via the CF Pages Function.
 * Throws on network error or signing failure.
 *
 * @param {string} unsignedUrl - URL returned by buildMoonpayUrl
 * @returns {Promise<string>} The same URL with `&signature=<hmac>` appended
 */
export async function signMoonpayUrl(unsignedUrl) {
  const url = new URL(unsignedUrl);
  const queryString = '?' + url.searchParams.toString();

  const resp = await fetch('/api/moonpay-sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
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
