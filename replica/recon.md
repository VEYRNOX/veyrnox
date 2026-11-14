# Recon map: Era (era.app) → input for the Veyrnox roadmap

Date: 2026-10-31. Method: public pages and docs only (clean-room). No JS bundles read, no network calls logged, no login, no REA bundle/session tools (the replica-recon rules forbid them). Screens in `replica/screens/` are empty: no screenshots were taken.

## 1. Scope

- App: Era (Tinwell Labs Inc., DBA Era). Web + iOS + Android.
- Slice: **AI-assistant access to a financial account with approval-gated writes** (Era Context MCP + REST API). Not the whole product.
- For: Veyrnox's own roadmap (self-custody wallet). Not a clone of Era's branding or copy.
- Era is a personal-finance aggregator (banks, cards, brokerage via Alpaca). It is NOT a crypto wallet and is not self-custody. What transfers is the agent-access pattern, not the product.

## 2. Sources

| source | URL | gave |
| --- | --- | --- |
| marketing site | https://era.app/ | positioning, entities, regulatory footprint |
| MCP overview | https://era.app/context/mcp-server | auth, scopes, approval flow, clients |
| API docs | https://era.app/docs/era-api | data model, scopes, limits, errors |
| developer overview | https://era.app/for-developers | endpoints, encryption claims |
| pricing | https://era.app/pricing | feature gating per plan |
| help center | https://era.app/help | category map (article titles not listed) |
| OpenAPI (public, not fetched) | https://forge.era.app/api/openapi/public.json | next step if wanted: it is public docs |

## 3. Core loop

Connect accounts → connect an AI client over OAuth 2.1 (approve scopes) → ask money questions → agent proposes changes (categories, tags, rules, transfers) → user approves sensitive ones → everything logged in an activity log → revoke any time.

## 4. Screen inventory (inferred from docs; none seen directly)

| ID | screen | purpose | states to confirm |
| --- | --- | --- | --- |
| S01 | Connect an agent (OAuth consent) | review/approve scopes | approved, denied, expired |
| S02 | Connected agents list | revoke access | none, several |
| S03 | API keys | create (mandatory expiry 90/365d), revoke | expired, revoked |
| S04 | Activity log | writes (and MCP reads) audit trail | empty, filtered |
| S05 | Transfer approval | per-transfer separate approval | pending, approved, rejected, timed out |
| S06 | Rules | list/create/enable/disable, preview | library rule (non-deletable) vs user rule |
| S07 | Plan / usage | tool-call quota, credits | quota hit (402/429) |
| S08 | Shared memory | facts the agents remember | 50 cap |

Confidence: medium. All inferred from text; needs the user's own account to verify.

## 5. Flows

- F01 Connect Claude/ChatGPT: S01 → approve scopes → agent can read. Edge: scope upgrade later (billing is a separate `mcp:billing-write`).
- F02 Agent proposes a transfer: agent call → S05 approval → execute → S04 log. Edge: own accounts only, cannot pay bills/trade/file taxes.
- F03 Revoke: S02 → immediate end; existing token expires within an hour.
- F04 Create a persistent rule: plain-language → preview (`POST /rules/preview`) → create → keeps running after chat.

## 6. Inferred data model (from public API docs, confidence high)

Account, Balance, AccountSummary, Transaction (reviewStatus, tags, category, isPending), Category (pack/parent), Tag (user/system/auto), RecurringCharge, CashFlow, Rule (filters, actions, version, priority, source), ApiKey (hashed SHA-256, scopes fixed at creation, forced expiry), ActivityLog (writes), Memory (facts). Opaque prefixed IDs (`utgr_`, `fcat_`, `ftag_`, `fmk_`).

## 7. Patterns worth borrowing (ordered by fit to Veyrnox)

1. **Scoped, expiring, revocable credentials**: scopes fixed at creation, mandatory expiry, hash-only storage.
2. **Read/write scope split**, and a separate scope for the most dangerous capability.
3. **Separate human approval for every money movement**, regardless of agent scope.
4. **Activity log of every agent write.**
5. **Preview before create** (dry-run endpoint).
6. **Optimistic concurrency** (409 on version conflict) and bulk caps (100).
7. **Tiered quotas** with separate REST vs MCP budgets.
8. **Undo for agent edits** on paid plans.
9. Weaknesses to NOT copy: no webhooks (polling only), no approval workflow for non-money writes, reads are not logged on REST, scopes are broad.

## 8. Cannot be cloned / does not apply

- Aggregator bank connections (regulated aggregators), Alpaca brokerage and custody, SEC investment-adviser registration: licensed, skip.
- Era's rules library and categorisation data: theirs.
- "Move money between your accounts" as custodial transfer: Veyrnox has no custodian. The analogue is on-device signing.

## 9. Size

Screens 8, flows 4, entities ~12. Hard parts: (1) an MCP/agent surface that does not break I1/I2/I3/I5, (2) approval UX that cannot be bypassed by the agent, (3) honest audit trail. Size: **L** (a quarter) for read-only + propose-only; **XL** if remote hosted write access is wanted.

## 10. Veyrnox invariants this collides with (must resolve first)

- I1 keys never leave device: a remote MCP server holding signing authority is out. Agents may only *propose* intents; signing happens on-device after `presignGateOrReject` and step-up re-auth.
- I2 no silent egress / I5 backend untrusted: a hosted MCP exposing balances is egress. Prefer a **local** MCP server (desktop companion or on-device bridge) or an explicit, consented, per-session link.
- I3 deniability: agent surface must be fully off in deniability/decoy and must never reveal wallet count or list.
- I4 fail closed: unknown scope, expired key or gate error = deny.
- Infra lock (CLAUDE.md): do not touch the tip-chat, tip-screen, tip-manifest edge functions or Transak for this. New functions need an explicit request, and prod DDL waits for the PR merge.
- §24 audit gate: anything that approves signing remotely needs real-device verification plus the audit.
