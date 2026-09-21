-- Security audit 2026-09-21, finding M1.
--
-- Eight referral/telemetry RPCs are EXECUTE-able by anon and authenticated on
-- prod (jwstkrtslotnjyerzzsi). The wallet reaches them only through the
-- Cloudflare Pages proxy (functions/api/rpc/[fn].js), which calls PostgREST
-- with SUPABASE_SERVICE_ROLE_KEY. Direct anon calls bypass the proxy's
-- allowlist, body caps and Turnstile/rate limits.
--
-- PRECONDITION — do not run until BOTH are true, or the proxy 500s:
--   1. functions/api/rpc/[fn].js from this audit branch is deployed;
--   2. SUPABASE_SERVICE_ROLE_KEY is set on the veyrnox-prod Pages project
--      (the proxy still falls back to the anon key when it is missing).
-- Verify with: SELECT current_setting('request.jwt.claims', true) is unused;
-- instead call /api/rpc/get_referral_tier from the deployed site and confirm 200.
--
-- Apply via the Supabase SQL editor or MCP execute_sql on prod, then staging.
-- Never on yrqzwqywxfesmbvhzjgj (veyrnox.ai).

BEGIN;

REVOKE EXECUTE ON FUNCTION public.generate_referral_code()            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_referral_count(text)            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_referral_earnings(text)         FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_referral_paid_count(text)       FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_referral_tier(text)             FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_referral(text)            FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_referral_code(text, text)  FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.track_event(text, jsonb)            FROM anon, authenticated;

-- service_role retains EXECUTE (it is the proxy's identity).
COMMIT;

-- Rollback (restores pre-audit state):
-- GRANT EXECUTE ON FUNCTION public.<fn>(<args>) TO anon, authenticated;
