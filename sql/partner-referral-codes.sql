-- ============================================================================
-- Partner referral codes — owner-minted codes for external partners
-- Run in Supabase SQL Editor (postgres role) AFTER api-security-hardening.sql
-- and referrals-select-lockdown.sql. Staging first; production after the PR
-- carrying this file has merged.
-- Date: 2026-09-12
-- ============================================================================
--
-- WHAT THIS IS
--
-- Every referral code today is minted by a device (generate_referral_code /
-- register_referral_code, 1 code per device, rate-limited). There is no way to
-- create a code for someone who is NOT an app install — a newsletter, a
-- podcast, a DeFi protocol, an influencer. This adds exactly that:
--
--   mint_partner_referral_code(p_partner_name, p_code DEFAULT NULL) -> text
--
-- It inserts one row into `referrals` with device_id NULL and a new
-- `partner_name` column so the owner can tell whose code is whose. Nothing
-- else changes: the referee-side flow is untouched, because it only ever
-- looks the code up by primary key —
--
--   share link   https://veyrnox.com/r/VYX-XXXXXX  (functions/r/[code].js)
--   deep link    /?ref=VYX-XXXXXX                   (lib/referralAttribution.js)
--   manual entry More -> Referrals -> "Got a referral code?"  (ReferralTracker.jsx)
--   redemption   increment_referral(p_code, p_device_id)  1 per device per code
--   read-back    get_referral_count(p_code)  (anon-callable, integer only)
--
-- A partner code is therefore a normal referrals row from the app's point of
-- view. The client validates codes against
-- /^VYX-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/ in three places
-- (referralApi.js, referralAttribution.js, functions/r/[code].js), so a vanity
-- code must fit that alphabet: A-Z without I and O, digits 2-9, six characters.
-- `VYX-ACMEXX` is fine; `VYX-ACME01` is not (0 and 1 are excluded).
--
-- ACCESS. service_role only. The function is deliberately NOT in ALLOWED_RPCS
-- (functions/api/rpc/[fn].js) and must never be — that allowlist is the only
-- boundary in front of the service-role key. Pinned by
-- functions/api/rpc/__tests__/rpc-proxy.test.js.
--
-- WHAT A PARTNER GETS TODAY — be honest with them:
--   * a count of installs that entered their code (referrals.count), read by
--     the owner with the SELECT at the bottom of this file.
--   * NOT commission: record_attribution is disabled client-side and the
--     RevenueCat webhook binds a subscriber to their OWN code only, so no paid
--     conversion is attributed to a referrer today.
--   * NOT a referee discount: fetchPaidCount() in referralApi.js returns null
--     (fail-closed since 2026-08-28), so the paywall never resolves a referral
--     offer. Referees currently pay full price.
-- Both of those are pre-existing gaps in the referral programme, not
-- introduced here; this file only makes partner codes possible.
--
-- PRIVACY. partner_name is a business name supplied by the owner, stored
-- server-side, never returned by any anon-callable RPC (get_referral_count
-- returns an integer). No RLS policy or grant is added to `referrals`.

-- ----------------------------------------------------------------------------
-- 1. Column
-- ----------------------------------------------------------------------------
ALTER TABLE public.referrals ADD COLUMN IF NOT EXISTS partner_name text;

-- ----------------------------------------------------------------------------
-- 2. Mint function
--
-- p_code NULL   -> mint a random VYX-XXXXXX (same alphabet + CSPRNG as
--                  generate_referral_code), retry on collision.
-- p_code given  -> vanity code; validated, upper-cased, inserted as-is. A
--                  collision RAISES (23505) rather than silently minting a
--                  different code — a partner told "your code is VYX-ACMEXX"
--                  must actually own VYX-ACMEXX.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mint_partner_referral_code(
  p_partner_name text,
  p_code         text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  alphabet  text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  candidate text;
  raw       bytea;
  i         int;
  attempt   int := 0;
BEGIN
  IF p_partner_name IS NULL
     OR length(btrim(p_partner_name)) = 0
     OR length(p_partner_name) > 80 THEN
    RAISE EXCEPTION 'partner_name required, 1-80 chars' USING ERRCODE = '22023';
  END IF;

  IF p_code IS NOT NULL THEN
    candidate := upper(btrim(p_code));
    IF candidate !~ '^VYX-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$' THEN
      RAISE EXCEPTION 'code must match VYX-XXXXXX using A-Z (no I/O) and 2-9, got %', candidate
        USING ERRCODE = '22023';
    END IF;
    INSERT INTO public.referrals (code, partner_name)
    VALUES (candidate, btrim(p_partner_name));
    RETURN candidate;
  END IF;

  LOOP
    attempt := attempt + 1;
    IF attempt > 10 THEN
      RAISE EXCEPTION 'Could not generate unique code after 10 attempts'
        USING ERRCODE = 'P0002';
    END IF;

    raw := extensions.gen_random_bytes(6);
    candidate := 'VYX-';
    FOR i IN 0..5 LOOP
      candidate := candidate || substr(alphabet, (get_byte(raw, i) % 32) + 1, 1);
    END LOOP;

    BEGIN
      INSERT INTO public.referrals (code, partner_name)
      VALUES (candidate, btrim(p_partner_name));
      RETURN candidate;
    EXCEPTION WHEN unique_violation THEN
      CONTINUE;
    END;
  END LOOP;
END;
$$;

-- Postgres grants EXECUTE to PUBLIC on CREATE FUNCTION; anon is a member of
-- PUBLIC. Revoke from PUBLIC (naming anon alone leaves the PUBLIC grant live).
REVOKE ALL ON FUNCTION public.mint_partner_referral_code(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mint_partner_referral_code(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.mint_partner_referral_code(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mint_partner_referral_code(text, text) TO service_role;

-- ----------------------------------------------------------------------------
-- VERIFY (after running)
--
--   -- anon must NOT be able to call it. Expect: f
--   SELECT has_function_privilege('anon',
--     'public.mint_partner_referral_code(text, text)', 'EXECUTE');
--
--   -- search_path pinned. Expect: {search_path=}
--   SELECT proconfig FROM pg_proc WHERE proname = 'mint_partner_referral_code';
--
-- ----------------------------------------------------------------------------
-- RUNBOOK — minting and reporting (SQL Editor, both projects as appropriate)
--
--   -- random code for a partner
--   SELECT public.mint_partner_referral_code('Acme Newsletter');
--
--   -- vanity code (must fit the alphabet)
--   SELECT public.mint_partner_referral_code('Acme Newsletter', 'VYX-ACMEXX');
--
--   -- hand the partner:  https://veyrnox.com/r/<code>
--   -- and the manual path: More -> Referrals -> "Got a referral code?"
--
--   -- report: installs that entered each partner code
--   SELECT partner_name, code, count, created_at
--     FROM public.referrals
--    WHERE partner_name IS NOT NULL
--    ORDER BY partner_name, created_at;
-- ----------------------------------------------------------------------------
