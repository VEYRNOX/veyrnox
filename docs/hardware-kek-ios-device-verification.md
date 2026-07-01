# Hardware KEK — iOS on-device verification procedure (H-NEW-D)

> Ready-to-run checklist for the **iOS** device tests that gate H-NEW-D moving from
> **BUILT / device-verified (PARTIAL)** to a stronger claim. Android is already
> device-verified (enroll, persist, StrongBox-gated unlock, KEK-gated Sepolia send,
> and biometric re-enrollment invalidation — see `docs/verified-evidence.json` →
> `_hardware_kek_biometric_reenroll_invalidation`). **iOS is the remaining gap.**
>
> None of this is doable in CI / a simulator — an iPhone Simulator has **no Secure
> Enclave**, so it cannot exercise SE-ECIES or `.biometryCurrentSet` invalidation.
> A **physical iPhone with Face ID + a real passcode** is mandatory.
>
> Standing rule: nothing here promotes the feature to "verified" in the on-chain
> sense. Test B produces a real txid; Tests A/C are on-device *protection* proofs.
> Record results honestly as **non-promoting META keys** (mirror the Android entries),
> never under `evidence{}`.

## Prerequisites

- **Mac + Xcode** (this repo's iOS shell builds via Capacitor).
- **Physical iPhone** with Secure Enclave + Face ID enrolled + a device passcode set
  (the reference device to date is iPhone 17 Pro Max).
- **Throwaway testnet wallet** (never real value): seed
  `bamboo lyrics harvest potato seat carry equip nation slam begin admit pet`,
  PIN `30081977`, EVM address `0x90f9f1F9F5a1938B21ef0C20352C7b792E68a729`,
  funded on **Sepolia** (faucet if the balance is low).
- Build + run **from Xcode** (not a detached install) so the native `NSLog` output and
  the WKWebView JS console are both visible in the Xcode debug console:
  ```
  npm run ios        # cap sync ios && cap open ios  (preios regenerates the app icon)
  # then in Xcode: select the physical device → Product ▸ Run
  ```
- Clear demo mode first (visit `/?demo=0`; confirm a fresh real wallet shows 0.0
  on-chain and no demo simulation box) — demo makes fake sends and no real KEK.

### Where the code lives (for reference while testing)
- Native plugin: `ios/App/App/HardwareKekPlugin.m` (SE P-256 ECIES; ACL
  `kSecAccessControlPrivateKeyUsage | .biometryCurrentSet` over
  `WhenPasscodeSetThisDeviceOnly`). Reject codes used below:
  `DECRYPT_FAILED`, `SE_KEY_MISSING` ("re-enrollment required"), `STALE_CLEAR_FAILED`.
- Face ID prompt string: `"Authenticate to unlock your wallet"` (`kSecUseOperationPrompt`).
- JS orchestration: `getHardwareFactor` / `clearHardwareCredential`
  (`src/wallet-core/keystore/hardware.js`); KEK-gated unlock in
  `src/wallet-core/keystore/native.js` (`_unlockInner`, `blob.kekWrap` branch).
- Enrollment UI + "Hardware Protection ON" badge:
  `src/components/security/HardwareKekSettings.jsx` (badge keys off `hasVaultKekWrap()`).

### Optional: capture the live SE-unlock trace (Test B)
The outstanding audit item is *a captured getHardwareFactor SE-unlock log line tied to
a send*. The plugin does not verbosely log by default. To capture it cleanly, add a
**temporary** one-line trace on the decrypt success path in
`ios/App/App/HardwareKekPlugin.m` (in `getHardwareFactor`, right after
`SecKeyCreateDecryptedData` succeeds), e.g.:
```objc
NSLog(@"[HardwareKek] getHardwareFactor: SE ECIES decrypt OK — H produced (%lu bytes)", (unsigned long)hData.length);
```
Remove it before shipping (do NOT log H's bytes — only the fact + length). Alternatively,
set a symbolic breakpoint on `-[HardwareKekPlugin getHardwareFactor:]` and step to the
success branch. In Console.app, filter by the device and process **App** (bundle
`com.veyrnox.app`); the system also logs Face ID activity under **BiometricKit** —
useful corroboration that a *fresh* biometric fired.

---

## Test A — Biometric re-enrollment invalidation (THE core I6 gap on iOS) 🔴 #1 priority

**Claim under test:** binding the SE key to `.biometryCurrentSet` means changing the
enrolled Face ID **invalidates** the key, so a KEK-wrapped vault can no longer be
unlocked with the old H — the app must **fail closed** and fall back to the PIN/password
recovery path, never silently downgrade or bypass.

**Preconditions:** app built + running from Xcode on the physical iPhone; Face ID
enrolled; a fresh real wallet imported (seed above), PIN set, and **KEK enrolled**
(Settings ▸ Security ▸ Hardware Protection ▸ enroll → badge shows "Hardware Protection
ON"). Confirm the badge is ON and, ideally, that a normal cold unlock works (Test B
step 1) before invalidating.

**Steps:**
1. With the vault KEK-enrolled and the badge ON, **force-quit** the app (swipe up).
2. In iOS **Settings ▸ Face ID & Passcode**, change the enrolled biometric — the
   reliable trigger is **Reset Face ID** then **Set Up Face ID** again (re-enroll).
   *(Adding/removing a face also changes the "current set"; a full reset+re-enroll is
   the least ambiguous.)*
3. **Do NOT** remove the device passcode in this test (see the nuance below — passcode
   removal destroys the item for a *different* reason and would muddy the result).
4. Cold-launch the Veyrnox app from Xcode and attempt to **unlock** with Face ID / PIN.
5. Observe the outcome + the Xcode debug console + Console.app.

**Expected (PASS):**
- The SE decrypt fails: the plugin rejects with **`DECRYPT_FAILED`** (or `SE_KEY_MISSING`
  if the OS dropped the key entirely) — surfaced up through `getHardwareFactor`.
- The app **refuses the hardware unlock** and routes to the **password/PIN recovery
  path** (the vault's independent Argon2id secret) — it must NOT silently unlock, and
  must NOT downgrade the vault to bare without the user's action.
- Entering the correct **PIN/password still recovers the vault** (recovery path intact —
  no fund-loss footgun). After recovery, re-enrolling the KEK produces a new SE key.

**FAIL if:** the app unlocks anyway (invalidation not enforced), or it crashes/bricks the
vault with no PIN recovery, or it silently converts the vault to bare without telling the
user.

**Capture:** screen recording of the refuse → PIN-recovery flow; the Xcode console line
showing the reject code; Console.app BiometricKit line showing the re-enrollment. Note
the exact user-facing error text.

**Nuance to record (do not skip):** the SE item's base accessibility is
`WhenPasscodeSetThisDeviceOnly`, so **removing the device passcode entirely also destroys
the key** — that is a *different* invalidation cause. This test must isolate the
**biometric-change** trigger (keep the passcode set throughout). If you also want to
cover passcode-removal, run it as a separate, clearly-labelled case.

---

## Test B — Live `getHardwareFactor` SE-unlock trace tied to a Sepolia send

**Claim under test:** a KEK-enrolled vault's seed can only be decrypted (and thus a tx
signed) **after** a genuine Secure-Enclave ECIES unlock produced H — proven by a captured
SE-unlock log line immediately preceding a real on-chain send (upgrades the current
*architectural* proof to an *observed* one).

**Preconditions:** Test A's optional NSLog trace (or breakpoint) in place; vault
KEK-enrolled; badge ON; Sepolia balance ≥ ~0.0005 ETH.

**Steps:**
1. Cold-launch from Xcode → unlock with Face ID. Confirm the console shows the
   `[HardwareKek] getHardwareFactor: SE ECIES decrypt OK` trace and the vault reads back
   as `kek-dek` (kekWrap present) — i.e. the unlock was genuinely SE-gated.
2. Go to **Send ▸ ETH (Sepolia)**, send a small amount (e.g. 0.0001 ETH) to
   `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045`, approve the step-up.
3. Record the **txid**; confirm it on-chain (`eth_getTransactionByHash` /
   `eth_getTransactionReceipt`, chainId 11155111, status SUCCESS) and that `from` =
   `0x90f9…E68a729`.

**Expected (PASS):** the SE-unlock trace is captured in the same session that produced a
**confirmed Sepolia txid** from the KEK-enrolled vault, and the vault was `kek-dek`
throughout (never silently downgraded to bare — the #497-class bug).

**FAIL if:** no SE-unlock trace appears (unlock wasn't SE-gated), or the vault reads back
bare, or the send can't be tied to a KEK unlock.

**Honesty note:** like the Android entry, this proves the send **required the SE KEK to
unlock**, not that a per-signature SE key signed the tx. State that explicitly.

---

## Test C — L4 reinstall-residue / `STALE_CLEAR_FAILED` (validates PR #513, optional)

**Only meaningful after PR #513 is built into the app.** iOS Keychain + SE items survive
app uninstall, so a reinstall can find residual state.

**Steps:**
1. KEK-enroll the vault; confirm badge ON.
2. **Delete** the app (uninstall) — the Keychain ciphertext + SE key persist.
3. Reinstall + launch; import the same seed / set up again.
4. Enroll KEK again.

**Expected (PASS):** enrollment's idempotent pre-clear removes the residual SE key +
ciphertext cleanly; if a residual delete genuinely fails, `enroll` rejects with
**`STALE_CLEAR_FAILED`** (fail-honest) rather than minting a second ambiguous key. The
badge reflects the true `hasVaultKekWrap()` state throughout (never a false ON).

**FAIL if:** a stale SE key silently coexists with a new one, or the badge shows ON over
a vault that isn't actually KEK-wrapped.

---

## Recording results (honest, non-promoting)

For each test that PASSES, add a **top-level META key** to `docs/verified-evidence.json`
(NOT under `evidence{}`), mirroring `_hardware_kek_biometric_reenroll_invalidation` and
`_ios_hardware_kek_device_verification`:

- Test A → `_hardware_kek_ios_biometric_reenroll_invalidation`
- Test B → extend `_ios_hardware_kek_device_verification` with the captured SE-unlock
  trace + the new txid (or add a dated sub-note).
- Test C → `_hardware_kek_ios_reinstall_residue` (note it validates PR #513).

Each entry: device + iOS version, exact procedure, result, the reject code / txid /
console line as proof, and the honest caveats (SE-unlock gates UNLOCK not per-signature;
passcode-removal is a distinct trigger; not independently audited).

**Only after Test A + Test B pass on a physical iPhone** does the iOS side of H-NEW-D
reach parity with Android. Even then it stays **BUILT / device-verified — NOT "verified"**
in the on-chain/asset sense (ETH is already LIVE; the KEK gates the unlock, not the asset).
Update `docs/Feature-Status.md` §4 and `docs/audit-triage/ecc-hardware-kek-audit-2026-07-01.md`
accordingly.
