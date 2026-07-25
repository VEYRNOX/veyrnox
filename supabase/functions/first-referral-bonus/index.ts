// supabase/functions/first-referral-bonus/index.ts
//
// Supabase Edge Function: grants the REFERRER a 1-month free Safety Plus
// entitlement via RevenueCat when their first referee converts to paid.
//
// Called by the client after record_attribution succeeds. The function:
//   1. Calls check_first_referral_bonus(p_code) — returns the referrer's
//      RevenueCat app_user_id if eligible, NULL otherwise (idempotent)
//   2. If eligible, calls the RevenueCat REST API to grant a promotional
//      entitlement for 1 month
//
// Environment variables (set via Supabase dashboard → Edge Functions → Secrets):
//   SUPABASE_URL            — auto-injected by Supabase
//   SUPABASE_SERVICE_ROLE_KEY — auto-injected; used for DB access
//   REVENUECAT_V1_SECRET_KEY — RevenueCat v1 API secret (sk_xxx)
//
// Deploy:
//   supabase functions deploy first-referral-bonus --no-verify-jwt

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ENTITLEMENT_ID = 'safety_plus';
const BONUS_DURATION = 'P1M'; // ISO 8601: 1 month

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const { referral_code } = await req.json();
    if (!referral_code || typeof referral_code !== 'string') {
      return new Response(
        JSON.stringify({ error: 'referral_code required' }),
        { status: 400, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const rcSecretKey = Deno.env.get('REVENUECAT_V1_SECRET_KEY');

    if (!rcSecretKey) {
      return new Response(
        JSON.stringify({ error: 'server_config_missing' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Atomic check + claim: returns the referrer's RC user ID if eligible,
    // NULL if ineligible or already granted.
    const { data: rcUserId, error: dbError } = await supabase.rpc(
      'check_first_referral_bonus',
      { p_code: referral_code },
    );

    if (dbError) {
      console.error('DB error:', dbError.message);
      return new Response(
        JSON.stringify({ error: 'db_error' }),
        { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    if (!rcUserId) {
      return new Response(
        JSON.stringify({ granted: false, reason: 'not_eligible' }),
        { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    // Grant 1-month promotional entitlement via RevenueCat REST API v1.
    // POST /v1/subscribers/{app_user_id}/entitlements/{entitlement_id}/promotional
    const rcUrl = `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(rcUserId)}/entitlements/${ENTITLEMENT_ID}/promotional`;
    const rcResponse = await fetch(rcUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${rcSecretKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ duration: BONUS_DURATION }),
    });

    if (!rcResponse.ok) {
      const rcBody = await rcResponse.text();
      console.error('RevenueCat error:', rcResponse.status, rcBody);

      // Revert the granted_at flag so a retry can succeed.
      await supabase
        .from('referrals')
        .update({ first_bonus_granted_at: null })
        .eq('code', referral_code);

      return new Response(
        JSON.stringify({ error: 'revenuecat_error', status: rcResponse.status }),
        { status: 502, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ granted: true }),
      { status: 200, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('Unhandled error:', err);
    return new Response(
      JSON.stringify({ error: 'internal' }),
      { status: 500, headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' } },
    );
  }
});
