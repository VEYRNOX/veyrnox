// src/api/referralApi.js
//
// Referral backend via Supabase JS client (direct Postgres + RLS).
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.
// If either env var is absent, register/status are no-ops and redeem
// throws { status: 503 } — callers handle this gracefully.

import { supabase } from '@/lib/supabaseClient';

export async function registerCode(code) {
  if (!supabase) return;
  try {
    await supabase
      .from('referrals')
      .upsert({ code }, { onConflict: 'code', ignoreDuplicates: true });
  } catch {
    // Best-effort: silently ignore network/db failures on register.
  }
}

export async function redeemCode(code) {
  if (!supabase) throw Object.assign(new Error('No referral backend configured'), { status: 503 });

  const { data, error } = await supabase.rpc('increment_referral', { ref_code: code });

  if (error) {
    // Postgres raises an exception when the code doesn't exist (see migration).
    if (error.code === 'P0001' || error.message?.includes('not found')) {
      throw Object.assign(new Error('Code not found'), { status: 404 });
    }
    throw Object.assign(new Error(error.message || 'Referral error'), { status: 500 });
  }

  return { newCount: data };
}

export async function fetchStatus(code) {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('referrals')
      .select('count')
      .eq('code', code)
      .single();
    if (error || !data) return null;
    return { count: data.count };
  } catch {
    return null;
  }
}
