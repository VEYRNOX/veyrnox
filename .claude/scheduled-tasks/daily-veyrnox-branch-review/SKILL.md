---
name: daily-veyrnox-branch-review
description: Daily branch-review workflow on the Veyrnox repo
---

Run the branch-review workflow on the Veyrnox repository located at C:\Users\aljob\Downloads\Veyrnox.

Objective: Review the current branch vs main across four dimensions — correctness, security/honesty, design-system compliance, and accessibility — then report findings.

Steps:
1. Change working directory context to C:\Users\aljob\Downloads\Veyrnox
2. Run the `branch-review` workflow (via the Workflow tool with name "branch-review") against the current branch
3. Each finding should be adversarially verified before being reported
4. Output a structured report with sections: Correctness, Security/Honesty, Design System, Accessibility
5. For each finding include: file path + line number, severity (critical/major/minor), description, and recommended fix

Constraints:
- Never flip an asset status to "live" or write "verified" without a real explorer-confirmed txid supplied by the user
- Never mock a security control — if something can't be delivered honestly, flag it as HONEST-DISABLED
- Status tags: BUILT (code complete), TARGET (audit-gated), PLANNED (roadmap), HONEST-DISABLED
- The Veyrnox design system uses: near-black surfaces (#050608 → #1D222B), teal accent (#4ADAC2), Schibsted Grotesk for prose, IBM Plex Mono for addresses/amounts/fees

Success criteria: A clear, actionable findings report the developer can act on immediately.