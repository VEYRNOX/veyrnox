// src/api/referralApi.js
//
// Thin fetch wrapper for the referral backend.
// Set VITE_REFERRAL_API_URL in .env.local to point at the deployed endpoint.
// If the env var is unset, register/status are no-ops and redeem throws — the
// caller handles the error gracefully (silent skip in onboarding, error message
// on the Referral page).

const BASE_URL = import.meta.env.VITE_REFERRAL_API_URL || '';

export async function registerCode(code) {
  if (!BASE_URL) return;
  try {
    await fetch(`${BASE_URL}/referrals/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });
  } catch {
    // Best-effort: network failure on register is silently ignored.
  }
}

export async function redeemCode(code) {
  if (!BASE_URL) throw Object.assign(new Error('No referral API configured'), { status: 503 });
  const res = await fetch(`${BASE_URL}/referrals/redeem`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  });
  if (res.status === 404) throw Object.assign(new Error('Code not found'), { status: 404 });
  if (!res.ok) throw Object.assign(new Error('Referral error'), { status: res.status });
  return res.json(); // { newCount: number }
}

export async function fetchStatus(code) {
  if (!BASE_URL) return null;
  try {
    const res = await fetch(`${BASE_URL}/referrals/status?code=${encodeURIComponent(code)}`);
    if (!res.ok) return null;
    return res.json(); // { count: number }
  } catch {
    return null;
  }
}
