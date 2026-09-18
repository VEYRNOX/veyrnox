# OTA web-bundle updates

**Status: BUILT, INTERNAL.** Not device-verified.

**Signing keys are provisioned (2026-09-18).** Two YubiKey 5C NFC tokens, each
holding a non-extractable P-256 key generated on-token in PIV slot 9c, with
touch required per signature:

| Token | Serial | Pinned |
|---|---|---|
| A | 39744850 | `OtaConfig` on both platforms, first in the list |
| B | 39744871 | `OtaConfig` on both platforms, second in the list |

Both were proven end to end against a real 1066-file bundle: each token's
signature verified under its own pinned key and under no other. That is tooling
evidence, not device evidence.

OTA stays **inert on every install already out there**. It only becomes live for
installs from a store release built with these keys, and nothing has been
published to `updates.veyrnox.com`.

Ships fixes to the web bundle (`dist/`) without a store submission. Native code
(Swift, Kotlin, Capacitor plugins) still ships only through the stores.

## Why this is dangerous, and what stops it

The web bundle *is* the wallet: derivation, signing, the RASP gates and the KEK
flow all run as JS. An OTA bundle can therefore execute code on every install,
without Apple or Google review. The design keeps the update host and CI
**untrusted**. Only the offline signing key can ship code.

| Guarantee | Where |
|---|---|
| The manifest carries an ECDSA P-256 signature from an **offline** key held on a hardware token. The public half of every token's key is compiled into the store binary, and a signature from any one of them is accepted. An OTA bundle cannot change the pinned keys. | `OtaConfig` in `VeyrnoxOta.swift` / `OtaBundleVerifier.kt` |
| Every file matches its sha256, and **no extra files** are allowed. This is re-checked natively on **every cold start**, not just at download. | `verifyFiles` |
| Versions only move forward. A replayed older (validly signed) bundle is refused. | `canAccept`, `floor` |
| A bundle that boots but never reports ready is rolled back, and that version is never accepted again. | `resolveLaunch`, `OtaBootSignal` in `main.jsx` |
| A bundle that needs newer native code (`minNativeApi`) is refused. So is one from the other channel. | `readVerifiedManifest` |
| A store update newer than the OTA bundle wins, and the OTA bundle is deleted. | `resolveLaunch` |
| An empty pinned key list, or a missing embedded manifest, disables OTA completely (I4). | `resolveLaunchDir` |
| Capacitor's own `serverBasePath` persistence loads code **with no verification**. It is switched off with `DisableDeploy` in `capacitor.config.json`, and also cleared on every Activity/VC creation, including warm relaunches. This closes a pre-existing path where XSS could persist code across restarts. | `capacitor.config.json`, `resolveLaunchDir` |
| A bundle built with `VITE_BYPASS_RASP`, `VITE_DEV_UNGATE_SEND` or `VITE_DEMO_MODE` set to `1` is refused at release time. The check reads the build's recorded flag values (`ota-build-flags.json`), because obfuscated store builds hide the inlined string. | `scripts/ota/release.mjs` |

### What it does NOT guarantee (read before enabling)

- **Key compromise means every wallet is exposed.** The whole design rests on the
  offline keys. Each lives on its own YubiKey and cannot be extracted; keep the two
  tokens in separate places. Never put a signing key in CI, GitHub Secrets,
  Cloudflare or a laptop keychain. **Any pinned key can ship code**, so a stolen
  token is as dangerous as a stolen key: if one goes missing, treat it as
  compromised, drop it from the list and ship a store release.
- **Freeze attacks.** Whoever controls the host or network can withhold updates. They
  cannot downgrade, but they can keep a user on the current bundle. `latest.json`
  is unsigned by design, since every accepted version is signed.
- **Forced move to an old, vulnerable bundle.** Every signed bundle stays valid
  forever, and `latest.json` is unsigned. So an attacker controlling the host or
  network can point a device at *any* signed version newer than what the device
  already has. For example: a fresh install of an older store binary gets pushed
  bundle V1, which was fixed in V2. The downgrade guard only protects devices that
  already have V2. Planned mitigation, not built: a signed, expiring
  `latest.json`, or a minimum version compiled into each store binary. Until then,
  a release that fixes a **security** bug should also ship a store binary.
- **One interrupted first boot blocks a good bundle.** If the app is killed
  (by the user or the OS) before the new bundle's first render, that version is
  treated as failed and never retried. Ship a newer version to recover.
- **Version order is build time, not code order.** A store binary built *later*
  from an *older* commit (for example a resubmission) outranks, and deletes, a newer
  OTA fix. Before a store build, check it contains every OTA fix already shipped.
- **Staging and production share the same keys**; only the signed `channel` differs.
  Every staging release therefore needs a token in hand. Don't let that convenience
  pull a key online. Use a separate staging token if staging releases are frequent.
- **Attestation does not cover OTA code.** App Attest and Play Integrity attest the
  store binary, not JS loaded afterwards.
- **"Ready" is a first-render heuristic.** A bundle that renders but breaks later
  (for example unlock) gets promoted. The fix is a newer bundle, not a rollback.
- **Rooted or jailbroken devices** with write access to app storage can reset the
  version floor. That is already outside the RASP threat model.
- **I3 and I2.** The update check runs once per cold start, **before unlock**, and
  behaves identically in real, decoy and demo sessions, so it reveals nothing about
  which session is open. It is still a network request that shows the updates host
  the device IP and that the app launched. **This needs owner sign-off against
  I3's "zero backend calls" wording, and a privacy-policy disclosure, before a key
  is provisioned.**
- **Apple Guideline 2.5.2 / DPLA 3.3.1(B).** Downloaded code must not add or change
  features. Use OTA for **bug and security fixes**. New features go through review.
  Play allows JS updates that run in a WebView.

## One-time setup

1. **Generate one key per YubiKey — the key never leaves the token.** Do this on a
   machine that is offline, and repeat it on the second token so each has its own key.
   Install the tools first (`brew install ykman yubico-piv-tool opensc`), then, with
   one token plugged in:

   ```bash
   ykman piv access change-pin && ykman piv access change-puk && ykman piv access change-management-key --generate --protect
   ```

   That replaces the factory PIN (`123456`), PUK (`12345678`) and management key.
   Write the new PIN and PUK into your password manager, per token.

   ```bash
   ykman piv keys generate --algorithm eccp256 --pin-policy once --touch-policy always 9c pubkey-token-a.pem
   ```

   The private key is generated **inside** the token and cannot be exported, which is
   the point. `--touch-policy ALWAYS` means every signature needs a physical tap, so
   malware on the signing machine cannot sign silently.

   ```bash
   ykman piv certificates generate --subject "CN=Veyrnox OTA token A" 9c pubkey-token-a.pem
   ```

   PIV needs a certificate in the slot alongside the key; this self-signed one is
   never verified by the app, which pins the raw public key.

   ```bash
   openssl ec -pubin -in pubkey-token-a.pem -pubout -outform DER | base64
   ```

   That prints the SPKI base64 to pin. Repeat everything for token B
   (`pubkey-token-b.pem`, `CN=Veyrnox OTA token B`).

   **Losing a token is recoverable, losing both is not.** With both keys pinned, a
   lost token costs nothing: keep signing with the other and drop the lost key in the
   next store release. If both are lost, OTA stops until a store release pins new
   keys. Neither case ever risks funds.
2. **Pin both public keys.** Put them into `OtaConfig.publicKeysSpkiB64` (iOS) and
   `OtaConfig.PUBLIC_KEYS_SPKI_B64` (Android), same keys in the same order;
   `ota-manifest.test.js` fails if the two lists differ. Before the store release,
   prove the pasted keys are right: prepare any bundle, sign it with **each** token
   in turn, and run `release.mjs verify <releaseDir>` with no key argument after
   each — it reads the pinned keys from source and passes if any matches. A typo
   only disables that key (fail closed), but you would not find out until a release.
3. **Hosting.** Create an R2 bucket with public read, served at
   `https://updates.veyrnox.com` (already in CSP `connect-src`). Give `latest.json`
   `Cache-Control: no-cache`. Everything else is immutable.
4. **Ship a store release** that carries the key. Installs on older binaries never
   take OTA updates.

## Releasing a fix

Build from the exact commit being shipped. Store builds and OTA bundles share a
version space: `bundleVersion` is the UTC build time (`yyyyMMddHHmm`), or
`OTA_BUNDLE_VERSION` if set.

```bash
npm run build
```

Use `npm run build:staging` for the staging channel.

```bash
node scripts/ota/release.mjs prepare dist ota-release
```

This refuses the release if `dist` changed after the build or if it carries a dev
flag. It writes `ota-release/<channel>/<version>/…` and
`ota-release/<channel>/latest.json`.

**Sign with a YubiKey.** Plug in either token; both are equally valid. Neither
`ykman` nor `yubico-piv-tool` can sign arbitrary data, so signing goes through
PKCS#11. The token asks for your PIN and a physical tap:

```bash
pkcs11-tool --module /opt/homebrew/lib/libykcs11.dylib --sign --mechanism ECDSA-SHA256 --id 02 --input-file ota-release/production/<version>/ota-manifest.json --output-file /tmp/ota-manifest.rawsig
```

`--id 02` is PIV slot 9c. Check the id on your token with
`pkcs11-tool --module /opt/homebrew/lib/libykcs11.dylib --list-objects --type privkey`.

Store the signature with `seal`. PKCS#11 emits a raw signature while the app
verifies DER, so this converts it and refuses to write anything that does not
verify under a pinned key — which is also what proves the signature and the pinned
keys agree:

```bash
node scripts/ota/release.mjs seal ota-release/production/<version> /tmp/ota-manifest.rawsig
```

`seal` already verified it. Run `verify` too if you want the check on its own, for
example on a signature someone handed you:

```bash
node scripts/ota/release.mjs verify ota-release/production/<version>
```

**Upload in this order: files first, then the manifest and signature, then
`latest.json` last.** Clients never see a pointer to a partial release.

```bash
rclone copy ota-release/production/<version> r2:veyrnox-updates/production/<version>
```

```bash
rclone copyto ota-release/production/latest.json r2:veyrnox-updates/production/latest.json
```

Devices download the update on their next cold start and boot it on the cold start
after that. Only files whose sha256 is not already on the device are downloaded.

## Rolling back

Downgrades are refused by design, so **rolling back means publishing a newer
version** built from the good commit. There is no remote kill switch. Adding one
would give the update host control the design deliberately withholds.

## Needs a store release instead

- Any Swift, Kotlin, Capacitor plugin or native dependency change.
- A web change that calls native code older binaries lack. Bump `NATIVE_API` in
  `scripts/ota/manifest.mjs` and both native `OtaConfig`s together.
- Anything Apple would consider a new or changed feature.
