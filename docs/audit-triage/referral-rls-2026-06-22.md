# Referral counter — server-side authz fix (2026-06-22)

> Closes a row-level-security gap in the OPTIONAL Supabase referral counter: an
> over-broad `UPDATE` policy let any anonymous client overwrite any code's count.
> The counter holds no identity/keys/holdings, so this is LOW severity — but the
> tamper was trivial and server-enforceable, so it is fixed at the policy layer.
> Code change is in `supabase/referrals.sql`; applying it to the hosted project is
> an owner action (no project credentials live in this repo).

## Finding

`supabase/referrals.sql` previously created three permissive policies:

```sql
create policy "public insert" on referrals for insert with check (true);
create policy "public update" on referrals for update using (true);   -- the gap
create policy "public select" on referrals for select using (true);
```

With RLS on but `UPDATE using (true)`, any holder of the (client-exposed) anon key
could run `UPDATE referrals SET count = <anything>` — set any code to any value, or
zero it. The legitimate increment path is the `SECURITY DEFINER` function
`increment_referral(text)`, which does not need a caller-facing UPDATE policy.

## Fix

Drop the `public update` policy. Keep `select` (read a count — `fetchStatus`) and
`insert` (register a new code via `registerCode`'s `upsert(..., ignoreDuplicates)`,
i.e. `INSERT ... ON CONFLICT DO NOTHING`, which needs INSERT only). With no UPDATE
policy and RLS on, anon clients cannot write the counter directly; the ONLY thing
that mutates `count` is `increment_referral`, which is `SECURITY DEFINER` and so
bypasses RLS to perform exactly a `+1`. The migration is idempotent
(`drop policy if exists` for all three, including the removed one).

## Reachability / impact

- LOW severity by data sensitivity: the table is `{ code, count }` only — no
  identity, addresses, or holdings (I1 holds; this is a vanity counter).
- The feature is OPTIONAL: with `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY`
  unset, the client no-ops (`src/api/referralApi.js`, `src/lib/supabaseClient.js`).
- Pre-fix, the integrity tamper (arbitrary set / reset of any code) was trivial for
  anyone with the public anon key. Post-fix it is server-prevented.

## Residual (honest scope)

`increment_referral` remains callable repeatedly, so a counter can still be
INFLATED by repeated legitimate `+1` calls. The fix makes the counter
**tamper-resistant** (no arbitrary set/zero), **not abuse-proof**. Rate-limiting a
non-sensitive vanity counter (per-IP / PoW / auth) is out of scope.

## Status — NOT yet applied to the hosted project

- Code-complete in `supabase/referrals.sql` (idempotent migration). This is BUILT,
  not "verified": no project credentials or Supabase CLI link exist in this repo,
  and the anon key cannot run DDL, so the policy change has NOT been executed
  against the live database from here.
- **Owner action to apply:** Supabase → SQL Editor → run the file's contents.
- **Verification query (run post-apply):**

  ```sql
  -- Expect ONLY insert + select rows, no UPDATE:
  select policyname, cmd from pg_policies where tablename = 'referrals' order by cmd;

  -- The legit path still increments:
  select increment_referral('YOURCODE');   -- returns new count
  ```

Re-triage trigger: if the referral table ever stores anything beyond `{ code,
count }`, re-assess `select`/`insert` being public and revisit rate-limiting.
