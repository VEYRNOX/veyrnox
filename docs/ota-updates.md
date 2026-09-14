# OTA web-bundle updates

**Status: BUILT, INTERNAL.** Not device-verified. No signing key is provisioned,
so OTA is **inert in every build** until the steps under *One-time setup* are
done and a store binary carrying the key has shipped.

Ships fixes to the web bundle (`dist/`) without a store submission. Native code
(Swift, Kotlin, Capacitor plugins) still ships only through the stores.

## Why this is dangerous, and what stops it

The web bundle *is* the wallet: derivation, signing, the RASP gates and the KEK
flow all run as JS. An OTA bundle can therefore execute code on every install,
without Apple or Google review. The design keeps the update host and CI
**untrusted**. Only the offline signing key can ship code.

| Guarantee | Where |
|---|---|
| The manifest carries an ECDSA P-256 signature from an **offline** key whose public half is compiled into the store binary. An OTA bundle cannot change the pinned key. | `OtaConfig` in `VeyrnoxOta.swift` / `OtaBundleVerifier.kt` |
| Every file matches its sha256, and **no extra files** are allowed. This is re-checked natively on **every cold start**, not just at download. | `verifyFiles` |
| Versions only move forward. A replayed older (validly signed) bundle is refused. | `canAccept`, `floor` |
| A bundle that boots but never reports ready is rolled back, and that version is never accepted again. | `resolveLaunch`, `OtaBootSignal` in `main.jsx` |
| A bundle that needs newer native code (`minNativeApi`) is refused. So is one from the other channel. | `readVerifiedManifest` |
| A store update newer than the OTA bundle wins, and the OTA bundle is deleted. | `resolveLaunch` |
| An empty pinned key, or a missing embedded manifest, disables OTA completely (I4). | `resolveLaunchDir` |
| Capacitor's own `serverBasePath` persistence loads code **with no verification**. It is switched off with `DisableDeploy` in `capacitor.config.json`, and also cleared on every Activity/VC creation, including warm relaunches. This closes a pre-existing path where XSS could persist code across restarts. | `capacitor.config.json`, `resolveLaunchDir` |
| A bundle built with `VITE_BYPASS_RASP`, `VITE_DEV_UNGATE_SEND` or `VITE_DEMO_MODE` set to `1` is refused at release time. The check reads the build's recorded flag values (`ota-build-flags.json`), because obfuscated store builds hide the inlined string. | `scripts/ota/release.mjs` |

### What it does NOT guarantee (read before enabling)

- **Key compromise means every wallet is exposed.** The whole design rests on the
  offline key. Store it on a hardware token, with a backup token in a separate
  location. Never put it in CI, GitHub Secrets, Cloudflare or a laptop keychain.
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
- **Staging and production share one key**; only the signed `channel` differs.
  Every staging release therefore needs the offline key. Don't let that convenience
  pull the key online. Use a separate staging key if staging releases are frequent.
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

1. **Generate the key offline — no hardware token needed.** Never create or use
   it on your everyday machine, or on any machine that has touched this repo's CI
   or Cloudflare credentials.
   - Boot a spare laptop from a live USB (for example Tails), with networking off.
   - Generate an **encrypted** key; you choose a passphrase:

     ```bash
     openssl ecparam -name prime256v1 -genkey -noout | openssl ec -aes256 -out ota-signing-key.pem
     ```

   - Print the public key (SPKI base64). Copy it out on paper or a camera photo —
     it is public, but no removable media should go back to the online machine
     carrying the private key:

     ```bash
     openssl ec -in ota-signing-key.pem -pubout -outform DER | base64
     ```

   - Copy `ota-signing-key.pem` onto **two** USB sticks kept in separate places,
     plus the passphrase in a password manager. Losing both sticks means OTA stops
     until a store release pins a new key; it never means lost funds.
   - A YubiKey (PIV slot 9c, ECCP256) is a later upgrade: it makes the key
     non-extractable. The manifest format does not change, but switching keys needs
     a store release.
2. **Pin the public key.** Put that base64 into **both**
   `OtaConfig.publicKeySpkiB64` (iOS) and `OtaConfig.PUBLIC_KEY_SPKI_B64`
   (Android). `ota-manifest.test.js` fails if the two differ. Before the store
   release, prove the pasted key is right: prepare any bundle, sign it offline,
   and run `release.mjs verify <releaseDir>` with no key argument — it reads the
   pinned key from source. A typo there only disables OTA (fail closed), but you
   would not find out until the first release.
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

**Sign on the offline machine.** Carry only `ota-manifest.json` across, on a
USB stick used for nothing else. Boot the live USB with networking off, then
sign. The output must be a base64 DER signature over the exact manifest bytes:

```bash
openssl dgst -sha256 -sign ota-signing-key.pem ota-manifest.json | base64 > ota-manifest.sig
```

Bring `ota-manifest.sig` back into `ota-release/<channel>/<version>/`. Then check it:

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
