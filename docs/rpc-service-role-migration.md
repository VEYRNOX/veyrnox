# Unblocking the H-3 REVOKE batch — RPC proxy to service_role

**Status:** step 1 (code) merged. Steps 2–4 are owner actions and are NOT done.
**Scope:** unblocks `sql/api-security-hardening.sql`'s H-3 REVOKEs. Does not close H-3.

---

## What was actually blocking this

`CLAUDE.md` records the H-3 REVOKE batch as un-runnable because six of its
functions "still have live anon callers in `src/api/referralApi.js` and
`src/api/trackEvent.js`", and that running the SQL without a client refactor
"will break referral + telemetry writes at runtime".

That description is now out of date, and the remaining work is much smaller than
it implies. Verified against `origin/main`:

- `src/api/referralApi.js` and `src/api/trackEvent.js` both import `rpc` from
  `src/api/edgeApi.js`.
- `edgeApi.rpc(fn, params)` is `post('/api/rpc/' + encodeURIComponent(fn), params)`.
- Nothing under `src/` calls PostgREST directly — no `supabase.rpc(`, no
  `/rest/v1/rpc`.

So the client refactor **already happened**, in `e99dd422` (the Pages Functions
API layer). The calls still arrive at Postgres as role `anon` only because
`functions/api/rpc/[fn].js` injects `SUPABASE_ANON_KEY`. That one file is the
last anon caller, and switching it is the entire prerequisite.

## Ordering — this is the part that breaks things if got wrong

| # | Step | Who | Done |
|---|---|---|---|
| 1 | Proxy prefers `SUPABASE_SERVICE_ROLE_KEY`, falls back to anon | this PR | ✅ |
| 2 | Set `SUPABASE_SERVICE_ROLE_KEY` on the `veyrnox-prod` Pages project | **owner** | ☐ |
| 3 | Verify it is set and a deploy has picked it up | **owner** | ☐ |
| 4 | Run the H-3 REVOKEs | **owner** | ☐ |

Step 1 is a **no-op until step 2**: with the secret unset the proxy uses the anon
key exactly as before. That is deliberate, so the deploy and the secret can land
independently without a flag day.

**Running step 4 before steps 2–3 breaks every referral and telemetry write.**
The symptom is a `403` from `/api/rpc/*` with
`permission denied for function <name>` — pinned as a test in
`functions/api/rpc/__tests__/rpc-proxy.test.js` precisely so that string is
greppable back to this document.

### Step 2

The service-role key is in the Supabase dashboard under Project Settings → API
(project `veyrnox-prod`, ref `nszlbcmcysftwyudthjz`).

```bash
npx wrangler pages secret put SUPABASE_SERVICE_ROLE_KEY --project-name veyrnox-prod
```

Set it as a **secret**, not a `[vars]` entry in `wrangler.toml` — that file is
committed. It must never be given a `VITE_` prefix: Vite statically inlines
`VITE_*` into the client bundle, which is the exact failure mode H-4 fixed for
the TIP signing secret.

### Step 3

```bash
npx wrangler pages secret list --project-name veyrnox-prod
```

Confirm `SUPABASE_SERVICE_ROLE_KEY` is listed, then redeploy (or wait for the
next deploy) so a running instance actually has it. Sanity-check a real referral
or telemetry write still succeeds before moving on.

### Step 4

Run the REVOKE block in `sql/api-security-hardening.sql`. Also gated on the same
prerequisite: `check-first-referral-bonus-hardening.sql`'s STILL OPEN section.

---

## What this buys, stated precisely

**Closes:** direct `anon` reachability of those functions over PostgREST. Today
anyone holding the public anon key can call them straight at
`/rest/v1/rpc/<name>`, subject only to each function's own rate limits. After
step 4 they cannot be called except through our allowlisted proxy.

**Does NOT close H-3.** `record_attribution` stays in the proxy's allowlist, so
revenue attribution remains **client-initiated** — just no longer anon-callable
directly. H-3's stated intent is that attribution be *server-authored*, via the
RevenueCat webhook in `sql/referral-rc-webhook.sql`, which is still a skeleton.
Removing `record_attribution` from the allowlist before that webhook exists would
silently stop attribution being recorded at all, so it is deliberately left in.

**Do not describe H-3 as closed on the strength of this work.** It moves the
attack surface from "anyone with the public anon key" to "anyone who can reach
our proxy", which is a real reduction and not a completion.

---

## The risk this introduces, and why it is accepted

`service_role` **bypasses RLS**. Once this key is in the Pages environment,
`ALLOWED_RPCS` in `functions/api/rpc/[fn].js` is the only thing between a caller
and those functions.

Accepted because:

- the allowlist is a closed `Set` checked before the name is used for anything;
- the proxy reaches only `/rest/v1/rpc/<name>` — never a table, never a
  caller-supplied host, and the name is `encodeURIComponent`'d into the path;
- each function does its own input validation and rate limiting, which is the
  entire point of the SECURITY DEFINER design;
- `functions/api/rpc/__tests__/rpc-proxy.test.js` pins the allowlist in both
  directions, including path-traversal and absolute-URL attempts, and asserts a
  rejected name never reaches `fetch` at all.

**The standing rule this creates:** never add a table-proxy route, a passthrough
path segment, or a wildcard to any file that can read
`SUPABASE_SERVICE_ROLE_KEY`. With RLS bypassed, one such route is full database
access. If a future feature needs table reads from the edge, give it a separate
function with its own narrowly-scoped credential rather than widening this one.

---

## Rollback

Unset the secret and redeploy — the proxy falls back to the anon key.

That only works while the REVOKEs have **not** run. Afterwards, rolling back the
proxy also requires re-granting:

```sql
GRANT EXECUTE ON FUNCTION public.track_event(uuid, text, jsonb) TO anon;
-- ...and the same for the other five.
```

Take a backup before step 4. Supabase point-in-time recovery is enabled, but a
grant change is cheaper to reverse deliberately than to restore around.

---

*INTERNAL. Static analysis and local tests only — no production database change
has been made, and no Supabase migration has been executed from this work.*
