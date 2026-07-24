// src/api/referralApi.js
//
// Referral backend via Supabase RPC functions (SECURITY DEFINER).
// All writes go through rate-limited Postgres functions — never direct
// table access. See sql/api-security-hardening.sql.

import { supabase } from '@/lib/supabaseClient';
import { isDeniabilityOrDemoActive } from '@/wallet-core/deniabilitySession';
import { getOrCreateDeviceId } from '@/lib/deviceId';
import { getAppUserId } from '@/lib/purchases';

export async function generateServerCode() {
  if (!supabase || isDeniabilityOrDemoActive()) return null;
  try {
    const deviceId = getOrCreateDeviceId();
    if (!deviceId) return null;
    const rcUserId = await getAppUserId();
    const { data, error } = await supabase.rpc('generate_referral_code', {
      p_device_id: deviceId,
      p_rc_user_id: rcUserId,
    });
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export async function registerCode(code) {
  if (!supabase || isDeniabilityOrDemoActive()) return;
  try {
    const deviceId = getOrCreateDeviceId();
    const rcUserId = await getAppUserId();
    await supabase.rpc('register_referral_code', {
      p_code: code,
      p_device_id: deviceId,
      p_rc_user_id: rcUserId,
    });
  } catch {
    // Best-effort: silently ignore network/db failures on register.
  }
}

export async function redeemCode(code) {
  if (isDeniabilityOrDemoActive()) throw Object.assign(new Error('Unavailable'), { status: 503 });
  if (!supabase) throw Object.assign(new Error('No referral backend configured'), { status: 503 });

  const deviceId = getOrCreateDeviceId();
  if (!deviceId) throw Object.assign(new Error('No device ID'), { status: 500 });

  const { data, error } = await supabase.rpc('increment_referral', {
    p_code: code,
    p_device_id: deviceId,
  });

  if (error) {
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
    const { data, error } = await supabase.rpc('get_referral_paid_count', {
      p_code: code,
    });
    if (error || data == null) return null;
    return data;
  } catch {
    return null;
  }
}

export async function recordAttribution(referralCode, plan, revenueCents, discountCents) {
  if (!supabase || isDeniabilityOrDemoActive()) return;
  try {
    await supabase.rpc('record_attribution', {
      p_code: referralCode,
      p_plan: plan,
      p_revenue_cents: revenueCents,
      p_discount_cents: discountCents || 0,
    });
  } catch {
    // Best-effort: don't block the purchase flow on attribution failure.
  }
}

export async function fetchEarnings(code) {
  if (!supabase || isDeniabilityOrDemoActive()) return null;
  try {
    const { data, error } = await supabase.rpc('get_referral_earnings', {
      p_code: code,
    });
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

export async function claimFirstReferralBonus(referralCode) {
  if (!supabase || isDeniabilityOrDemoActive()) return null;
  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return null;

    const res = await fetch(
      `${supabaseUrl}/functions/v1/first-referral-bonus`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ referral_code: referralCode }),
      },
    );
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}
