---
description: Fan out parallel implementer subagents across INDEPENDENT targets, then honest-review the combined result. Arg is the area or an explicit list of independent files/tasks.
argument-hint: <area, or list of independent files/tasks>
---
Run a parallel fix sweep over: **$ARGUMENTS**

Follow this exactly:

1. **Recon first.** Dispatch a `veyrnox-recon` subagent (or do a quick read-only pass) to
   enumerate the work as a list of **independent** items — items that touch DIFFERENT files,
   so parallel agents cannot collide. Report the list before dispatching implementers.

2. **Fan out — one implementer per independent item, in parallel.** In a SINGLE message,
   dispatch multiple subagents (multiple Agent calls = concurrent):
   - UI / a11y / design-system work → `veyrnox-ui`
   - wallet-core / signing / risk / gating work → `veyrnox-security-tdd` (strict TDD)
   Give each agent ONLY its item, the file(s) it owns, and the relevant constraint. Never
   let two parallel agents edit the same file.

3. **Review.** When they return, dispatch a `veyrnox-honest-reviewer` over the combined
   diff. Send fix agents for Critical/Important findings; re-review until clean.

4. **Integrate & verify.** Run `npx eslint` on touched files and the relevant tests;
   preview-verify any UI change. Report what landed, what was deliberately LEFT (with the
   reason), and the evidence. Do not mark anything "verified" without a real on-chain txid
   from the user.
