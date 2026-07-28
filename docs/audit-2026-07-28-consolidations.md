# Audit 2026-07-28 — consolidated findings

This file records findings from the 2026-07-28 internal audit that were closed
by consolidation into another finding rather than by a separate code change.
Kept as a stub so the finding id remains discoverable in the repo and the
tracker's "closed" state is auditable.

## M-11 — superseded by M-4

- Status: CLOSED (consolidated)
- Superseded by: M-4
- Decision date: 2026-07-28

M-11 was found to describe the same underlying defect as M-4 (same root cause,
same failure scenario, same fix surface). Rather than land two overlapping
patches, M-11 is closed here and the remediation is tracked entirely under M-4.
Any regression test, doc update, or PR reference belongs on M-4.

No separate code change ships for M-11.
