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

## Status — applied & verified live (2026-06-22)

Applied by the repo owner via the Supabase SQL editor, then confirmed live with a
functional test of the **anonymous** REST path. That is the faithful test: it
exercises exactly the role the policy governs. (A SQL-editor / service-role query
bypasses RLS and would give a false pass, so it must NOT be used to "verify" this.)
This is server-side RLS behavior confirmed by direct observation; it is distinct
from the on-chain asset-verification gate in `CLAUDE.md` — no txid applies to a
database policy.

Evidence — anonymous client (public anon key) against the live project:

| Step (as anon) | Result | Meaning |
|---|---|---|
| Insert a fresh test code | `201`, row at count 0 | insert allowed (expected) |
| **PATCH count = 9999** | `200` → `[]`, count still `0` | **direct write blocked by RLS** |
| `increment_referral(code)` RPC | `200` → `1` | SECURITY DEFINER path works |
| Delete attempt | `200` → `[]` | delete also blocked (no policy) |

The decisive pair is the tamper step: the row demonstrably exists, yet an anon
write affected 0 rows and the value did not change (RLS rejected it), while the
intended RPC increment still succeeds.

**Re-verify any time** — no secrets needed beyond the public anon key + project URL
for the functional test, or in the SQL editor confirm the policy set directly:

```sql
-- Expect ONLY insert + select rows, no UPDATE:
select policyname, cmd from pg_policies where tablename = 'referrals' order by cmd;
```

Re-triage trigger: if the referral table ever stores anything beyond `{ code,
count }`, re-assess `select`/`insert` being public and revisit rate-limiting.
