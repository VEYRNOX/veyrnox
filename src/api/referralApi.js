// src/api/referralApi.js
//
// Referral backend via Supabase JS client (direct Postgres + RLS).
// Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.
// If either env var is absent, register/status are no-ops and redeem
// throws { status: 503 } — callers handle this gracefully.

import { supabase } from '@/lib/supabaseClient';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';

export async function generateServerCode() {
  if (!supabase || isDeniabilityOrDemoActive()) return null;
  try {
    const { data, error } = await supabase.rpc('generate_referral_code');
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export async function registerCode(code) {
  if (!supabase || isDeniabilityOrDemoActive()) return;
  try {
    await supabase
      .from('referrals')
      .upsert({ code }, { onConflict: 'code', ignoreDuplicates: true });
  } catch {
    // Best-effort: silently ignore network/db failures on register.
  }
}

export async function redeemCode(code) {
  if (isDeniabilityOrDemoActive()) throw Object.assign(new Error('Unavailable'), { status: 503 });
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
  if (!supabase || isDeniabilityOrDemoActive()) return null;
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

export const fetchReferrerTier = fetchStatus;

export async function fetchPaidCount(code) {
  if (!supabase || isDeniabilityOrDemoActive()) return null;
  try {
    const { count, error } = await supabase
      .from('referral_attributions')
      .select('*', { count: 'exact', head: true })
      .eq('referral_code', code);
    if (error || count == null) return null;
    return count;
  } catch {
    return null;
  }
}

export async function recordAttribution(referralCode, plan, revenueCents, discountCents) {
  if (!supabase || isDeniabilityOrDemoActive()) return;
  try {
    await supabase
      .from('referral_attributions')
      .insert({
        referral_code: referralCode,
        plan,
        revenue_cents: revenueCents,
        discount_cents: discountCents || 0,
      });
  } catch {
    // Best-effort: don't block the purchase flow on attribution failure.
  }
}

export async function fetchEarnings(code) {
  if (!supabase || isDeniabilityOrDemoActive()) return null;
  try {
    const { data, error } = await supabase
      .from('referral_attributions')
      .select('plan, revenue_cents, discount_cents, created_at')
      .eq('referral_code', code);
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}
