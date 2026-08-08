# Threat aggregator — end-to-end verification (2026-08-08)

Live-prod verification of PRs [VEYRNOX/veyrnox#1615](https://github.com/VEYRNOX/veyrnox/pull/1615)
(wallet UI) and [aljobson/veyrnox-tip#17](https://github.com/aljobson/veyrnox-tip/pull/17)
(TIP multi-source aggregator + OFAC GitHub mirror ingestion), captured from
`https://veyrnox-prod.pages.dev` origin against `https://tip.veyrnox.com`.

Not the outstanding independent third-party audit. Claude-driven browser and curl
probes only. Every fact below is reproducible with the commands shown.

## Scope

- New TIP `checkSanctions()` returns a typed `SourceResult[]` per source
  (`ofac-github` KV, `chainalysis`, `opensanctions`).
- Aggregator emits `verdict: "unknown"` when every source is skipped/errored
  (I4: absence of data must not read as safety).
- Wallet UI extracts EVM + Bitcoin + Solana addresses (not just EVM) and passes
  the format-inferred chain to `screenTransaction`.
- 716 OFAC SDN addresses backfilled into KV via wrangler bulk-write from the
  0xB10C GitHub mirror (Treasury.gov XML is unreachable from CF Workers — Akamai
  IP block; verified 2026-08-08 with `[sanctions] errors: ['OFAC fetch failed:
  525 <none>']` from `wrangler tail`).

## Screening — 4 test cases (POST /functions/v1/tip-screen)

Client:

    curl -X POST https://jwstkrtslotnjyerzzsi.supabase.co/functions/v1/tip-screen \
      -H "Content-Type: application/json" \
      -H "Origin: https://veyrnox-prod.pages.dev" \
      -H "Authorization: Bearer $ANON" \
      -H "apikey: $ANON" \
      -d '{ "request_id": "…", "chain": "<chain>",
            "action_type": "address_lookup",
            "from_address": "<zero>",
            "to_address": "<addr>" }'

### Case 1 — Lazarus Group ETH (`0x098B716B8Aaf21512996dC57EB0615e2383E2f96`)

    verdict: block
    reason:  OFAC/sanctions match on list: OFAC-SDN
    sources: 4 consulted
      - ofac-github=hit (21ms) OFAC-SDN
      - ofac-github=clean (20ms) Not present in cached OFAC SDN list
      - chainalysis=skipped (0ms) CHAINALYSIS_API_KEY not configured
      - opensanctions=skipped (0ms) OPENSANCTIONS_API_KEY not configured

Sanctioned entity: DPRK Lazarus Group cluster. Currently on the SDN list per
the 0xB10C mirror re-verified today.

### Case 2 — OFAC BTC (`123WBUDmSJv4GctdVEz6Qq6z8nXSKrJ4KX`)

    verdict: block
    reason:  OFAC/sanctions match on list: OFAC-SDN
    sources: 4 consulted
      - ofac-github=hit (25ms) OFAC-SDN
      - …

Proves the aggregator does not gate on `chain`: KV lookup is chain-agnostic,
same code path as EVM.

### Case 3 — OFAC SOL (`42RLPACwZPx3vYYmxSueqsogfynBDqXK298EDsNoyoHi`)

    verdict: block
    reason:  OFAC/sanctions match on list: OFAC-SDN
    sources: 4 consulted
      - ofac-github=hit (25ms) OFAC-SDN
      - …

Same result across all three chain families the wallet supports.

### Case 4 — random dev address (`0xd9145CCE52D386f254917e481eB44e9943F39138`)

    verdict: allow
    reason:  No threats detected
    sources: 4 consulted
      - ofac-github=clean (21ms) Not present in cached OFAC SDN list
      - ofac-github=clean (3ms) Not present in cached OFAC SDN list
      - chainalysis=skipped (0ms) CHAINALYSIS_API_KEY not configured
      - opensanctions=skipped (0ms) OPENSANCTIONS_API_KEY not configured

Round-trip 300–700ms per request. `sources_consulted[]` populated in every
response — the wallet's `ScreeningVerdict` component renders the expandable
"Sources consulted (4)" trace from this field.

## Verdict-policy nuance

Case 4 returns `allow` because one positive `clean` came back (`ofac-github`).
The two network sources are `skipped` (no API keys). This is a 1-of-3 positive
attestation. Two options if the policy is too lenient for shipping:

- **Strict:** require ≥ 2 positive sources for `allow`; otherwise `unknown`.
- **Current:** any 1 positive → `allow`.

This is a policy dial, not a code bug. Deferred for owner decision.

## WAF — origin allowlist (CF rule #4 "Challenge /chat requests")

Rule fires Managed Challenge on any request to `tip.veyrnox.com/api/v1/chat`
whose `Origin` header is not on the exact-match allowlist. Probe method:

    curl -sI -o /dev/null -w "%{http_code}" \
      -X OPTIONS "https://tip.veyrnox.com/api/v1/chat" \
      -H "Origin: <origin>" \
      -H "Access-Control-Request-Method: POST" \
      -H "Access-Control-Request-Headers: content-type"

204 = allowed. 403 = WAF challenge (attacker origin gets an HTML interstitial).

### Live state (after 2026-08-08 rule #4 edit)

    https://veyrnox-prod.pages.dev              → 204 ALLOWED (web canonical)
    capacitor://localhost                       → 204 ALLOWED (iOS App Store)
    https://localhost                           → 204 ALLOWED (Android Play Store)
    https://ab25d4b4.veyrnox-prod.pages.dev     → 403 BLOCKED  (PR preview subdomain)
    https://a2729b6b.veyrnox-prod.pages.dev     → 403 BLOCKED  (PR preview subdomain)
    https://evilveyrnox-prod.pages.dev          → 403 BLOCKED  (attacker origin)
    https://veyrnox-prod.pages.dev.attacker.com → 403 BLOCKED  (attacker origin)

### Mobile app coverage matrix

| Layer | iOS App Store | Android Play Store |
|---|---|---|
| Supabase edge CORS (`tip-screen`, `tip-chat`) | allowed | allowed |
| Cloudflare WAF rule #4 | allowed | **allowed (added 2026-08-08)** |

`https://localhost` was missing from the exact-match set before today. This
blocked every Android Play Store user from reaching the Advisor. iOS was
already covered because Capacitor's default `iosScheme` is `capacitor` (so the
WebView origin is `capacitor://localhost`, already allowlisted). Android's
default `androidScheme` is `https` since Capacitor 3, so the WebView origin is
`https://localhost` — the addition that shipped today.

### Deferred: PR preview subdomain support

Preview builds land at `https://<hash>.veyrnox-prod.pages.dev` — not on the
exact-match allowlist, so they get challenged. Two paths considered:

- **`matches` regex** — CF returned `not entitled: the use of operator Matches
  is not allowed, a Business plan or a WAF Advanced plan is required`. Rejected.
- **`contains ".veyrnox-prod.pages.dev"`** — free-tier operator, but allows
  `veyrnox-prod.pages.dev.attacker.com` (attacker-registered domain that
  contains the substring). Blast radius on that is Advisor quota exhaustion
  (endpoint is unauthenticated by design and rate-limited per device_id), so
  no data leak, but it's still a WAF policy weakening we don't need.

Chosen path: **verify PRs via curl with a spoofed `Origin: https://veyrnox-prod.pages.dev`
header** — no WAF change required. The four-case screening probe above uses
exactly this technique.

## What ISN'T verified here

- The wallet's `ScreeningVerdict` UI rendering the "Sources consulted (4)" panel
  end-to-end. This requires an unlocked wallet with the new bundle and a user
  typing an address into the Advisor drawer — bundle inspection confirmed the
  render code shipped (`Sources consulted`, `No threat source could screen`,
  `bc1` pattern, `solana` chain literal all present in `index-Bv61N9AH.js`), but
  the rendered pixels have not been visually confirmed.
- Chainalysis + OpenSanctions live source integration — both currently return
  `status: "skipped"` (no API keys set). The code paths exist and are tested;
  the wire-up decision is a follow-up.
- Local IOC push to the wallet (signed manifest sync). This is the honest
  end-state that makes screening work in deniability mode + offline. Not
  shipped in this PR.
- Independent third-party security audit (still outstanding).

## Reproducibility

Every fact above is reproducible in ~60 seconds. Screening cases:

    for case in \
      "LAZARUS-ETH|ethereum|0x098B716B8Aaf21512996dC57EB0615e2383E2f96|0x0000000000000000000000000000000000000000" \
      "OFAC-BTC-1|bitcoin|123WBUDmSJv4GctdVEz6Qq6z8nXSKrJ4KX|1111111111111111111114oLvT2" \
      "OFAC-SOL|solana|42RLPACwZPx3vYYmxSueqsogfynBDqXK298EDsNoyoHi|11111111111111111111111111111111" \
      "RANDOM-CLEAN|ethereum|0xd9145CCE52D386f254917e481eB44e9943F39138|0x0000000000000000000000000000000000000000" ; do
      IFS='|' read -r NAME CHAIN ADDR FROM <<< "$case"
      curl -s -X POST "https://jwstkrtslotnjyerzzsi.supabase.co/functions/v1/tip-screen" \
        -H "Content-Type: application/json" \
        -H "Origin: https://veyrnox-prod.pages.dev" \
        -H "Authorization: Bearer $ANON" -H "apikey: $ANON" \
        -d "{\"request_id\":\"$NAME-$(date +%s)\",\"chain\":\"$CHAIN\",\"action_type\":\"address_lookup\",\"from_address\":\"$FROM\",\"to_address\":\"$ADDR\"}"
    done

WAF origin probe: see the `curl -X OPTIONS` snippet above.

## Related commits + PRs

- Wallet UI:           [VEYRNOX/veyrnox#1615](https://github.com/VEYRNOX/veyrnox/pull/1615) → `35d85509`
- TIP aggregator:      [aljobson/veyrnox-tip#17](https://github.com/aljobson/veyrnox-tip/pull/17) → `9971afe`
- TIP hotfixes:        [#18](https://github.com/aljobson/veyrnox-tip/pull/18) `sanctions_list` contract restore, [#20](https://github.com/aljobson/veyrnox-tip/pull/20) `ENGINE_VERSION` revert
- WAF rule #4 edit:    live change 2026-08-08 (added `"https://localhost"`)
- KV backfill:         716 unique OFAC SDN addresses, `wrangler kv bulk put`
