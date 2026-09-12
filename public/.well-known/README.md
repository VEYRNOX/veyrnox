# `.well-known/` — deep-link association files

These make `https://veyrnox.com/wc?uri=…`, `/buy/return…` and the referral share
link `/r/VYX-XXXXXX` open the installed Veyrnox app (iOS Universal Links + Android
verified App Links).

**Where the LIVE copy is served from — corrected 2026-09-12.** This file used to say
"copied into the web build by Vite, so a normal deploy of the site publishes them".
That deploy is the Cloudflare **Pages** project (`veyrnox-prod.pages.dev`), and it
does NOT serve these files — it returns the SPA shell (`text/html`) for
`/.well-known/apple-app-site-association`, verified live. `veyrnox.com` is the
marketing site (a different origin, source not in this repo), which serves its own
copy. So editing a file here changes nothing on the apex by itself. The
`apple-app-site-association` on `veyrnox.com` is now served by the
`veyrnox-referral-redirect` Worker (`workers/referral-redirect`, routed at
`veyrnox.com/.well-known/apple-app-site-association`), which bundles THIS file —
redeploy that Worker after editing it. `assetlinks.json` is still the marketing
site's copy; it carries no paths, only the package + signing cert, so it does not
change when a path is added.

## Files

| File | Platform | Purpose |
|---|---|---|
| `apple-app-site-association` | iOS | Associates `applinks:veyrnox.com` with appID `R54268MWFV.com.veyrnox.app` for the `/wc*`, `/buy/return*` and `/r/*` paths. No file extension; must be served as JSON. |
| `assetlinks.json` | Android | Digital Asset Links — authorises `com.veyrnox.app` signed by the Play App Signing cert (SHA-256 `D8:99:69:D5:…:44:6C:B9`) to handle `veyrnox.com` links. |

## Hosting requirements (Play/Apple + the OS verifier are strict)

1. **Served from the apex the app declares** — `https://veyrnox.com/.well-known/…`
   (matching `applinks:veyrnox.com` and the manifest `android:host="veyrnox.com"`).
2. **HTTP 200, `Content-Type: application/json`, NO redirect** to reach the file.
   ⚠️ veyrnox.com is a client-rendered SPA — if the host has a catch-all that returns
   `index.html` for unknown paths, it will serve the SPA shell here and BOTH platforms
   will fail verification. The deploy must serve `/.well-known/*` as static files.
3. **No auth, no query string, valid JSON.**

## Verify after deploy

```
curl -sS -i https://veyrnox.com/.well-known/apple-app-site-association | head
curl -sS -i https://veyrnox.com/.well-known/assetlinks.json | head
# Android verifier:
#   https://developers.google.com/digital-asset-links/tools/generator
# Apple AASA validator:
#   https://app-site-association.cdn-apple.com/a/v1/veyrnox.com   (Apple's CDN cache)
```

## Dependencies / gotchas

- **Universal/App Links only fully work once the app is PUBLISHED** and installed —
  Apple's CDN caches the AASA at install/first-run, and Android autoVerify runs at
  install. So these are staged now but prove out only after the store launches
  (Play upload-key reset + Apple org conversion).
- The **custom scheme `veyrnox://wc?uri=…`** (Info.plist / AndroidManifest) needs NONE
  of this hosting — it works on any installed build and is the fallback.
- If the Play App Signing cert ever changes (e.g. key upgrade), update the SHA-256 in
  `assetlinks.json`. Play Console → App integrity shows the current one; it also
  auto-generates this exact JSON under Setup → App integrity → Deep links.
- Runtime routing of an incoming link → pairing lives in
  `src/components/DeepLinkHandler.jsx` + `src/lib/deepLinkPairing.js` (pre-fills the
  connector; never auto-pairs).
- `/r/<code>` (#2527): `DeepLinkHandler.jsx` hands the URL to
  `lib/referralAttribution.js captureReferralFromUrl`, which stores the pending
  referral; `WalletProvider` redeems it on the next primary-session unlock. Without
  the app installed, the same URL is a plain HTTPS request and the Worker 302s it to
  the web wallet with `?ref=`. The three places that must agree (AASA, manifest,
  handler) are pinned by `src/__tests__/deepLinkAssociations.referral.test.js`.
