# Changing the Veyrnox developer address on Google Play

Owner: Al Jobson. Written 2026-09-23, **corrected the same day after doing it.**

## Done 2026-09-23 — and it took one click, not a four-step chain

The address is now `SUITE RA01, 195-197 WOOD STREET, LONDON - E17 3NU`,
confirmed in Play Console's Organization details.

**Check this first, before anything below.** Google Payments Center →
Settings → Payments profile → scroll to ORGANIZATION ADDRESS → **"Change
address"**. If Dun & Bradstreet has already been updated, that link opens a
*Confirm your D-U-N-S info* screen showing the old and new addresses side by
side, and one **Confirm** adopts the D&B record across every Google service
that reads the payments profile — invoices, tax documents, and the developer
profile Play renders.

That is exactly what happened here. D&B had already been updated; Google was
holding the change pending confirmation. The rest of this file describes the
path for when that is *not* the case.

Two mistakes worth recording, because both cost time:

- **There is no pencil icon next to ORGANIZATION ADDRESS.** The edit affordance
  is a "Change address" text link *below* the address block. Reading the field
  header and concluding it is read-only is wrong — scroll.
- **The Android developer verification deadline is not a reason to defer.**
  Verification for this account completed 2026-07-13 (both package names
  registered, Package names tab). The Sep 30 notice in the console is a general
  announcement, not an outstanding action.

---

## If D&B has NOT been updated

**The address still cannot be typed directly into Play Console.** Play Console's *Developer account → About you → Organization
details* renders the address read-only and states its source:

> Your organization name, address, and D-U-N-S number are taken from the Google
> payments profile
> Registry: Dun & Bradstreet — D-U-N-S number: 234941876

Play displays the value; it does not own it. Editing has to happen upstream, in
a specific order, or it fails validation or silently reverts.

## The records, and who owns each

| Record | Holder | Current value |
|---|---|---|
| Registered office | Companies House | Suite Ra01, 195-197 Wood Street, London, England, E17 3NU (per owner, 2026-09-23) |
| D-U-N-S `234941876` | Dun & Bradstreet | 24 Lankers Drive, HARROW - HA2 7NT |
| Business address | Google payments profile | 24 Lankers Drive, HARROW - HA2 7NT |
| Organization address | Play Console | inherited — 24 Lankers Drive, HARROW - HA2 7NT |

Google reconciles the payments profile against D&B. **If D&B still says Harrow,
changing only the payments profile is the failure mode that produced today's
state** — one record moved, the authoritative one did not.

## Order of operations

Do these in order. Skipping step 2 is what makes step 3 fail.

1. **Companies House** — confirm the registered office already reads Wood
   Street. If it does not, file the change first; everything downstream is
   checked against it.
2. **Dun & Bradstreet** — update D-U-N-S `234941876`. This is the gate.
   Free updates go through D&B's iUpdate service. Expect **days to weeks**, not
   minutes. Ask for written confirmation of the effective date.
3. **Google payments profile** — update the business address only after D&B
   shows the new value. Reached from Play Console's *Update organization
   details* link, or directly at payments.google.com.
4. **Play Console** — nothing to do. It inherits from the payments profile.

## Exact values to submit

Submit the same string everywhere. A difference in formatting between records
is itself a mismatch.

```
Organization name : VEYRNOX LTD
Address line 1    : Suite Ra01
Address line 2    : 195-197 Wood Street
City              : London
Postcode          : E17 3NU
Country           : United Kingdom (GB)
```

Reference data for any support ticket:

```
Developer account ID : 6178387777449533067
D-U-N-S              : 234941876
Registry             : Dun & Bradstreet
Account owner        : support@veyrnox.com
Website (verified)   : https://veyrnox.com/
```

## Timing risk — smaller than it looks

Developer verification reads this identity record (*Android developer
verification → Identity*: "Your legal name and address are taken from your Play
Console developer account"), so the two are linked.

But verification for this account **already completed on 2026-07-13** — both
`com.veyrnox.app` and `veyrnox.app` show Registered. The Sep 30 notice is the
general announcement to all developers, not a pending action here. Confirming a
D&B-sourced address change did not disturb it.

## What the stale address currently affects

- The developer address shown on the public Play listing.
- Nothing about the app binary, the store copy, or any entitlement.

It is a correctness and companies-register consistency problem, not a
functional one. That is why it is worth doing properly rather than quickly.
