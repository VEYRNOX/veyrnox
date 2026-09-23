# Changing the Veyrnox developer address on Google Play

Owner: Al Jobson. Written 2026-09-23.

**The address cannot be changed in Play Console.** That is the whole reason this
file exists. Play Console's *Developer account → About you → Organization
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

## Timing risk — read before starting

Play Console is showing a notice dated 2026-09-08:

> Ensure your apps are registered for Android developer verification by
> **Sep 30, 2026**

Developer verification checks the organization identity record. Putting that
record mid-change across three systems in the week before the deadline risks
pushing verification into review, which is a worse outcome than a stale address
on a listing. Either complete the chain well before the deadline, or start it
after verification has cleared.

## What the stale address currently affects

- The developer address shown on the public Play listing.
- Nothing about the app binary, the store copy, or any entitlement.

It is a correctness and companies-register consistency problem, not a
functional one. That is why it is worth doing properly rather than quickly.
